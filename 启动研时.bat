@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "研时" http://localhost:5173
node server.js
