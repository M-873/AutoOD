import os
import urllib.request
from ultralytics import YOLO

def download_weights():
    print("🚀 Starting weights download...")
    # Get the directory of the current script
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. YOLOv8n
    yolo_path = os.path.join(base_dir, "yolov8n.pt")
    if not os.path.exists(yolo_path):
        print(f"📥 Downloading YOLOv8n to {yolo_path}...")
        YOLO(yolo_path) # Ultralytics handles paths well
        print("✅ YOLOv8n ready.")
    else:
        print("✅ YOLOv8n already exists.")

    # 2. NanoDet-Plus M416
    nanodet_weight = os.path.join(base_dir, "nanodet-plus-m_416_checkpoint.ckpt")
    nanodet_url = "https://github.com/RangiLyu/nanodet/releases/download/v1.0.0-alpha-1/nanodet-plus-m_416_checkpoint.ckpt"
    
    if not os.path.exists(nanodet_weight):
        print(f"📥 Downloading NanoDet weight to {nanodet_weight}...")
        try:
            urllib.request.urlretrieve(nanodet_url, nanodet_weight)
            print("✅ NanoDet weight ready.")
        except Exception as e:
            print(f"❌ Failed to download NanoDet weight: {e}")
    else:
        print(f"✅ NanoDet weight already exists.")

    # 3. NanoDet Config
    nanodet_cfg = os.path.join(base_dir, "nanodet-plus-m_416.yml")
    cfg_url = "https://raw.githubusercontent.com/RangiLyu/nanodet/main/config/nanodet-plus-m_416.yml"
    
    if not os.path.exists(nanodet_cfg):
        print(f"📥 Downloading NanoDet config to {nanodet_cfg}...")
        try:
            urllib.request.urlretrieve(cfg_url, nanodet_cfg)
            print("✅ NanoDet config ready.")
        except Exception as e:
            print(f"❌ Failed to download NanoDet config: {e}")
    else:
        print(f"✅ NanoDet config already exists.")

if __name__ == "__main__":
    download_weights()
