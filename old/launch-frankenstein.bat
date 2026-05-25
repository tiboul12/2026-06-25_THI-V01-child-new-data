@echo off
:: ============================================================
::  Worganic — Lancement de l'environnement de developpement
::  Lance Windows Terminal avec 7 onglets configures
:: ============================================================

:: %~dp0 = dossier du script, avec \ final (ex: E:\www\projet\)
set "DIR=%~dp0"
:: Supprimer le \ final pour homogeneiser les chemins
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"


start "" wt ^
  new-tab --title "Claude"    -d "%DIR%"          powershell -NoExit -Command "claude" ^; ^
  new-tab --title "Frankenstein"   --suppressApplicationTitle -d "%DIR%\frankenstein"  powershell -NoExit -Command "npm start" ^; ^
  new-tab --title "Data"      -d "%DIR%"          powershell -NoExit -Command "node server/server-data.js" ^; ^
  new-tab --title "Agent"     -d "%DIR%"          powershell -NoExit -Command "node server/server-agent.js" ^; ^
  new-tab --title "Electron"  -d "%DIR%\electron" powershell -NoExit -ExecutionPolicy Bypass -File "%DIR%\start-electron.ps1" ^; ^
  new-tab --title "Gemini"    --suppressApplicationTitle -d "%DIR%"          powershell -NoExit -Command "gemini" ^; ^
  new-tab --title "git"       -d "%DIR%"          powershell -NoExit -Command "git status"
