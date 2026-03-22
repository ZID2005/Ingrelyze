import os
from dotenv import load_dotenv
from groq import Groq

# Load .env
load_dotenv(r'd:\Ingrelyze\backend\.env')
api_key = os.environ.get("GROQ_API_KEY")

print(f"Testing Groq API with Key: {api_key[:10]}...")

try:
    client = Groq(api_key=api_key)
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "Hello! Just testing the connection. Reply with 'OK'."
            }
        ],
        model="llama-3.3-70b-versatile",
        max_tokens=10
    )
    print("API RESPONSE:")
    print(chat_completion.choices[0].message.content)
    print("TEST STATUS: SUCCESS")
except Exception as e:
    print("TEST STATUS: FAILED")
    print(f"Error: {e}")
