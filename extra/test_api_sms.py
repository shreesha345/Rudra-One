import requests
import json

API_URL = "http://localhost:8000"

def test_send_sms():
    print("Testing SMS sending via API...")
    try:
        response = requests.post(
            f"{API_URL}/api/send-sms",
            json={
                "to": "+918277785093",  # User's number from context
                "body": "Test SMS from RudraOne API"
            }
        )
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

def test_root_endpoint():
    print("\nTesting Root Endpoint...")
    try:
        response = requests.get(f"{API_URL}/")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_root_endpoint()
    test_send_sms()
