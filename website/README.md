# WorkDSH product website

Static English product showcase at https://techflag.github.io/workdsh/.

Deploys only `website/` through the official GitHub Pages Actions. No application runtime, model configuration, analytics or local workspace files are served. Screenshots are user-provided development-preview images, already published in the project README; they are examples rather than included default user data. Typography uses Google Fonts with local fallbacks.

Visual reference: https://hermes-studio.ai/ (currently Ekko Studio). Layout and copy are original WorkDSH material; no source code or brand assets from the reference are copied. Product screenshots/brand are kept in assets; third-party component credits link to the root README.

Preview: `python3 -m http.server 19101 --directory website`.

Verification: desktop/mobile geometry, actual image loading, tabs, keyboard navigation, disclosure and console errors. Live GitHub Pages deployment is verified after the publishing workflow.
