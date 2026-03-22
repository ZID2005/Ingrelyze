import requests
import json

BASE_URL = "http://localhost:8000"

def test_home():
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"Home Check: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"Home Check Failed: {e}")

def test_search():
    try:
        response = requests.get(f"{BASE_URL}/search?query=chicken")
        print(f"Search Check: {response.status_code} - Found {len(response.json())} items")
    except Exception as e:
        print(f"Search Check Failed: {e}")

if __name__ == "__main__":
    test_home()
    test_search()
