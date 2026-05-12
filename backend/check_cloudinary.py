import os
import logging
from dotenv import load_dotenv
import cloudinary
import cloudinary.api

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("CloudinaryStatus")

# Load environment variables
load_dotenv()

def check_cloudinary_status():
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")
    
    if not all([cloud_name, api_key, api_secret]):
        logger.error("Cloudinary credentials missing in environment.")
        return
    
    logger.info(f"Checking Cloudinary status for: {cloud_name}")
    try:
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True
        )
        
        # Get usage information
        usage = cloudinary.api.usage()
        
        print("\n--- Cloudinary Usage Status ---")
        for metric, data in usage.items():
            if isinstance(data, dict):
                used = data.get('used', 0)
                limit = data.get('limit', 0)
                percent = data.get('used_percent', 0)
                print(f"{metric.capitalize()}: {used} / {limit} ({percent}%)")
        
        # Check folder structure
        print("\n--- Project Folders ---")
        folders = cloudinary.api.subfolders("autood")
        for folder in folders.get("folders", []):
            print(f"- {folder['path']}")
            
        return True
    except Exception as e:
        logger.error(f"❌ Failed to fetch Cloudinary status: {e}")
        return False

if __name__ == "__main__":
    check_cloudinary_status()
