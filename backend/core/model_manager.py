"""YOLO Model Manager - Handles model loading and inference"""
from ultralytics import YOLO
from pathlib import Path
from typing import Dict, List, Optional
import streamlit as st


class ModelManager:
    """Manages YOLO model loading, caching, and inference"""
    
    AVAILABLE_MODELS = {
        "M873.V2": "yolov8n.pt",
        "M873.V1": "nanodet",
    }
    
    def __init__(self, models_dir: str = "data/models"):
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._cache = {}
    
    @st.cache_resource
    def load_model(_self, model_name: str) -> YOLO:
        """Load YOLO model with caching"""
        if model_name in _self._cache:
            return _self._cache[model_name]
        
        model_path = _self.AVAILABLE_MODELS.get(model_name)
        if not model_path:
            raise ValueError(f"Model {model_name} not found")
        
        # Load model (will download if not exists)
        model = YOLO(model_path)
        _self._cache[model_name] = model
        return model
    
    def get_available_models(self) -> List[str]:
        """Get list of available model names"""
        return list(self.AVAILABLE_MODELS.keys())
    
    def predict(self, model_name: str, source, conf: float = 0.25, 
                classes: Optional[List[int]] = None, **kwargs):
        """Run prediction with specified model"""
        model = self.load_model(model_name)
        results = model.predict(source, conf=conf, classes=classes, **kwargs)
        return results
