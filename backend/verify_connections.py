import os
import asyncio
import logging
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import cloudinary
import cloudinary.uploader
from PIL import Image
import io

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Verification")

# Load environment variables
load_dotenv()

async def verify_mongodb():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.error("MONGODB_URI not found in environment.")
        return False
    
    logger.info("Testing MongoDB connection...")
    try:
        client = AsyncIOMotorClient(uri)
        db = client["autood"]
        coll = db["test_connection"]
        
        # Test write
        test_doc = {"test": "connection", "timestamp": asyncio.get_event_loop().time()}
        result = await coll.insert_one(test_doc)
        doc_id = result.inserted_id
        logger.info(f"✅ MongoDB Write Success: {doc_id}")
        
        # Test read
        found = await coll.find_one({"_id": doc_id})
        if found:
            logger.info("✅ MongoDB Read Success")
        
        # Cleanup
        await coll.delete_one({"_id": doc_id})
        logger.info("✅ MongoDB Cleanup Success")
        return True
    except Exception as e:
        logger.error(f"❌ MongoDB Verification Failed: {e}")
        return False

def verify_cloudinary():
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")
    
    if not all([cloud_name, api_key, api_secret]):
        logger.error("Cloudinary credentials missing in environment.")
        return False
    
    logger.info("Testing Cloudinary connection...")
    try:
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True
        )
        
        # Create a small test image
        img = Image.new('RGB', (100, 100), color=(73, 109, 137))
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='JPEG')
        img_bytes = img_byte_arr.getvalue()
        
        # Test upload
        logger.info("Uploading test image...")
        upload_result = cloudinary.uploader.upload(
            img_bytes,
            folder="autood/test",
            public_id="test_verify"
        )
        public_id = upload_result.get("public_id")
        logger.info(f"✅ Cloudinary Upload Success: {upload_result.get('secure_url')}")
        
        # Test delete
        logger.info("Deleting test image...")
        delete_result = cloudinary.uploader.destroy(public_id)
        if delete_result.get("result") == "ok":
            logger.info("✅ Cloudinary Delete Success")
        else:
            logger.warning(f"⚠️ Cloudinary Delete returned: {delete_result.get('result')}")
            
        return True
    except Exception as e:
        logger.error(f"❌ Cloudinary Verification Failed: {e}")
        return False

async def main():
    logger.info("--- Starting Infrastructure Verification ---")
    mongo_ok = await verify_mongodb()
    cloudinary_ok = verify_cloudinary()
    
    logger.info("--- Verification Summary ---")
    logger.info(f"MongoDB: {'PASSED' if mongo_ok else 'FAILED'}")
    logger.info(f"Cloudinary: {'PASSED' if cloudinary_ok else 'FAILED'}")
    
    if mongo_ok and cloudinary_ok:
        logger.info("🚀 ALL SYSTEMS GO!")
    else:
        logger.error("🛑 ONE OR MORE SYSTEMS FAILED.")

if __name__ == "__main__":
    asyncio.run(main())
