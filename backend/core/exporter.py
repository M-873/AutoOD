"""Export annotations to multiple formats"""
import json
import csv
from pathlib import Path
from typing import List, Dict
import zipfile


class Exporter:
    """Export annotations in multiple formats"""
    
    def __init__(self, export_dir: str = "data/exports"):
        self.export_dir = Path(export_dir)
        self.export_dir.mkdir(parents=True, exist_ok=True)
    
    def export_yolo(self, annotations: Dict[str, List[Dict]], 
                    image_sizes: Dict[str, tuple], class_names: List[str]) -> str:
        """
        Export to YOLO format (.txt files)
        
        Args:
            annotations: Dict mapping filename -> list of detections
            image_sizes: Dict mapping filename -> (width, height)
            class_names: List of class names for mapping
        
        Returns:
            Path to exported zip file
        """
        yolo_dir = self.export_dir / "yolo"
        yolo_dir.mkdir(exist_ok=True)
        
        # Create class mapping
        class_to_id = {name: idx for idx, name in enumerate(class_names)}
        
        for filename, dets in annotations.items():
            txt_path = yolo_dir / f"{Path(filename).stem}.txt"
            width, height = image_sizes[filename]
            
            with open(txt_path, 'w') as f:
                for det in dets:
                    # Convert to YOLO format: class_id x_center y_center width height (normalized)
                    x1, y1, x2, y2 = det['bbox']
                    x_center = ((x1 + x2) / 2) / width
                    y_center = ((y1 + y2) / 2) / height
                    w = (x2 - x1) / width
                    h = (y2 - y1) / height
                    
                    class_id = class_to_id.get(det['class'], 0)
                    f.write(f"{class_id} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}\n")
        
        # Create classes.txt
        with open(yolo_dir / "classes.txt", 'w') as f:
            for name in class_names:
                f.write(f"{name}\n")
        
        # Zip the directory
        zip_path = self.export_dir / "yolo_annotations.zip"
        self._zip_directory(yolo_dir, zip_path)
        return str(zip_path)
    
    def export_csv(self, annotations: Dict[str, List[Dict]]) -> str:
        """Export to CSV format with polygon support"""
        csv_path = self.export_dir / "annotations.csv"
        
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['filename', 'class', 'confidence', 'shape', 'x1', 'y1', 'x2', 'y2', 'polygon_points'])
            
            for filename, dets in annotations.items():
                for det in dets:
                    x1, y1, x2, y2 = det['bbox']
                    shape = det.get('shape', 'rect')
                    polygon_str = ''
                    
                    if shape == 'polygon' and 'polygon_points' in det:
                        # Format: "x1,y1;x2,y2;x3,y3"
                        polygon_str = ';'.join([f"{p[0]:.2f},{p[1]:.2f}" for p in det['polygon_points']])
                    
                    writer.writerow([
                        filename, det['class'], det['confidence'], shape,
                        x1, y1, x2, y2, polygon_str
                    ])
        
        return str(csv_path)
    
    def export_json(self, annotations: Dict[str, List[Dict]], 
                   metadata: Dict = None) -> str:
        """Export to JSON format"""
        json_path = self.export_dir / "annotations.json"
        
        export_data = {
            'annotations': annotations,
            'metadata': metadata or {}
        }
        
        with open(json_path, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        return str(json_path)
    
    def export_coco(self, annotations: Dict[str, List[Dict]], 
                   image_sizes: Dict[str, tuple], class_names: List[str]) -> str:
        """Export to COCO format"""
        coco_data = {
            'images': [],
            'annotations': [],
            'categories': []
        }
        
        # Create categories
        class_to_id = {}
        for idx, name in enumerate(class_names):
            class_to_id[name] = idx + 1
            coco_data['categories'].append({
                'id': idx + 1,
                'name': name,
                'supercategory': 'object'
            })
        
        # Create images and annotations
        annotation_id = 1
        for img_id, (filename, dets) in enumerate(annotations.items(), 1):
            width, height = image_sizes[filename]
            
            coco_data['images'].append({
                'id': img_id,
                'file_name': filename,
                'width': width,
                'height': height
            })
            
            for det in dets:
                x1, y1, x2, y2 = det['bbox']
                annotation = {
                    'id': annotation_id,
                    'image_id': img_id,
                    'category_id': class_to_id.get(det['class'], 1),
                    'bbox': [x1, y1, x2 - x1, y2 - y1],  # COCO uses [x, y, width, height]
                    'area': (x2 - x1) * (y2 - y1),
                    'iscrowd': 0
                }
                
                # Add segmentation for polygons
                if det.get('shape') == 'polygon' and 'polygon_points' in det:
                    # COCO segmentation format: [[x1,y1,x2,y2,...]]
                    flat_points = []
                    for p in det['polygon_points']:
                        flat_points.extend([p[0], p[1]])
                    annotation['segmentation'] = [flat_points]
                else:
                    # Bounding box as polygon
                    annotation['segmentation'] = [[
                        x1, y1, x2, y1, x2, y2, x1, y2
                    ]]
                
                coco_data['annotations'].append(annotation)
                annotation_id += 1
        
        coco_path = self.export_dir / "coco_annotations.json"
        with open(coco_path, 'w') as f:
            json.dump(coco_data, f, indent=2)
        
        return str(coco_path)
    
    @staticmethod
    def _zip_directory(directory: Path, zip_path: Path):
        """Zip a directory"""
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file in directory.rglob('*'):
                if file.is_file():
                    zipf.write(file, file.relative_to(directory))
