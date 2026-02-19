"""Simplified FastAPI Backend for AutoOD - Optimized for Render deployment"""
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import cv2
import numpy as np
from PIL import Image
import io
import tempfile
import json
import os
import base64
from datetime import datetime
from pathlib import Path
import sys

# Import only what we need, create custom classes to avoid streamlit dependency
class MultiModelManager:
    AVAILABLE = [
        "yolo/yolov8n.pt",
        "yolo/yolov8s.pt",
        "yolo/yolov8m.pt",
        "yolo/yolo11n.pt",
        "yolo/yolo11s.pt",
    ]

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    def load_model(self, model_id: str):
        if model_id in self._cache:
            return self._cache[model_id]

        print(f"Loading model: {model_id}")
        from ultralytics import YOLO
        
        backend, name = model_id.split("/", 1)
        if backend == "yolo":
            model = YOLO(name)
            self._cache[model_id] = (model, None)
            return self._cache[model_id]
        else:
            raise ValueError("Unsupported backend")

    def get_available_models(self) -> List[str]:
        return list(self.AVAILABLE)

    def detect(self, model_id: str, image: np.ndarray, conf: float = 0.25,
               class_filter: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        try:
            from PIL import Image
            import torch
            backend, name = model_id.split("/", 1)
            print(f"Running detection with model: {model_id}")
            model, categories = self.load_model(model_id)
            print(f"Model loaded successfully: {model_id}")
        except Exception as e:
            print(f"Error loading model {model_id}: {str(e)}")
            raise

        if backend == "yolo":
            try:
                print(f"Running YOLO detection with confidence: {conf}")
                results = model.predict(image, conf=conf, verbose=False)
                detections: List[Dict[str, Any]] = []
                for result in results:
                    boxes = result.boxes
                    if boxes is None or len(boxes) == 0:
                        print("No boxes detected")
                        continue
                    for i in range(len(boxes)):
                        try:
                            class_id = int(boxes.cls[i])
                            class_name = result.names[class_id]
                            if class_filter and class_name not in class_filter:
                                continue
                            bbox = boxes.xyxy[i].cpu().numpy().tolist()
                            confidence = float(boxes.conf[i])
                            detections.append({
                                "class": class_name,
                                "confidence": confidence,
                                "bbox": bbox,
                                "shape": "rect",
                            })
                        except Exception as e:
                            print(f"Error processing box {i}: {str(e)}")
                            continue
                print(f"YOLO detection completed - {len(detections)} objects found")
                return detections
            except Exception as e:
                print(f"YOLO detection error: {str(e)}")
                raise

        raise ValueError("Unsupported backend")

# Import exporter
from core.exporter import Exporter

# Helper functions for detection
def detect_objects_in_image(model_manager, image, model_name: str, conf: float = 0.25, 
                           class_filter: Optional[List[str]] = None) -> List[Dict]:
    """Detect objects in image using YOLO"""
    import torch
    # Run prediction
    results = model_manager.predict(model_name, image, conf=conf)
    
    detections = []
    for result in results:
        boxes = result.boxes
        for i in range(len(boxes)):
            # Get class name
            class_id = int(boxes.cls[i])
            class_name = result.names[class_id]
            
            # Filter by class if specified
            if class_filter and class_name not in class_filter:
                continue
            
            # Get bbox coordinates (xyxy format)
            bbox = boxes.xyxy[i].cpu().numpy().tolist()
            confidence = float(boxes.conf[i])
            
            detections.append({
                'class': class_name,
                'confidence': confidence,
                'bbox': bbox,  # [x1, y1, x2, y2]
                'shape': 'rect'
            })
    
    return detections

def draw_annotations(image: np.ndarray, detections: List[Dict], 
                    color: tuple = (102, 126, 234), thickness: int = 2) -> np.ndarray:
    """Draw bounding boxes on image"""
    import cv2
    img_copy = image.copy()
    
    for det in detections:
        bbox = det['bbox']
        x1, y1, x2, y2 = map(int, bbox)
        
        # Draw rectangle
        cv2.rectangle(img_copy, (x1, y1), (x2, y2), color, thickness)
        
        # Draw label
        label = f"{det['class']} {det['confidence']:.2f}"
        
        # Get text size for background
        (text_width, text_height), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, thickness
        )
        
        # Draw background rectangle for text
        cv2.rectangle(
            img_copy, 
            (x1, y1 - text_height - baseline - 5), 
            (x1 + text_width, y1), 
            color, 
            -1
        )
        
        # Draw text
        cv2.putText(
            img_copy, label, (x1, y1 - 5), 
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), thickness
        )
    
    return img_copy

app = FastAPI(title="AutoOD API", version="1.0.0")

# CORS middleware to allow React frontend to communicate (Updated for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For now, allow all origins to avoid deployment blockers. Can be restricted later.
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Initialize core components
model_manager = MultiModelManager()
exporter = Exporter()

# Pydantic models for request/response
class DetectionRequest(BaseModel):
    model: str = "yolo/yolov8n.pt"
    confidence: float = 0.25
    class_filter: Optional[List[str]] = None

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    class_name: str
    confidence: float
    attributes: Optional[Dict[str, Any]] = None

class AnnotationResponse(BaseModel):
    detections: List[Dict[str, Any]]
    image_size: Dict[str, int]
    total_objects: int
    class_counts: Dict[str, int]

class ExportRequest(BaseModel):
    annotations: List[Dict[str, Any]]
    image_size: Dict[str, int]
    formats: List[str]
    classes: List[str]

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "AutoOD API",
        "version": "1.0.0"
    }

@app.on_event("startup")
async def _prefetch():
    # Prefetch in a non-blocking way or skip if too slow
    # For now, let's keep it minimal to ensure fast health check
    pass

@app.get("/api/models")
async def get_models():
    try:
        models = model_manager.get_available_models()
        return {
            "models": models,
            "default": "yolo/yolov8n.pt",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect")
async def detect_objects(
    file: UploadFile = File(...),
    model: str = Form("yolo/yolov8n.pt"),
    confidence: float = Form(0.25),
    class_filter: Optional[str] = Form(None)
):
    """Detect objects in uploaded image"""
    try:
        print(f"Received detection request - model: {model}, confidence: {confidence}")
        
        # Read image file
        contents = await file.read()
        print(f"Image file size: {len(contents)} bytes")
        
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file - could not decode")
        
        print(f"Image decoded successfully - shape: {img.shape}")
        
        # Convert BGR to RGB for processing
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Parse class filter
        classes = None
        if class_filter:
            try:
                classes = json.loads(class_filter)
                print(f"Class filter applied: {classes}")
            except:
                classes = [c.strip() for c in class_filter.split(",") if c.strip()]
                print(f"Class filter (parsed): {classes}")
        
        print(f"Running detection with model: {model}")
        detections = model_manager.detect(model, img_rgb, conf=confidence, class_filter=classes)
        print(f"Detection completed - found {len(detections)} objects")
        
        # Calculate class counts
        class_counts = {}
        for det in detections:
            cls = det['class']
            class_counts[cls] = class_counts.get(cls, 0) + 1
        
        return {
            "detections": detections,
            "image_size": {
                "width": img.shape[1],
                "height": img.shape[0]
            },
            "total_objects": len(detections),
            "class_counts": class_counts
        }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect-annotated")
async def detect_and_annotate(
    file: UploadFile = File(...),
    model: str = Form("yolo/yolov8n.pt"),
    confidence: float = Form(0.25),
    class_filter: Optional[str] = Form(None)
):
    """Detect objects and return annotated image"""
    try:
        # Read image file
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file")
        
        # Convert BGR to RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Parse class filter
        classes = None
        if class_filter:
            try:
                classes = json.loads(class_filter)
            except:
                classes = [c.strip() for c in class_filter.split(",") if c.strip()]
        
        detections = model_manager.detect(model, img_rgb, conf=confidence, class_filter=classes)
        
        # Draw annotations
        annotated_img = draw_annotations(
            img_rgb,
            detections,
            color=(102, 126, 234),  # Purple color
            thickness=3
        )
        
        # Convert back to BGR for encoding
        annotated_img_bgr = cv2.cvtColor(annotated_img, cv2.COLOR_RGB2BGR)
        
        # Encode image to bytes
        _, buffer = cv2.imencode('.jpg', annotated_img_bgr)
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as tmp:
            tmp.write(buffer.tobytes())
            tmp_path = tmp.name
        
        # Calculate class counts
        class_counts = {}
        for det in detections:
            cls = det['class']
            class_counts[cls] = class_counts.get(cls, 0) + 1
        
        return FileResponse(
            tmp_path,
            media_type="image/jpeg",
            headers={
                "X-Total-Objects": str(len(detections)),
                "X-Class-Counts": json.dumps(class_counts)
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/classes")
async def get_available_classes():
    """Get available object classes from YOLO model"""
    try:
        # Get COCO classes (standard YOLO classes)
        coco_classes = [
            "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
            "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
            "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
            "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
            "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
            "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
            "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
            "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote",
            "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book",
            "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
        ]
        
        return {
            "classes": coco_classes,
            "total": len(coco_classes)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Create a 'dist' directory if it doesn't exist (it will hold the built frontend)
frontend_dist = os.path.join(os.path.dirname(__file__), "dist")
if not os.path.exists(frontend_dist):
    os.makedirs(frontend_dist, exist_ok=True)

# Serve static files from the dist directory
# Serve static files from the dist directory with SPA support
if os.path.exists(frontend_dist):
    # 1. Mount assets directory explicitly
    assets_path = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    # 2. Catch-all route to serve index.html for client-side routing
    # This must be defined AFTER all API routes
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Check if dynamic file exists in root of dist (e.g. favicon.ico, robots.txt)
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Fallback to index.html for all other routes (SPA)
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
            
        return JSONResponse(status_code=404, content={"message": "Frontend not found"})

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)