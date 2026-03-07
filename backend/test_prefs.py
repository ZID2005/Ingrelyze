import urllib.request
import json
import ssl

def test_analyze():
    url = "http://localhost:8000/api/analyze"
    headers = {"Content-Type": "application/json"}
    
    # Base query without preferences
    payload_base = {
        "query": "1 large fries",
        "user_preferences": None
    }
    
    req1 = urllib.request.Request(url, data=json.dumps(payload_base).encode(), headers=headers)
    with urllib.request.urlopen(req1) as response:
        res1 = json.loads(response.read().decode())
        print("NO PREFERENCES:", res1.get('rating', {}).get('health_label'), res1.get('rating', {}).get('warnings'))
    
    # Query with high sodium / hypertension
    payload_high = {
        "query": "1 large fries",
        "user_preferences": {
            "hypertension_level": "High"
        }
    }
    
    req2 = urllib.request.Request(url, data=json.dumps(payload_high).encode(), headers=headers)
    with urllib.request.urlopen(req2) as response:
        res2 = json.loads(response.read().decode())
        print("HIGH HYPERTENSION:", res2.get('rating', {}).get('health_label'), res2.get('rating', {}).get('warnings'))

test_analyze()
