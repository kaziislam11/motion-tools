$ErrorActionPreference = 'Stop'
$toolsDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.local\tools'
New-Item -ItemType Directory -Path $toolsDirectory -Force | Out-Null
$archiveName = 'blender-4.5.0-windows-x64.zip'
$archivePath = Join-Path $toolsDirectory $archiveName
$checksumsPath = Join-Path $toolsDirectory 'blender-4.5.0.sha256'
Invoke-WebRequest -Uri 'https://download.blender.org/release/Blender4.5/blender-4.5.0.sha256' -OutFile $checksumsPath
if (-not (Test-Path -LiteralPath $archivePath)) {
    Invoke-WebRequest -Uri "https://download.blender.org/release/Blender4.5/$archiveName" -OutFile $archivePath
}
$line = Get-Content -LiteralPath $checksumsPath | Where-Object { $_ -match ([regex]::Escape($archiveName) + '$') }
if (@($line).Count -ne 1) { throw 'Official checksum entry missing or ambiguous.' }
$expectedHash = ($line -split '\s+')[0].ToUpperInvariant()
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) { throw 'Blender archive failed checksum validation.' }
$executable = Join-Path $toolsDirectory 'blender-4.5.0-windows-x64\blender.exe'
if (-not (Test-Path -LiteralPath $executable)) {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDirectory
}
Write-Output "Verified portable Blender: $executable"
