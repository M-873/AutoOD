import os
import sys
import asyncio
import numpy as np
import cv2
from dotenv import load_dotenv

# Add backend to sys.path to allow imports
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

# Load env vars before core imports to ensure credentials are available
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

from core.database import init_db, save_annotation, get_expired_records
from core.storage import upload_image

async def test_integration():
    print("Starting Integration Test...")
    
    # 1. Test Database Init
    db_success = await init_db()
    if not db_success:
        print("Database initialization failed. Ensure MONGODB_URI is set.")
        return

    # 2. Test Cloudinary Upload
    print("Testing Cloudinary upload...")
    # Create a dummy image
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.putText(img, "Test", (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    _, buffer = cv2.imencode('.jpg', img)
    img_bytes = buffer.tobytes()
    
    storage_result = upload_image(img_bytes)
    if not storage_result:
        print("Cloudinary upload failed. Check credentials.")
        return
    
    print(f"Cloudinary upload success: {storage_result['secure_url']}")
    
    # 3. Test MongoDB Save
    print("Testing MongoDB save...")
    record = {
        "test": True,
        "image_url": storage_result["secure_url"],
        "public_id": storage_result["public_id"],
        "detections": [{"class": "test", "confidence": 0.99, "bbox": [0,0,10,10]}]
    }
    record_id = await save_annotation(record)
    if not record_id:
        print("MongoDB save failed.")
        return
    
    print(f"MongoDB save success: ID {record_id}")
    
    # 4. Test Cleanup Fetch
    print("Testing expired records fetch...")
    expired = await get_expired_records(days=0) # Get all records for test
    print(f"Found {len(expired)} records in DB.")
    
    # 5. Test Deletion (Optional - we might want to keep the test record for a bit)
    # print("Testing deletion...")
    # del_success = delete_image(storage_result["public_id"])
    # if del_success:
    #     print("Cloudinary deletion success.")
    # else:
    #     print("Cloudinary deletion failed.")

    print("Integration Test Completed!")

if __name__ == "__main__":
    asyncio.run(test_integration())
