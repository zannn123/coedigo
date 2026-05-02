@echo off
echo Pushing COEDIGO to Git...
echo.

git add .
git commit -m "Update: AI chatbot memory manager and project files"
git push origin main

echo.
echo Done!
pause
