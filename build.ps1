param(
    [string]$RuntimePath = (Join-Path $PSScriptRoot '../SPT_Runtime'),
    [switch]$Install,
    [switch]$Package
)
$ErrorActionPreference = 'Stop'
$runtimeDirectory = (Resolve-Path -LiteralPath $RuntimePath).Path
dotnet build (Join-Path $PSScriptRoot 'AmmoGraph.csproj') -c Release "-p:SptRuntime=$runtimeDirectory"
if ($LASTEXITCODE -ne 0) { throw 'AmmoGraph build failed.' }
if ($Package) {
    $version = ([xml](Get-Content -LiteralPath (Join-Path $PSScriptRoot 'AmmoGraph.csproj') -Raw)).Project.PropertyGroup.Version
    $releaseRoot = Join-Path $PSScriptRoot "artifacts/release-$version"
    $releaseMod = Join-Path $releaseRoot 'SPT_Runtime/user/mods/AmmoGraph'
    $releaseAssets = Join-Path $releaseMod 'wwwroot'
    New-Item -ItemType Directory -Path $releaseAssets -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bin/Release/net10.0/AmmoGraph.dll') -Destination $releaseMod
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bin/Release/net10.0/AmmoGraph.pdb') -Destination $releaseMod
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LICENSE') -Destination $releaseMod
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'wwwroot') -File | Copy-Item -Destination $releaseAssets
    Compress-Archive -LiteralPath (Join-Path $releaseRoot 'SPT_Runtime') -DestinationPath (Join-Path $PSScriptRoot "artifacts/AmmoGraph-$version.zip") -Force
}
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
