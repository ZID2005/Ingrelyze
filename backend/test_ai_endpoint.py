import urllib.request
import json
import base64

def test_ai_endpoint():
    url = "http://localhost:8000/ai-assistant"
    headers = {
        "Content-Type": "application/json",
        # Mock JWT token that decodes to {"user_id": "TEST_USER_123"}
        "Authorization": "Bearer eyJhbGciOiJub25lIn0.eyJ1c2VyX2lkIjoiVEVTVF9VU0VSXzEyMyJ9."
    }
    
    payload = {
        "query": "Could you analyze how my diet has been over the last week?",
        "local_date": "2026-03-01"
    }
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode())
            print("Response STATUS: SUCCESS")
            print(json.dumps(res, indent=2))
    except Exception as e:
        print("Response STATUS: FAILED")
        if hasattr(e, 'read'):
            print(e.read().decode())
        else:
            print(e)
            
if __name__ == "__main__":
    test_ai_endpoint()
