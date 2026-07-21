"""Fix calls stuck in live state"""
import asyncio
from database import AsyncSessionLocal
from models import Call
from sqlalchemy import select
from datetime import datetime

async def fix_stuck_calls():
    """Mark all calls as ended if they're stuck in live state"""
    async with AsyncSessionLocal() as db:
        # Get all live calls
        result = await db.execute(
            select(Call).where(Call.is_live == True)
        )
        live_calls = result.scalars().all()
        
        print(f"Found {len(live_calls)} calls stuck in live state")
        
        for call in live_calls:
            print(f"Fixing call: {call.call_sid} from {call.caller_number}")
            call.is_live = False
            if not call.end_time:
                # Use timezone-aware datetime if start_time is timezone-aware
                if call.start_time and call.start_time.tzinfo:
                    from datetime import timezone
                    call.end_time = datetime.now(timezone.utc)
                else:
                    call.end_time = datetime.now()
            if call.start_time and call.end_time and not call.duration:
                try:
                    duration = (call.end_time - call.start_time).total_seconds()
                    call.duration = int(duration)
                except TypeError:
                    # If timezone mismatch, just set a default duration
                    call.duration = 0
        
        await db.commit()
        print(f"✅ Fixed {len(live_calls)} calls")

if __name__ == "__main__":
    asyncio.run(fix_stuck_calls())
