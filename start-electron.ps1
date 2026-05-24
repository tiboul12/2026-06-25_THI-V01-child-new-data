$port    = 4202
$timeout = 180
$elapsed = 0

Write-Host "[Electron] Attente d'Angular sur http://localhost:$port ..."

while ($elapsed -lt $timeout) {
    try {
        $r = Invoke-WebRequest "http://localhost:$port" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        Write-Host "[Electron] Angular pret - demarrage Electron..."
        break
    } catch {
        Start-Sleep -Seconds 3
        $elapsed += 3
        Write-Host "[Electron] ... toujours en compilation ($elapsed s)"
    }
}

if ($elapsed -ge $timeout) {
    Write-Host "[Electron] Timeout : Angular non disponible apres $timeout secondes."
    exit 1
}

Set-Location -Path "$PSScriptRoot\electron"
npx electron .
