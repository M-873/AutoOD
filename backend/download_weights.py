import os
import urllib.request
from ultralytics import YOLO

def download_weights():
    print("🚀 Starting weights download...")
    
    # 1. YOLOv8n (handled by ultralytics automatically, but let's be explicit)
    if not os.path.exists("yolov8n.pt"):
        print("📥 Downloading YOLOv8n...")
        YOLO("yolov8n.pt")
        print("✅ YOLOv8n ready.")
    else:
        print("✅ YOLOv8n already exists.")

    # 2. NanoDet-Plus M416
    nanodet_weight = "nanodet-plus-m_416_checkpoint.ckpt"
    nanodet_url = "https://github.com/RangiLyu/nanodet/releases/download/v1.0.0-alpha/nanodet-plus-m_416_checkpoint.ckpt"
    
    if not os.path.exists(nanodet_weight):
        print(f"📥 Downloading NanoDet weight: {nanodet_weight}...")
        try:
            urllib.request.urlretrieve(nanodet_url, nanodet_weight)
            print("✅ NanoDet weight ready.")
        except Exception as e:
            print(f"❌ Failed to download NanoDet weight: {e}")
    else:
        print(f"✅ NanoDet weight already exists.")

    # 3. NanoDet Config
    nanodet_cfg = "nanodet-plus-m_416.yml"
    cfg_url = "https://raw.githubusercontent.com/RangiLyu/nanodet/main/config/nanodet-plus-m_416.yml"
    
    if not os.path.exists(nanodet_cfg):
        print(f"📥 Downloading NanoDet config: {nanodet_cfg}...")
        try:
            urllib.request.urlretrieve(cfg_url, nanodet_cfg)
            print("✅ NanoDet config ready.")
        except Exception as e:
            print(f"❌ Failed to download NanoDet config: {e}")
    else:
        print(f"✅ NanoDet config already exists.")

if __name__ == "__main__":
    download_weights()
