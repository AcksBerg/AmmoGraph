# Ballistics simulator

[Project overview](../README.md) · [Usage](usage.md) · [Interface tour](ui.md)

The cartridge button in the header opens the simulator. The graph button returns to the ammunition graph, preserving its axes, selected ammunition and caliber selection. No client plugin or running game is required.

The simulator follows AmmoGraph's selected language, including its controls, legend, chart, model assumptions and errors. All 29 UI translations are included, with the same locale aliases as the graph. Armor names, materials and slot labels use the server's game translations, falling back to English and then the original identifier when a mod provides no translation. Changing language preserves the magazine, equipment and calculated result.

## Configure a magazine

Select one caliber in the existing filter. The ammunition table supports search and sorting; its **Start**, **Middle** and **End** actions add ammunition to the editor. Searching does not remove configured rounds.

Choose a magazine capacity from **1 to 100 cartridges**, with **30** as the default. Entries are in **firing order**, without an additional chambered round:

- **Start:** optional ammunition type and count.
- **Middle:** ordered groups of ammunition and count. The pattern repeats to fill the available spaces, truncating the last group when necessary.
- **End:** optional ammunition type and count.

Start and end together must leave at least one round for the middle pattern. Shrinking the capacity trims optional start/end counts to fit, removing them when necessary; a one-round magazine uses the middle pattern alone. Numbered ammunition entries appear on one line with the cartridge dropdown, count and order/remove controls. Use Add ammunition to append an entry. Hover or focus a selected ammunition input, a dropdown choice, or a firing-order entry to see the ammunition tooltip configured in Settings. The preview numbers every shot up to the chosen capacity. Buckshot entries represent whole cartridges. Personal ammunition and caliber blacklists also apply to the editor dropdowns. Existing recipes containing blocked ammunition cannot run until corrected or unblocked.

Each caliber keeps its own ammunition pattern for the lifetime of the page. Magazine capacity, pellet hit percentage, carrier, inserts, plate choices (including empty slots), and entry zone are shared across calibers. Changing capacity in one caliber also applies when opening a new caliber or returning to a cached pattern. If necessary, optional start/end blocks are shortened to fit the new capacity. Returning to a pattern uses the current shared settings and recalculates stale results. Browser preferences save the current draft and shared settings; results and other caliber patterns are not persisted across a reload. Older saved magazines without a capacity load with 30 rounds.

## Buckshot accuracy

For calibers containing multi-projectile ammunition, **Average pellet hits (%)** sets the mean percentage of pellets that hit, from 0 to 100. The default is **100%**, preserving the previous behavior. The hit count is sampled separately for each shot and each simulation run. **At least one pellet always hits**, even at 0%. Single-projectile cartridges, including slugs, are unaffected.

For example, an eight-pellet load at 50% averages four hits per shot, while individual shots can hit with fewer or more pellets. A requested average below one pellet uses a one-pellet minimum; for eight pellets, settings below 12.5% therefore still average one hit.

The sampler guarantees one hit and uses independent trials for the remaining pellets, with an adjusted probability so the requested mean is preserved above that minimum:

```text
expected hits = max(1, pellet count × percentage / 100)
remaining pellet probability = (expected hits − 1) / (pellet count − 1)
hits per shot = 1 + binomial(pellet count − 1, remaining pellet probability)
```

Only hitting pellets affect armor, body damage, penetration statistics, and the mean-damage death marker. They use the same configured impact zone. This is a hit-count model rather than a simulation of spread or individual pellet trajectories. Details show both the **mean pellets hitting** and the actual **pellets hitting** in the reproducible example run. The setting persists across caliber changes and reloads; older preferences without it use 100%.

## Configure protection

Choose armor or an armored rig from the loaded server templates. Carriers without replaceable armor slots are marked **(Only fixed insert)** in the English selector. Its default preset supplies inserts and plates. Fixed inserts are listed as text with their values; optional plate slots can be emptied. Replacements follow slot filters, including item base-class filters. Each component shows class, material and original maximum durability.

Choose **Front**, **Back**, **Side · left** or **Side · right**. The model selects one representative impact point: a supported plate collider in that zone, if present, followed by a matching torso collider. It does not average over the vest's area. Components start at full original durability. Skills, elite effects, repair buffs and stimulants are excluded.

The editor initially shows slots for the selected zone. **Show slots from all protection zones** exposes the entire configuration without changing the simulated impact zone.

## Read the result

Changing simulation parameters automatically evaluates 2,000 complete magazines after a short input pause. Obsolete calculations are cancelled. Armor is reset between magazines and wears down between shots within a magazine. All configured rounds are calculated so that later shots can be inspected without rerunning the simulation.

A vertical red line marks the first shot at which **cumulative mean immediate damage reaches 85 chest HP**. This is a threshold on the mean damage curve, not a claim that every simulated target dies on that exact shot. Blunt damage is included. By default the diagram stops at this shot; **Show shots after death** reveals the rest of the magazine. No line is drawn if the magazine never reaches 85 HP. Total magazine summaries continue to cover the entire calculated magazine.

Use the mouse wheel to zoom horizontally around the pointer and drag to pan along the shot axis. The +/− buttons zoom around the center; reset or Home restores the full visible range. With the chart focused, +/− zoom and Left/Right pan. Both vertical scales always remain fully visible. Shot labels start at **1**, with half a shot interval of space before the first bar and after the last. This keeps edge bars and the kill marker fully inside the plot. Panning is bounded by that padded range, without additional overscroll. Hover and selection highlights retain their unzoomed screen width; the full enlarged bar remains interactive. Focus an individual shot to select it or navigate between shots. Zoom and pan update locally in the browser; they are preserved when selecting a shot, and reset when the data, displayed range, axes, or language changes.

- X-axis: actual shot number, starting at 1. Durability series show the values after each shot; initial durability remains available in the example's before/after details.
- Left Y-axis: penetration rate and each component's remaining durability, as a percentage of its original maximum.
- Right Y-axis: mean immediate body damage per shot in HP, including blunt damage. Total mean magazine damage appears above the diagram.

Penetration rate is the fraction of magazines in which at least one hitting projectile from that cartridge passes the modeled protection and reaches the body. Blunt damage alone does not count. Hitting buckshot pellets strike the same zone and affect armor separately; missed pellets do not affect armor or damage.

Click or focus a shot marker, or use the previous/next controls. Details show the statistical mean and one actual example run, including the blocking component, damage and durability before/after the shot. Legend buttons hide or show series.

The firing-order preview starts collapsed. Class and material checkbox dropdowns below Plate Carrier filter only compatible plate choices; carrier names are filtered solely by the text search. Classes run from 1 through the highest class of available protection components, including mod-added levels. Each dropdown has an All/None toggle and closes on an outside click. Selected equipment remains visible. Plate options include their class and material. The damage summary shows both mean total damage and the example run total. The cumulative HP line is disabled by default; enable it in the legend to see total mean damage through each shot, with a value for the currently selected shot. Hide that series to restore the HP axis to the per-shot damage range. An internal fixed seed keeps comparisons stable; there are no seed controls. Switching views or calibers cancels an active run.

## Calculation sources and limits

This is an **idealized server-side model**, not execution of the installed game's methods. It follows the supplied Assembly-CSharp dump for the supported SPT 4.1.6 installation:

| Behavior | Inspected source |
| --- | --- |
| Effective resistance / probability | `E340.RealResistance`, `E33F.GetPenetrationChance` |
| Effective slot coverage | `ArmorComponent.ArmorColliders` / `ArmorPlateCollidersMask` |
| Armor ordering | `Inventory.GetPutOnArmorsNonAlloc` |
| Shared checks and blocking | `Player.SetShotStatus` |
| Wear and blunt damage | `ArmorComponent.ApplyDamage`, `Player.ProceedDamageThroughArmor` |
| Continuing projectile | `BodyPartCollider.IsPenetrated`, `F16A.E00D`, `F16A.E01E` |
| Fragment creation / bounded penetration variation | `F16A.E01C`, `F161` |

For durability percentage `d`, class resistance `C`, effective resistance `R` and impact penetration `P`:

```text
d = 100 * current durability / original maximum durability
R = (121 - 5000 / (45 + 2*d)) * C / 100
CF = clamp(P / (R + 12), 0.6, 1)
```

The engine uses the inspected piecewise probability formula, material destructibility, minimum durability loss of one and the configured soft-armor blunt modifier. Shared checks within one collider event use one random value rather than independent layer probabilities. Projectile state and copied damage-event state are separate.

The startup catalog captures ammunition, armor, presets, slot filters, class resistances, material factors and body-collider settings from loaded SPT tables. Restart the server after changing them. Client patches to calculation functions are not reproduced. Game updates require reviewing the copied logic.

The simulator displays these assumptions:

- Each hitting projectile strikes the same entry zone perpendicularly. The selected pellet percentage controls the number of hitting pellets. Flight distance, weapon velocity modifiers, geometric spread, angle-dependent ricochets and missed plates are not simulated.
- Plate-prefab geometry and additional material coefficients are unavailable in server tables. The plate is treated as an ideal surface with no extra prefab material loss beyond armor damping, affecting continuation toward another collider.
- Fragment creation at a plate exit follows the modeled branch and divides damage/penetration by the original maximum fragment count. The model ends at first body impact: no speculative fragment damage bonus, exit-side hit or bleeding damage over time is added.
- The seeded generator approximates the inspected bounded penetration distribution and preserves within-event correlations. It is not Unity's exact generator or finite random table.
- Multiple plate shapes and physical distances are represented by one impact path, not Unity physics.
- Missing required data, incompatible equipment and unknown collider mappings produce an error instead of fabricated values.

## Implementation and validation

`SimulationCatalog` captures inputs, `MagazineRecipe` expands the magazine and `BallisticsEngine` evaluates an immutable request on a background task. Cancellation and progress belong to the page. Loaded game tables and profiles are never written.

Core checks read local databases without modifying them:

```powershell
dotnet run --project AmmoGraph/tests/Core -c Release
```

A separate test host serves the real components with read-only database fixtures without stopping or changing SPT:

```powershell
dotnet run --project AmmoGraph/tests/SimulationHost -c Release
node AmmoGraph/tests/simulation.mjs
```

Its default address is `http://127.0.0.1:6973/AmmoGraph`. `AMMOGRAPH_TEST_URL` changes the host binding; `AMMOGRAPH_URL` changes the browser test target. The test host is excluded from the shipped mod. Test screenshots and logs go into `artifacts`.
