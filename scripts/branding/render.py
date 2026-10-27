"""Renders the PNG icons, favicon.ico and og-image.png in public/ from favicon.svg,
icon-maskable.svg and og.html, using headless Chrome (so Sinhala and Tamil text
is shaped). Run: python scripts/branding/render.py"""
import os, pathlib, subprocess, tempfile
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
PUB = ROOT / 'public'
HERE = pathlib.Path(__file__).resolve().parent
SCRATCH = pathlib.Path(tempfile.mkdtemp())
CHROME = os.environ.get('CHROME', r'C:\Program Files\Google\Chrome\Application\chrome.exe')


def shot(html: pathlib.Path, out: pathlib.Path, w: int, h: int, transparent: bool):
    args = [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--window-size={w},{h}', f'--screenshot={out}',
            '--force-device-scale-factor=1']
    if transparent:
        args.append('--default-background-color=00000000')
    with tempfile.TemporaryDirectory() as prof:
        subprocess.run(args + [f'--user-data-dir={prof}', html.as_uri()], check=True, capture_output=True, timeout=60)
    img = Image.open(out)
    assert img.size == (w, h), (out, img.size)


def icon(svg: pathlib.Path, out: pathlib.Path, size: int, transparent=True):
    page = SCRATCH / f'icon_{size}.html'
    page.write_text(f'<!doctype html><html><body style="margin:0;background:transparent">'
                    f'<img src="{svg.as_uri()}" style="display:block;width:{size}px;height:{size}px"></body></html>', encoding='utf-8')
    shot(page, out, size, size, transparent)


logo = PUB / 'favicon.svg'
mask = PUB / 'icon-maskable.svg'
icon(logo, PUB / 'icon-192.png', 192)
icon(logo, PUB / 'icon-512.png', 512)
icon(mask, PUB / 'icon-maskable-512.png', 512, transparent=False)
icon(mask, PUB / 'apple-touch-icon.png', 180, transparent=False)
icon(logo, SCRATCH / 'ico-256.png', 256)
Image.open(SCRATCH / 'ico-256.png').save(PUB / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

og = HERE / 'og.html'
src = og.read_text(encoding='utf-8').replace('LOGO', logo.as_uri())
page = SCRATCH / 'og_render.html'
page.write_text(src, encoding='utf-8')
shot(page, SCRATCH / 'og.png', 1200, 630, False)
Image.open(SCRATCH / 'og.png').convert('RGB').save(PUB / 'og-image.png', optimize=True)
for f in sorted(PUB.iterdir()):
    print(f.name, f.stat().st_size)
