"""FastAPI Backend for AutoOD - Multi-model object detection API"""
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import cv2
import numpy as np
from PIL import Image
import io
import tempfile
import json
import os
import zipfile
import base64
from datetime import datetime
from pathlib import Path
import sys
from ultralytics import YOLO
import torch
from torchvision.transforms.functional import to_tensor
from torchvision.models.detection import (
    fasterrcnn_resnet50_fpn,
    FasterRCNN_ResNet50_FPN_Weights,
    maskrcnn_resnet50_fpn,
    MaskRCNN_ResNet50_FPN_Weights,
    retinanet_resnet50_fpn,
    RetinaNet_ResNet50_FPN_Weights,
    ssd300_vgg16,
    SSD300_VGG16_Weights,
)
from transformers import DetrImageProcessor, DetrForObjectDetection
from effdet import create_model



# Import only what we need, create custom classes to avoid streamlit dependency
class MultiModelManager:
    AVAILABLE = [
        "yolo/yolov8n.pt",
        "yolo/yolov8s.pt",
        "yolo/yolov8m.pt",
        "yolo/yolo11n.pt",
        "yolo/yolo11s.pt",
        "torchvision/fasterrcnn_resnet50_fpn",
        "torchvision/maskrcnn_resnet50_fpn",
        "torchvision/retinanet_resnet50_fpn",
        "torchvision/ssd300_vgg16",
        "transformers/detr_resnet50",
        "effdet/tf_efficientdet_d0",
        
    ]

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    def load_model(self, model_id: str):
        if model_id in self._cache:
            return self._cache[model_id]

        backend, name = model_id.split("/", 1)
        if backend == "yolo":
            model = YOLO(name)
            self._cache[model_id] = (model, None)
            return self._cache[model_id]
        elif backend == "torchvision":
            if name == "fasterrcnn_resnet50_fpn":
                weights = FasterRCNN_ResNet50_FPN_Weights.DEFAULT
                model = fasterrcnn_resnet50_fpn(weights=weights)
            elif name == "maskrcnn_resnet50_fpn":
                weights = MaskRCNN_ResNet50_FPN_Weights.DEFAULT
                model = maskrcnn_resnet50_fpn(weights=weights)
            elif name == "retinanet_resnet50_fpn":
                weights = RetinaNet_ResNet50_FPN_Weights.DEFAULT
                model = retinanet_resnet50_fpn(weights=weights)
            elif name == "ssd300_vgg16":
                weights = SSD300_VGG16_Weights.DEFAULT
                model = ssd300_vgg16(weights=weights)
            else:
                raise ValueError("Unsupported torchvision model")
            model.eval()
            categories = weights.meta.get("categories") if hasattr(weights, "meta") else None
            self._cache[model_id] = (model, categories)
            return self._cache[model_id]
        elif backend == "transformers":
            if name == "detr_resnet50":
                processor = DetrImageProcessor.from_pretrained("facebook/detr-resnet-50")
                model = DetrForObjectDetection.from_pretrained("facebook/detr-resnet-50")
            else:
                raise ValueError("Unsupported transformers model")
            model.eval()
            self._cache[model_id] = (model, {"processor": processor})
            return self._cache[model_id]
        elif backend == "effdet":
            if name == "tf_efficientdet_d0":
                model = create_model(name, pretrained=True, bench_task="predict")
            else:
                raise ValueError("Unsupported effdet model")
            model.eval()
            self._cache[model_id] = (model, None)
            return self._cache[model_id]
        else:
            raise ValueError("Unsupported backend")

    def get_available_models(self) -> List[str]:
        return list(self.AVAILABLE)

    def detect(self, model_id: str, image: np.ndarray, conf: float = 0.25,
               class_filter: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        try:
            backend, name = model_id.split("/", 1)
            print(f"Loading model: {model_id} (backend: {backend}, name: {name})")
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

        if backend == "torchvision":
            tensor = to_tensor(image)
            with torch.no_grad():
                outputs = model([tensor])[0]
            boxes = outputs.get("boxes")
            scores = outputs.get("scores")
            labels = outputs.get("labels")
            detections: List[Dict[str, Any]] = []
            for i in range(boxes.shape[0]):
                score = float(scores[i].item())
                if score < conf:
                    continue
                label_idx = int(labels[i].item())
                class_name = str(label_idx)
                if categories and 0 <= label_idx < len(categories):
                    class_name = categories[label_idx]
                if class_filter and class_name not in class_filter:
                    continue
                bbox = boxes[i].cpu().numpy().tolist()
                detections.append({
                    "class": class_name,
                    "confidence": score,
                    "bbox": bbox,
                    "shape": "rect",
                })
            return detections

        if backend == "transformers":
            meta = categories or {}
            processor = meta.get("processor")
            if processor is None:
                raise ValueError("DETR processor missing")
            pil = Image.fromarray(image)
            inputs = processor(images=pil, return_tensors="pt")
            with torch.no_grad():
                outputs = model(**inputs)
            target_sizes = torch.tensor([pil.size[::-1]])
            results = processor.post_process_object_detection(outputs, target_sizes=target_sizes)[0]
            detections: List[Dict[str, Any]] = []
            for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
                s = float(score.item())
                if s < conf:
                    continue
                cls = int(label.item())
                class_name = str(cls)
                if class_filter and class_name not in class_filter:
                    continue
                bbox = box.tolist()
                detections.append({
                    "class": class_name,
                    "confidence": s,
                    "bbox": bbox,
                    "shape": "rect",
                })
            return detections

        if backend == "effdet":
            pil = Image.fromarray(image).convert("RGB").resize((512, 512))
            tensor = to_tensor(pil).unsqueeze(0)
            with torch.no_grad():
                pred = model(tensor)
            # effdet returns list of dicts per batch
            boxes = scores = labels = None
            pred0 = pred
            if isinstance(pred, (list, tuple)):
                # Batch list
                pred0 = pred[0]
                if isinstance(pred0, (list, tuple)) and len(pred0) == 3:
                    boxes, scores, labels = pred0
                elif hasattr(pred0, "get"):
                    boxes = pred0.get("boxes")
                    scores = pred0.get("scores")
                    labels = pred0.get("labels") or pred0.get("classes")
                elif isinstance(pred0, torch.Tensor):
                    # Nx6: x1,y1,x2,y2,score,label
                    arr = pred0
                    if arr.ndim == 2 and arr.shape[1] >= 6:
                        boxes = arr[:, 0:4]
                        scores = arr[:, 4]
                        labels = arr[:, 5]
            elif hasattr(pred0, "get"):
                boxes = pred0.get("boxes")
                scores = pred0.get("scores")
                labels = pred0.get("labels") or pred0.get("classes")
            elif isinstance(pred0, torch.Tensor):
                arr = pred0
                if arr.ndim == 2 and arr.shape[1] >= 6:
                    boxes = arr[:, 0:4]
                    scores = arr[:, 4]
                    labels = arr[:, 5]
            detections: List[Dict[str, Any]] = []
            if boxes is not None and scores is not None and labels is not None:
                for bbox, score, label in zip(boxes, scores, labels):
                    s = float(score)
                    if s < conf:
                        continue
                    class_name = str(int(label))
                    if class_filter and class_name not in class_filter:
                        continue
                    detections.append({
                        "class": class_name,
                        "confidence": s,
                        "bbox": bbox.tolist() if hasattr(bbox, "tolist") else list(bbox),
                        "shape": "rect",
                    })
            return detections

        raise ValueError("Unsupported backend")

# Import exporter
from core.exporter import Exporter

# Helper functions for detection
def detect_objects_in_image(model_manager, image, model_name: str, conf: float = 0.25, 
                           class_filter: Optional[List[str]] = None) -> List[Dict]:
    """Detect objects in image using YOLO"""
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

# CORS middleware to allow React frontend to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize core components
model_manager = MultiModelManager()
exporter = Exporter()

# Pydantic models for request/response
class DetectionRequest(BaseModel):
    model: str = "yolov8n.pt"
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

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "AutoOD API",
        "version": "1.0.0"
    }

@app.on_event("startup")
async def _prefetch():
    ids = [
        "torchvision/fasterrcnn_resnet50_fpn",
        "torchvision/retinanet_resnet50_fpn",
        "torchvision/ssd300_vgg16",
    ]
    for mid in ids:
        try:
            model_manager.load_model(mid)
        except Exception:
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

@app.post("/api/detect-batch")
async def detect_objects_batch(
    files: List[UploadFile] = File(...),
    model: str = Form("yolo/yolov8n.pt"),
    confidence: float = Form(0.25),
    class_filter: Optional[str] = Form(None)
):
    """Detect objects in multiple uploaded images"""
    try:
        print(f"Received batch detection request - {len(files)} files, model: {model}, confidence: {confidence}")
        
        # Parse class filter
        classes = None
        if class_filter:
            try:
                classes = json.loads(class_filter)
                print(f"Class filter applied: {classes}")
            except:
                classes = [c.strip() for c in class_filter.split(",") if c.strip()]
                print(f"Class filter (parsed): {classes}")
        
        results = []
        processed_count = 0
        
        # Limit maximum number of images to prevent memory exhaustion
        MAX_IMAGES = 50
        if len(files) > MAX_IMAGES:
            print(f"Warning: Received {len(files)} files, limiting to {MAX_IMAGES}")
            files = files[:MAX_IMAGES]
        
        for i, file in enumerate(files):
            try:
                # Read image file
                contents = await file.read()
                print(f"Processing file {i+1}/{len(files)}: {file.filename} - {len(contents)} bytes")
                
                # Validate file size to prevent memory issues
                MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB limit
                if len(contents) > MAX_FILE_SIZE:
                    print(f"Warning: Skipping large file {file.filename} ({len(contents)} bytes)")
                    results.append({
                        "filename": file.filename,
                        "error": "File too large - maximum 50MB",
                        "detections": [],
                        "image_size": {"width": 0, "height": 0},
                        "total_objects": 0,
                        "class_counts": {}
                    })
                    continue
                
                nparr = np.frombuffer(contents, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if img is None:
                    print(f"Warning: Could not decode image {file.filename}")
                    results.append({
                        "filename": file.filename,
                        "error": "Invalid image file - could not decode",
                        "detections": [],
                        "image_size": {"width": 0, "height": 0},
                        "total_objects": 0,
                        "class_counts": {}
                    })
                    continue
                
                print(f"Image {i+1} decoded successfully - shape: {img.shape}")
                
                # Convert BGR to RGB for processing
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                
                # Run detection
                detections = model_manager.detect(model, img_rgb, conf=confidence, class_filter=classes)
                print(f"Image {i+1} detection completed - found {len(detections)} objects")
                
                # Calculate class counts
                class_counts = {}
                for det in detections:
                    cls = det['class']
                    class_counts[cls] = class_counts.get(cls, 0) + 1
                
                results.append({
                    "filename": file.filename,
                    "detections": detections,
                    "image_size": {
                        "width": img.shape[1],
                        "height": img.shape[0]
                    },
                    "total_objects": len(detections),
                    "class_counts": class_counts
                })
                
                processed_count += 1
                
                # Clear memory after processing each image
                del contents
                del nparr
                del img
                del img_rgb
                
            except Exception as e:
                print(f"Error processing file {file.filename}: {str(e)}")
                results.append({
                    "filename": file.filename,
                    "error": str(e),
                    "detections": [],
                    "image_size": {"width": 0, "height": 0},
                    "total_objects": 0,
                    "class_counts": {}
                })
        
        return {
            "results": results,
            "total_images": len(files),
            "successful_detections": len([r for r in results if not r.get("error")]),
            "total_objects": sum(r["total_objects"] for r in results)
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect-folder")
async def detect_objects_folder(
    files: List[UploadFile] = File(...),
    model: str = Form("yolo/yolov8n.pt"),
    confidence: float = Form(0.25),
    class_filter: Optional[str] = Form(None)
):
    """Detect objects in multiple uploaded files from folder selection"""
    try:
        print(f"Received folder detection request - {len(files)} files, model: {model}, confidence: {confidence}")
        
        # Parse class filter
        classes = None
        if class_filter:
            try:
                classes = json.loads(class_filter)
                print(f"Class filter applied: {classes}")
            except:
                classes = [c.strip() for c in class_filter.split(",") if c.strip()]
                print(f"Class filter (parsed): {classes}")
        
        results = []
        image_files = []
        processed_count = 0
        
        # Limit maximum number of images to prevent memory exhaustion
        MAX_IMAGES = 50
        if len(files) > MAX_IMAGES:
            print(f"Warning: Received {len(files)} files, limiting to {MAX_IMAGES}")
            files = files[:MAX_IMAGES]
        
        for i, file in enumerate(files):
            try:
                # Check if it's an image file by extension
                filename = file.filename or ""
                valid_extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp']
                file_ext = os.path.splitext(filename.lower())[1]
                
                if file_ext not in valid_extensions:
                    print(f"Skipping non-image file: {filename}")
                    continue
                
                # Read image file
                contents = await file.read()
                print(f"Processing file {i+1}/{len(files)}: {filename} - {len(contents)} bytes")
                
                # Validate file size to prevent memory issues
                MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB limit
                if len(contents) > MAX_FILE_SIZE:
                    print(f"Warning: Skipping large file {filename} ({len(contents)} bytes)")
                    results.append({
                        "filename": filename,
                        "error": "File too large - maximum 50MB",
                        "detections": [],
                        "image_size": {"width": 0, "height": 0},
                        "total_objects": 0,
                        "class_counts": {}
                    })
                    continue
                
                nparr = np.frombuffer(contents, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if img is None:
                    print(f"Warning: Could not decode image {filename}")
                    results.append({
                        "filename": filename,
                        "error": "Invalid image file - could not decode",
                        "detections": [],
                        "image_size": {"width": 0, "height": 0},
                        "total_objects": 0,
                        "class_counts": {}
                    })
                    continue
                
                print(f"Image {i+1} decoded successfully - shape: {img.shape}")
                
                # Convert BGR to RGB for processing
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                
                # Run detection
                detections = model_manager.detect(model, img_rgb, conf=confidence, class_filter=classes)
                print(f"Image {i+1} detection completed - found {len(detections)} objects")
                
                # Calculate class counts
                class_counts = {}
                for det in detections:
                    cls = det['class']
                    class_counts[cls] = class_counts.get(cls, 0) + 1
                
                results.append({
                    "filename": filename,
                    "detections": detections,
                    "image_size": {
                        "width": img.shape[1],
                        "height": img.shape[0]
                    },
                    "total_objects": len(detections),
                    "class_counts": class_counts
                })
                
                # Only create base64 URL for first few images to prevent memory issues
                if processed_count < 10:
                    image_files.append({
                        "filename": filename,
                        "url": f"data:image/{file_ext.replace('.', '')};base64,{base64.b64encode(contents).decode()}"
                    })
                else:
                    # For remaining images, just return filename
                    image_files.append({
                        "filename": filename,
                        "url": null
                    })
                
                processed_count += 1
                
                # Clear memory after processing each image
                del contents
                del nparr
                del img
                del img_rgb
                
            except Exception as e:
                print(f"Error processing file {filename}: {str(e)}")
                results.append({
                    "filename": filename,
                    "error": str(e),
                    "detections": [],
                    "image_size": {"width": 0, "height": 0},
                    "total_objects": 0,
                    "class_counts": {}
                })
        
        return {
            "results": results,
            "total_files": len(files),
            "total_images": processed_count,
            "successful_detections": len([r for r in results if not r.get("error")]),
            "total_objects": sum(r["total_objects"] for r in results),
            "image_files": image_files
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect-video")
async def detect_objects_video(
    file: UploadFile = File(...),
    model: str = Form("yolo/yolov8n.pt"),
    confidence: float = Form(0.25),
    class_filter: Optional[str] = Form(None),
    frame_interval: int = Form(1),  # Process every N frames
    max_frames: int = Form(100)     # Maximum frames to process
):
    """Detect objects in video file, processing frames at specified intervals"""
    try:
        print(f"Received video detection request - model: {model}, confidence: {confidence}, frame_interval: {frame_interval}, max_frames: {max_frames}")
        
        # Parse class filter
        classes = None
        if class_filter:
            try:
                classes = json.loads(class_filter)
                print(f"Class filter applied: {classes}")
            except:
                classes = [c.strip() for c in class_filter.split(",") if c.strip()]
                print(f"Class filter (parsed): {classes}")
        
        # Save uploaded video to temporary file
        contents = await file.read()
        
        # Validate file size to prevent memory issues
        MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200MB limit
        if len(contents) > MAX_VIDEO_SIZE:
            raise HTTPException(status_code=400, detail="Video file too large - maximum 200MB")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp_file:
            tmp_file.write(contents)
            tmp_video_path = tmp_file.name
        
        print(f"Video saved to temporary file: {tmp_video_path} - {len(contents)} bytes")
        
        # Clear contents from memory
        del contents
        
        # Open video with OpenCV
        cap = cv2.VideoCapture(tmp_video_path)
        if not cap.isOpened():
            os.unlink(tmp_video_path)
            raise HTTPException(status_code=400, detail="Could not open video file")
        
        # Get video properties
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        print(f"Video properties - total_frames: {total_frames}, fps: {fps}, width: {width}, height: {height}")
        
        # Calculate which frames to process
        frames_to_process = []
        frame_count = 0
        processed_count = 0
        
        while cap.isOpened() and processed_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
                
            # Process every Nth frame
            if frame_count % frame_interval == 0:
                frames_to_process.append({
                    "frame_number": frame_count,
                    "timestamp": frame_count / fps if fps > 0 else 0
                })
                processed_count += 1
            
            frame_count += 1
        
        cap.release()
        print(f"Will process {len(frames_to_process)} frames")
        
        # Process selected frames
        results = []
        cap = cv2.VideoCapture(tmp_video_path)
        
        # Limit maximum frames to prevent memory exhaustion
        MAX_FRAMES = 100
        if len(frames_to_process) > MAX_FRAMES:
            print(f"Warning: Too many frames to process ({len(frames_to_process)}), limiting to {MAX_FRAMES}")
            frames_to_process = frames_to_process[:MAX_FRAMES]
        
        for i, frame_info in enumerate(frames_to_process):
            # Seek to the specific frame
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_info["frame_number"])
            ret, frame = cap.read()
            
            if not ret:
                print(f"Warning: Could not read frame {frame_info['frame_number']}")
                continue
            
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Run detection
            detections = model_manager.detect(model, frame_rgb, conf=confidence, class_filter=classes)
            print(f"Frame {i+1}/{len(frames_to_process)} (frame {frame_info['frame_number']}) - found {len(detections)} objects")
            
            # Calculate class counts
            class_counts = {}
            for det in detections:
                cls = det['class']
                class_counts[cls] = class_counts.get(cls, 0) + 1
            
            results.append({
                "frame_number": frame_info["frame_number"],
                "timestamp": frame_info["timestamp"],
                "detections": detections,
                "image_size": {
                    "width": width,
                    "height": height
                },
                "total_objects": len(detections),
                "class_counts": class_counts
            })
            
            # Clear frame from memory to prevent accumulation
            del frame
            del frame_rgb
        
        cap.release()
        os.unlink(tmp_video_path)  # Clean up temporary file
        
        return {
            "results": results,
            "video_properties": {
                "total_frames": total_frames,
                "fps": fps,
                "width": width,
                "height": height
            },
            "processing_info": {
                "frame_interval": frame_interval,
                "max_frames": max_frames,
                "processed_frames": len(results),
                "total_objects": sum(r["total_objects"] for r in results)
            }
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/export")
async def export_annotations(request: ExportRequest, background_tasks: BackgroundTasks):
    """Export annotations in various formats as a ZIP file"""
    try:
        # Create a temporary directory for this export
        with tempfile.TemporaryDirectory() as temp_dir:
            # Initialize custom exporter for this directory
            local_exporter = Exporter(export_dir=temp_dir)
            
            # Prepare data
            filename = "image" # Default filename since we handle single image
            annotations_dict = {filename: request.annotations}
            image_sizes = {filename: (request.image_size["width"], request.image_size["height"])}
            
            # Export requested formats
            if "YOLO" in request.formats:
                local_exporter.export_yolo(annotations_dict, image_sizes, request.classes)
                # This creates 'yolo' folder and 'yolo_annotations.zip' inside temp_dir
                # We can remove the inner zip to avoid redundancy if we want, or keep it.
                # Let's keep the folder structure clean.
            
            if "CSV" in request.formats:
                local_exporter.export_csv(annotations_dict)
            
            if "JSON" in request.formats:
                metadata = {
                    'classes': request.classes,
                    'total_annotations': len(request.annotations)
                }
                local_exporter.export_json(annotations_dict, metadata)
            
            if "COCO" in request.formats:
                local_exporter.export_coco(annotations_dict, image_sizes, request.classes)
            
            # Create master zip file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            zip_filename = f"autood_export_{timestamp}.zip"
            zip_path = os.path.join(tempfile.gettempdir(), zip_filename)
            
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        # Skip valid zips generated by sub-routines to avoid nested zips?
                        # exporter.export_yolo generates a zip.
                        if file.endswith('.zip'):
                            continue
                            
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, temp_dir)
                        zipf.write(file_path, arcname)
            
            # Schedule cleanup
            background_tasks.add_task(os.remove, zip_path)
            
            return FileResponse(
                zip_path,
                media_type="application/zip",
                filename=zip_filename
            )
            
    except Exception as e:
        import traceback
        traceback.print_exc()
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
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.staticfiles import StaticFiles
import os

# Create a 'dist' directory if it doesn't exist (it will hold the built frontend)
frontend_dist = os.path.join(os.path.dirname(__file__), "dist")
if not os.path.exists(frontend_dist):
    os.makedirs(frontend_dist, exist_ok=True)

# Mount the static files (built frontend)
app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
from transformers import DetrImageProcessor, DetrForObjectDetection
from effdet import create_model
