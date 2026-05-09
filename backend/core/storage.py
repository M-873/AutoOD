import os
import logging
import cloudinary
import cloudinary.uploader
import cloudinary.api
from io import BytesIO

logger = logging.getLogger("AutoOD-Storage")

# Configuration
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET")

# Initialize Cloudinary
if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True
    )
    logger.info("Cloudinary configured successfully.")
else:
    logger.warning("Cloudinary credentials missing. Storage functions will fail.")

def upload_image(image_bytes, filename=None):
    """Upload compressed image to Cloudinary to save bandwidth/storage on free tier"""
    try:
        # Compress image before upload
        from PIL import Image
        import io
        
        img = Image.open(io.BytesIO(image_bytes))
        # Convert to RGB if necessary (Cloudinary handles it but smaller before upload is better)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        
        # Resize if too large (e.g., max 1280px width/height for small project)
        max_size = 1280
        if max(img.size) > max_size:
            img.thumbnail((max_size, max_size), Image.LANCZOS)
            
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=85, optimize=True)
        compressed_bytes = output.getvalue()

        options = {
            "folder": "autood/uploads",
            "resource_type": "image"
        }
        
        result = cloudinary.uploader.upload(compressed_bytes, **options)
        return {
            "secure_url": result.get("secure_url"),
            "public_id": result.get("public_id")
        }
    except Exception as e:
        logger.error(f"Cloudinary upload/compression failed: {e}")
        return None

def delete_image(public_id):
    """Delete image from Cloudinary"""
    if not public_id:
        return False
    
    try:
        result = cloudinary.uploader.destroy(public_id)
        # We consider "ok" or "not found" as successful for the purpose of database cleanup
        return result.get("result") in ["ok", "not found"]
    except Exception as e:
        logger.error(f"Cloudinary deletion failed for {public_id}: {e}")
        return False
