"""Object Detection Engine"""
import cv2
import numpy as np
from typing import List, Dict, Optional, Tuple
from pathlib import Path


class Detector:
    """Handles object detection and annotation extraction"""
    
    def __init__(self, model_manager):
        self.model_manager = model_manager
    
    def detect_objects(self, image, model_name: str, conf: float = 0.25, 
                      class_filter: Optional[List[str]] = None) -> List[Dict]:
        """
        Detect objects in image
        
        Returns:
            List of detections with format:
            [{'class': str, 'confidence': float, 'bbox': [x1, y1, x2, y2]}, ...]
        """
        # Run prediction
        results = self.model_manager.predict(model_name, image, conf=conf, verbose=False)
        
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
                    'bbox': bbox  # [x1, y1, x2, y2]
                })
        
        return detections
    
    def detect_video_frames(self, video_path: str, model_name: str, 
                           conf: float = 0.25, class_filter: Optional[List[str]] = None,
                           sample_rate: int = 1) -> Dict[int, List[Dict]]:
        """
        Detect objects in video frames
        
        Args:
            sample_rate: Process every Nth frame (1 = all frames)
        
        Returns:
            Dict mapping frame_number -> list of detections
        """
        cap = cv2.VideoCapture(video_path)
        frame_detections = {}
        frame_num = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Sample frames
            if frame_num % sample_rate == 0:
                detections = self.detect_objects(frame, model_name, conf, class_filter)
                frame_detections[frame_num] = detections
            
            frame_num += 1
        
        cap.release()
        return frame_detections
    
    def draw_annotations(self, image: np.ndarray, detections: List[Dict], 
                        color: Tuple[int, int, int] = (0, 255, 0), 
                        thickness: int = 2) -> np.ndarray:
        """Draw bounding boxes on image"""
        img_copy = image.copy()
        
        for det in detections:
            bbox = det['bbox']
            x1, y1, x2, y2 = map(int, bbox)
            
            # Draw rectangle
            cv2.rectangle(img_copy, (x1, y1), (x2, y2), color, thickness)
            
            # Draw label
            label = f"{det['class']} {det['confidence']:.2f}"
            cv2.putText(img_copy, label, (x1, y1 - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, thickness)
        
        return img_copy
