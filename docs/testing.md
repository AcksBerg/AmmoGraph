# Testing and documentation maintenance

[Project overview](../README.md) · [Developer guide](development.md)

Run all commands below from the shared workspace directory containing `AmmoGraph` and `SPT_Runtime`. The checks need the existing SPT libraries; browser checks also need a running server.

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
| General page behavior | `node AmmoGraph/tests/browser.mjs` |
| Table, sorting, comparisons | `node AmmoGraph/tests/table.mjs` |
| Menus, keyboard, percentage display | `node AmmoGraph/tests/menus.mjs` |
| Zoom, pan, legend, touch events | `node AmmoGraph/tests/navigation.mjs` |
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

After a change, check the affected interface area and its data logic. Browser checks simulate mobile and touch interaction in Chromium; they do not replace checks on a physical device.

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

## Keeping documentation current

- Update the field tables in [interfaces.md](interfaces.md) when changing the data model.
- Update workflows in [development.md](development.md) when changing startup or page state.
- Update [usage.md](usage.md), [ui.md](ui.md), and the affected screenshots when changing user interaction.
- Keep documentation, diagram labels, image descriptions, examples, and screenshots in English.
- Use relative Markdown links so they work both in the repository and on GitHub.
- Keep diagrams in code fences labeled `mermaid`. Architecture diagrams show responsibilities, flowcharts show order, and sequence diagrams show calls between participants.

Always check actual order and signatures against the code. The diagrams explain the implemented behavior and should be maintained alongside code changes.
