# Usability validation

Validation uses the separate SimulationHost with read-only local SPT data and temporary headless Chrome profiles. It does not install the mod or edit SPT profiles or configuration.

Run from `AmmoGraph`:

```powershell
dotnet build tests/SimulationHost -c Release --no-restore
dotnet run --project tests/Core -c Release --no-restore
dotnet tests/SimulationHost/bin/Release/net10.0/SimulationHost.dll
```

In a separate shell, also in `AmmoGraph`:

```powershell
$env:AMMOGRAPH_URL = 'http://127.0.0.1:6973/AmmoGraph'
node tests/usability.mjs
node tests/simulation.mjs
node tests/simulation-release.mjs
node tests/simulation-horizontal.mjs
node tests/simulation-pellets.mjs
node tests/navigation.mjs
```

The final results are recorded below after running the completed implementation. Screenshots and machine-readable browser results are written to the ignored `artifacts` directory.

## Results ? 16 November 2026

| Check | Result |
| --- | --- |
| Release build of SimulationHost and AmmoGraph | Passed, no compilation errors |
| Core executable checks | Passed, including simulation and 60 new localization/locale coverage assertions |
| `usability.mjs` | Passed all 10 interaction groups |
| `simulation.mjs` | Passed, including all available languages, tooltips, inline errors, mobile layout and graph restoration |
| `simulation-release.mjs` | Passed all 5 groups |
| `simulation-horizontal.mjs` | Passed all 7 groups |
| `simulation-pellets.mjs` | Passed all 6 groups, including older preference migration |
| `navigation.mjs` | Passed all 7 groups, including real touch pinch/pan |
| `git diff --check` | Passed |

The build emitted NU1900 because the NuGet vulnerability metadata endpoint was unavailable in the restricted network. Compilation and test execution succeeded using the available dependencies. Chrome needed execution outside the filesystem sandbox to launch a temporary test profile.

The core ballistic engine, simulation catalog, and simulation models have no changes. Existing staged release edits were left as found. The implementation was built and tested locally; it was not installed into the running SPT instance.
