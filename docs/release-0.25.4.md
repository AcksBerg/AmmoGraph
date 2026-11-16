# AmmoGraph 0.25.4

Released: 2026-11-16

This release improves usability across the ammunition graph and ballistics simulator.

- Show persistent red validation errors beside magazine and armor controls, with accessible announcements.
- Distinguish applied settings from confirmed browser saves, coalesce rapid changes, and offer retry when saving fails.
- Clarify simulation legend units and original maximum armor durability, add the 85 HP cumulative mean damage marker to the legend, and provide contextual chart help.
- Enable optional ammunition names beside shot bars, with automatic shortening and hiding when crowded.
- Add a persistent table-height preference with dragging, keyboard controls and a slider.
- Label the graph/simulator toggle, settings menu and column picker; move magazine actions into the first table column and provide ammunition removal there.
- Make existing settings categories easier to find and add a graph-attributes shortcut.
- Enable graph names for new visitors while respecting saved preferences and suppressing overlapping labels.
- Localize new controls and explanations across all 29 existing translation catalogs.

Ballistic calculations, simulation data models, sampling and existing series defaults are unchanged. Existing browser preferences, cookie chunking and legacy preference migration remain compatible. Existing server configuration files are preserved.

Compatibility: SPT 4.1.4 and later / .NET 10.

Validation: Release build and core checks passed, including 60 new localization assertions. Six Playwright suites passed: usability, simulation, simulation-release, simulation-horizontal, simulation-pellets and navigation. See [validation details](usability-validation.md) and [changes with screenshots](usability.md).

Installation: stop the SPT server and extract `AmmoGraph-0.25.4.7z` into the SPT root directory containing `SPT_Runtime`. The archive contains the assembly, debug symbols and web assets under `SPT_Runtime/user/mods/AmmoGraph`. Configuration files and documentation are not included in the archive. Restart the server after updating.

Release package verification: the archive passed its integrity check; all 11 extracted files exactly match the release build and web assets. Assembly version: `0.25.4.0`. A SHA-256 checksum accompanies the archive as `AmmoGraph-0.25.4.7z.sha256`.
