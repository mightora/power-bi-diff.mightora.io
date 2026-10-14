# Mightora · Power BI Report Diff

Privacy-first, local-only static web application to compare Power BI report metadata and generate release notes.

## Getting started

1. Save both Power BI versions as **Power BI Projects (.pbip)** in Power BI Desktop, with **PBIR** report files and **TMDL** model files when available.
2. ZIP the entire PBIP project folders, or use **Choose folder** to select project directories. Include `.Report/definition/` and `.SemanticModel/definition/`.
3. Upload the earlier and later versions separately and select **Compare versions**.
4. Review added, modified and removed metadata side-by-side. Export Markdown release notes, HTML report or JSON diff.
5. Select **Load example comparison** to try the interface without a Power BI file.

## Run offline

Download `power-bi-report-diff-offline.html` and double-click it to open in a modern browser on Windows, macOS or Linux; alternatively unzip `power-bi-report-diff-offline.zip` and open `index.html`. No installation or web server is needed. The ZIP includes the MIT licence and this README. The offline edition declares a restrictive CSP with no outbound connections. It is generated from the same source as the online edition.

## Supported coverage

| Metadata | PBIR | Legacy PBIX/PBIT layout | TMDL or model.bim |
| --- | --- | --- | --- |
| Pages, visuals, formatting, report settings, filters, bookmarks | Yes | Best-effort | N/A |
| DAX measures, relationships | N/A | Cannot read proprietary binary model | Yes |

`Report/Layout` is sometimes not readable from a PBIX or saved in another form. This application does not parse compressed/encrypted Power BI DataModel internals, visually render reports, compare data values or evaluate DAX semantic equivalence. A renamed object may show as removal and addition. Missing metadata is explicitly marked **not verified**, not unchanged. It processes supported ZIP/PBIR/TMDL JSON/text, not binary report content.

Recommended maximum archive size is 65 MB; capped decompression and file sizes are enforced. ZIP64 and encrypted archives are not supported. Modern browsers with `DecompressionStream('deflate-raw')` support are required for ZIP uploads.

## Development

```bash
npm test
npm run build
python -m http.server 8080 -d dist
```

Set the `SITE_URL` environment variable before building when deploying to a custom domain (for example, `SITE_URL=https://power-bi-diff.mightora.io/ npm run build`). The default canonical URL is `https://power-bi-diff.mightora.io/`.

There are no runtime npm dependencies. `scripts/build.py` builds `dist/index.html`, `dist/app.js`, `dist/styles.css`, and offline single HTML/ZIP artifacts. All comparison processing stays in the browser. Source files are maintained in `src/`, tests in `tests/`.

## Privacy and network transparency

Online edition loads Mightora shared UI CSS/JS via jsDelivr, js-yaml via jsDelivr, and Mightora logo via GitHub; the author/footer components may load public profile/footer assets. Reports are **not uploaded**. Offline edition embeds styles/logic and has hash-allowed inline scripts/styles, `connect-src 'none'` and no remote dependencies. Network monitor uses the Performance Resource Timing API; it is not exhaustive. Inspect F12 → Network → Preserve log → reload to independently verify.

## Brand status

Online header uses the prescribed full Mightora logo URL, the official shared UI, header/author/footer web components, shared colour tokens, responsive/focus styles and sticky navigation. Offline embeds the official full Mightora logo when the checked-in `public/mightora-logo.png` asset is present (as required for published builds). Evidence badges link to the real repository workflows and do not pre-claim passing results.

## GitHub Pages & CI

Workflow templates are included for automated tests, GitHub Pages deployment, CodeQL analysis, and dependency auditing. Create a **public** repo (`mightora/power-bi-diff.mightora.io`), push the files, enable GitHub Pages **GitHub Actions** as the deployment source, and configure the site's custom domain if desired. First-run evidence badges can then be added, linked to the real workflow run and repository licence. Review the workflow run and the live site after each deployment.

## Maintainers

Mightora / TechTweedie — MIT licensed. Not affiliated with Microsoft. Microsoft Power BI product trademarks belong to their owners.

### Standard Mightora author, footer and verification badges

The online edition loads the shared Mightora UI and uses its author configuration (`data/config.json`), including the TechTweedie biography and photographs. The same author markup is present as a static fallback. The offline edition embeds the pinned brand assets at build time, without fetching anything while running.

Quality badges are **live external evidence**, not manually asserted results: GitHub Actions build/deploy, CodeQL and dependency-manifest-check workflow SVGs, plus Shields badges backed by the public GitHub repository for licence, source activity and Pages deployment. All badge links open the underlying GitHub evidence. Offline editions show links to live evidence rather than stale or invented status indicators. The dependency workflow verifies the zero-package runtime manifest; it is not a security certification and does not scan CDN-hosted shared UI code.
