@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ============================================================
REM  Sync worganic-base -> child (via remote git)
REM ------------------------------------------------------------
REM  Pre-requis :
REM   - Le repo child a un remote nomme `base` pointant vers
REM     worganic-base (verifier avec : git remote -v)
REM   - Le fichier .gitattributes du child definit merge=ours
REM     pour les fichiers child-specifiques.
REM ------------------------------------------------------------
REM  Workflow :
REM   1. Auto-commit + push child si modifs locales non commitees
REM   2. Fetch base
REM   3. Detection des fichiers issus de la base qui different
REM   4. Backup auto des versions child (xxx-old-YYYYMMDD.ext)
REM   5. Log dans docs/infos-synchro.md
REM   6. Merge base/main -X theirs (favorise la base sur conflits)
REM   7. Mise a jour version.json (baseSynced)
REM ============================================================

set "CHILD_JSON=%~dp0version.json"

REM -- Lecture du childId depuis version.json
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content '%CHILD_JSON%' | ConvertFrom-Json).childId"`) do set "CHILD_ID=%%i"

if "%CHILD_ID%"=="" (
    echo.
    echo  [ERREUR] Ce fichier est reserve aux projets child.
    echo  version.json ne contient pas de champ 'childId'.
    echo.
    pause & exit /b 1
)

title Sync worganic-base -^> %CHILD_ID%

echo.
echo  ================================================
echo    Sync worganic-base  ^>  child %CHILD_ID%
echo  ================================================
echo.

REM -- Verification du remote `base`
git remote get-url base >nul 2>&1
if errorlevel 1 (
    echo  [ERREUR] Le remote `base` n'est pas configure dans ce repo.
    echo  A configurer avec :
    echo    git remote add base https://github.com/worganic/worganic-base.git
    echo.
    pause & exit /b 1
)

REM ============================================================
REM  ETAPE 1 : Auto-commit + push child si modifs non commitees
REM ============================================================
set "HAS_CHANGES="
for /f "usebackq delims=" %%s in (`git status --porcelain`) do (
    set "HAS_CHANGES=1"
    goto :HAS_CHANGES_DONE
)
:HAS_CHANGES_DONE

if defined HAS_CHANGES (
    echo  [!] Modifications non commitees detectees dans le child :
    git status --short
    echo.
    set /p "AUTO_COMMIT= Auto-commit + push child avant le sync ? (O/N) : "
    if /i "!AUTO_COMMIT!"=="O" (
        for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"`) do set "TODAY=%%d"
        echo.
        echo  [GIT] Auto-commit en cours...
        git add -A
        git commit -m "WIP avant sync base - !TODAY!"
        if errorlevel 1 (
            echo  [ERREUR] git commit a echoue.
            pause & exit /b 1
        )
        echo  [GIT] Push en cours...
        git push origin HEAD
        if errorlevel 1 (
            echo  [ERREUR] git push a echoue. Abandon du sync.
            pause & exit /b 1
        )
        echo  [OK] Modifications child commitees et poussees.
        echo.
    ) else (
        echo  Annule. Veuillez commiter ou stasher manuellement avant de relancer.
        pause & exit /b 0
    )
)

REM ============================================================
REM  ETAPE 2 : Fetch base
REM ============================================================
echo  [GIT] Fetch du remote `base`...
git fetch base
if errorlevel 1 (
    echo  [ERREUR] git fetch base a echoue.
    pause & exit /b 1
)
echo.

REM -- Lecture des versions
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content '%CHILD_JSON%' | ConvertFrom-Json).child"`) do set "CHILD_VERSION=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content '%CHILD_JSON%' | ConvertFrom-Json).baseSynced"`) do set "BASE_SYNCED=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(git show base/main:version.json | ConvertFrom-Json).base"`) do set "BASE_VERSION=%%i"

echo   Child           : %CHILD_ID%
echo   Version child   : %CHILD_VERSION%
echo   Base disponible : %BASE_VERSION%
echo   Base syncee     : %BASE_SYNCED%
echo.

REM -- Compter les commits a integrer
for /f "usebackq delims=" %%n in (`git rev-list --count HEAD..base/main`) do set "COMMITS_AHEAD=%%n"

if "%COMMITS_AHEAD%"=="0" (
    echo  [OK] Aucun commit a integrer. Le child est deja a jour avec base/main.
    echo.
    pause & exit /b 0
)

echo  [!] %COMMITS_AHEAD% commit(s) base a integrer dans ce child :
echo  --------------------------------------------------------
git log --oneline HEAD..base/main
echo.

REM -- Afficher les entrees de propagation depuis base/main:data/base-propagation.json
echo  Entrees de propagation (depuis base/main) :
echo  --------------------------------------------------------
powershell -NoProfile -Command "$j = git show base/main:data/base-propagation.json | ConvertFrom-Json; $p = @($j.entries | Where-Object { $_.propagationRequired -eq $true }); if ($p.Count -gt 0) { $p | ForEach-Object { Write-Host ('  [' + $_.baseVersion + '] ' + $_.title) } } else { Write-Host '  (aucune entree marquee propagationRequired:true)' }"
echo.

set /p "CONFIRM= Lancer le sync (backup auto des fichiers divergents + merge) ? (O/N) : "
if /i not "!CONFIRM!"=="O" (
    echo.
    echo  Annule. Aucun merge effectue.
    pause & exit /b 0
)

REM ============================================================
REM  ETAPE 3-4-5 : Backup des fichiers issus de la base
REM  qui different + log dans docs/infos-synchro.md
REM ============================================================
echo.
echo  [BACKUP] Detection des fichiers issus de la base divergents...

set "HELPER_PS1=%~dp0sync-backup-helper.ps1"
if not exist "%HELPER_PS1%" (
    echo  [ERREUR] Helper introuvable : %HELPER_PS1%
    echo  Ce fichier doit etre propage depuis worganic-base.
    pause & exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%HELPER_PS1%" -BaseVersion "%BASE_VERSION%"
if errorlevel 1 (
    echo  [ERREUR] Le backup helper a echoue. Abandon du sync.
    pause & exit /b 1
)
echo.

REM ============================================================
REM  ETAPE 6 : Merge base/main avec strategy theirs
REM ============================================================
echo  [GIT] Merge base/main (strategy: -X theirs sur conflits)...
git merge base/main --no-ff -X theirs -m "Sync base %BASE_VERSION% dans %CHILD_ID% (merge base/main)"
set "MERGE_RC=%ERRORLEVEL%"

if %MERGE_RC% NEQ 0 (
    echo.
    echo  [!] Le merge a produit des conflits non resolvables auto.
    echo  --------------------------------------------------------
    git status --short | findstr /B /C:"UU " /C:"AA " /C:"DD " /C:"AU " /C:"UA " /C:"DU " /C:"UD "
    echo.
    echo  Etapes pour resoudre :
    echo    1. Editer chaque fichier en conflit
    echo    2. git add ^<fichier^>
    echo    3. git commit
    echo    4. Mettre a jour version.json baseSynced = %BASE_VERSION% manuellement
    echo    5. git push origin main
    echo.
    echo  Pour annuler le merge en cours :
    echo    git merge --abort
    pause & exit /b 1
)

echo.
echo  [OK] Merge termine.

REM ============================================================
REM  ETAPE 7 : Mise a jour de version.json (baseSynced)
REM ============================================================
powershell -NoProfile -Command "$vf = Get-Content '%CHILD_JSON%' | ConvertFrom-Json; $vf.baseSynced = '%BASE_VERSION%'; $json = $vf | ConvertTo-Json -Depth 10; [System.IO.File]::WriteAllText('%CHILD_JSON%', $json, [System.Text.UTF8Encoding]::new($false))"
git add version.json
git commit --amend --no-edit >nul 2>&1
echo  [OK] version.json mis a jour : baseSynced = %BASE_VERSION%

echo.
echo  Etapes suivantes :
echo    git push origin HEAD
echo    Marquer la propagation comme traitee dans l'admin base
echo.
pause
endlocal
