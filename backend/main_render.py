import os
import sys
import asyncio
from dotenv import load_dotenv

# Load environment variables early for all modules
load_dotenv()

import logging
import gc
import torch
import cv2
import numpy as np
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from ultralytics import YOLO
import json
import io
from PIL import Image
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from core.database import init_db, save_annotation, get_expired_records, get_collection
from core.storage import upload_image, delete_image

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("AutoOD-Render")

# Monkeypatch torch._six for NanoDet compatibility with Torch 2.x
try:
    import types
    if not hasattr(torch, "_six"):
        torch_six = types.ModuleType("torch._six")
        torch_six.string_classes = (str,)
        torch_six.int_classes = (int,)
        sys.modules["torch._six"] = torch_six
        logger.info("Monkeypatched torch._six for NanoDet compatibility.")
except Exception as e:
    logger.error(f"Failed to monkeypatch torch._six: {e}")

app = FastAPI(title="AutoOD Optimized API", version="1.2.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Scheduler
async_scheduler = AsyncIOScheduler()

async def daily_cleanup_job():
    logger.info("Starting scheduled cleanup job...")
    try:
        # We target records older than 7 days
        expired_records = await get_expired_records(days=7)
        deleted_count = 0
        coll = get_collection()
        
        if not expired_records:
            logger.info("No expired records found to clean up.")
            return

        logger.info(f"Found {len(expired_records)} expired records. Processing...")
        
        for record in expired_records:
            public_id = record.get("public_id")
            image_deleted = True
            
            if public_id:
                # Cloudinary delete is synchronous, run in thread to avoid blocking the event loop
                image_deleted = await asyncio.to_thread(delete_image, public_id)
                if image_deleted:
                    logger.info(f"Deleted image from Cloudinary: {public_id}")
                else:
                    logger.warning(f"Failed to delete image from Cloudinary: {public_id}")
            
            if image_deleted and coll is not None:
                await coll.delete_one({"_id": record["_id"]})
                deleted_count += 1
                
        logger.info(f"Scheduled cleanup finished. Successfully deleted {deleted_count} database records.")
    except Exception as e:
        logger.error(f"Error in daily cleanup job: {e}")

@app.on_event("startup")
async def startup_event():
    # Initialize Database
    db_success = await init_db()
    if not db_success:
        logger.error("Failed to initialize database on startup. Some features may be unavailable.")
    else:
        logger.info("Database initialized successfully on startup.")
    
    # Start Scheduler (Daily at 00:00)
    if torch.cuda.is_available():
        async_scheduler.add_job(lambda: torch.cuda.empty_cache(), 'interval', hours=1) # Periodic memory clear
    async_scheduler.add_job(daily_cleanup_job, 'cron', hour=0, minute=0)
    async_scheduler.start()
    logger.info("Background scheduler started.")

# Global variables for the SINGLETON model
CURRENT_MODEL_ID = None
ACTIVE_MODEL = None

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "dist")
NANODET_REPO_DIR = os.path.join(BASE_DIR, "nanodet")
YOLO_WEIGHTS_PATH = os.path.join(BASE_DIR, "yolov8n.pt")
NANODET_WEIGHTS_PATH = os.path.join(BASE_DIR, "nanodet-plus-m_416_checkpoint.ckpt")
NANODET_CONFIG_PATH = os.path.join(BASE_DIR, "nanodet-plus-m_416.yml")

def unload_current_model():
    """Explicitly unload the current model to free memory"""
    global ACTIVE_MODEL, CURRENT_MODEL_ID
    if ACTIVE_MODEL is not None:
        logger.info(f"Unloading model: {CURRENT_MODEL_ID}")
        del ACTIVE_MODEL
        ACTIVE_MODEL = None
        CURRENT_MODEL_ID = None
        
        # Force garbage collection
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Memory cleared after unloading model.")

def load_yolo():
    global ACTIVE_MODEL, CURRENT_MODEL_ID
    if CURRENT_MODEL_ID == "yolov8n" and ACTIVE_MODEL is not None:
        return ACTIVE_MODEL
    
    unload_current_model()
    
    logger.info("Loading YOLOv8n model...")
    try:
        ACTIVE_MODEL = YOLO(YOLO_WEIGHTS_PATH)
        CURRENT_MODEL_ID = "yolov8n"
        logger.info("YOLOv8n model loaded successfully.")
        return ACTIVE_MODEL
    except Exception as e:
        logger.error(f"Error loading YOLOv8n: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load YOLOv8n: {str(e)}")

def load_nanodet():
    global ACTIVE_MODEL, CURRENT_MODEL_ID
    if CURRENT_MODEL_ID == "nanodet" and ACTIVE_MODEL is not None:
        return ACTIVE_MODEL
    
    unload_current_model()
    
    logger.info("Loading NanoDet model...")
    try:
        if not os.path.exists(NANODET_REPO_DIR):
            raise Exception(f"NanoDet repository not found at {NANODET_REPO_DIR}")
            
        if NANODET_REPO_DIR not in sys.path:
            sys.path.append(NANODET_REPO_DIR)
        
        from demo.demo import Predictor
        from nanodet.util import cfg, load_config, Logger
        
        if not os.path.exists(NANODET_CONFIG_PATH) or not os.path.exists(NANODET_WEIGHTS_PATH):
            raise Exception("NanoDet weights or config missing.")
            
        load_config(cfg, NANODET_CONFIG_PATH)
        nanodet_logger = Logger(-1, use_tensorboard=False)
        ACTIVE_MODEL = Predictor(cfg, NANODET_WEIGHTS_PATH, nanodet_logger, device=torch.device('cpu'))
        CURRENT_MODEL_ID = "nanodet"
        logger.info("NanoDet model loaded successfully.")
        return ACTIVE_MODEL
    except Exception as e:
        logger.error(f"Error loading NanoDet: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to load NanoDet: {str(e)}")

def run_yolov8n(image: np.ndarray, model_instance, confidence: float = 0.25) -> List[Dict[str, Any]]:
    results = model_instance.predict(image, conf=confidence, verbose=False)[0]
    detections = []
    
    for box in results.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        conf = float(box.conf[0])
        cls_id = int(box.cls[0])
        class_name = results.names[cls_id]
        
        detections.append({
            "class": class_name,
            "confidence": round(conf, 4),
            "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)]
        })
    
    return detections

def run_nanodet(image: np.ndarray, model_instance, confidence: float = 0.25) -> List[Dict[str, Any]]:
    # NanoDet inference
    meta, res_list = model_instance.inference(image)
    res = res_list[0] if isinstance(res_list, (list, tuple)) and len(res_list) > 0 else res_list
    if isinstance(res, dict) and 0 in res and isinstance(res[0], dict):
        res = res[0]
    
    detections = []
    from nanodet.util import cfg
    class_names = cfg.class_names
    
    for class_id, boxes in res.items():
        if not isinstance(boxes, (list, np.ndarray)):
            continue
            
        for box in boxes:
            if len(box) < 5: continue
            score = float(box[4])
            if score < confidence: continue
            
            x1, y1, x2, y2 = box[:4]
            class_name = class_names[class_id]
            
            detections.append({
                "class": class_name,
                "confidence": round(score, 4),
                "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)]
            })
            
    return detections

@app.get("/api/models")
async def get_models():
    """Endpoint for frontend to discover supported models"""
    return {
        "models": ["M873.V1", "M873.V2"],
        "default": "M873.V1"
    }

@app.post("/api/detect")
async def detect(
    file: UploadFile = File(...),
    model: str = Form(...),
    confidence: float = Form(0.25),
    class_filter: str = Form("[]")
):
    """Unified detection endpoint with strict singleton memory management"""
    logger.info(f"Detection request - Model: {model} - Conf: {confidence} - Filter: {class_filter}")
    
    model_mapping = {
        "M873.V1": "yolov8n",
        "M873.V2": "nanodet",
        "yolov8n": "yolov8n",
        "nanodet": "nanodet"
    }
    
    target_id = model_mapping.get(model)
    if not target_id:
        raise HTTPException(status_code=400, detail=f"Invalid model '{model}'")

    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")

        if target_id == "yolov8n":
            model_instance = load_yolo()
            detections = run_yolov8n(img, model_instance, confidence)
        else:
            model_instance = load_nanodet()
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            detections = run_nanodet(img_rgb, model_instance, confidence)
        
        # Apply class filter if provided
        try:
            filter_list = json.loads(class_filter)
            if filter_list and isinstance(filter_list, list) and len(filter_list) > 0:
                logger.info(f"Filtering results by: {filter_list}")
                detections = [d for d in detections if d["class"] in filter_list]
        except Exception as e:
            logger.warning(f"Failed to parse class_filter: {e}")
            
        # --- NEW: MongoDB & Cloudinary Integration ---
        try:
            # Prepare image for Cloudinary
            _, buffer = cv2.imencode('.jpg', img)
            img_bytes = buffer.tobytes()
            
            # Upload to Cloudinary (Run in thread to avoid blocking)
            storage_result = await asyncio.to_thread(upload_image, img_bytes)
            if storage_result:
                # Save metadata to MongoDB
                annotation_record = {
                    "model": model,
                    "confidence_threshold": confidence,
                    "detections": detections,
                    "image_url": storage_result["secure_url"],
                    "public_id": storage_result["public_id"],
                    "timestamp": datetime.utcnow().isoformat(),
                    "createdAt": datetime.utcnow() # Ensure field matches TTL index
                }
                await save_annotation(annotation_record)
                logger.info(f"Record saved to MongoDB. Cloudinary URL: {storage_result['secure_url']}")
        except Exception as e:
            logger.error(f"Failed to save record to MongoDB/Cloudinary: {e}")
            # We don't raise HTTPException here to ensure zero breaking changes for the user
            # The system remains functional even if DB/Storage fails.
            
        return detections

    except Exception as e:
        logger.error(f"Inference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect-folder")
async def detect_folder(
    files: List[UploadFile] = File(...),
    model: str = Form(...),
    confidence: float = Form(0.25)
):
    """Batch folder detection endpoint"""
    logger.info(f"Folder detection request: {len(files)} files - Model: {model}")
    
    results = []
    processed_count = 0
    total_objects = 0
    
    # We load the model ONCE for the whole batch
    model_mapping = {"M873.V1": "yolov8n", "M873.V2": "nanodet"}
    target_id = model_mapping.get(model, "yolov8n")
    
    if target_id == "yolov8n":
        model_instance = load_yolo()
    else:
        model_instance = load_nanodet()

    for file in files:
        try:
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                results.append({"filename": file.filename, "error": "Invalid image"})
                continue

            if target_id == "yolov8n":
                detections = run_yolov8n(img, model_instance)
            else:
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                detections = run_nanodet(img_rgb, model_instance)
            
            results.append({
                "filename": file.filename,
                "detections": detections
            })
            processed_count += 1
            total_objects += len(detections)
            
            # --- NEW: MongoDB & Cloudinary Integration for Batch ---
            try:
                _, buffer = cv2.imencode('.jpg', img)
                img_bytes = buffer.tobytes()
                storage_result = await asyncio.to_thread(upload_image, img_bytes)
                if storage_result:
                    annotation_record = {
                        "filename": file.filename,
                        "model": model,
                        "confidence_threshold": confidence,
                        "detections": detections,
                        "image_url": storage_result["secure_url"],
                        "public_id": storage_result["public_id"],
                        "timestamp": datetime.utcnow().isoformat(),
                        "createdAt": datetime.utcnow()
                    }
                    await save_annotation(annotation_record)
            except Exception as e:
                logger.error(f"Failed to save batch record: {e}")
                
        except Exception as e:
            results.append({"filename": file.filename, "error": str(e)})

    return {
        "results": results,
        "total_images": len(files),
        "processed_count": processed_count,
        "total_objects": total_objects,
        "image_files": [{"url": f"/temp/{f.filename}", "filename": f.filename} for f in files] # Placeholder URLs
    }

@app.post("/api/detect-video")
async def detect_video(
    file: UploadFile = File(...),
    model: str = Form(...),
    frame_interval: int = Form(10),
    max_frames: int = Form(50)
):
    """Stub for video detection endpoint"""
    logger.info(f"Video detection request received - Model: {model}")
    return {
        "message": "Video detection is currently in beta. Frame-by-frame processing is supported via individual /api/detect calls.",
        "results": [],
        "total_frames": 0
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "current_model": CURRENT_MODEL_ID,
        "memory_info": "Strict singleton mode active"
    }

@app.post("/api/clear-cache")
async def clear_cache():
    """Manually trigger model unloading and garbage collection"""
    global ACTIVE_MODEL, CURRENT_MODEL_ID
    unload_current_model()
    return {"message": "Memory cache cleared successfully"}

# --- Mount Static Files (Frontend) ---
if os.path.exists(DIST_DIR):
    logger.info(f"Mounting static files from {DIST_DIR}")
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # API routes should be handled by their respective decorators
        if full_path.startswith("api/") or full_path == "health" or full_path == "docs" or full_path == "openapi.json":
            raise HTTPException(status_code=404)
        
        # Serve actual files if they exist in dist
        file_path = os.path.join(DIST_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Fallback to index.html for SPA routing
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
else:
    logger.warning(f"Frontend dist directory not found at {DIST_DIR}. Frontend will not be served.")
    @app.get("/")
    async def root():
        return {"message": "AutoOD API is running. Frontend dist not found."}

@app.post("/api/cleanup-expired")
async def trigger_cleanup_expired():
    """Manually trigger the cleanup of expired records and images (useful for external cron services)"""
    await daily_cleanup_job()
    return {"message": "Cleanup job for expired records triggered successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
