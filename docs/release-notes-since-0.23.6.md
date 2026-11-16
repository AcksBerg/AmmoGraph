# AmmoGraph v0.25.1 — changes since v0.23.6

This cumulative changelog covers v0.24.0–v0.25.1. Features already present in v0.23.6 are omitted.

## Shots to Kill (v0.25.0–v0.25.1)

- Added **Shots to Kill · Armor Class N** for each eligible armor class in the loaded SPT data. Reference armor uses averaged component properties; class 10 is excluded.
- Made these metrics available in graph axes, table columns and sorting, comparisons, tooltips, details and attribute settings. Fewer shots are rated as better.
- Evaluate each cartridge against fresh reference armor in ten deterministic trials targeting 85 chest HP, with a maximum of 100 shots per trial. Buckshot uses 75% average pellet hits, independently of interactive simulator settings.
- Require at least eight successful trials. Average only successful shot counts and round upward. Other completed evaluations display **100+**, with no numeric graph coordinate; missing or failed results display **—**. Comparisons involving capped results show direction without an invented numeric delta.
- Compute results once during startup and share them across visitors, languages and whole-load/pellet views, using the simulator's shared ballistic calculations.
- Removed the extra capped-results notice below the graph. `100+` remains available in tables, tooltips and details.

## Magazine and armor controls (v0.24.0–v0.24.3)

- Added adjustable magazine capacity from **1–100 rounds**, defaulting to 30. Capacity and armor configuration are retained when switching calibers; ammunition patterns remain specific to each caliber.
- Mark armor carriers without replaceable plates as **(Only fixed insert)**.
- Added configurable average pellet-hit percentage for buckshot, from **0–100%** with a default of 100%. Each shot samples its pellet hits and always hits with at least one pellet. Only hitting pellets contribute to damage and armor wear.
- Show mean pellet hits and the actual hit count in the example shot. Preserve the selected percentage across caliber changes and browser reloads.

## Simulation chart (v0.24.0–v0.24.3)

- Added mouse-wheel zoom, horizontal drag-to-pan, navigation buttons and keyboard controls. Navigation affects only the horizontal axis; both vertical scales always show the full displayed values.
- Keep navigation within the displayed shot range, including a half-shot interval of padding at each edge. Shot labels start at **1**.
- Added a red vertical marker at the first shot where cumulative **mean immediate damage reaches 85 chest HP**. **Show shots after death** reveals the remaining magazine; the full magazine is calculated regardless of this display setting.
- Keep hover and selected-shot highlights at their original screen width when zooming. Edge padding keeps the death marker visible at the first or last shot.

## Distribution and documentation

- Replaced release ZIPs with **7z archives** using relative paths compatible across operating systems.
- Archives contain only files under `SPT_Runtime/user/mods/AmmoGraph`. Documentation and the license remain on GitHub, and existing configuration files are preserved.
- Updated the English usage, interface and developer documentation, including startup/data-flow diagrams, calculation assumptions and screenshots.

## Compatibility and installation

**SPT 4.1.4 and later / .NET 10.** Tested in clean and modded SPT installations.

Stop the SPT server. Copy `AmmoGraph-0.25.1.7z` into the SPT root directory containing `SPT_Runtime`, then extract it there. Start the server and open `/AmmoGraph` through its configured web address.

See the [simulator guide](simulation.md), [Shots to Kill guide](shots-to-kill.md), and individual [v0.25.0](release-0.25.0.md) and [v0.25.1](release-0.25.1.md) notes for details.
