"""Smoke-check that the offline ZIP matches the current generated HTML."""
from pathlib import Path
from zipfile import ZipFile
import re
p=Path(__file__).resolve().parents[1]
html=(p/'dist/downloads/power-bi-report-diff-offline.html').read_text()
with ZipFile(p/'dist/downloads/power-bi-report-diff-offline.zip') as z:
    assert z.read('index.html').decode()==html
    assert set(z.namelist())=={'index.html','README.md','LICENSE'}
assert 'default-src &#39;none&#39;' not in html
assert "default-src 'none'" in html and "connect-src 'none'" in html and "script-src 'sha256-" in html
assert 'https://cdn.jsdelivr.net' not in html and '<script src=' not in html and '<link rel="stylesheet"' not in html
assert 'Offline Edition – No Internet Connection Required' in html
assert '<mightora-header' in html and '<mightora-author' in html and '<mightora-footer' in html
assert 'Compar' in html and len(html)>40000
print('Offline build / ZIP content verified; no declared external resource loading.')

# The live badges must reflect pipeline/repository state, not decorative claims.
online=(p/'dist/index.html').read_text()
assert 'actions/workflows/test-deploy.yml/badge.svg?branch=main' in online
assert 'actions/workflows/codeql.yml/badge.svg?branch=main' in online
assert 'actions/workflows/dependency-audit.yml/badge.svg?branch=main' in online
assert 'img.shields.io/github/license/mightora/power-bi-diff.mightora.io' in online
assert 'img.shields.io/github/deployments/mightora/power-bi-diff.mightora.io/github-pages' in online
assert 'id="trust-badges"' in online and '<mightora-author' in online
assert online.index('<mightora-author') < online.index('id="trust-badges"') < online.index('<mightora-footer')
assert 'author-section-overlay' in online and 'author-blog-logo' in online
assert 'class="footer-bottom"' in online
assert '<img ' not in html[html.index('id="trust-badges"'):html.index('</div>',html.index('id="trust-badges"'))]
assert 'img.shields.io' not in html
assert 'ian-tweedie-sq2_hu_a380911c6f4726de.png' not in html
assert 'cdn.jsdelivr.net' not in html
for name in ('author-avatar.png','author-blog-logo.png','author-background.png','mightora-logo.png'):
    asset=p/'public'/name
    if asset.is_file():
        assert asset.stat().st_size>1000
        assert 'data:image/png;base64,' in html
print('Brand author/footer structure, dynamic GitHub evidence badges and offline fallbacks verified.')
