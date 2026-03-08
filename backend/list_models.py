import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GROQ_API_KEY")
if not api_key:
    print("GROQ_API_KEY not found")
    exit(1)

client = Groq(api_key=api_key)
try:
    models = client.models.list()
    for model in models.data:
        print(model.id)
except Exception as e:
    print(f"Error: {e}")
