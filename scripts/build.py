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
if (ROOT/'data/config.json').is_file():
    (DIST/'data').mkdir(exist_ok=True)
    shutil.copy2(ROOT/'data/config.json',DIST/'data/config.json')
standin = '<span class="brand-standin">◆ mightora</span>'
logo_online = '<img src="https://raw.githubusercontent.com/mightora/mightora.io/main/static/images/mightoraIoLogo4-200x900.png" alt="Mightora" width="142" height="40">'
# Embed the exact official Mightora full logo when the bundled asset is present.
# Without it, builds remain possible, but the offline edition has fallback branding.
logo_asset = ROOT / 'public' / 'mightora-logo.png'
logo_offline = ('<img alt="Mightora" width="142" height="40" src="data:image/png;base64,' + base64.b64encode(logo_asset.read_bytes()).decode() + '">') if logo_asset.exists() else standin
repo='https://github.com/mightora/power-bi-diff.mightora.io'

def status_badge(label, image_url, evidence):
    return '<a class="badge-link" href="'+evidence+'" target="_blank" rel="noopener noreferrer" aria-label="'+html.escape(label,quote=True)+' — inspect evidence"><img loading="lazy" src="'+image_url+'" alt="'+html.escape(label,quote=True)+'" height="20"></a>'

online_badges=''.join([
    status_badge('GitHub repository', 'https://img.shields.io/github/stars/mightora/power-bi-diff.mightora.io?logo=github&label=GitHub%20repo',repo),
    status_badge('MIT licence', 'https://img.shields.io/github/license/mightora/power-bi-diff.mightora.io?label=Licence',repo+'/blob/main/LICENSE'),
    status_badge('Build and test pipeline',repo+'/actions/workflows/test-deploy.yml/badge.svg?branch=main',repo+'/actions/workflows/test-deploy.yml'),
    status_badge('CodeQL security analysis pipeline',repo+'/actions/workflows/codeql.yml/badge.svg?branch=main',repo+'/actions/workflows/codeql.yml'),
    status_badge('Dependency manifest check pipeline',repo+'/actions/workflows/dependency-audit.yml/badge.svg?branch=main',repo+'/actions/workflows/dependency-audit.yml'),
    status_badge('GitHub Pages deployment','https://img.shields.io/github/deployments/mightora/power-bi-diff.mightora.io/github-pages?label=Pages%20deployment',repo+'/deployments'),
])
offline_badges=''.join('<a class="badge-link" href="'+evidence+'" target="_blank" rel="noopener noreferrer"><span class="badge-offline">'+label+' (view live evidence ↗)</span></a>' for label,evidence in [
    ('GitHub source',repo),('MIT licence',repo+'/blob/main/LICENSE'),('Build / tests / deployment',repo+'/actions/workflows/test-deploy.yml'),('CodeQL',repo+'/actions/workflows/codeql.yml'),('Dependency check',repo+'/actions/workflows/dependency-audit.yml')
])

def inline_image(file_name):
    f=ROOT/'public'/file_name
    if not f.is_file(): return None
    return 'data:image/png;base64,'+base64.b64encode(f.read_bytes()).decode()
head_online = '''<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/shared.css"><link rel="stylesheet" href="./styles.css">
<script>/* Work around indentation in the published footer YAML before js-yaml runs. */(function(){if(!window.fetch)return;const prior=window.fetch.bind(window);window.fetch=async function(input,init){const response=await prior(input,init);const url=typeof input==='string'?input:input&&input.url||'';if(!/footer\\.ya?ml(?:\\?|$)/i.test(url)||!response.ok)return response;const data=await response.clone().text();return new Response(data.replace(/^([ \\t]*)-\\s+/gm,(m,indent)=>indent.replace(/\\t/g,'  ')+'- '),{status:response.status,statusText:response.statusText,headers:response.headers});};})();</script>
<script src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js" defer></script><script src="https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/components.js" defer></script>'''
head_offline = '<meta id="offline-csp" http-equiv="Content-Security-Policy" content="{{OFFLINE_CSP}}">' 
for edition in ['online','offline']:
    document = template.replace('{{EDITION}}', edition).replace('{{YEAR}}',str(datetime.datetime.now().year)).replace('{{SITE_URL}}', site_url)
    document = document.replace('{{BADGE_CONTENT}}',offline_badges if edition=='offline' else online_badges)
    edition_css=css
    if edition=='offline':
        # Avoid external image fetches. Include all Mightora author imagery in the offline HTML.
        for external,image in [
            ('https://techtweedie.github.io/images/author/ian-tweedie-sq2_hu_a380911c6f4726de.png','author-avatar.png'),
            ('https://raw.githubusercontent.com/TechTweedie/techtweedie.github.io/v2/assets/images/site/main-logo.png','author-blog-logo.png'),
        ]:
            local=inline_image(image)
            if local:
                document=document.replace(external,local)
            else:
                # Local preview fallback: no external connections even without fetched CI images.
                document=document.replace(external,'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="120"%3E%3Crect width="120" height="120" fill="%23111827"/%3E%3C/svg%3E')
        bg=inline_image('author-background.png')
        edition_css=edition_css.replace('url(\'https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/ian-tweedie-presenting-4.png\')', 'url(\''+bg+'\')' if bg else 'linear-gradient(135deg,#16253d,#172c45)')
    document = document.replace('{{HEAD_ASSETS}}',head_offline if edition=='offline' else head_online)
    document = document.replace('{{HEADER_LOGO}}',logo_offline if edition=='offline' else logo_online)
    document = document.replace('{{STYLE}}','<style>'+edition_css+'</style>' if edition=='offline' else '')
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
