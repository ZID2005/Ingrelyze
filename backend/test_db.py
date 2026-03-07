import firebase_admin
from firebase_admin import firestore
try:
    firebase_admin.initialize_app(options={'projectId': 'ingrelyze-a0478'})
    db = firestore.client()
    _, doc_ref = db.collection('testEntries').add({'test': 'data'})
    print(f"Success! {doc_ref.id}")
except Exception as e:
    print(f"FAILED: {e}")
