# Release 0.25.5 validation

Validated on 16 November 2026 against the actual SPT 4.1.6 server at `https://localhost:6969/AmmoGraph`, with 215 ammunition variants and 31 offered languages. Browser checks use temporary Chrome profiles.

| Check | Result |
| --- | --- |
| Release build | Passed |
| Core checks, including ballistic and translation assertions | Passed |
| `empty-messages.mjs` on live server | Passed all 5 groups |
| `usability.mjs` on live server | Passed all 10 groups |
| `simulation.mjs` on live server | Passed, including every offered language, tooltips, error translation and graph restoration |
| `simulation-horizontal.mjs` on live server | Passed all 7 groups |
| Installed assembly version | `0.25.5.0` |
| Existing mod configuration SHA-256 comparison | Unchanged |
| `git diff --check` | Passed |

Reproduce browser checks from `AmmoGraph`:

```powershell
$env:AMMOGRAPH_URL = 'https://localhost:6969/AmmoGraph'
node tests/empty-messages.mjs
node tests/usability.mjs
node tests/simulation.mjs
node tests/simulation-horizontal.mjs
```

Results and screenshots are in `artifacts/empty-messages-checks.json`, `artifacts/empty-messages-dark.png` and `artifacts/empty-messages-mobile.png`. The previous live installation is backed up under `artifacts/before-live-0.25.5`. The live server remains running with the updated mod.

The build reports NU1900 because NuGet vulnerability metadata is unavailable over the restricted network. Compilation and tests succeed with the available dependencies. No ballistic calculations or simulation models were modified.

The 7z integrity check passed. All 11 extracted files match both the release build and the live installation byte for byte. The archive has a companion SHA-256 checksum.
