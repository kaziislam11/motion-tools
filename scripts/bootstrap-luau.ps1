$ErrorActionPreference = 'Stop'
$toolsDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.local\tools'
New-Item -ItemType Directory -Path $toolsDirectory -Force | Out-Null
$archivePath = Join-Path $toolsDirectory 'luau-0.737-windows.zip'
Invoke-WebRequest -Uri 'https://github.com/luau-lang/luau/releases/download/0.737/luau-windows.zip' -OutFile $archivePath
$expectedHash = '8CD28BE648F3E5CC4BFC977D2344E43540ADE5F3524440B171EECF54D3A4FB7C'
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Luau archive checksum mismatch.' }
Expand-Archive -LiteralPath $archivePath -DestinationPath (Join-Path $toolsDirectory 'luau-0.737') -Force
Write-Output 'Verified Luau 0.737 compiler downloaded.'
