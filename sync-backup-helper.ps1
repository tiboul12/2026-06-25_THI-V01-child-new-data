# ============================================================
#  sync-backup-helper.ps1
#  ----------------------
#  Helper appele par sync-from-base.bat dans un repo child.
#  Detecte tous les fichiers tracks qui different entre HEAD
#  (child) et base/main, exclut ceux marques merge=ours dans
#  .gitattributes, sauvegarde la version child sous
#  <basename>-old-YYYYMMDD.<ext>, et logge l'operation dans
#  docs/infos-synchro.md.
#
#  L'idee : quand on lance le merge ensuite avec -X theirs,
#  les fichiers de la base ecrasent les versions child, mais
#  l'ancienne version reste accessible via le backup horodate.
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BaseVersion
)

$ErrorActionPreference = "Continue"

# Tag de date pour les backups (YYYYMMDD)
$dateTag = Get-Date -Format "yyyyMMdd"
$dateIso = Get-Date -Format "yyyy-MM-dd HH:mm"

# Liste des fichiers qui different entre HEAD et base/main
# --diff-filter=M : seulement les fichiers presents dans les DEUX et modifies
# (exclut les fichiers child-only et les fichiers nouveaux cote base)
$modifiedFiles = @(git diff --name-only --diff-filter=M HEAD base/main 2>$null) | Where-Object { $_ }
$addedInBase   = @(git diff --name-only --diff-filter=A HEAD base/main 2>$null) | Where-Object { $_ }
$childOnly     = @(git diff --name-only --diff-filter=D HEAD base/main 2>$null) | Where-Object { $_ }

if ($modifiedFiles.Count -eq 0 -and $addedInBase.Count -eq 0) {
    Write-Host "  Aucun fichier divergent entre HEAD et base/main."
    exit 0
}

$backedUp = @()
$newFromBase = @()
$skippedOurs = @()

# Helper : construit un nom de backup robuste pour un chemin de fichier
function Get-BackupName {
    param([string]$FilePath, [string]$DateTag)
    $dir  = [System.IO.Path]::GetDirectoryName($FilePath)
    $leaf = [System.IO.Path]::GetFileName($FilePath)
    # Si le nom commence par un point (.gitattributes) ou n'a pas d'extension separable
    # -> suffixer apres le nom complet : <leaf>-old-<date>
    # Sinon -> inserer avant l'extension : <name>-old-<date>.<ext>
    if ($leaf.StartsWith(".")) {
        $newLeaf = "$leaf-old-$DateTag"
    } else {
        $name = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
        $ext  = [System.IO.Path]::GetExtension($leaf)
        if ([string]::IsNullOrEmpty($ext)) {
            $newLeaf = "$leaf-old-$DateTag"
        } else {
            $newLeaf = "$name-old-$DateTag$ext"
        }
    }
    if ($dir) { return ($dir + "/" + $newLeaf) } else { return $newLeaf }
}

# Traitement des fichiers ajoutes cote base (juste a logguer, le merge les ajoutera)
foreach ($file in $addedInBase) {
    $newFromBase += $file
}

# Traitement des fichiers modifies des deux cotes : backup de la version child
foreach ($file in $modifiedFiles) {

    # 1. Verifier si le fichier est marque merge=ours -> on garde la version child, pas de backup
    $attrLine = git check-attr merge -- "$file" 2>$null
    if ($attrLine -match "merge:\s*ours") {
        $skippedOurs += $file
        continue
    }

    # 2. Construire le chemin du backup
    $backupRel = Get-BackupName -FilePath $file -DateTag $dateTag
    $backupAbs = Join-Path (Get-Location) $backupRel

    # 3. Recuperer le contenu HEAD (version child) et l'ecrire dans le backup
    $tmpFile = [System.IO.Path]::GetTempFileName()
    try {
        cmd /c "git show ""HEAD:$file"" > ""$tmpFile""" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmpFile)) {
            Write-Warning "  Impossible de recuperer HEAD:$file - skip"
            continue
        }
        $backupDir = [System.IO.Path]::GetDirectoryName($backupAbs)
        if ($backupDir -and -not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        Move-Item -Path $tmpFile -Destination $backupAbs -Force
    } finally {
        if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
    }

    # 4. Stage le backup avec -f pour outrepasser .gitignore eventuel
    git add -f -- "$backupRel" 2>&1 | Out-Null

    Write-Host ("  [B] " + $file + "  ->  " + $backupRel)
    $backedUp += @{ File = $file; Backup = $backupRel }
}

# Affichage recapitulatif
Write-Host ""
if ($newFromBase.Count -gt 0) {
    Write-Host "  Nouveaux fichiers ajoutes par la base (pas de backup necessaire) :"
    $newFromBase | ForEach-Object { Write-Host ("    [+] " + $_) }
}
if ($skippedOurs.Count -gt 0) {
    Write-Host "  Fichiers child preserves (merge=ours) :"
    $skippedOurs | ForEach-Object { Write-Host ("    [=] " + $_) }
}

# 6. Mise a jour de docs/infos-synchro.md (creation si absent)
$logFile = "docs/infos-synchro.md"
$logDir  = [System.IO.Path]::GetDirectoryName($logFile)
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$bt = [char]0x60   # backtick literal pour le markdown
$nl = "`r`n"

$entry  = "## Sync base $BaseVersion - $dateIso" + $nl + $nl

if ($backedUp.Count -gt 0) {
    $entry += "### Fichiers issus de la base remplaces" + $nl + $nl
    $entry += "Les versions child precedentes ont ete sauvegardees :" + $nl + $nl
    foreach ($b in $backedUp) {
        $entry += "- " + $bt + $b.File + $bt + "  ->  backup : " + $bt + $b.Backup + $bt + $nl
    }
    $entry += $nl
}

if ($newFromBase.Count -gt 0) {
    $entry += "### Nouveaux fichiers ajoutes par la base" + $nl + $nl
    foreach ($f in $newFromBase) {
        $entry += "- " + $bt + $f + $bt + $nl
    }
    $entry += $nl
}

if ($skippedOurs.Count -gt 0) {
    $entry += "### Fichiers child preserves (merge=ours)" + $nl + $nl
    foreach ($f in $skippedOurs) {
        $entry += "- " + $bt + $f + $bt + $nl
    }
    $entry += $nl
}

if ($childOnly.Count -gt 0) {
    $entry += "### Fichiers presents uniquement cote child (non concernes)" + $nl + $nl
    foreach ($f in $childOnly) {
        $entry += "- " + $bt + $f + $bt + $nl
    }
    $entry += $nl
}

$entry += "---" + $nl + $nl

# Construction du contenu : entete + nouvelle entree (en haut) + ancien contenu
$header  = "# Historique des synchronisations base -> child" + $nl + $nl
$header += "Log des sync worganic-base -> ce child : fichiers mis a jour, fichiers renommes en backup, dates." + $nl + $nl

if (Test-Path $logFile) {
    $existing = [System.IO.File]::ReadAllText($logFile)
    # Detacher l'entete existante en cherchant la premiere entree (## ...)
    $idx = $existing.IndexOf("## ")
    if ($idx -ge 0) {
        $existingEntries = $existing.Substring($idx)
    } else {
        $existingEntries = ""
    }
    $newContent = $header + $entry + $existingEntries
} else {
    $newContent = $header + $entry
}

[System.IO.File]::WriteAllText($logFile, $newContent, [System.Text.UTF8Encoding]::new($false))
git add -- "$logFile" 2>$null

# 7. Commit du backup + log AVANT de lancer le merge
if ($backedUp.Count -gt 0 -or $newFromBase.Count -gt 0) {
    git commit -m "Backup avant sync base $BaseVersion ($dateTag)" 2>&1 | Out-Null
    Write-Host ""
    Write-Host "  [OK] $($backedUp.Count) backup(s) cree(s) + log dans $logFile"
}

exit 0
