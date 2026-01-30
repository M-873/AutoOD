# AutoOD - Automatic Object Detection & Annotation System

Minimal, fast, and powerful object detection tool with auto-labeling capabilities.

## Features

- Multiple YOLO models: YOLOv8 and YOLOv11 (nano/small/medium)
- Dual annotation modes: bounding boxes and polygons
- Custom label colors and keyboard shortcuts
- Auto-labeling: seed with 1–2 annotations, detect the rest
- Class filtering and confidence control
- Multi-format export: YOLO, CSV, JSON, COCO
- Image and video support

## Tech Stack

- Frontend: React + TypeScript + Vite + shadcn/ui + Tailwind CSS
- Backend: FastAPI + Ultralytics YOLO + OpenCV + Pillow
- Auth/Storage: Supabase (optional)

## Installation

```bash
# Backend dependencies
cd backend
pip install -r requirements.txt

# Frontend dependencies
cd ../Frontend
npm install
```

## Running Locally

```bash
# Terminal 1: Backend API (http://localhost:8000)
cd backend
python main.py

# Terminal 2: Frontend (http://localhost:8080)
cd Frontend
npm run dev
```

## Usage Workflow

- Upload an image or video
- Select a YOLO model (e.g., YOLOv8n for speed)
- Choose annotation mode: rectangle or polygon
- Optionally add a few manual annotations
- Run auto-annotation to detect similar objects
- Review detections and adjust
- Export annotations in your desired formats

## Project Structure

```
AutoOD/
├── Frontend/                 # React application
│   └── src/                  # Pages, components, hooks, lib
├── backend/                  # FastAPI server
│   ├── main.py               # API endpoints
│   ├── requirements.txt      # Python dependencies
│   └── core/                 # Detection modules
│       ├── model_manager.py  # YOLO model loading
│       ├── detector.py       # Detection engine
│       ├── auto_labeler.py   # Auto-labeling logic
│       └── exporter.py       # Multi-format export
└── data/                     # Exported examples / generated outputs
```

## Export Formats

- YOLO: `.txt` per image with normalized `class_id x_center y_center width height` and `classes.txt`
- CSV: `filename, class, confidence, shape, x1, y1, x2, y2, polygon_points`
- JSON: `{ annotations: ..., metadata: ... }`
- COCO: `images`, `annotations`, `categories` with polygon segmentation when available

## Available Models

- `yolo/yolov8n.pt` — fastest (Nano)
- `yolo/yolov8s.pt` — balanced (Small)
- `yolo/yolov8m.pt` — more accurate (Medium)
- `yolo/yolo11n.pt` — latest Nano
- `yolo/yolo11s.pt` — latest Small
- `torchvision/fasterrcnn_resnet50_fpn` — two-stage, high accuracy
- `torchvision/retinanet_resnet50_fpn` — focal loss, small objects
- `torchvision/ssd300_vgg16` — lightweight, real-time
- `transformers/detr_resnet50` — end-to-end transformer detector
- `effdet/tf_efficientdet_d0` — scalable EfficientDet (D0 variant)

## Tips

- Use `yolov8n.pt` for real-time iterations
- Lower confidence to detect more objects; raise to reduce false positives
- For videos, sample frames to speed up processing

## License

MIT License

## Contributing

Contributions are welcome. Please submit pull requests for improvements and bug fixes.
