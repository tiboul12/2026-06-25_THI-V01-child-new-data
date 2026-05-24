@echo off
set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"

start "" wt ^
  new-tab --title "Claude"    -d "%DIR%"          powershell -NoExit -Command "claude" ^; ^
  new-tab --title "Portail"   -d "%DIR%"          powershell -NoExit -Command "npx nx serve portail" ^; ^
  new-tab --title "Projets"   -d "%DIR%"          powershell -NoExit -Command "npx nx serve projets" ^; ^
  new-tab --title "API"       -d "%DIR%"          powershell -NoExit -Command "node server/server-data.js" ^; ^
  new-tab --title "Agent"     -d "%DIR%"          powershell -NoExit -Command "node server/server-agent.js" ^; ^
  new-tab --title "Electron"  -d "%DIR%"          powershell -NoExit -ExecutionPolicy Bypass -File "%DIR%\start-electron.ps1" ^; ^
  new-tab --title "Gemini"    -d "%DIR%"          powershell -NoExit -Command "gemini" ^; ^
  new-tab --title "git"       -d "%DIR%"          powershell -NoExit -Command "git status"
