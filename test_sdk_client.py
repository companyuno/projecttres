# Test using the official SDK's RESTClient directly
from dotenv import load_dotenv
import os
from coinbase.rest import RESTClient
import json

load_dotenv()

api_key = os.getenv("COINBASE_API_KEY")
api_secret = os.getenv("COINBASE_API_SECRET")

if api_secret:
    api_secret = api_secret.replace('\\n', '\n')

print("Testing with official RESTClient...")
print(f"API Key: {api_key[:50]}...\n")

try:
    # Use the official SDK client directly
    client = RESTClient(api_key=api_key, api_secret=api_secret, verbose=True)

    print("Calling get_accounts()...")
    accounts = client.get_accounts()
    print(f"✅ SUCCESS! Accounts: {len(accounts.data.accounts) if accounts.data.accounts else 0}")
    print(json.dumps(accounts.to_dict(), indent=2))

except Exception as e:
    print(f"❌ Error: {type(e).__name__}")
    print(f"Message: {str(e)}")
    import traceback
    traceback.print_exc()

