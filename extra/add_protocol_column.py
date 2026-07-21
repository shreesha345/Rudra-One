import asyncio
from database import engine
from sqlalchemy import text

async def add_column():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE call_insights ADD COLUMN protocol_questions JSON"))
            print("✅ Added protocol_questions column to call_insights table")
        except Exception as e:
            print(f"⚠️ Column might already exist or error: {e}")

if __name__ == "__main__":
    asyncio.run(add_column())
