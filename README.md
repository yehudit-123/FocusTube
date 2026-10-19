# FocusTube (מיקוד ולמידה)

FocusTube is a full-stack learning-support environment that measures the learner's concentration in real-time through the webcam while watching YouTube educational videos. When concentration drops, the video automatically pauses and prompts the learner with an adaptive comprehension question about the missed segment.

The user interface is entirely in **Hebrew (RTL)**, while all code, documentation, comments, and APIs are in English.

---

## 🏗️ Architecture Overview

The system is organized into three isolated Docker containers orchestrated via a single `docker-compose.yml`:

1. **Client (`FocusTube_client`)**
   - **Port**: `3000`
   - **Stack**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Motion.
   - **Runtime**: Built into static files and served by an optimized **Nginx** container.
   - **Vision & ML**: In-browser face landmark extraction at 10 FPS with `@mediapipe/tasks-vision` (478 landmarks, x/y/z) and attention scoring via `onnxruntime-web` (WASM).
   - **Models**: Pre-loaded ONNX models bundled inside `/client/public/models`.

2. **Server (`FocusTube_server`)**
   - **Port**: `8000`
   - **Stack**: Python 3.11, FastAPI, Motor (Async MongoDB), Pydantic v2, PyJWT / Python-Jose, Bcrypt.
   - **Health Endpoint**: `GET /health` returning `200 {"status": "ok"}`.
   - **Video Processing & AI**: Deterministic sentence-boundary segmentation (60–90 seconds) in Python, YouTube transcript extraction, and single-shot comprehension question generation via the official Google GenAI Python SDK (`google-genai`).

3. **Database (`FocusTube_mongo`)**
   - **Port**: `27017`
   - **Image**: Official `mongo:7.0` with persistent volume `mongo_data`.
   - **Connection**: `mongodb://mongo:27017/FocusTube` (connecting via compose service name, never localhost).

---

## ⚙️ Environment Variables

The project uses `.env` (configured locally) and `.env.example`:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `MONGO_URL` | MongoDB connection string | `mongodb://mongo:27017/FocusTube` |
| `SECRET_JWT` | Secret key used to sign 24h JWT tokens | `FocusTube_super_secret_jwt_key_2026_dev_secure` |
| `GEMINI_API_KEY` | Google Gemini API key (**EMPTY** in submitted repo) | `` |
| `GEMINI_MODEL` | Gemini model name | `gemini-2.5-flash` |
| `VITE_API_URL` | Server API URL accessible by the browser | `http://localhost:8000` |
| `VITE_MODEL_VERSION` | Selected ONNX attention model file | `v4_2` |

---

## 🧠 ONNX Attention Models Placement

Place the 9 pre-trained ONNX attention model files in:
```
client/public/models/
├── v1.onnx
├── v2.onnx
├── v3.onnx
├── v4.onnx
├── v4_2.onnx    # (Default model used by VITE_MODEL_VERSION=v4_2)
├── v4_3.onnx
├── v4_4.onnx
├── v4_7.onnx
└── v4_66.onnx
```

- In the Docker client build, these files are copied into the static Nginx root under `/models/` and loaded in-browser via WASM.
- Model input shape: `[1, 100, 478, 3]` (Float32 tensor representing 100 consecutive frames of 478 landmarks).
- The client dynamically reads `session.inputNames[0]` and inspects `session.outputNames` at runtime.

---

## 🐳 Running with Docker Compose

Start the entire environment with a single command (no manual setup required):

```bash
docker compose up --build
```

- **Client Web App**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Server**: [http://localhost:8000](http://localhost:8000)
- **API Health Check**: [http://localhost:8000/health](http://localhost:8000/health)
- **FastAPI Interactive Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

To stop the containers:
```bash
docker compose down
```

---

## 🔨 Building Multi-Platform Images (`linux/amd64`)

All Dockerfiles are designed and documented for `linux/amd64` architecture:

```bash
# Build Client Image for linux/amd64
docker buildx build --platform linux/amd64 -t FocusTube-client:latest ./client

# Build Server Image for linux/amd64
docker buildx build --platform linux/amd64 -t FocusTube-server:latest ./server
```

---

## 🧪 Running Unit Tests

The deterministic segmentation algorithm includes automated tests covering:
- Regular sentence-boundary closing (60–90 seconds)
- Videos without punctuation (hard-cap boundary at 90s)
- Very short videos (<60s)
- Gaps between transcript entries
- Merging remainders shorter than ~30s into previous segment

To run the unit tests:
```bash
python3 -m unittest server/app/tests/test_segmentation.py
```

---

## 🔒 Security (For PROJECT_INFO)

```markdown
### Security Architecture & Compliance

1. **Password Storage**:
   - User passwords are strictly hashed using `bcrypt` with automatic salt generation (`bcrypt.gensalt()`).
   - Plaintext passwords and bcrypt hash strings are never exposed or returned in any API response or database projection.

2. **JWT Authentication & Token Lifecycle**:
   - Authentication is handled via stateless JSON Web Tokens (JWT) signed with HMAC-SHA256 (`HS256`) using `SECRET_JWT`.
   - Tokens carry an explicit expiration time of 24 hours (`expires_in = 86400` seconds).
   - Protected endpoints require `Authorization: Bearer <token>` and return `401 Unauthorized` on missing, expired, or tampered tokens.
   - The React client securely handles token state and automatically redirects unauthorized requests to the login screen.

3. **Secret Isolation & Zero Client Exposure**:
   - `GEMINI_API_KEY` and database credentials exist exclusively within the server environment.
   - Gemini API calls are strictly executed server-side; keys are never transmitted to the browser, bundled in client static builds, or printed in logs.
   - If `GEMINI_API_KEY` is missing or invalid, the server emits a single sanitized warning without revealing key contents, and gracefully flags videos as `questions_failed` with specific error codes rather than crashing.

4. **Multi-Tenant Data Isolation (Zero Resource Leakage)**:
   - Data access across all resources (content items, sessions, readings, pause events, and classes) enforces strict ownership validation (`user_id == current_user.id`).
   - Attempting to access or mutate another user's resource results in an immediate `404 Not Found` with the generic response `{"message": "לא נמצא"}`, preventing resource enumeration or metadata leakage.

5. **Camera Stream Privacy**:
   - Face landmark extraction and concentration inferences occur entirely client-side inside the user's browser (WASM).
   - Video frames, webcam streams, and raw facial landmark coordinates never leave the browser and are never transmitted to or stored on any server. Only anonymous scalar concentration scores (0.0–1.0) and playback timestamps are persisted.
```
