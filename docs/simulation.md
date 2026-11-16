# Ballistics simulator

[Project overview](../README.md) · [Usage](usage.md) · [Interface tour](ui.md)

The cartridge button in the header opens the simulator. The graph button returns to the ammunition graph, preserving its axes, selected ammunition and caliber selection. No client plugin or running game is required.

The simulator follows AmmoGraph's selected language, including its controls, legend, chart, model assumptions and errors. All 29 UI translations are included, with the same locale aliases as the graph. Armor names, materials and slot labels use the server's game translations, falling back to English and then the original identifier when a mod provides no translation. Changing language preserves the magazine, equipment and calculated result.

## Configure a magazine

Select one caliber in the existing filter. The ammunition table supports search and sorting; its **Start**, **Middle** and **End** actions add ammunition to the editor. Searching does not remove configured rounds.

Every magazine contains 30 cartridges in **firing order**, without an additional chambered round:

- **Start:** optional ammunition type and count.
- **Middle:** ordered groups of ammunition and count. The pattern repeats to fill the available spaces, truncating the last group when necessary.
- **End:** optional ammunition type and count.

Start and end reserve at most 29 rounds together. A middle pattern is required. Numbered ammunition entries appear on one line with the cartridge dropdown, count and order/remove controls. Use Add ammunition to append an entry. Hover or focus a selected ammunition input, a dropdown choice, or a firing-order entry to see the ammunition tooltip configured in Settings. The preview numbers every shot from 1 to 30. Buckshot entries represent whole cartridges. Personal ammunition and caliber blacklists also apply to the editor dropdowns. Existing recipes containing blocked ammunition cannot run until corrected or unblocked.

Changing caliber keeps its draft and result for the lifetime of the page. Browser preferences save the current draft and view; results and other caliber drafts are not persisted across a reload.

## Configure protection

Choose armor or an armored rig from the loaded server templates. Its default preset supplies inserts and plates. Fixed inserts are listed as text with their values; optional plate slots can be emptied. Replacements follow slot filters, including item base-class filters. Each component shows class, material and original maximum durability.

Choose **Front**, **Back**, **Side · left** or **Side · right**. The model selects one representative impact point: a supported plate collider in that zone, if present, followed by a matching torso collider. It does not average over the vest's area. Components start at full original durability. Skills, elite effects, repair buffs and stimulants are excluded.

The editor initially shows slots for the selected zone. **Show slots from all protection zones** exposes the entire configuration without changing the simulated impact zone.

## Read the result

Changing simulation parameters automatically evaluates 2,000 complete magazines after a short input pause. Obsolete calculations are cancelled. Armor is reset between magazines and wears down between shots within a magazine. The target has no HP cap or death condition, so all 30 rounds are evaluated.

- X-axis: shot number, with initial armor durability at shot 0.
- Left Y-axis: penetration rate and each component's remaining durability, as a percentage of its original maximum.
- Right Y-axis: mean immediate body damage per shot in HP, including blunt damage. Total mean magazine damage appears above the diagram.

Penetration rate is the fraction of magazines in which at least one projectile from that cartridge passes the modeled protection and reaches the body. Blunt damage alone does not count. Buckshot projectiles hit the same zone and affect armor separately.

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

- Every projectile hits the same entry zone perpendicularly. Flight distance, weapon velocity modifiers, spread, angle-dependent ricochets and missed plates are not simulated.
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
