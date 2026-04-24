import os
import sys
import logging
import json
import torch
import cv2
import numpy as np
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("AutoOD-Backend")

# Monkeypatch torch._six for NanoDet compatibility with Torch 2.x
try:
    import torch
    import types
    if not hasattr(torch, "_six"):
        torch_six = types.ModuleType("torch._six")
        torch_six.string_classes = (str,)
        torch_six.int_classes = (int,)
        sys.modules["torch._six"] = torch_six
        logger.info("Monkeypatched torch._six for NanoDet compatibility.")
except Exception as e:
    logger.error(f"Failed to monkeypatch torch._six: {e}")

app = FastAPI(title="AutoOD Backend", version="1.1.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for models
YOLO_MODEL = None
NANODET_PREDICTOR = None

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NANODET_REPO_DIR = os.path.join(BASE_DIR, "nanodet")
YOLO_WEIGHTS_PATH = os.path.join(BASE_DIR, "yolov8n.pt")
NANODET_WEIGHTS_PATH = os.path.join(BASE_DIR, "nanodet-plus-m_416_checkpoint.ckpt")
NANODET_CONFIG_PATH = os.path.join(BASE_DIR, "nanodet-plus-m_416.yml")

def init_yolo():
    global YOLO_MODEL
    try:
        if os.path.exists(YOLO_WEIGHTS_PATH):
            YOLO_MODEL = YOLO(YOLO_WEIGHTS_PATH)
            logger.info("YOLOv8n model loaded successfully.")
        else:
            logger.warning(f"YOLOv8n weights not found at {YOLO_WEIGHTS_PATH}. Will load on first request.")
    except Exception as e:
        logger.error(f"Error initializing YOLOv8n: {e}")

def init_nanodet():
    global NANODET_PREDICTOR
    try:
        if os.path.exists(NANODET_REPO_DIR):
            if NANODET_REPO_DIR not in sys.path:
                sys.path.append(NANODET_REPO_DIR)
            
            from demo.demo import Predictor
            from nanodet.util import cfg, load_config, Logger
            
            if os.path.exists(NANODET_CONFIG_PATH) and os.path.exists(NANODET_WEIGHTS_PATH):
                load_config(cfg, NANODET_CONFIG_PATH)
                nanodet_logger = Logger(-1, use_tensorboard=False)
                NANODET_PREDICTOR = Predictor(cfg, NANODET_WEIGHTS_PATH, nanodet_logger, device=torch.device('cpu'))
                logger.info("NanoDet predictor initialized successfully.")
            else:
                logger.warning("NanoDet weights or config missing. Check setup instructions.")
        else:
            logger.warning(f"NanoDet repository not found at {NANODET_REPO_DIR}. Please clone it.")
    except Exception as e:
        import traceback
        logger.error(f"Error initializing NanoDet: {e}")
        logger.error(traceback.format_exc())

@app.on_event("startup")
async def startup_event():
    init_yolo()
    init_nanodet()

def run_yolov8n(image: np.ndarray) -> List[Dict[str, Any]]:
    """Inference for YOLOv8n"""
    global YOLO_MODEL
    if YOLO_MODEL is None:
        YOLO_MODEL = YOLO(YOLO_WEIGHTS_PATH)
    
    results = YOLO_MODEL.predict(image, conf=0.25, verbose=False)[0]
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

def run_nanodet(image: np.ndarray) -> List[Dict[str, Any]]:
    """Inference for NanoDet"""
    global NANODET_PREDICTOR
    if NANODET_PREDICTOR is None:
        init_nanodet()
        if NANODET_PREDICTOR is None:
            raise HTTPException(status_code=500, detail="NanoDet model not initialized. Check server logs.")
    
    # NanoDet-Plus often returns a double-nested dict {0: {class_id: [boxes]}}
    meta, res_list = NANODET_PREDICTOR.inference(image)
    res = res_list[0] if isinstance(res_list, (list, tuple)) and len(res_list) > 0 else res_list
    if isinstance(res, dict) and 0 in res and isinstance(res[0], dict):
        res = res[0]
    
    detections = []
    from nanodet.util import cfg
    class_names = cfg.class_names
    
    for class_id, boxes in res.items():
        # Boxes should be a list of [x1, y1, x2, y2, score]
        if not isinstance(boxes, (list, np.ndarray)):
            continue
            
        for box in boxes:
            if len(box) < 5:
                continue
            score = float(box[4])
            if score < 0.25:
                continue
            
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
    model: str = Form(...)
):
    """Unified detection endpoint for M873.V1 (YOLOv8n) and M873.V2 (NanoDet)"""
    logger.info(f"Detection request received - Model: {model}")
    
    # Map display names to internal identifiers
    model_mapping = {
        "M873.V1": "yolov8n",
        "M873.V2": "nanodet",
        "yolov8n": "yolov8n",
        "nanodet": "nanodet"
    }
    
    target_model = model_mapping.get(model)
    
    if not target_model:
        logger.error(f"Invalid model requested: {model}")
        raise HTTPException(status_code=400, detail=f"Invalid model '{model}'. Supported: 'M873.V1', 'M873.V2'")

    try:
        # Read and decode image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Could not decode image.")

        if target_model == "yolov8n":
            detections = run_yolov8n(img)
        elif target_model == "nanodet":
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            detections = run_nanodet(img_rgb)
        
        return detections

    except Exception as e:
        logger.error(f"Inference error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models_loaded": {
            "yolov8n": YOLO_MODEL is not None,
            "nanodet": NANODET_PREDICTOR is not None
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
