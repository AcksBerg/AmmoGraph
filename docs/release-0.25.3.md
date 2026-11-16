# AmmoGraph 0.25.3

Released: 2026-11-16

- Update the built-in caliber display names from `Resources/caliber-names.json`.
- Include the revised defaults in the mod assembly, without changing internal caliber IDs or ammunition values.

Existing server configuration and personal browser names retain priority over built-in defaults. If a changed name is explicitly configured in `config/caliber-names.json`, update that entry to use the revised name. Restart the SPT server after updating the mod or server configuration.

Compatibility: SPT 4.1.4 and later / .NET 10.

Validation: Release build and all existing core checks passed. The packaged assembly contains the exact updated JSON resource. The 7z archive passed its integrity check and uses portable relative paths without configuration or documentation files.

Installation: stop the SPT server and extract `AmmoGraph-0.25.3.7z` into the SPT root directory containing `SPT_Runtime`. The archive contains only files under `SPT_Runtime/user/mods/AmmoGraph`; existing configuration files are preserved. Documentation and the license remain on GitHub.
