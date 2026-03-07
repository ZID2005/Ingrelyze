import urllib.request
import json

url = "http://127.0.0.1:8000/predict"
payload = {
    "food_name": "Test Avocado",
    "nutrients": {
        "calories": 160,
        "sugar": 0.7,
        "fat": 15,
        "protein": 2,
        "sodium": 7,
        "saturated_fat": 2.1,
        "fiber": 6.7,
        "cholesterol": 0,
        "carbohydrates": 8.5
    },
    "user_preferences": {
        "diabetes_level": "Low",
        "hypertension_level": "Low",
        "cholesterol_level": "Low",
        "lactose_level": "None",
        "weight_goal": "maintain",
        "height_cm": 175,
        "weight_kg": 70
    }
}

try:
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as f:
        print(f"Status Code: {f.status}")
        print(f"Response: {f.read().decode('utf-8')}")
except Exception as e:
    print(f"Error: {e}")
