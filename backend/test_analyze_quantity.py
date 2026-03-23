import requests
import json

BASE_URL = "http://localhost:8000"

def test_analyze(query, quantity=None):
    payload = {
        "query": query,
        "user_preferences": {
            "diabetes_level": "Low",
            "hypertension_level": "Low",
            "cholesterol_level": "Low",
            "lactose_level": "None",
            "weight_goal": "maintain"
        }
    }
    if quantity is not None:
        payload["quantity"] = quantity
        
    try:
        response = requests.post(f"{BASE_URL}/analyze", json=payload)
        print(f"Analyze '{query}' (qty={quantity}): {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            if data["success"]:
                print(f"  Calories: {data['analysis']['calories']}")
                return data['analysis']
            else:
                print(f"  Error: {data['message']}")
        else:
            print(f"  Response: {response.text}")
    except Exception as e:
        print(f"Analyze Failed: {e}")
    return None

if __name__ == "__main__":
    # Test baseline
    print("--- Baseline Tests ---")
    res1 = test_analyze("pizza")
    res2 = test_analyze("2 pizzas")
    
    if res1 and res2:
        print(f"Ratio 2 pizzas / 1 pizza: {res2['calories'] / res1['calories']:.2f}")

    print("\n--- Explicit Quantity Tests ---")
    res3 = test_analyze("pizza", quantity=2)
    if res1 and res3:
        print(f"Ratio pizza(qty=2) / pizza: {res3['calories'] / res1['calories']:.2f}")
        
    res4 = test_analyze("2 pizzas", quantity=3)
    if res1 and res4:
        print(f"Ratio '2 pizzas'(qty=3) / pizza: {res4['calories'] / res1['calories']:.2f} (Expected: 6.0)")
