@echo off
:: ============================================================
::  Frankenstein — Installation des dependances
::  A executer une fois apres git clone ou git pull
:: ============================================================

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"

echo.
echo ============================================================
echo  Frankenstein - Installation des dependances
echo ============================================================
echo.

echo [1/3] Backend data (server)...
call npm install --prefix "%DIR%\server"
if %errorlevel% neq 0 ( echo ERREUR : server & pause & exit /b 1 )
echo OK

echo.
echo [2/3] Executor IA local (electron)...
call npm install --prefix "%DIR%\electron"
if %errorlevel% neq 0 ( echo ERREUR : electron & pause & exit /b 1 )
echo OK

echo.
echo [3/3] Frontend Angular (frankenstein)...
call npm install --prefix "%DIR%\frankenstein"
if %errorlevel% neq 0 ( echo ERREUR : frankenstein & pause & exit /b 1 )
echo OK

echo.
echo ============================================================
echo  Installation terminee. Vous pouvez lancer :
echo  launch-frankenstein.bat
echo ============================================================
echo.

echo Archivage du script d'installation...
rename "%DIR%\install.bat" "old-install.bat"

pause
