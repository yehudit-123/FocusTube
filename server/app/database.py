"""Database connection and index configuration for MongoDB."""

import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from server.app.config import settings

logger = logging.getLogger(__name__)

client: AsyncIOMotorClient = None
db: AsyncIOMotorDatabase = None


async def connect_db():
    global client, db
    try:
        client = AsyncIOMotorClient(settings.MONGO_URL, serverSelectionTimeoutMS=5000)
        # Parse database name from MONGO_URL or fallback to FocusTube
        db_name = settings.MONGO_URL.rsplit('/', 1)[-1].split('?')[0] or "FocusTube"
        db = client[db_name]
        logger.info(f"Connecting to MongoDB database: {db_name}")
        
        # Create indexes
        # 1. Users collection: unique email (lowercased)
        await db.users.create_index("email", unique=True)
        # 2. Videos collection: unique youtube_id
        await db.videos.create_index("youtube_id", unique=True)
        # 3. Content collection: user_id + video_id
        await db.content.create_index([("user_id", 1), ("video_id", 1)])
        # 4. Sessions collection: user_id, content_id
        await db.sessions.create_index("user_id")
        await db.sessions.create_index("content_id")
        # 5. Classes collection: join_code, owner_id
        await db.classes.create_index("join_code", unique=True, sparse=True)
        await db.classes.create_index("owner_id")
        
        logger.info("MongoDB indexes verified successfully.")
    except Exception as e:
        logger.warning(f"Could not connect to MongoDB on startup ({e}). App will retry when requests arrive.")


async def close_db():
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed.")


def get_db() -> AsyncIOMotorDatabase:
    return db
