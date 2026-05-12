import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta

logger = logging.getLogger("AutoOD-Database")

# Configuration
MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = "autood"
COLLECTION_NAME = "annotations"

client = None
db = None
collection = None

async def init_db():
    global client, db, collection
    try:
        logger.info(f"Connecting to MongoDB...")
        client = AsyncIOMotorClient(MONGODB_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        
        # Drop existing index if options conflict (common during TTL duration updates)
        try:
            logger.info("Updating TTL index options...")
            await collection.drop_index("createdAt_1")
        except Exception:
            pass # Index might not exist yet
            
        await collection.create_index("createdAt", name="createdAt_1", expireAfterSeconds=604800)
        logger.info("MongoDB initialized with 7-day TTL index.")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize MongoDB: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def get_collection():
    return collection

async def save_annotation(data: dict):
    if collection is None:
        logger.warning("Database not initialized, skipping save.")
        return None
    
    try:
        # Add timestamp if not present
        if "createdAt" not in data:
            data["createdAt"] = datetime.utcnow()
            
        result = await collection.insert_one(data)
        return str(result.inserted_id)
    except Exception as e:
        logger.error(f"Error saving to MongoDB: {e}")
        return None

async def get_expired_records(days=7):
    if collection is None:
        return []
    
    cutoff = datetime.utcnow() - timedelta(days=days)
    try:
        cursor = collection.find({"createdAt": {"$lt": cutoff}})
        return await cursor.to_list(length=1000)
    except Exception as e:
        logger.error(f"Error fetching expired records: {e}")
        return []
