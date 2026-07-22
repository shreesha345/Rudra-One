"""
Initialize database tables for RudraOne
Run this script to create all required database tables
"""
import asyncio
from database import init_db

async def main():
    print("🔧 Initializing database tables...")
    try:
        await init_db()
        print("✅ Database tables created successfully!")
        print("📋 Created tables:")
        print("  - users")
        print("  - login_logs")
        print("  - calls")
        print("  - transcripts")
        print("  - call_insights")
        print("  - location_data")
        print("  - agency_settings")
    except Exception as e:
        print(f"❌ Error initializing database: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main())
