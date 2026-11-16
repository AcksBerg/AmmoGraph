# Usage and configuration

Use the labeled header cartridge button to open the [ballistics simulator](simulation.md), or the graph button to return to ammunition comparison. It runs with the SPT server alone and displays its model assumptions beside the configuration.

AmmoGraph is a server mod with a Blazor interface at `/AmmoGraph`, compatible with **SPT 4.1.4 and later / .NET 10**. It has been tested in clean and modded installations; the local development installation uses SPT 4.1.6. The page displays ammunition data from that server instance without a Python export, Realism file parser, or separate web server.

> Back to the [project overview](../README.md). See the [developer guide](development.md) for code explanations and the [interface tour](ui.md) for screenshots.

## Building and installing

Stop the server before updating the DLL. Run this command from the shared workspace directory:

```powershell
./AmmoGraph/build.ps1 -Install
```

The script uses libraries from `../SPT_Runtime` and installs `AmmoGraph.dll`, debug symbols, and `wwwroot` into `SPT_Runtime/user/mods/AmmoGraph`. It also creates `config/caliber-names.json` and `config/default-exclusions.json` if they do not exist. Existing configuration files are preserved during updates. Existing server libraries are not replaced. Use `-RuntimePath 'C:/SPT/SPT_Runtime'` to select another runtime directory.

Start the server normally, then open **https://localhost:6969/AmmoGraph**, for example. The mod also appears among the mod pages in the SPT web panel. Other players use the same route at the reachable server address. AmmoGraph follows SPT's existing HTTPS, network, and authentication configuration.

The local test installation binds to `127.0.0.1`, which is reachable only on that machine. Access from other devices depends on the host's FIKA/SPT network configuration; AmmoGraph does not change it. No additional client mod is required. An actual FIKA multiplayer session was not tested here because no FIKA server mod was installed.

## Data and startup behavior

A singleton builds the dataset once during server startup directly from `TemplateTable.Items`, including language snapshots for all offered SPT languages.

`IOnLoad` runs with `TypePriority = int.MaxValue`, after ordinary earlier SPT and mod startup phases. Completed changes from earlier hooks are included. Hooks with the same priority may run before or after it according to SPT's ordering. Delayed changes after startup are not reloaded.

New ammunition and calibers are detected automatically. The dataset includes every template with `ammoType` set to `bullet` or `buckshot` and a caliber, including internal, unused, and special ammunition templates. Name-based exclusions affect visibility rather than removing records.

AmmoGraph does not change game values, profiles, or mod configuration files. The page does not require external CDNs at runtime.

## Language and formatting

`serverLocale` determines the initial language; SPT's localization service resolves `system`. The language selector in the header offers configured server languages and additional available game languages, currently 31 in the test installation. Language and number formatting apply to each visitor independently. The server configuration stays unchanged. Arabic uses right-to-left layout. Older Tarkov language codes, such as `ge` for German instead of `de`, are mapped to their display equivalents.

Ammunition names come from the loaded game localization data. Missing or empty names fall back individually to English, then to the template name. Languages without their own game database use English ammunition names.

Attributes consistently use full translations from the mod catalog, avoiding a mixture of game abbreviations and capitalization variants. Attribute and language names use culture-aware capitalization. Units follow attribute names in parentheses, such as `Bullet Velocity (m/s)` or `Ricochet Chance (%)`. Regional Spanish and Portuguese variants share interface text.

## Defaults and saved preferences

The default selection is 5.45×39 and 5.56×45, with damage on X, penetration on Y, automatic scaling enabled, and pellet calibers hidden.

Language, selection, axes, display options, search text, sorting, selected ammunition, table columns, visible sections, and exclusions are saved per browser in cookies lasting one year (`SameSite=Lax`, with `Secure` under HTTPS). Larger settings are split across multiple cookies. Existing localStorage settings from version 0.1 are migrated once and then removed. Older cookies remain compatible, and newly introduced view options start enabled.

The theme toggle beside the gear switches directly between light and dark. By default, the page follows the device preference (`prefers-color-scheme`) and tracks changes until the visitor switches manually. The first click selects the opposite of the currently visible theme. A manual choice is saved in the browser cookie. Older cookies without a theme setting use the device preference. The light theme also adjusts the chart, tooltips, menus, and comparison colors. Header controls use compact spacing.

## Filters and exclusions

### Caliber selection and search

A checked caliber in the left sidebar is selected for display. **All** and **None** are also available above the chart legend. The legend lists every available, non-excluded caliber. Unselected entries remain available as struck-through buttons. Clicking toggles a caliber; double-clicking a legend entry or sidebar caliber selects that caliber alone. Selection therefore remains available when the filter sidebar is hidden.

Caliber, ammunition, and exclusion searches ignore dots and `/` on both sides of the comparison. For example, `545`, `5.45`, and `5/4.5` can match the same caliber, while `1270` matches `12/70`. Matching is case-insensitive. Caliber search checks displayed labels only, including in exclusions: `762` does not match `.300 BLK` through its internal template identifier.

**Apply filter**, below **All / None**, makes the caliber search results the new selection. It is enabled only when the search text is effective. All matching visible calibers are selected and other calibers are deselected; exclusions and pellet visibility still apply. A search with no results produces an empty selection. Search text and selection are saved in cookies.

The caliber list reserves fixed columns for checkboxes and symbols so labels align regardless of symbol shape. Circles, triangles, squares, diamonds, and stars each have filled and outline variants. The same SVG shapes appear in the filter list, chart, legend, details, and table.

### Personal exclusions

The gear opens **Settings**, including **Hide calibers and ammunition** with separate **Calibers** and **Ammunition** lists. In these lists, a checked box means hidden. Hidden entries appear first, sorted alphabetically within their group.

The table has no hide actions or extra action column. Ammunition exclusions use the shared template ID and cover both whole-load and pellet variants. Hidden entries are excluded from the chart, table, and global axis scaling. The caliber selection remains saved.

### Default exclusions

The configuration contains calibers, individual ammunition IDs, and name patterns. By default, `!!!DO_NOT_USE!!!` entries and known grenade fragments and placeholders are hidden. Fragments are listed explicitly in `ammo`. All entries remain available in the exclusion settings.

Making an entry visible or choosing the show-all action is saved. **Restore defaults** discards personal exclusions and exceptions. Newly loaded templates matching configured patterns also receive the default exclusion on the next server start, unless the visitor has explicitly made that template ID visible. This does not change server data or another visitor's settings.

The **20x1, 26x75, and 40x46** calibers are hidden by default. They remain fully present and can be made visible in the gear menu; this choice survives a reload. **Restore defaults** reapplies the caliber exclusions.

**Airsoft 6mm BB** is another reversible default exclusion. Its configured template ID identifies it independently of the display language. Name-pattern rules check internal or English names rather than translated display labels.

## View sections and scrolling

Under **Graph view** in the gear menu, the left caliber/filter sidebar, table, and **Selected ammunition** details panel can each be hidden. The remaining sections use the available width. Axis selection and the chart legend remain accessible. Hiding a section does not itself change the caliber selection or a pinned comparison reference.

On desktop, the filter sidebar uses the available viewport height and remains visible while scrolling toward the table, together with its search and All/None controls. Only the caliber list scrolls internally. On narrow screens, the sidebar stays compact with a maximum height of 300 px.

The details panel matches the chart area's height and scrolls internally when extra values are expanded. There is no additional reference block above the main table; reference highlighting and comparisons remain available.

The interface uses subtle gradients, coordinated borders, and shadows for the chart, details, table, sidebar, and menus. Hover areas have their own padding, including 8 px horizontally on table headers and additional spacing in the legend, settings lists, and expandable sections. Ammunition names have no separate hover background.

## Table, ammunition search, and empty views

Default columns are ammunition, caliber, damage, penetration, and bullet velocity. The eye icon next to **Search ammunition** opens column selection. Every metric can be enabled, but at least one column remains visible. Column order follows the metric catalog. Hiding the sorted column switches sorting to the first visible column. **Default columns** restores the original five columns and name sorting.

Both icon menus support keyboard interaction and close with Escape or an outside click. On small screens, they use a view adapted to the window.

Ammunition search filters the chart and table together while the table is visible. When the table is hidden, the chart ignores that search text. Showing the table again reapplies the saved text. Caliber selection, exclusions, and the pellet option remain effective independently.

With no selected calibers, the empty message points to the filter list and chart legend. With calibers selected and an active ammunition search, it explicitly mentions that filter; otherwise, it points to selection and exclusions.

Missing values appear as `—`. Points missing either axis value are not drawn. Global scaling uses all allowed ammunition with valid values for both axes, respecting exclusions and pellet visibility. Automatic scaling uses only the filtered, plotted selection.

The upper bound is exactly `Maximum + min(abs(Maximum) × 0.1, 10)`. The lower bound receives similarly limited padding and stays at least 0 for non-negative data. Tick marks are chosen within these bounds; rounding does not extend them. An axis containing only zeros uses 0 to 1.

## Tooltips

Overlapping points are grouped. The hover tooltip shows one compact card per cartridge, with vertical attribute/value rows. By default it includes the symbol, caliber, name, damage, penetration, and bullet velocity. Units are attached to attribute names and numeric values are right-aligned.

The tooltip also opens on keyboard focus, closes with Escape, and stays open when the pointer moves into the card. Long attribute lists scroll inside the tooltip and stay within the window. Hovering a grouped point fans its cartridges out around their common location, with dashed connectors back to the actual data point. Select one of these symbols directly, or choose a cartridge in the main table. **Show all names** also labels every fanned member; switching it off hides these labels again. Large stacks use multiple rings. Leaving the fan, pressing Escape, zooming, or panning collapses it. Tab focuses a group, Enter moves into its individual symbols, and Enter or Space selects a focused symbol.

Symbol, caliber, and ammunition name form a fixed header in both the tooltip and details panel, outside the configurable metric selection. In the tooltip, the symbol always sits immediately beside the caliber. Saved attribute lists from older versions are reduced to metrics while preserving their order.

In the details panel, **All values** remains below the visible metrics, including after expansion. This button is omitted when every metric is already enabled in the settings.

## Attributes and order

The gear menu provides selections for the tooltip, selected ammunition, and one shared list for the X/Y axes. Available metrics are on the left and selected metrics on the right. Clicking marks an entry. The four central controls add or remove one entry or all entries.

Drag and drop works between lists and for reordering the selected list. Up/down buttons remain available. With the keyboard, Enter moves a focused entry between lists; Alt+Up/Down changes its order.

Symbol, caliber, and name remain fixed headers outside these options. Default metrics are damage, penetration, and velocity. Both axis dropdowns use the same available selection and order, but their active metrics are chosen independently. Removing an active metric selects the first remaining one. Empty lists are allowed; with no axis metrics, the chart pauses and shows a message.

Each selection can be reset. Membership and order persist in cookies. Older separate X/Y lists are merged without losing configured metrics.

## Chart navigation

The mouse wheel zooms around the pointer. Dragging with the left mouse button pans even at the base zoom level. The plus/minus buttons zoom around the chart center; reset restores the full data view. With chart focus, `+`, `-`, arrow keys, and `Home` are also available.

Zoom is limited to 1–100×. Panning may extend beyond the original data bounds by at most 20% of the currently visible axis span on each side. At 1×, this allows movement of ±20% of the full displayed range. Axes and the reset button account for panning independently of zoom. Points are clipped at the plot edge and keep their size during zoom. Dragging does not accidentally select a cartridge.

The viewport updates locally in the browser without a separate server call for each animation frame. Selection, hover, and showing or hiding side sections preserve it. Changes to axes, language, or the displayed dataset reset it. The temporary viewport is not stored in cookies.

## Buckshot and pellets

Buckshot uses separate caliber groups for a whole load and an individual pellet. Slugs remain in the ordinary caliber group. **Show pellet calibers** sits beside All/None in the chart and remains reachable without the sidebar. It hides pellet groups from the list, chart, table, and global scaling. Their selection is preserved so it returns when pellet groups are shown again.

`Damage` in the game data is damage per projectile; the whole-load view multiplies it by `ProjectileCount`. Other metrics, including the cartridge's projectile count, stay unchanged. The load total assumes all pellets hit and is not a damage simulation.

## Comparisons and percentages

A clicked cartridge becomes the shared reference. Every numeric table cell shows its row's value and the difference from that reference (`row − reference`) without needing a hover. Additional metric columns use the same comparison.

Hovering another chart point or table row adds candidate values and differences to the details panel. Keyboard focus activates the same detail comparison. Arrows indicate numeric direction, green indicates an improvement, and red indicates a decrease in quality.

Higher damage, penetration, armor damage, accuracy, or bleeding are rated as better. Lower recoil, misfires, feed failures, wear, heat, or ricochet chance are also rated as better. Context-dependent values such as velocity, mass, projectile count, and fragmentation remain neutral. Missing values produce no delta. Leaving the candidate clears only the detail comparison; table comparisons remain until the reference changes or becomes hidden.

Ricochet, fragmentation, base misfire, misfire, and feed-failure chances, along with bleeding deltas, are normalized from server fractions by multiplying by 100 for display. These same values are used for axes, tables, sorting, tooltips, and differences. Values already stored as percentages, such as armor damage, accuracy, and recoil, remain unchanged.

Differences between percentages are absolute percentage points; bleeding deltas remain additive modifiers. Server data is not changed. The interactive simulator models armor penetration and wear; Shots to Kill provides a separate, fixed reference-armor comparison. Both use captured server data and the shared ballistic engine.

## Shots to Kill

Open **Attributes and order** in settings and add **Shots to Kill · Armor Class N** to the axis list, tooltip or selected-ammunition metrics. Use the table column picker to add it to the table. Select an enabled metric in either axis dropdown, or click its table header to sort. Lower values are better. Eligible classes come from the loaded armor data; class 10 is excluded.

A number is the upward-rounded average of successful trials, provided at least eight of ten deterministic trials kill an 85 HP chest target within 100 shots. `100+` means that success threshold was not met; it is not a measured kill count or a numeric graph coordinate. It remains visible in tables, tooltips and details, with no extra notice below the graph. `—` means no usable result. Comparisons involving a capped value show direction without an invented numeric difference.

The reference calculation starts with fresh representative armor in every trial and uses 75% average pellet hits for buckshot. These inputs are independent of the interactive simulator's armor, magazine and pellet-hit settings. Pellet rows still describe shots of the whole cartridge. Results are computed once at startup and shared across visitors and languages. See [calculation details and assumptions](shots-to-kill.md) and the [illustrated interface tour](ui.md#shots-to-kill).

## Server configuration

### Configure default exclusions

`SPT_Runtime/user/mods/AmmoGraph/config/default-exclusions.json` contains server-wide defaults. The file is created on first installation and is not overwritten by updates. Changes require a server restart. Visitors can reset existing personal choices through **Restore defaults**.

```json
{
  "calibers": ["20x1mm", "26x75", "40x46"],
  "ammo": ["6241c316234b593b5676b637", "5943d9c186f7745a13413ac9"],
  "nameContains": ["!!!DO_NOT_USE!!!"]
}
```

The configuration has three supported fields: `calibers`, `ammo`, and `nameContains`. `calibers` contains internal caliber IDs with an optional `Caliber` prefix; these also apply to buckshot/pellet groups. `ammo` accepts only 24-character hexadecimal template IDs, such as `6241c316234b593b5676b637` for Airsoft 6mm BB. Names are not evaluated in this field, so renaming and localization do not change the match.

`nameContains` checks internal and English names for the configured substrings. This rule is available only through the configuration file; there is no corresponding text field on the page, which provides personal caliber and ammunition lists instead. The shipped file contains additional explicit fragment IDs in `ammo` to retain those defaults. `x` and `×` are equivalent in caliber keys. Calibers and ammunition IDs that are not installed do not create entries.

A valid file completely replaces the built-in exclusion rules. Removed rules no longer apply, and `{}` sets no default exclusions. Personal exclusions and exceptions remain browser settings. All ammunition templates remain in the dataset. Invalid configuration produces a warning in the server log and falls back to built-in defaults.

### Server-wide caliber names

`SPT_Runtime/user/mods/AmmoGraph/config/caliber-names.json` overrides display names only. Restart the SPT server after changes. Examples from the included WTT-Armory defaults:

```json
{
  "1036x77": ".408 Cheyenne",
  "11x33R": ".44 Magnum",
  "762x67B": ".300 Winchester",
  "86x63": ".338 Norma Magnum"
}
```

Add further entries, including vanilla calibers, such as `"Caliber545x39": "Custom label"`. Short keys and full IDs with the `Caliber` prefix are equivalent, and matching is case-insensitive. Mappings use exact caliber IDs rather than substrings. Comments and trailing commas are allowed; empty or non-string names are ignored.

Custom mappings take precedence over built-in defaults. Without a custom mapping, the built-in mod default, existing vanilla label, or game localization applies. Names are used in every language across filters, search, legend, exclusions, table, details, and tooltips. Buckshot/pellet suffixes are retained.

Only templates actually loaded by the server are processed: uninstalled mods do not produce empty calibers or errors. IDs, cookie selections, and game values stay unchanged. An invalid file is reported in the server log, and built-in names are used instead.

Caliber map keys and search text treat `×` and `x` as equivalent; displayed caliber names use ordinary `x`. Existing entries such as `"93×64": "9.3x64"` and `"792×57": "7.92x57"` work without editing the file. Internal caliber IDs stay unchanged.

### Personal caliber names

Under **Caliber names** in the gear menu, select a loaded caliber and save a personal display name. These names apply only in that browser and are saved with the other preferences in cookies. Other players retain their own names and server defaults.

**Delete name** suppresses only the currently selected mapping for this browser; other names are retained. **Restore defaults** clears all personal names and suppressions and restores the loaded configuration mappings. Caliber/ammunition exclusions are also browser settings, with their own reset action in the corresponding accordion.

The page provides no write function for `caliber-names.json` or `default-exclusions.json`, and no buttons to open or edit them. Server defaults are changed by editing these files outside the page and restarting the server. Personal browser names can override those defaults for that visitor's view. The editor lists only calibers actually loaded.

The four settings sections, **Graph view**, **Attributes and order**, **Caliber names**, and **Hide calibers and ammunition**, are accordions. They start collapsed; opening a main section closes the previous one. Attribute selectors remain independently expandable within their section.

## Project layout and styling

- `Core`: dataset, translations, and metrics.
- `Web`: Blazor page and layout, with an SVG chart and no additional chart library.
- `wwwroot`: page-specific CSS and browser behavior.
- `tests`: core checks, browser checks, and a temporary integration test mod.
- `tools/Inspect`: utility for checking the .NET interfaces actually installed.

The chart stylesheet is embedded in the DLL from the same CSS source file and emitted before the server-rendered page content. Initial styling therefore does not depend on Blazor initialization or a later CSS download. CSS changes require a rebuild.

## Running checks

```powershell
dotnet run --project AmmoGraph/tests/Core -c Release
npm.cmd ci --prefix AmmoGraph/tests --ignore-scripts --no-audit --no-fund
node AmmoGraph/tests/browser.mjs
node AmmoGraph/tests/table.mjs
node AmmoGraph/tests/menus.mjs
node AmmoGraph/tests/navigation.mjs
node AmmoGraph/tests/filter-pan.mjs
node AmmoGraph/tests/search-symbols.mjs
node AmmoGraph/tests/presentation.mjs
node AmmoGraph/tests/caliber-map.mjs
node AmmoGraph/tests/attribute-transfer.mjs
node AmmoGraph/tests/default-exclusions.mjs
node AmmoGraph/tests/caliber-editor.mjs
```

Browser checks need a running server and use the existing Chrome installation without downloading another browser. Some scripts support `CHROME_PATH` and `AMMOGRAPH_URL`; others contain fixed paths. See [Testing and documentation maintenance](testing.md). The checks target the local German-language test installation and its ammunition dataset. They use a fresh temporary browser context, leaving the personal browser profile untouched. Screenshots and results go into `artifacts`.

The table check covers visible comparison cells, column selection and sorting, cookie restoration, reversible default exclusions, separate visitor contexts, and hiding both whole-load and pellet views together.

The menu check covers icon menu positioning and labels, excluded-entry grouping, complete attribute names and units, consistent percentage conversion, and keyboard and right-to-left interaction.

The navigation check covers wheel zoom, mouse drag, selection after zoom, double-clicking, legend selection without the sidebar, saved view options, and browser interaction.

The filter/pan check covers suspending and reapplying the table filter, the reversible Airsoft exclusion, the pellet toggle without the sidebar, and exact ±20% pan limits at 1× using the mouse.

The search/symbol check covers empty-message priority, shared search normalization, all ten SVG symbol variants, and alignment at different viewport widths.

The presentation check covers tooltip tables with mouse and keyboard, overlapping points, independent attribute selections and ordering, reset and cookie migration, axis changes, internally scrolling details, and the sticky filter sidebar at different viewport widths.

The attribute-transfer check covers individual/bulk actions, mouse drag between lists and reordering, up/down buttons, shared and empty axis lists, and preference restoration and migration.

`tests/StartupFixture` is **not part of the distributed mod**. Install it temporarily in a test installation for the integration check. It adds a caliber early and changes its damage from 111 to 777 after `PostLoad`. `node AmmoGraph/tests/browser.mjs --fixture` checks the final value on the prepared server. Remove the test mod afterward and restart the server. It changes only loaded tables in the test process, not database files.

## Credits

Continues the idea behind [SPTRealismAmmoGraph](https://github.com/AcksBerg/SPTRealismAmmoGraph). Assemblies from the existing SPT installation remain external build requirements.

See [Usability improvements](usability.md) for automatic-save feedback, table resizing, graph-name defaults, and chart help.
