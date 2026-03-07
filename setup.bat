@echo off
echo Setting up Backend...
cd backend
if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate
pip install -r requirements.txt

echo.
echo Setting up Frontend...
cd ../frontend
call npm install

echo.
echo Setup Complete!
pause
