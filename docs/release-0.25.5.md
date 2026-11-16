# AmmoGraph 0.25.5

Released: 2026-11-16

- Apply the shared red error styling to messages inside the ammunition graph and comparison table: no caliber selected, no matching ammunition, missing graph attributes, and unavailable graph values.
- Use the same text, background and border colors as the existing errors in both dark and light themes.
- Preserve localized messages, polite accessible status announcements, persistence until the condition is resolved, and existing graph/table behavior.
- Include the usability improvements from [0.25.4](release-0.25.4.md). Ballistic calculations and simulation data models are unchanged.

Compatibility: SPT 4.1.4 and later / .NET 10.

## Live validation

The updated mod was installed and tested on the running local SPT 4.1.6 server at `https://localhost:6969/AmmoGraph`, using isolated Chrome contexts. Its previous installation was backed up before updating. Existing mod configuration files were verified unchanged by SHA-256 comparison. Installed assembly version: `0.25.5.0`.

The targeted `empty-messages.mjs` browser test covers shared error colors in both themes, empty caliber selection, unmatched searches, error resolution, missing axis attributes, German localization, reload persistence, and a 390 px viewport. The existing usability and simulator suites were also run against the live server. See [release validation](release-0.25.5-validation.md) for results.

## Installation

Stop the SPT server and extract `AmmoGraph-0.25.5.7z` into the SPT root containing `SPT_Runtime`, then restart the server. The archive contains only the mod assembly, debug symbols and web assets under `SPT_Runtime/user/mods/AmmoGraph`. Existing configuration files are preserved. A SHA-256 checksum accompanies the archive.
