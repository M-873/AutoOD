import os
import asyncio
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
load_dotenv()

from core.database import init_db, get_collection, save_annotation
from core.storage import upload_image, delete_image
import cloudinary.api

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("LifecycleTest")

async def simulate_lifecycle():
    logger.info("--- Starting 7-Day Lifecycle Simulation ---")
    
    # 1. Initialize
    if not await init_db():
        logger.error("Failed to init DB")
        return

    # 2. Upload & Save (Phase 1: Persistence)
    logger.info("Step 1: Uploading and saving test data...")
    test_img = b"fake-image-data-for-lifecycle-test" # Small dummy data
    # We'll use a real tiny image for Cloudinary if needed, but dummy bytes might fail PIL.
    # Let's use a real 1x1 pixel image
    pixel_1x1 = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    
    storage_result = upload_image(pixel_1x1)
    if not storage_result:
        logger.error("Upload failed")
        return
    
    public_id = storage_result["public_id"]
    record = {
        "test_name": "Lifecycle Simulation",
        "public_id": public_id,
        "image_url": storage_result["secure_url"],
        "createdAt": datetime.utcnow()
    }
    
    doc_id = await save_annotation(record)
    logger.info(f"✅ Data saved successfully. ID: {doc_id}")

    # 3. Verify Presence
    coll = get_collection()
    saved_doc = await coll.find_one({"_id": doc_id}) if hasattr(doc_id, "id") else await coll.find_one({"public_id": public_id})
    if saved_doc:
        logger.info("✅ Verified: Data exists in MongoDB.")
    else:
        logger.error("Data not found in MongoDB after save!")
        return

    # 4. Simulate Aging (Phase 2: Expiration)
    logger.info("Step 2: Simulating record aging (8 days old)...")
    eight_days_ago = datetime.utcnow() - timedelta(days=8)
    await coll.update_one({"public_id": public_id}, {"$set": {"createdAt": eight_days_ago}})
    logger.info("Record timestamp updated to 8 days ago.")

    # 5. Run Cleanup (Phase 3: Deletion)
    logger.info("Step 3: Triggering cleanup logic...")
    from main_render import daily_cleanup_job
    await daily_cleanup_job()

    # 6. Final Verification
    logger.info("Step 4: Verifying deletion...")
    
    # Check MongoDB
    final_doc = await coll.find_one({"public_id": public_id})
    if not final_doc:
        logger.info("✅ Verified: Record removed from MongoDB.")
    else:
        logger.error("❌ Failed: Record still exists in MongoDB after cleanup!")

    # Check Cloudinary
    try:
        cloudinary.api.resource(public_id)
        logger.error("❌ Failed: Image still exists in Cloudinary after cleanup!")
    except Exception as e:
        if "not found" in str(e).lower() or "404" in str(e).lower():
            logger.info("✅ Verified: Image removed from Cloudinary.")
        else:
            logger.error(f"Error checking Cloudinary: {e}")

    logger.info("--- Simulation Complete ---")

if __name__ == "__main__":
    asyncio.run(simulate_lifecycle())
