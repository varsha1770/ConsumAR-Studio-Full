import requests
import json

url = "http://127.0.0.1:5001/optimize-direct"
data = {"s3_key": "dummy_key.glb"} # I'll use a real key if I know one, or let it fail gracefully

try:
    print("Testing /optimize-direct...")
    response = requests.post(url, data=data)
    print("Status:", response.status_code)
    print("Response:", response.text)
except Exception as e:
    print("Error:", e)
