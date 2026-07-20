#!/usr/bin/env python3
"""
Example script to fetch Twilio call recordings using the API
"""

import requests
from datetime import datetime, timedelta

# Server configuration
SERVER_URL = "http://localhost:8080"

def fetch_recordings_for_date(date_str):
    """
    Fetch all recordings for a specific date
    
    Args:
        date_str: Date in YYYY-MM-DD format
    """
    print(f"\n📞 Fetching recordings for {date_str}...")
    
    # Using GET endpoint
    response = requests.get(f"{SERVER_URL}/recordings/fetch/{date_str}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ {data['message']}")
        print(f"📊 Total recordings saved: {data['recordings_saved']}")
        
        for recording in data['recordings']:
            print(f"\n  📁 {recording['filename']}")
            print(f"     Call SID: {recording['call_sid']}")
            print(f"     Duration: {recording['duration']}s")
            print(f"     Created: {recording['date_created']}")
    else:
        print(f"❌ Error: {response.json()['detail']}")


def fetch_recordings_for_call(date_str, call_sid):
    """
    Fetch recordings for a specific call
    
    Args:
        date_str: Date in YYYY-MM-DD format
        call_sid: Twilio Call SID
    """
    print(f"\n📞 Fetching recordings for Call SID: {call_sid}...")
    
    # Using GET endpoint with query parameter
    response = requests.get(
        f"{SERVER_URL}/recordings/fetch/{date_str}",
        params={"call_sid": call_sid}
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ {data['message']}")
        print(f"📊 Total recordings saved: {data['recordings_saved']}")
        
        for recording in data['recordings']:
            print(f"\n  📁 {recording['filename']}")
            print(f"     Duration: {recording['duration']}s")
    else:
        print(f"❌ Error: {response.json()['detail']}")


def fetch_recordings_post(date_str, call_sid=None):
    """
    Fetch recordings using POST endpoint
    
    Args:
        date_str: Date in YYYY-MM-DD format
        call_sid: Optional Twilio Call SID
    """
    print(f"\n📞 Fetching recordings (POST method)...")
    
    payload = {"date": date_str}
    if call_sid:
        payload["call_sid"] = call_sid
    
    response = requests.post(
        f"{SERVER_URL}/recordings/fetch",
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ {data['message']}")
        print(f"📊 Total recordings saved: {data['recordings_saved']}")
        
        for recording in data['recordings']:
            print(f"\n  📁 {recording['filename']}")
            print(f"     Call SID: {recording['call_sid']}")
            print(f"     Duration: {recording['duration']}s")
    else:
        print(f"❌ Error: {response.json()['detail']}")


if __name__ == "__main__":
    # Example 1: Fetch all recordings for today
    today = datetime.now().strftime("%Y-%m-%d")
    fetch_recordings_for_date(today)
    
    # Example 2: Fetch recordings for yesterday
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    fetch_recordings_for_date(yesterday)
    
    # Example 3: Fetch recordings for a specific date
    # fetch_recordings_for_date("2025-10-20")
    
    # Example 4: Fetch recordings for a specific call
    # fetch_recordings_for_call("2025-10-20", "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
    
    # Example 5: Using POST method
    # fetch_recordings_post("2025-10-20")
