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
