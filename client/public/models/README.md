# ONNX Attention Models Directory

Place the 9 pre-trained ONNX attention model files here:
- `v1.onnx`
- `v2.onnx`
- `v3.onnx`
- `v4.onnx`
- `v4_2.onnx` (default model specified by VITE_MODEL_VERSION=v4_2)
- `v4_3.onnx`
- `v4_4.onnx`
- `v4_7.onnx`
- `v4_66.onnx`

### Tensor Specifications:
- **Input Tensor**: Shape `[1, 100, 478, 3]`, Float32 array representing 100 consecutive frames of 478 MediaPipe face landmarks (x, y, z).
- **First Output**: Concentration score in the range `[0.0, 1.0]`.
- **v4+ Output**: 5-level classification.
- **v4_2+ Output**: Per-frame attention weights (used to pinpoint the exact moment of the attention drop).

In the client container, this folder is mounted / copied into `/usr/share/nginx/html/models` and served statically.
