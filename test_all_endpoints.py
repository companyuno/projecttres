# Test multiple endpoints to see which ones work
from dotenv import load_dotenv
import os
from coinbase import jwt_generator
import requests
import json

load_dotenv()

api_key = os.getenv("COINBASE_API_KEY")
api_secret = os.getenv("COINBASE_API_SECRET")
if api_secret:
    api_secret = api_secret.replace('\\n', '\n')

base_url = "https://api.coinbase.com/api/v3/brokerage"

# Test endpoints
endpoints = [
    ("/time", "GET", "Public - should work"),
    ("/products", "GET", "Public products - should work"),
    ("/accounts", "GET", "Requires View permission"),
    ("/products/BTC-USD/book", "GET", "Product book - may work"),
    ("/products/BTC-USD/candles?start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z&granularity=ONE_MINUTE", "GET", "Candles - requires View"),
]

print("Testing multiple endpoints...\n")
print("=" * 60)

for path, method, description in endpoints:
    print(f"\n{description}")
    print(f"Endpoint: {method} {path}")

    try:
        if path in ["/time", "/products"]:
            # Public endpoint - no auth needed
            url = f"{base_url}{path}"
            r = requests.get(url, timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                print("✅ SUCCESS (public endpoint)")
            else:
                print(f"Response: {r.text[:100]}")
        else:
            # Authenticated endpoint
            uri = jwt_generator.format_jwt_uri(method, path.split('?')[0])  # Remove query params for JWT
            jwt_token = jwt_generator.build_rest_jwt(uri, api_key, api_secret)

            url = f"{base_url}{path}"
            headers = {"Authorization": f"Bearer {jwt_token}"}
            r = requests.get(url, headers=headers, timeout=10)

            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                print("✅✅✅ SUCCESS!")
                data = r.json()
                print(f"Response keys: {list(data.keys())[:5]}")
            else:
                print(f"Response: {r.text[:200]}")

    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {str(e)[:100]}")

print("\n" + "=" * 60)

