# AmmoGraph 0.25.2

Released: 2026-11-16

- Replace the header's letter mark with the supplied AmmoGraph logo.
- Display the original logo on a white badge with a border and subtle shadow, keeping its black lettering and colored graph points visible in both light and dark themes.
- Preserve the logo's aspect ratio and use a compact badge at narrow window widths.

Screenshots: [light theme](images/header-light.png) · [dark theme](images/header-dark.png).

Validation: installed and tested on the actual local SPT server at `/AmmoGraph`. The PNG loaded successfully in both themes; window widths of 1600, 768, 375 and 320 pixels showed no horizontal overflow. Theme selection survived a reload, and no browser errors occurred. The release archive passed 7-Zip's integrity check; an independent archive listing confirmed relative forward-slash paths and the included logo.

Compatibility: SPT 4.1.4 and later / .NET 10.

Installation: stop the SPT server and extract `AmmoGraph-0.25.2.7z` into the SPT root directory containing `SPT_Runtime`. The archive contains only files under `SPT_Runtime/user/mods/AmmoGraph`; existing configuration files are preserved. Documentation and the license remain on GitHub.
