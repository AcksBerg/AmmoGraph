param(
    [string]$RuntimePath = (Join-Path $PSScriptRoot '../SPT_Runtime'),
    [switch]$Install,
    [switch]$Package,
    [string]$SevenZipPath = ''
)
$ErrorActionPreference = 'Stop'
$runtimeDirectory = (Resolve-Path -LiteralPath $RuntimePath).Path
dotnet build (Join-Path $PSScriptRoot 'AmmoGraph.csproj') -c Release "-p:SptRuntime=$runtimeDirectory"
if ($LASTEXITCODE -ne 0) { throw 'AmmoGraph build failed.' }
if ($Package) {
    if (-not $SevenZipPath) {
        foreach ($command in @('7zz', '7z', '7za')) {
            $available = Get-Command $command -ErrorAction SilentlyContinue
            if ($available) { $SevenZipPath = $available.Source; break }
        }
        if (-not $SevenZipPath -and $env:OS -eq 'Windows_NT') {
            $installation = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\7-Zip' -ErrorAction SilentlyContinue
            if ($installation -and $installation.Path) {
                $candidate = Join-Path $installation.Path '7z.exe'
                if (Test-Path -LiteralPath $candidate) { $SevenZipPath = $candidate }
            }
        }
    }
    if (-not $SevenZipPath) { throw '7-Zip is required for packaging. Install 7zz/7z or pass -SevenZipPath.' }
    $SevenZipPath = (Get-Command $SevenZipPath -ErrorAction Stop).Source
    $version = ([xml](Get-Content -LiteralPath (Join-Path $PSScriptRoot 'AmmoGraph.csproj') -Raw)).Project.PropertyGroup.Version
    $releaseRoot = Join-Path $PSScriptRoot "artifacts/release-$version"
    $releaseMod = Join-Path $releaseRoot 'SPT_Runtime/user/mods/AmmoGraph'
    $releaseAssets = Join-Path $releaseMod 'wwwroot'
    New-Item -ItemType Directory -Path $releaseAssets -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bin/Release/net10.0/AmmoGraph.dll') -Destination $releaseMod
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bin/Release/net10.0/AmmoGraph.pdb') -Destination $releaseMod
    # Remove documentation left in staging by earlier package builds.
    foreach ($documentationFile in @('LICENSE', 'README.md')) {
        $stagedDocumentation = Join-Path $releaseMod $documentationFile
        if (Test-Path -LiteralPath $stagedDocumentation) {
            Remove-Item -LiteralPath $stagedDocumentation
        }
    }
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'wwwroot') -File | Copy-Item -Destination $releaseAssets
    $archivePath = Join-Path $PSScriptRoot "artifacts/AmmoGraph-$version.7z"
    # A fresh archive avoids retaining entries from an earlier package build.
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
    Push-Location -LiteralPath $releaseRoot
    try {
        # Native 7z stores portable relative paths. Do not use Compress-Archive,
        # whose Windows ZIP entries can contain literal backslashes.
        & $SevenZipPath a -t7z -mx=9 $archivePath 'SPT_Runtime/'
        if ($LASTEXITCODE -ne 0) { throw '7-Zip packaging failed.' }
        & $SevenZipPath t $archivePath
        if ($LASTEXITCODE -ne 0) { throw '7-Zip archive validation failed.' }
    }
    finally { Pop-Location }
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
