@echo off
set ELECTRON_RUN_AS_NODE=

echo Starting Backend Server...
start "Fashion Shaa POS Backend" cmd /k "cd backend && node server.js"

echo Starting Frontend POS Application...
cd simple-pos
start "" "node_modules\electron\dist\electron.exe" .
