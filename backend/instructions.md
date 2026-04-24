# AutoOD Backend Setup & Execution Guide

This backend is a specialized object detection API supporting strictly **YOLOv8n** and **NanoDet**. It is designed for production deployment in CPU-only environments (e.g., Render).

## 1. Prerequisites
- Python 3.9+
- Git

## 2. Setup Instructions

### Step 1: Clone the Official NanoDet Repository
From within the `backend/` directory, run:
```bash
git clone https://github.com/RangiLyu/nanodet.git
```

### Step 2: Download Pretrained Weights
Place these files directly in the `backend/` directory:

1. **YOLOv8n**:
   - Download: [yolov8n.pt](https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.pt)
   
2. **NanoDet-Plus-m (416px)**:
   - Weights: [nanodet-plus-m_416_checkpoint.ckpt](https://github.com/RangiLyu/nanodet/releases/download/v1.0.0-alpha-1/nanodet-plus-m_416_checkpoint.ckpt)
   - Config: [nanodet-plus-m_416.yml](https://github.com/RangiLyu/nanodet/blob/main/config/nanodet-plus-m_416.yml)

### Step 3: Install Dependencies
```bash
pip install -r requirements.txt
# Also install nanodet in editable mode or ensure it's in PYTHONPATH
cd nanodet && pip install -e . && cd ..
```

## 3. Running the Server
Start the FastAPI server locally:
```bash
python main.py
```
The server will be available at `http://localhost:8000`.

## 4. Testing the API

### Example cURL Request (YOLOv8n)
```bash
curl -X POST http://localhost:8000/detect \
  -F "image=@/path/to/your/image.jpg" \
  -F "model=yolov8n"
```

### Example cURL Request (NanoDet)
```bash
curl -X POST http://localhost:8000/detect \
  -F "image=@/path/to/your/image.jpg" \
  -F "model=nanodet"
```

### Expected Output Format
```json
[
  {
    "class": "person",
    "confidence": 0.9245,
    "bbox": [10.5, 20.1, 150.3, 300.8]
  }
]
```

## 5. Deployment Notes (Render)
- Ensure `build.sh` includes the `git clone` and `pip install -e ./nanodet` steps.
- Set `PYTHONPATH` if the `nanodet` folder is not automatically recognized.
- The server is optimized for CPU inference and will automatically use `device='cpu'`.
