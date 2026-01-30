# Backend API

FastAPI backend for AutoOD that connects the React frontend to YOLO object detection.

## Installation

```bash
pip install -r requirements.txt
```

## Running the Server

```bash
python main.py
```

Or with uvicorn:

```bash
uvicorn main:app --reload --port 8000
```

## API Endpoints

- `GET /` - Health check
- `GET /api/models` - Get available YOLO models
- `GET /api/classes` - Get available object classes
- `POST /api/detect` - Detect objects in image (returns JSON)
- `POST /api/detect-annotated` - Detect objects and return annotated image
- `POST /api/export` - Export annotations in various formats

## CORS

The API allows requests from:
- http://localhost:8080 (Vite dev server)
- http://localhost:5173 (Alternative Vite port)
- http://localhost:3000 (React dev server)
