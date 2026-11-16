# AmmoGraph 0.25.0

Released: 2026-11-16

See the [calculation guide](shots-to-kill.md), [English screenshots](ui.md#shots-to-kill), and [cumulative changes since v0.23.6](release-notes-since-0.23.6.md). The graph notice mentioned below was subsequently removed in [v0.25.1](release-0.25.1.md).

- Add Shots to Kill metrics for every eligible armor class using representative armor profiles from the loaded SPT dataset.
- Evaluate each ammunition template in ten deterministic runs with fresh armor, an 85 HP chest target and a maximum of 100 shots per run. Buckshot uses 75% average pellet hits.
- Require at least eight successful runs, exclude failed runs from the average and round successful averages upward. Display capped outcomes separately as `100+`.
- Integrate the metrics into axes, sorting, comparisons, tooltips, details and attribute settings. Graphs explicitly report capped results without treating them as exactly 100.
- Compute results once during startup and share them across visitors, languages and display variants.
- Reuse the simulator's ballistic calculations and preserve its existing behavior.

Compatibility: SPT 4.1.4 and later / .NET 10.

Installation: stop the SPT server and extract `AmmoGraph-0.25.0.7z` into the SPT root directory containing `SPT_Runtime`. The archive contains only files under `SPT_Runtime/user/mods/AmmoGraph`; existing configuration files are preserved.

Validation: Release build, core checks, browser checks and comparison with the previous simulator implementation passed.
