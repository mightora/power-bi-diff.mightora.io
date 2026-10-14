"""Fetch pinned official Mightora images for deterministic standalone offline builds.

Remote requests happen at build time in CI only, never in the offline application.
Each downloaded file is checked against its published Git blob digest.
"""
from pathlib import Path
from urllib.request import urlopen
from hashlib import sha1

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
PUBLIC.mkdir(exist_ok=True)

SHARED_REV = '1b12c89ea0aeb2d250e11c37b40671bc878cfa69'
MIGHTORA_REV = 'd6ba3b6107f3e72965a7775d86de5809db1693b0'
ITEMS = [
    ('mightora-logo.png',f'https://raw.githubusercontent.com/mightora/mightora.io/{MIGHTORA_REV}/static/images/mightoraIoLogo4-200x900.png','b75bc2d21a367a0ba64050f5a4923464dadeb526'),
    ('author-avatar.png',f'https://raw.githubusercontent.com/mightora/shared-ui/{SHARED_REV}/ian-tweedie-sq2.png','435ae8ed3dbc93fe784913a4ffa0e6da8f8b3bdf'),
    ('author-blog-logo.png',f'https://raw.githubusercontent.com/mightora/shared-ui/{SHARED_REV}/main-logo.png','3730946cf2465120d4f8d2e0426d48f980da1b8e'),
    ('author-background.png',f'https://raw.githubusercontent.com/mightora/shared-ui/{SHARED_REV}/ian-tweedie-presenting-4.png','e3ecbaf005d6190354ea053a79ba74ecf90bbb6c'),
]

for filename, url, expected_sha in ITEMS:
    target = PUBLIC / filename
    if target.is_file():
        raw = target.read_bytes()
    else:
        with urlopen(url, timeout=45) as response:
            raw = response.read()
    git_blob_sha = sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if git_blob_sha != expected_sha:
        raise RuntimeError(f'Official image digest mismatch: {filename}: {git_blob_sha} (expected {expected_sha})')
    target.write_bytes(raw)
    print(f'Pinned Mightora asset verified: {filename} ({len(raw)} bytes)')
