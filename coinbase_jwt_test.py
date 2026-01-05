# Install dependencies:
# pip install coinbase-advanced-py requests python-dotenv
#
# Create .env file with:
# COINBASE_API_KEY = the CDP API key string from the JSON (the long organizations/.../apiKeys/... one)
# COINBASE_API_SECRET = the full EC private key block, including -----BEGIN EC PRIVATE KEY----- and -----END EC PRIVATE KEY-----

from dotenv import load_dotenv
import os
from coinbase import jwt_generator
import requests

load_dotenv()

api_key = os.getenv("COINBASE_API_KEY")
api_secret = os.getenv("COINBASE_API_SECRET")

# Handle newline escapes in private key
if api_secret:
    api_secret = api_secret.replace('\\n', '\n')

if not api_key or not api_secret:
    print("❌ Missing COINBASE_API_KEY or COINBASE_API_SECRET in .env")
    exit(1)

# Build JWT using official helper
uri = jwt_generator.format_jwt_uri("GET", "/api/v3/brokerage/accounts")
jwt_token = jwt_generator.build_rest_jwt(uri, api_key, api_secret)

# Make request
url = "https://api.coinbase.com/api/v3/brokerage/accounts"
headers = {"Authorization": f"Bearer {jwt_token}"}
r = requests.get(url, headers=headers, timeout=10)

# Print results
print(f"Status Code: {r.status_code}")
print(f"Response: {r.text}")

if r.status_code != 200:
    print(f"\nURI passed to build_rest_jwt: {uri}")
    print(f"JWT (first 20 chars): {jwt_token[:20]}")

