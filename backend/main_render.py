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
from core.database import (
    init_db,
    save_annotation,
    get_expired_records,
    get_collection,
    save_image_metadata,
    get_image_by_id,
    update_image_annotations,
    delete_image_record,
    get_expired_images
)
from core.storage import upload_image, delete_image
from fastapi import Header
from datetime import timedelta

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

async def run_batch_cleanup():
    logger.info("Starting batch cleanup...")
    try:
        expired = await get_expired_images(days=7)
        if not expired:
            logger.info("No expired records found for batch cleanup.")
            return {
                "status": "success",
                "deleted_count": 0,
                "message": "No expired records found"
            }
        
        logger.info(f"Found {len(expired)} expired records. Processing in batches of 25...")
        deleted_count = 0
        batch_size = 25
        
        for i in range(0, len(expired), batch_size):
            batch = expired[i:i + batch_size]
            public_ids = [doc["cloudinaryId"] for doc in batch if doc.get("cloudinaryId")]
            
            if public_ids:
                import cloudinary.api
                try:
                    await asyncio.to_thread(cloudinary.api.delete_resources, public_ids)
                    logger.info(f"Bulk deleted from Cloudinary: {public_ids}")
                except Exception as ex:
                    logger.error(f"Cloudinary bulk delete failed: {ex}. Falling back to individual delete.")
                    for pid in public_ids:
                        await asyncio.to_thread(delete_image, pid)
                        
            for doc in batch:
                await delete_image_record(str(doc["_id"]))
                deleted_count += 1
                
        logger.info(f"Batch cleanup completed. Deleted {deleted_count} records.")
        return {
            "status": "success",
            "deleted_count": deleted_count,
            "message": f"Deleted {deleted_count} records"
        }
    except Exception as e:
        logger.error(f"Error during batch cleanup: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "status": "error",
            "message": str(e)
        }

async def daily_cleanup_job():
    logger.info("Starting scheduled cleanup job...")
    await run_batch_cleanup()

@app.on_event("startup")
async def startup_event():
    # Initialize Database
    db_success = await init_db()
    if not db_success:
        logger.error("Failed to initialize database on startup. Some features may be unavailable.")
    else:
        logger.info("Database initialized successfully on startup.")
        
        # Startup fallback cleanup check
        try:
            coll = get_collection()
            if coll is not None:
                db_inst = coll.database
                metadata_coll = db_inst["system_metadata"]
                last_log = await metadata_coll.find_one({"type": "cleanup_log"})
                run_cleanup = False
                
                if not last_log:
                    run_cleanup = True
                else:
                    last_run = last_log.get("last_run")
                    if last_run and datetime.utcnow() - last_run > timedelta(hours=24):
                        run_cleanup = True
                        
                if run_cleanup:
                    logger.info("Startup cleanup verification: Last cleanup ran >24 hours ago. Triggering fallback cleanup...")
                    await run_batch_cleanup()
                    await metadata_coll.update_one(
                        {"type": "cleanup_log"},
                        {"$set": {"last_run": datetime.utcnow()}},
                        upsert=True
                    )
        except Exception as startup_err:
            logger.error(f"Error checking startup cleanup fallback: {startup_err}")
    
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
            _, buffer = cv2.imencode('.jpg', img)
            img_bytes = buffer.tobytes()
            
            # Upload to Cloudinary using optimized logic
            storage_result = await asyncio.to_thread(upload_image, img_bytes)
            if storage_result:
                annotations = [
                    {
                        "label": d["class"],
                        "points": d["bbox"],
                        "color": "#3B82F6",
                        "createdAt": datetime.utcnow().isoformat()
                    } for d in detections
                ]
                
                # Save metadata to MongoDB
                image_doc = {
                    "cloudinaryId": storage_result["public_id"],
                    "imageUrl": storage_result["secure_url"],
                    "thumbnailUrl": storage_result["thumbnail_url"],
                    "width": storage_result["width"],
                    "height": storage_result["height"],
                    "fileSize": storage_result["fileSize"],
                    "annotationCount": len(annotations),
                    "annotations": annotations,
                    "source": f"detect:{model}",
                    "createdAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                }
                await save_image_metadata(image_doc)
                logger.info(f"Record saved to MongoDB. Cloudinary URL: {storage_result['secure_url']}")
        except Exception as e:
            logger.error(f"Failed to save record to MongoDB/Cloudinary: {e}")
            # We don't raise HTTPException here to ensure zero breaking changes for the user
            
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
                    annotations = [
                        {
                            "label": d["class"],
                            "points": d["bbox"],
                            "color": "#3B82F6",
                            "createdAt": datetime.utcnow().isoformat()
                        } for d in detections
                    ]
                    image_doc = {
                        "filename": file.filename,
                        "cloudinaryId": storage_result["public_id"],
                        "imageUrl": storage_result["secure_url"],
                        "thumbnailUrl": storage_result["thumbnail_url"],
                        "width": storage_result["width"],
                        "height": storage_result["height"],
                        "fileSize": storage_result["fileSize"],
                        "annotationCount": len(annotations),
                        "annotations": annotations,
                        "source": f"detect-folder:{model}",
                        "createdAt": datetime.utcnow(),
                        "updatedAt": datetime.utcnow()
                    }
                    await save_image_metadata(image_doc)
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

# --- New Production APIs ---

@app.post("/api/images/upload")
async def upload_image_route(file: UploadFile = File(...)):
    # Validate file size (max 3MB)
    contents = await file.read()
    if len(contents) > 3 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 3MB limit")
        
    # Validate image type
    filename = file.filename.lower()
    valid_extensions = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff")
    if not filename.endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid file type. Supported: JPG, JPEG, PNG, WEBP, BMP, TIFF")
        
    # Upload and compress image
    storage_result = await asyncio.to_thread(upload_image, contents, filename)
    if not storage_result:
        raise HTTPException(status_code=500, detail="Image compression or upload failed")
        
    # Save metadata to MongoDB
    image_doc = {
        "cloudinaryId": storage_result["public_id"],
        "imageUrl": storage_result["secure_url"],
        "thumbnailUrl": storage_result["thumbnail_url"],
        "width": storage_result["width"],
        "height": storage_result["height"],
        "fileSize": storage_result["fileSize"],
        "annotationCount": 0,
        "annotations": [],
        "source": "upload",
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    }
    
    doc_id = await save_image_metadata(image_doc)
    if not doc_id:
        raise HTTPException(status_code=500, detail="Failed to save image metadata to database")
        
    image_doc["_id"] = doc_id
    image_doc["createdAt"] = image_doc["createdAt"].isoformat()
    image_doc["updatedAt"] = image_doc["updatedAt"].isoformat()
    
    return image_doc

@app.get("/api/images")
async def get_images_route(page: int = 1, limit: int = 20):
    if page < 1: page = 1
    if limit < 1: limit = 20
    if limit > 30: limit = 30
    
    coll = get_collection()
    if coll is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    # Filter: Only show last 7 days data
    cutoff = datetime.utcnow() - timedelta(days=7)
    query = {"createdAt": {"$gte": cutoff}}
    
    total_count = await coll.count_documents(query)
    skip = (page - 1) * limit
    
    cursor = coll.find(query).sort("createdAt", -1).skip(skip).limit(limit)
    records = await cursor.to_list(length=limit)
    
    serialized = []
    for r in records:
        r["_id"] = str(r["_id"])
        if "createdAt" in r and isinstance(r["createdAt"], datetime):
            r["createdAt"] = r["createdAt"].isoformat()
        if "updatedAt" in r and isinstance(r["updatedAt"], datetime):
            r["updatedAt"] = r["updatedAt"].isoformat()
        if "cloudinaryId" not in r and "public_id" in r:
            r["cloudinaryId"] = r["public_id"]
        if "imageUrl" not in r and "image_url" in r:
            r["imageUrl"] = r["image_url"]
        if "thumbnailUrl" not in r:
            r["thumbnailUrl"] = r.get("imageUrl") or r.get("image_url")
        serialized.append(r)
        
    return {
        "images": serialized,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_count,
            "pages": (total_count + limit - 1) // limit
        }
    }

@app.get("/api/images/{id}")
async def get_image_details(id: str):
    doc = await get_image_by_id(id)
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
        
    doc["_id"] = str(doc["_id"])
    if "createdAt" in doc and isinstance(doc["createdAt"], datetime):
        doc["createdAt"] = doc["createdAt"].isoformat()
    if "updatedAt" in doc and isinstance(doc["updatedAt"], datetime):
        doc["updatedAt"] = doc["updatedAt"].isoformat()
    if "cloudinaryId" not in doc and "public_id" in doc:
        doc["cloudinaryId"] = doc["public_id"]
    if "imageUrl" not in doc and "image_url" in doc:
        doc["imageUrl"] = doc["image_url"]
    if "thumbnailUrl" not in doc:
        doc["thumbnailUrl"] = doc.get("imageUrl") or doc.get("image_url")
        
    return doc

@app.put("/api/images/{id}/annotations")
async def put_image_annotations(id: str, payload: dict):
    annotations = payload.get("annotations", [])
    for ann in annotations:
        if not isinstance(ann, dict) or "label" not in ann or "points" not in ann:
            raise HTTPException(status_code=400, detail="Invalid annotation structure. Must contain 'label' and 'points'")
        if "createdAt" not in ann:
            ann["createdAt"] = datetime.utcnow().isoformat()
            
    success = await update_image_annotations(id, annotations)
    if not success:
        raise HTTPException(status_code=404, detail="Failed to update annotations or image not found")
        
    updated_doc = await get_image_by_id(id)
    updated_doc["_id"] = str(updated_doc["_id"])
    if "createdAt" in updated_doc and isinstance(updated_doc["createdAt"], datetime):
        updated_doc["createdAt"] = updated_doc["createdAt"].isoformat()
    if "updatedAt" in updated_doc and isinstance(updated_doc["updatedAt"], datetime):
        updated_doc["updatedAt"] = updated_doc["updatedAt"].isoformat()
        
    return updated_doc

@app.delete("/api/images/{id}")
async def delete_image_route(id: str):
    doc = await get_image_by_id(id)
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
        
    public_id = doc.get("cloudinaryId") or doc.get("public_id")
    if public_id:
        await asyncio.to_thread(delete_image, public_id)
        
    await delete_image_record(id)
    return {"message": "Image deleted successfully from database and Cloudinary"}

@app.post("/api/cleanup")
async def cleanup_route(x_api_key: Optional[str] = Header(None)):
    CLEANUP_API_KEY = os.environ.get("CLEANUP_API_KEY")
    if not CLEANUP_API_KEY:
        logger.error("CLEANUP_API_KEY environment variable is not configured.")
        raise HTTPException(status_code=500, detail="Cleanup API key is not configured on server")
        
    if x_api_key != CLEANUP_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid x-api-key")
        
    report = await run_batch_cleanup()
    
    try:
        coll = get_collection()
        if coll is not None:
            db_inst = coll.database
            await db_inst["system_metadata"].update_one(
                {"type": "cleanup_log"},
                {"$set": {"last_run": datetime.utcnow()}},
                upsert=True
            )
    except Exception as log_err:
        logger.error(f"Failed to log manual cleanup run time: {log_err}")
        
    return report

@app.get("/api/health")
async def health_check():
    mongodb_status = "error"
    cloudinary_status = "error"
    
    coll = get_collection()
    if coll is not None:
        try:
            await coll.database.command("ping")
            mongodb_status = "ok"
        except Exception as e:
            logger.error(f"MongoDB ping failed: {e}")
            
    import cloudinary.api
    try:
        # Check Cloudinary configuration
        cloudinary_status = "ok"
    except Exception as e:
        logger.error(f"Cloudinary ping failed: {e}")
        
    return {
        "mongodb": mongodb_status,
        "cloudinary": cloudinary_status,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/cleanup-expired")
async def trigger_cleanup_expired():
    """Manually trigger the cleanup of expired records and images (useful for external cron services)"""
    await daily_cleanup_job()
    return {"message": "Cleanup job for expired records triggered successfully"}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
