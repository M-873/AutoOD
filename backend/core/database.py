import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from bson import ObjectId

logger = logging.getLogger("AutoOD-Database")

# Configuration
MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = "autood"
COLLECTION_NAME = "images"

client = None
db = None
collection = None

async def init_db():
    global client, db, collection
    try:
        logger.info(f"Connecting to MongoDB...")
        # Configure connection pooling to optimize thread and socket allocation on Free Tier
        client = AsyncIOMotorClient(
            MONGODB_URI,
            maxPoolSize=5,
            minPoolSize=1,
            serverSelectionTimeoutMS=5000
        )
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        
        # Drop existing index if options conflict (common during TTL duration updates)
        try:
            logger.info("Updating TTL index options...")
            await collection.drop_index("createdAt_1")
        except Exception:
            pass # Index might not exist yet
            
        await collection.create_index("createdAt", name="createdAt_1")
        await collection.create_index("cloudinaryId", name="cloudinaryId_1", unique=True, sparse=True)
        logger.info("MongoDB initialized with standard createdAt index and unique sparse cloudinaryId index.")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize MongoDB: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def get_collection():
    return collection

async def save_image_metadata(data: dict):
    if collection is None:
        logger.warning("Database not initialized, skipping save.")
        return None
    
    try:
        if "createdAt" not in data:
            data["createdAt"] = datetime.utcnow()
        if "updatedAt" not in data:
            data["updatedAt"] = datetime.utcnow()
            
        result = await collection.insert_one(data)
        return str(result.inserted_id)
    except Exception as e:
        logger.error(f"Error saving image metadata to MongoDB: {e}")
        return None

async def get_image_by_id(image_id: str):
    if collection is None:
        return None
    try:
        return await collection.find_one({"_id": ObjectId(image_id)})
    except Exception as e:
        logger.error(f"Error fetching image by ID {image_id}: {e}")
        return None

async def update_image_annotations(image_id: str, annotations: list):
    if collection is None:
        return False
    try:
        updated_at = datetime.utcnow()
        result = await collection.update_one(
            {"_id": ObjectId(image_id)},
            {
                "$set": {
                    "annotations": annotations,
                    "annotationCount": len(annotations),
                    "updatedAt": updated_at
                }
            }
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception as e:
        logger.error(f"Error updating annotations for image {image_id}: {e}")
        return False

async def delete_image_record(image_id: str):
    if collection is None:
        return False
    try:
        result = await collection.delete_one({"_id": ObjectId(image_id)})
        return result.deleted_count > 0
    except Exception as e:
        logger.error(f"Error deleting image record {image_id}: {e}")
        return False

async def get_expired_images(days=7):
    if collection is None:
        return []
    
    cutoff = datetime.utcnow() - timedelta(days=days)
    try:
        # Optimize memory by projecting only required fields (skip large annotations array)
        cursor = collection.find(
            {"createdAt": {"$lt": cutoff}},
            projection={"_id": 1, "cloudinaryId": 1}
        )
        return await cursor.to_list(length=1000)
    except Exception as e:
        logger.error(f"Error fetching expired records: {e}")
        return []

# Legacy wrapper support for backward compatibility
async def save_annotation(data: dict):
    logger.info("save_annotation legacy wrapper called")
    if "cloudinaryId" not in data and "public_id" in data:
        data["cloudinaryId"] = data["public_id"]
    if "imageUrl" not in data and "image_url" in data:
        data["imageUrl"] = data["image_url"]
    if "annotationCount" not in data:
        data["annotationCount"] = len(data.get("detections", []))
    if "annotations" not in data:
        data["annotations"] = [
            {
                "label": d.get("class", "object"),
                "points": d.get("bbox", []),
                "color": "#3B82F6",
                "createdAt": datetime.utcnow()
            } for d in data.get("detections", [])
        ]
    return await save_image_metadata(data)

async def get_expired_records(days=7):
    logger.info("get_expired_records legacy wrapper called")
    return await get_expired_images(days=days)

