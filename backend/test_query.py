import firebase_admin
from firebase_admin import credentials, firestore
import json
import base64

try:
    if not firebase_admin._apps:
        cred = credentials.Certificate("serviceAccountKey.json") # We don't have this, so we'll init default
except Exception:
    pass
    
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

# Let's just fetch ALL foodEntries to see if ANY exist at all
docs = db.collection("foodEntries").get()

print(f"Total entries found in DB globally: {len(docs)}")

if len(docs) > 0:
    for doc in docs[:2]:
        print(doc.id, doc.to_dict())
else:
    print("Zero food entries exist in the entire database!")
