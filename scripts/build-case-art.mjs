// Web-sized derivatives of the 3-D case artwork.
//
//   node scripts/build-case-art.mjs
//
// The masters in public/cases/{music,film,games} stay untouched. For each one
// this writes
//   public/cases/web/…    at most 1024 px on the long side: what the 3-D case
//                         textures use (a case is ~400 device px on screen)
//   public/cases/thumb/…  at most 480 px, fronts only: the flat placeholder
//   lqip                  a ~300-byte, 24 px data URL of each front, inlined in
//                         the page so the placeholder has colour before any download
// and records both in src/data/case-art-web.json, which Bookshelves.astro reads.
// Re-run after adding or replacing artwork. Uses the `sharp` that Astro installs.
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES = path.join(ROOT, 'public/cases');
const WEB = 1024, THUMB = 480;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.webp')) out.push(full);
  }
  return out;
}

const manifest = {};
let before = 0, after = 0, thumbs = 0;
for (const kind of ['music', 'film', 'games']) {
  for (const source of (await walk(path.join(CASES, kind))).sort()) {
    const relative = path.relative(CASES, source).split(path.sep).join('/');
    const url = `/cases/${relative}`;
    const entry = { web: `/cases/web/${relative}` };
    const target = path.join(CASES, 'web', relative);
    await mkdir(path.dirname(target), { recursive: true });
    // Disc scans rely on their alpha as ink coverage; keep it crisp.
    const info = await sharp(source)
      .resize(WEB, WEB, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90, effort: 6 })
      .toFile(target);
    entry.width = info.width; entry.height = info.height;
    before += (await stat(source)).size; after += info.size;
    if (/^front/.test(path.basename(source))) {
      const thumb = path.join(CASES, 'thumb', relative);
      await mkdir(path.dirname(thumb), { recursive: true });
      const small = await sharp(source)
        .resize(THUMB, THUMB, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72, effort: 6 })
        .toFile(thumb);
      entry.thumb = `/cases/thumb/${relative}`;
      const tiny = await sharp(source).resize(24, 24, { fit: 'inside' }).webp({ quality: 40, effort: 6 }).toBuffer();
      entry.lqip = `data:image/webp;base64,${tiny.toString('base64')}`;
      entry.thumbWidth = small.width; entry.thumbHeight = small.height;
      thumbs += small.size;
    }
    manifest[url] = entry;
  }
}
await writeFile(path.join(ROOT, 'src/data/case-art-web.json'), JSON.stringify(manifest, null, 2) + '\n');
const mb = bytes => (bytes / 1e6).toFixed(2) + ' MB';
console.log(`${Object.keys(manifest).length} images: ${mb(before)} -> ${mb(after)} for 3-D textures, ${mb(thumbs)} of placeholder thumbnails`);
