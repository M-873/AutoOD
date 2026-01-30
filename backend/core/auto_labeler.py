"""Auto-labeling Engine - Propagate annotations from minimal examples"""
from typing import List, Dict, Optional
import numpy as np


class AutoLabeler:
    """Intelligent auto-labeling from 1-2 manual annotations"""
    
    def __init__(self, detector):
        self.detector = detector
    
    def auto_label_images(self, images: List, manual_annotations: List[Dict],
                         model_name: str, conf: float = 0.25) -> Dict[int, List[Dict]]:
        """
        Auto-label multiple images based on manual annotations
        
        Args:
            images: List of images to label
            manual_annotations: List of manual annotations with class names
            model_name: YOLO model to use
            conf: Confidence threshold
        
        Returns:
            Dict mapping image_index -> list of detections
        """
        # Extract classes from manual annotations
        target_classes = list(set([ann['class'] for ann in manual_annotations]))
        
        all_detections = {}
        for idx, image in enumerate(images):
            detections = self.detector.detect_objects(
                image, model_name, conf=conf, class_filter=target_classes
            )
            all_detections[idx] = detections
        
        return all_detections
    
    def auto_label_video(self, video_path: str, manual_annotations: List[Dict],
                        model_name: str, conf: float = 0.25, 
                        sample_rate: int = 1) -> Dict[int, List[Dict]]:
        """
        Auto-label video frames based on manual annotations
        
        Args:
            video_path: Path to video file
            manual_annotations: Manual annotations from first frame(s)
            model_name: YOLO model to use
            conf: Confidence threshold
            sample_rate: Process every Nth frame
        
        Returns:
            Dict mapping frame_number -> list of detections
        """
        # Extract target classes
        target_classes = list(set([ann['class'] for ann in manual_annotations]))
        
        # Detect on all frames
        frame_detections = self.detector.detect_video_frames(
            video_path, model_name, conf=conf, 
            class_filter=target_classes, sample_rate=sample_rate
        )
        
        return frame_detections
    
    def merge_annotations(self, auto_detections: List[Dict], 
                         manual_annotations: List[Dict],
                         iou_threshold: float = 0.5) -> List[Dict]:
        """
        Merge auto-detected and manual annotations, preferring manual ones
        
        Args:
            auto_detections: Auto-generated detections
            manual_annotations: Manual annotations
            iou_threshold: IoU threshold for matching
        
        Returns:
            Merged list of annotations
        """
        merged = manual_annotations.copy()
        
        for auto_det in auto_detections:
            # Check if overlaps with any manual annotation
            overlaps = False
            for manual_det in manual_annotations:
                iou = self._calculate_iou(auto_det['bbox'], manual_det['bbox'])
                if iou > iou_threshold:
                    overlaps = True
                    break
            
            # Add if no overlap
            if not overlaps:
                merged.append(auto_det)
        
        return merged
    
    @staticmethod
    def _calculate_iou(bbox1: List[float], bbox2: List[float]) -> float:
        """Calculate Intersection over Union between two bboxes"""
        x1_1, y1_1, x2_1, y2_1 = bbox1
        x1_2, y1_2, x2_2, y2_2 = bbox2
        
        # Intersection area
        x1_i = max(x1_1, x1_2)
        y1_i = max(y1_1, y1_2)
        x2_i = min(x2_1, x2_2)
        y2_i = min(y2_1, y2_2)
        
        if x2_i < x1_i or y2_i < y1_i:
            return 0.0
        
        intersection = (x2_i - x1_i) * (y2_i - y1_i)
        
        # Union area
        area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
        area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
        union = area1 + area2 - intersection
        
        return intersection / union if union > 0 else 0.0
