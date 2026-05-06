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
        
        # Create TTL index on createdAt field (8 days = 691200 seconds)
        # We use 8 days to allow our daily cron job (running at 7 days) to delete Cloudinary images first.
        await collection.create_index("createdAt", expireAfterSeconds=691200)
        logger.info("MongoDB initialized with 7-day TTL index.")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize MongoDB: {e}")
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
