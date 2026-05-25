@echo off
set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"

:: Vérifie PyQt6, installe si absent
python -c "import PyQt6" 2>nul || (
  echo Installation de PyQt6...
  pip install PyQt6 --quiet
)

:: Lance l'app native (sans console)
start "" pythonw "%DIR%\launcher_app.py"

:: Ouvre les outils dev dans Windows Terminal
start "" wt ^
  new-tab --title "Claude"   -d "%DIR%"  powershell -NoExit -Command "claude" ^; ^
  new-tab --title "Gemini"   -d "%DIR%"  powershell -NoExit -Command "gemini" ^; ^
  new-tab --title "Git"      -d "%DIR%"  powershell -NoExit -Command "git status"
