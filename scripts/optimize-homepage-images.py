"""Regenerate homepage WebPs with Pillow (install in a /tmp venv).

Originals stay beside each derivative. The generated manifest records every
conversion and supplies intrinsic image dimensions to the Astro components.
"""
import json
import re
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
limits = {"game icons and logos": 480, "movie logos": 480, "artists": 480,
          "movies": 900, "games": 900, "mainphotos": 1800,
          "postphotos": 1200, "crests": 192}
reference_files = [ROOT / "src/pages/index.astro", *sorted((ROOT / "src/data").glob("top-*.json"))]
posts = sorted((ROOT / "src/pages/posts").glob("*.md"), reverse=True,
               key=lambda p: re.search(r"^pubDate:\s*(.+)$", p.read_text(), re.M)[1])[:4]
references = [(p, p.read_text()) for p in reference_files]
references += [(p, p.read_text().split("---", 2)[1]) for p in posts]
manifest = {}
replacements = {}
for _, contents in references:
    for url in re.findall(r'''["'](/[^"'\n]+\.(?:png|jpe?g|webp))["']''', contents, re.I):
        folder = url.split("/")[1]
        if folder not in limits:
            continue
        source = PUBLIC / url.lstrip("/")
        if source.suffix == ".webp":
            source = next((source.with_suffix(ext) for ext in (".png", ".jpg", ".jpeg")
                           if source.with_suffix(ext).exists()), source)
        if not source.exists() or source.suffix == ".webp":
            continue
        target = source.with_suffix(".webp")
        target_url = "/" + target.relative_to(PUBLIC).as_posix()
        if target_url not in manifest:
            with Image.open(source) as original:
                image = ImageOps.exif_transpose(original).convert("RGBA" if "A" in original.getbands() or "transparency" in original.info else "RGB")
                # Work cards open in a wider modal; 1800 also covers that use.
                image.thumbnail((limits[folder], limits[folder]), Image.Resampling.LANCZOS)
                image.save(target, "WEBP", quality=85, method=6)
                manifest[target_url] = {"width": image.width, "height": image.height,
                    "source": "/" + source.relative_to(PUBLIC).as_posix(),
                    "beforeBytes": source.stat().st_size, "afterBytes": target.stat().st_size}
        replacements["/" + source.relative_to(PUBLIC).as_posix()] = target_url
for path, _ in references:
    text = path.read_text()
    if path in posts:
        prefix, frontmatter, body = text.split("---", 2)
        for old, new in replacements.items():
            frontmatter = frontmatter.replace(old, new)
        text = "---".join((prefix, frontmatter, body))
    else:
        for old, new in replacements.items():
            text = text.replace(old, new)
    path.write_text(text)
(ROOT / "src/data/homepage-images.json").write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
for folder in limits:
    items = [v for k, v in manifest.items() if k.split("/")[1] == folder]
    if items:
        print(f"{folder}: {len(items)} images, {sum(v['beforeBytes'] for v in items)/1e6:.3f} → {sum(v['afterBytes'] for v in items)/1e6:.3f} MB")
