import os
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

def test_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key.startswith("AIza"): # Wait, starts with AIza is normal for real keys too.
        print(f"API Key: {api_key[:10]}...")
    
    try:
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")
        res = llm.invoke("Hello, are you there?")
        print(f"Response: {res.content}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_gemini()
