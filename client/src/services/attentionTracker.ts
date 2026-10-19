/**
 * FocusTube Attention Measurement Engine
 * - MediaPipe FaceLandmarker (478 landmarks, x/y/z at 10 FPS)
 * - ONNX Runtime Web WASM inference with 100-frame sliding window ([1, 100, 478, 3])
 * - Attention weights analysis for pinpointing attention drop moments
 * - Moving average smoothing (last 2-3 evaluations)
 * - Support for virtual cameras (OBS) and physical webcams
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';

const MODEL_VERSION = import.meta.env.VITE_MODEL_VERSION || 'v4_2';
const MODEL_URL = `/models/${MODEL_VERSION}.onnx?v=2`;

const TARGET_FPS = 10;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS; // 100ms
const WINDOW_SIZE = 100; // 100 frames = ~10 seconds
const INFERENCE_STEP_FRAMES = 25; // Recompute score every 2.5 seconds (25 frames at 10 FPS)

export interface AttentionReading {
  score: number; // Smoothed score in [0.0, 1.0]
  rawScore: number; // Raw score from model
  hasFace: boolean;
  dropTimeOffsetSeconds?: number; // Estimated offset in seconds within sliding window of lowest attention
}

export class AttentionTracker {
  private videoElement: HTMLVideoElement | null = null;
  private landmarker: FaceLandmarker | null = null;
  private onnxSession: ort.InferenceSession | null = null;
  private isModelLoading = false;
  private isRunning = false;
  private stream: MediaStream | null = null;

  // Frame sliding window: Array of Float32Array each containing 478 * 3 = 1434 floats
  private frameBuffer: Float32Array[] = [];
  private frameTimestamps: number[] = [];
  private recentScores: number[] = []; // For 2-3 step moving average

  private intervalId: number | null = null;
  private framesSinceLastInference = 0;
  private noFaceConsecutiveCount = 0;

  // Callbacks
  public onReading: ((reading: AttentionReading) => void) | null = null;
  public onFaceStatus: ((hasFace: boolean) => void) | null = null;
  public onError: ((error: string) => void) | null = null;
  public onBufferProgress: ((progressPercent: number) => void) | null = null;

  /**
   * Initializes MediaPipe FaceLandmarker and ONNX Runtime session
   */
  public async initialize(): Promise<void> {
    if (this.landmarker && this.onnxSession) return;
    if (this.isModelLoading) return;
    this.isModelLoading = true;

    try {
      // 1. Initialize MediaPipe FaceLandmarker
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: '/mediapipe/face_landmarker.task',
          delegate: 'CPU',
        },
        outputFaceBlendshapes: false,
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      // 2. Initialize ONNX Runtime session
      try {
        ort.env.wasm.wasmPaths = '/ort/';
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.simd = true;
        this.onnxSession = await ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        console.log(`[FocusTube] Loaded ONNX model ${MODEL_VERSION}:`, {
          inputs: this.onnxSession.inputNames,
          outputs: this.onnxSession.outputNames,
        });
      } catch (onnxErr) {
        const reason = (onnxErr as any)?.message || String(onnxErr);
        console.error('[FocusTube] ONNX load failed:', onnxErr);
        this.onError?.(`מודל הקשב לא נטען: ${reason}`);
      }
    } catch (err: any) {
      console.error('[FocusTube] Error initializing attention models:', err);
      this.onError?.(err?.message || 'שגיאה באתחול מודל זיהוי הפנים');
    } finally {
      this.isModelLoading = false;
    }
  }

  /**
   * Requests webcam access and attaches stream to video element
   */
  public async startCamera(videoEl: HTMLVideoElement): Promise<MediaStream> {
    this.videoElement = videoEl;
    await this.initialize();

    try {
      // Support physical and virtual cameras (e.g. OBS)
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoEl.srcObject = this.stream;
      await videoEl.play();

      this.startTracking();
      return this.stream;
    } catch (err: any) {
      const errName = err.name || '';
      let msg = 'לא ניתן לגשת למצלמת הרשת. אנא ודא שהמצלמה מחוברת והרשאות הדפדפן מאושרות.';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        msg = 'הרשאת השימוש במצלמה נדחתה. ניתן להמשיך לצפות בסרטון ללא מדידת ריכוז.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        msg = 'לא נמצאה מצלמה מחוברת למחשב (כולל מצלמה וירטואלית כגון OBS).';
      }
      this.onError?.(msg);
      throw new Error(msg);
    }
  }

  /**
   * Starts periodic landmark extraction at 10 FPS
   */
  private startTracking(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.frameBuffer = [];
    this.frameTimestamps = [];
    this.recentScores = [];
    this.framesSinceLastInference = 0;
    this.noFaceConsecutiveCount = 0;

    let lastTime = performance.now();

    this.intervalId = window.setInterval(async () => {
      if (!this.isRunning || !this.videoElement || this.videoElement.readyState < 2) return;

      const now = performance.now();
      try {
        await this.processFrame(now);
      } catch (err) {
        console.error('[FocusTube] Error processing video frame:', err);
      }
      lastTime = now;
    }, FRAME_INTERVAL_MS);
  }

  /**
   * Extracts landmarks from current video frame and manages sliding window
   */
  private async processFrame(timestampMs: number): Promise<void> {
    if (!this.videoElement || !this.landmarker) return;

    const result = this.landmarker.detectForVideo(this.videoElement, timestampMs);
    const faces = result.faceLandmarks;

    if (!faces || faces.length === 0) {
      this.noFaceConsecutiveCount++;
      if (this.noFaceConsecutiveCount >= 5) {
        // Show "לא זוהו פנים" and do not run model
        this.onFaceStatus?.(false);
      }
      return;
    }

    // Face is detected
    this.noFaceConsecutiveCount = 0;
    this.onFaceStatus?.(true);

    const landmarks = faces[0];
    // Flatten 478 landmarks (x, y, z) into Float32Array of length 1434
    const frameData = new Float32Array(478 * 3);
    for (let i = 0; i < Math.min(478, landmarks.length); i++) {
      const lm = landmarks[i];
      frameData[i * 3] = lm.x;
      frameData[i * 3 + 1] = lm.y;
      frameData[i * 3 + 2] = lm.z;
    }

    // Push into sliding window
    this.frameBuffer.push(frameData);
    this.frameTimestamps.push(Date.now());

    // Keep buffer strictly at WINDOW_SIZE (100 frames)
    if (this.frameBuffer.length > WINDOW_SIZE) {
      this.frameBuffer.shift();
      this.frameTimestamps.shift();
    }

    // Buffer progress callback (for the initial 10s warmup)
    const progress = Math.min(100, Math.round((this.frameBuffer.length / WINDOW_SIZE) * 100));
    this.onBufferProgress?.(progress);

    this.framesSinceLastInference++;

    // First score appears when buffer reaches 100 frames (~10s).
    // Afterwards, compute a new score every INFERENCE_STEP_FRAMES (~2.5s).
    if (this.frameBuffer.length === WINDOW_SIZE) {
      if (this.framesSinceLastInference >= INFERENCE_STEP_FRAMES || this.recentScores.length === 0) {
        this.framesSinceLastInference = 0;
        await this.runAttentionInference(landmarks);
      }
    }
  }

  /**
   * Executes inference on the 100-frame sliding window tensor
   */
  private async runAttentionInference(currentLandmarks: Array<{ x: number; y: number; z: number }>): Promise<void> {
    if (!this.onnxSession) {
      this.onError?.('מודל הקשב לא נטען, ולכן אין מדידת ריכוז.');
      return;
    } let rawScore = 0;
    let dropTimeOffsetSeconds = 0;

    try {
      // Construct tensor Float32Array [1, 100, 478, 3]
      const tensorData = new Float32Array(1 * WINDOW_SIZE * 478 * 3);
      let offset = 0;
      for (let f = 0; f < WINDOW_SIZE; f++) {
        tensorData.set(this.frameBuffer[f], offset);
        offset += 478 * 3;
      }

      const inputTensor = new ort.Tensor('float32', tensorData, [1, WINDOW_SIZE, 478, 3]);
      const inputName = this.onnxSession.inputNames[0] || 'input';
      const feeds: Record<string, ort.Tensor> = { [inputName]: inputTensor };

      const results = await this.onnxSession.run(feeds);
      const outputNames = this.onnxSession.outputNames;

      // First output is score in 0–1
      const firstOutput = results[outputNames[0]];
      if (firstOutput && firstOutput.data) {
        rawScore = Number(firstOutput.data[0]);
        // Clamp score to [0.0, 1.0]
        rawScore = Math.max(0.0, Math.min(1.0, rawScore));
      }

      // For v4_2+: Check per-frame attention weights output
      // If present, use the frame with the highest attention-weight / drop moment
      for (let i = 1; i < outputNames.length; i++) {
        const outName = outputNames[i].toLowerCase();
        if (outName.includes('weight') || outName.includes('attention')) {
          const weightsOutput = results[outputNames[i]];
          if (weightsOutput && weightsOutput.data && weightsOutput.data.length >= WINDOW_SIZE) {
            let minIdx = 0;
            let minWeight = Number(weightsOutput.data[0]);
            for (let f = 1; f < WINDOW_SIZE; f++) {
              const w = Number(weightsOutput.data[f]);
              if (w < minWeight) {
                minWeight = w;
                minIdx = f;
              }
            }
            // Map min attention frame to offset from end of window (0 to 10 seconds ago)
            dropTimeOffsetSeconds = (WINDOW_SIZE - 1 - minIdx) * (FRAME_INTERVAL_MS / 1000);
          }
        }
      }
    } catch (err) {
      console.error('[FocusTube] Inference failed:', err);
      this.onError?.('חישוב הציון נכשל.');
      return;
    }

    // Smoothing: Moving average over the last 2-3 scores
    this.recentScores.push(rawScore);
    if (this.recentScores.length > 3) {
      this.recentScores.shift();
    }

    const smoothedScore = this.recentScores.reduce((a, b) => a + b, 0) / this.recentScores.length;

    this.onReading?.({
      score: Math.round(smoothedScore * 1000) / 1000,
      rawScore: Math.round(rawScore * 1000) / 1000,
      hasFace: true,
      dropTimeOffsetSeconds,
    });
  }

  /**
   * Geometry attention estimator from 478 MediaPipe landmarks
   * Evaluates head yaw/pitch, gaze alignment, and eye openness
   */


  /**
   * Stops camera stream and tracking interval
   */
  public stop(): void {
    this.isRunning = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    this.frameBuffer = [];
    this.frameTimestamps = [];
    this.recentScores = [];
  }
}
