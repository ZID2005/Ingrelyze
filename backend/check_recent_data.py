import firebase_admin
from firebase_admin import credentials, firestore
import json
from datetime import datetime

# Initialize Firebase Admin
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={'projectId': 'ingrelyze-a0478'})
    db = firestore.client()
    print("Firebase Admin initialized.")
except Exception as e:
    print(f"Error: {e}")
    exit(1)

def check_recent_entries():
    try:
        # Fetch last 10 entries across all users to find the active one
        docs = db.collection("foodEntries").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(10).get()
        
        results = []
        for doc in docs:
            d = doc.to_dict()
            # Convert Timestamps to strings for JSON
            if 'createdAt' in d and hasattr(d['createdAt'], 'isoformat'):
                d['createdAt'] = d['createdAt'].isoformat()
            results.append(d)
            
        print(json.dumps(results, indent=2))
    except Exception as e:
        print(f"Error fetching entries: {e}")

if __name__ == "__main__":
    check_recent_entries()
