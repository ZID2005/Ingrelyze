import json
import urllib.request

req = urllib.request.Request("http://localhost:8000/ai-assistant", data=json.dumps({
    "query": "how calories i intake this month",
    "local_date": "2023-10-10",
    "user_preferences": {"weight_goal": "maintain", "diabetes_level": "Low", "hypertension_level": "Low"},
    "daily_totals": {"calories": 500, "protein": 20, "carbs": 50, "fat": 10, "sugar": 5},
    "weekly_data": [{"calories": 500, "protein": 20, "carbs": 50, "fat": 10, "sugar": 5, "sodium": 100}]
}).encode('utf-8'), headers={"Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req) as f:
        print(f.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTPError:", e.code)
    print(e.read().decode('utf-8'))
except Exception as e:
    print("Error:", str(e))
