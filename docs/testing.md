# Testing and documentation maintenance

[Project overview](../README.md) · [Developer guide](development.md)

Run all commands below from the shared workspace directory containing `AmmoGraph` and `SPT_Runtime`. The checks need the existing SPT libraries; browser checks also need a running server.

Release testing has been performed in both clean and modded SPT installations. Declared compatibility starts at SPT 4.1.4.

## Checking the C# core

```powershell
dotnet run --project AmmoGraph/tests/Core -c Release
```

[tests/Core/Program.cs](../tests/Core/Program.cs) is an executable check program. It covers data preparation, translations, buckshot variants, percentages, configuration, comparisons, and axis bounds, among other things. Run it with `dotnet run`.

To build without installing:

```powershell
./AmmoGraph/build.ps1
```

## Preparing browser checks

```powershell
npm.cmd ci --prefix AmmoGraph/tests --ignore-scripts --no-audit --no-fund
```

The scripts use Playwright with an existing Google Chrome installation at `C:/Program Files/Google/Chrome/Application/chrome.exe`. The checks target the local German-language test server, and some depend on its specific ammunition dataset. Not every script supports path overrides through environment variables; some contain fixed server and Chrome paths. Check the beginning of each script before running it on another installation.

Browsers use fresh temporary contexts, leaving the personal Chrome profile untouched. Check results and test screenshots go into `artifacts`, which is excluded by `.gitignore`.

## Choosing a check

| Changed area | Command / focus |
| --- | --- |
| Graph and table error styling, themes, localization and resolution | `node AmmoGraph/tests/empty-messages.mjs` (defaults to the live server) |
| Usability feedback, resize controls, chart help and preferences | `node AmmoGraph/tests/usability.mjs` against the separate simulation test host |
| General page behavior | `node AmmoGraph/tests/browser.mjs` |
| Magazine editor, armor, diagram, buckshot and graph restoration | `node AmmoGraph/tests/simulation.mjs` against the separate [simulation test host](simulation.md#implementation-and-validation) |
| Magazine capacity, equipment across calibers, death marker, zoom/pan and restoration | `node AmmoGraph/tests/simulation-release.mjs` against the same test host |
| Horizontal-only simulator zoom/pan, fixed vertical scales, shot-1 labels, edge padding, and constant highlight widths | `node AmmoGraph/tests/simulation-horizontal.mjs` (defaults to the live SPT server; `AMMOGRAPH_URL` overrides the address) |
| Shared magazine capacity, sampled pellet hits, minimum one hit, and preference migration | `node AmmoGraph/tests/simulation-pellets.mjs` (same server selection) |
| Shots to Kill, capped graph results, integer display and comparisons | `node AmmoGraph/tests/shots-to-kill.mjs` against the separate simulation test host |
| Table, sorting, comparisons | `node AmmoGraph/tests/table.mjs` |
| Menus, keyboard, percentage display | `node AmmoGraph/tests/menus.mjs` |
| Zoom, pan, and legend | `node AmmoGraph/tests/navigation.mjs` |
| Grouped point fans, connectors, individual selection, and keyboard | `node AmmoGraph/tests/spiderfy.mjs` |
| Table filter and pan bounds | `node AmmoGraph/tests/filter-pan.mjs` |
| Search and SVG symbols | `node AmmoGraph/tests/search-symbols.mjs` |
| Tooltip, details, and attributes | `node AmmoGraph/tests/presentation.mjs` |
| Name mappings | `node AmmoGraph/tests/caliber-map.mjs` |
| Attribute transfer and ordering | `node AmmoGraph/tests/attribute-transfer.mjs` |
| Default exclusions | `node AmmoGraph/tests/default-exclusions.mjs` |
| Personal name editor and visitor isolation | `node AmmoGraph/tests/caliber-editor.mjs` |
| Light/dark themes | `node AmmoGraph/tests/theme.mjs` |
| Header icons | `node AmmoGraph/tests/icon-loading.mjs` |
| Styling before Blazor initialization | `node AmmoGraph/tests/initial-render.mjs` |
| Filter sidebar height and scrolling | `node AmmoGraph/tests/sidebar-height.mjs` |

After a change, check the affected interface area and its data logic. Browser checks run in Chromium.

## Checking startup with the test mod

[tests/StartupFixture](../tests/StartupFixture) is not part of the distributed mod. It adds a test template and changes its damage from 111 to 777 after `PostLoad`. With the test mod temporarily installed, this command checks whether the page contains the final value:

```powershell
node AmmoGraph/tests/browser.mjs --fixture
```

Remove the test mod from the test installation afterward and restart the server. It changes loaded tables in the test process, not database files. Use a test installation prepared for this integration check.

## Updating screenshots

GitHub images live in [docs/images](images) so they can be committed independently of the ignored `artifacts` test directory. [tests/screenshots.mjs](../tests/screenshots.mjs) captures eight views of the running application:

```powershell
node AmmoGraph/tests/screenshots.mjs
```

This script supports alternative paths and addresses:

```powershell
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:AMMOGRAPH_URL = 'https://localhost:6969/AmmoGraph'
node AmmoGraph/tests/screenshots.mjs
```

It creates a fresh browser context with an English locale, selects English and a reference cartridge, and opens the settings sections. It writes PNG files into `docs/images`. It does not edit personal settings in the normal browser or server configuration files. At least one cartridge must be visible in the default selection.

Inspect the generated images for loaded data, readable labels, the correct menu sections, and useful framing. The script captures views; it is not a complete functional test.

### Shots to Kill screenshots

Build and start the separate [simulation test host](simulation.md#implementation-and-validation). It reads the local SPT dataset and exposes the read-only fixture endpoint needed by the capture script. It is not installed into SPT or included in releases.

```powershell
$env:AMMOGRAPH_URL = 'http://127.0.0.1:6973/AmmoGraph'
node AmmoGraph/tests/shots-to-kill.mjs
node AmmoGraph/tests/screenshots-shots-to-kill.mjs
```

The screenshot script writes `shots-to-kill-graph.png`, `shots-to-kill-table.png` and `shots-to-kill-attributes.png` into `docs/images`. It selects the highest eligible reference class and calibers containing successful and capped outcomes from the actual loaded data, with a fresh English browser context. The dataset must provide both outcomes. Inspect all three images before committing documentation.

## Keeping documentation current

To verify the header logo on a running SPT server and regenerate the English light/dark header images:

```powershell
node AmmoGraph/tests/screenshots-header.mjs
```

This script supports `AMMOGRAPH_URL` and `CHROME_PATH`. It checks PNG loading, the white logo badge in both themes, layout at four window widths, theme restoration after reload, and browser errors. It writes `header-light.png` and `header-dark.png` into `docs/images` using an isolated browser context.

- Update the field tables in [interfaces.md](interfaces.md) when changing the data model.
- Update workflows in [development.md](development.md) when changing startup or page state.
- Update [usage.md](usage.md), [ui.md](ui.md), and the affected screenshots when changing user interaction.
- Keep documentation, diagram labels, image descriptions, examples, and screenshots in English.
- Use relative Markdown links so they work both in the repository and on GitHub.
- Keep diagrams in code fences labeled `mermaid`. Architecture diagrams show responsibilities, flowcharts show order, and sequence diagrams show calls between participants.

Always check actual order and signatures against the code. The diagrams explain the implemented behavior and should be maintained alongside code changes.
