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
        from PIL import Image
        import io
        import cloudinary.utils
        
        with Image.open(io.BytesIO(image_bytes)) as img:
            orig_format = img.format if img.format else "JPEG"
            
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
                orig_format = "JPEG"
            
            # Resize if width or height exceeds 1024px
            max_size = 1024
            orig_width, orig_height = img.size
            width, height = orig_width, orig_height
            if max(img.size) > max_size:
                img.thumbnail((max_size, max_size), Image.LANCZOS)
                width, height = img.size
                
            output = io.BytesIO()
            img.save(output, format=orig_format, quality=80, optimize=True)
            compressed_bytes = output.getvalue()
            file_size = len(compressed_bytes)

        options = {
            "folder": "autood",
            "resource_type": "image",
            "quality": "auto:low",
            "fetch_format": "auto"
        }
        
        result = cloudinary.uploader.upload(compressed_bytes, **options)
        public_id = result.get("public_id")
        
        # Generate the specific imageUrl and thumbnailUrl with transformations
        image_url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            transformation=[
                {"width": 1024, "crop": "limit", "quality": "auto:low", "fetch_format": "auto"}
            ],
            secure=True
        )
        
        thumbnail_url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            transformation=[
                {"width": 300, "crop": "limit", "quality": "auto:low", "fetch_format": "auto"}
            ],
            secure=True
        )
        
        logger.info(f"Successfully uploaded image to Cloudinary. Public ID: {public_id}")
        return {
            "secure_url": image_url,
            "thumbnail_url": thumbnail_url,
            "public_id": public_id,
            "width": width,
            "height": height,
            "fileSize": file_size
        }
    except Exception as e:
        logger.error(f"Cloudinary upload/compression failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def delete_image(public_id):
    """Delete image from Cloudinary"""
    if not public_id:
        return False
    
    try:
        result = cloudinary.uploader.destroy(public_id)
        status = result.get("result")
        if status in ["ok", "not found"]:
            logger.info(f"Successfully deleted/confirmed absence of image: {public_id} (Status: {status})")
            return True
        else:
            logger.warning(f"Unexpected Cloudinary deletion result for {public_id}: {status}")
            return False
    except Exception as e:
        logger.error(f"Cloudinary deletion failed for {public_id}: {e}")
        return False

