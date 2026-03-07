@echo off
cd backend
if not exist venv (
    echo Virtual environment not found. Please run setup.bat first.
    pause
    exit /b
)
call venv\Scripts\activate
uvicorn api:app --reload
pause
