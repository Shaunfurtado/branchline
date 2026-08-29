# Third-party notices

BRANCHLINE has no runtime JavaScript dependencies, external fonts, stock imagery, music, analytics, or proprietary assets. The application uses browser-standard HTML, SVG, CSS, Web Audio, View Transitions, and the experimental WebMCP API.

## TypeScript

The repository includes `vendor/typescript-5.8.3.tgz` as a deterministic local development dependency so `npm install --offline` and static builds do not depend on package-registry availability.

TypeScript is copyright Microsoft Corporation and contributors and is licensed under the Apache License 2.0. Its upstream archive includes `LICENSE.txt` and `ThirdPartyNoticeText.txt`.

Project development and verification also use Node.js, Python, pytest, Playwright, and Chromium supplied by the execution environment under their respective licenses. They are not bundled into the production application.
