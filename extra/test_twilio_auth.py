import os
from dotenv import load_dotenv
from twilio.rest import Client

load_dotenv()

account_sid = os.getenv("TWILIO_ACCOUNT_SID")
auth_token = os.getenv("TWILIO_AUTH_TOKEN")
from_number = os.getenv("TWILIO_PHONE_NUMBER")

print(f"Account SID: {account_sid}")
print(f"Auth Token: {'*' * 5 if auth_token else 'None'}")
print(f"From Number: {from_number}")

if not all([account_sid, auth_token, from_number]):
    print("Missing credentials!")
    exit(1)

try:
    client = Client(account_sid, auth_token)
    # Try to fetch account details to verify credentials
    account = client.api.accounts(account_sid).fetch()
    print(f"Successfully authenticated as: {account.friendly_name}")
    
    # List incoming phone numbers to verify the from_number belongs to the account
    incoming_numbers = client.incoming_phone_numbers.list(phone_number=from_number)
    if incoming_numbers:
        print(f"Found phone number: {incoming_numbers[0].phone_number}")
    else:
        print(f"Warning: Phone number {from_number} not found in account!")

except Exception as e:
    print(f"Error: {e}")
