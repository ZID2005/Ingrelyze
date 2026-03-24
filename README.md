🥗 Ingrelyze - Nutrition Health Analysis App

📌 Overview

Ingrelyze is a web-based nutrition analysis system that uses Machine Learning and AI to evaluate food intake and provide personalized health insights.

---

⚙️ Tech Stack

- Frontend: React (Vite)
- Backend: FastAPI (Python)
- Database: Firebase
- ML Model: Random Forest
- AI Assistant: Groq / Gemini API
- Deployment: Vercel (Frontend), Render (Backend)

---

📁 Project Structure

Ingrelyze/
│
├── backend/        # FastAPI backend + ML model
├── frontend/       # React frontend (Vite)
├── data/           # Dataset (CSV)
├── README.md

---

🔐 Environment Variables Setup

⚠️ IMPORTANT: Do NOT commit real API keys to GitHub

---

🔹 Backend (.env file inside /backend)

Create a ".env" file in the backend folder:



---

🔹 Frontend (.env file inside /frontend)

Create a ".env" file in the frontend folder:

VITE_API_URL=https://your-backend-url.onrender.com

---

🚀 How to Run Locally

1️⃣ Clone Repository

git clone https://github.com/your-username/Ingrelyze.git
cd Ingrelyze

---

2️⃣ Install Dependencies

Frontend:

cd frontend
npm install

Backend:

cd backend
pip install -r requirements.txt

---

3️⃣ Run Project

Start Backend:

uvicorn api:app --reload

Start Frontend:

npm run dev

---

🌐 Deployment

- Frontend hosted on Vercel
- Backend hosted on Render

---

📱 Features

- Food intake analysis using NLP
- Health score prediction (0–4 scale)
- AI-based recommendations
- Weekly health reports
- User authentication (Firebase)

---

⚠️ Notes

- Backend may take time to respond initially due to free-tier cold start
- Ensure environment variables are correctly configured

---

👨‍💻 Contributors

- Your Team Name

—
