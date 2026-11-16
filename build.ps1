param(
    [string]$RuntimePath = (Join-Path $PSScriptRoot '../SPT_Runtime'),
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
$runtimeDirectory = (Resolve-Path -LiteralPath $RuntimePath).Path
dotnet build (Join-Path $PSScriptRoot 'AmmoGraph.csproj') -c Release "-p:SptRuntime=$runtimeDirectory"
if ($LASTEXITCODE -ne 0) { throw 'AmmoGraph build failed.' }
if ($Install) {
    $destination = Join-Path $runtimeDirectory 'user/mods/AmmoGraph'
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bin/Release/net10.0/AmmoGraph.dll') -Destination $destination
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bin/Release/net10.0/AmmoGraph.pdb') -Destination $destination
    $assets = Join-Path $destination 'wwwroot'
    New-Item -ItemType Directory -Path $assets -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'wwwroot') -File | Copy-Item -Destination $assets
    $configDirectory = Join-Path $destination 'config'
    New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
    $mapPath = Join-Path $configDirectory 'caliber-names.json'
    if (-not (Test-Path -LiteralPath $mapPath)) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Resources/caliber-names.json') -Destination $mapPath
    }
    $exclusionPath = Join-Path $configDirectory 'default-exclusions.json'
    if (-not (Test-Path -LiteralPath $exclusionPath)) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Resources/default-exclusions.json') -Destination $exclusionPath
    }
    Write-Host "Installed AmmoGraph in $destination"
}
