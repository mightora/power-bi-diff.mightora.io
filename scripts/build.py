"""Build online and fully self-contained offline sites from one maintained source."""
import datetime
import html
import pathlib
import os
import shutil
import re
import hashlib
import base64
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
DIST = ROOT / 'dist'
(DIST / 'downloads').mkdir(parents=True, exist_ok=True)
css = (SRC/'styles.css').read_text()
engine = (SRC/'engine.js').read_text().replace('export const ', 'const ').replace('export async function ', 'async function ').replace('export function ', 'function ').replace('export { TYPES, LABELS };', '')
main = (SRC/'main.js').read_text()
main = '\n'.join(line for line in main.splitlines() if not line.startswith('import {'))
combined = '(function(){"use strict";\n' + engine + '\n' + main + '\n})();'
# Avoid a literal HTML closing script tag inside inline script.
combined = combined.replace('</script', '<\\/script')
(DIST/'app.js').write_text(combined)
(DIST/'styles.css').write_text(css)
template = (SRC/'index.template.html').read_text()
site_url = os.environ.get('SITE_URL', 'https://power-bi-diff.mightora.io/')
for fname in ['LICENSE','README.md']:
    shutil.copy2(ROOT/fname,DIST/fname)
shutil.copytree(ROOT/'samples',DIST/'samples',dirs_exist_ok=True)
standin = '<span class="brand-standin">◆ mightora</span>'
logo_online = '<img src="https://raw.githubusercontent.com/mightora/mightora.io/main/static/images/mightoraIoLogo4-200x900.png" alt="Mightora" width="142" height="40">'
# Embed the exact official Mightora full logo when the bundled asset is present.
# Without it, builds remain possible, but the offline edition has fallback branding.
logo_asset = ROOT / 'public' / 'mightora-logo.png'
logo_offline = ('<img alt="Mightora" width="142" height="40" src="data:image/png;base64,' + base64.b64encode(logo_asset.read_bytes()).decode() + '">') if logo_asset.exists() else standin
head_online = '''<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/shared.css"><link rel="stylesheet" href="./styles.css">
<script>/* Work around indentation in the published footer YAML before js-yaml runs. */(function(){if(!window.fetch)return;const prior=window.fetch.bind(window);window.fetch=async function(input,init){const response=await prior(input,init);const url=typeof input==='string'?input:input&&input.url||'';if(!/footer\\.ya?ml(?:\\?|$)/i.test(url)||!response.ok)return response;const data=await response.clone().text();return new Response(data.replace(/^([ \\t]*)-\\s+/gm,(m,indent)=>indent.replace(/\\t/g,'  ')+'- '),{status:response.status,statusText:response.statusText,headers:response.headers});};})();</script>
<script src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js" defer></script><script src="https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/components.js" defer></script>'''
head_offline = '<meta id="offline-csp" http-equiv="Content-Security-Policy" content="{{OFFLINE_CSP}}">' 
for edition in ['online','offline']:
    document = template.replace('{{EDITION}}', edition).replace('{{YEAR}}',str(datetime.datetime.now().year)).replace('{{SITE_URL}}', site_url)
    document = document.replace('{{HEAD_ASSETS}}',head_offline if edition=='offline' else head_online)
    document = document.replace('{{HEADER_LOGO}}',logo_offline if edition=='offline' else logo_online)
    document = document.replace('{{STYLE}}','<style>'+css+'</style>' if edition=='offline' else '')
    document = document.replace('{{SCRIPT}}','<script>'+combined+'</script>' if edition=='offline' else '<script defer src="./app.js"></script>')
    if edition=='offline':
        def sha256(value):
            return "'sha256-" + base64.b64encode(hashlib.sha256(value.encode('utf-8')).digest()).decode() + "'"
        scripts = re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', document, flags=re.DOTALL|re.IGNORECASE)
        styles = re.findall(r'<style(?:\s[^>]*)?>(.*?)</style>', document, flags=re.DOTALL|re.IGNORECASE)
        policy = "default-src 'none'; script-src " + ' '.join(map(sha256,scripts)) + '; style-src ' + ' '.join(map(sha256,styles)) + "; img-src data:; connect-src 'none'; font-src 'none'; object-src 'none'; media-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
        document = document.replace('{{OFFLINE_CSP}}', policy)
        document = document.replace('href="./downloads/power-bi-report-diff-offline.html"','href="#privacy"').replace('href="./downloads/power-bi-report-diff-offline.zip"','href="#privacy"')
        dest = DIST/'downloads/power-bi-report-diff-offline.html'
        dest.write_text(document)
        with zipfile.ZipFile(DIST/'downloads/power-bi-report-diff-offline.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('index.html',document)
            z.write(ROOT/'LICENSE','LICENSE')
            z.write(ROOT/'README.md','README.md')
    else: (DIST/'index.html').write_text(document)
(DIST / '.nojekyll').write_text('')
print('Built online + self-contained offline editions:', len(combined),'JS chars')
