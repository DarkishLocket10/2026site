#!/usr/bin/env node
/**
 * Fetches transparent-PNG artist wordmark/logo assets for every item in
 * top-music.json, downloads them to /public/artists/<slug>.png, and
 * writes the resolved path back into the JSON as a `logo` field.
 *
 * Two backends are tried in sequence per artist:
 *   1. fanart.tv  (preferred — high-quality "hdmusiclogo" PNGs).
 *      Requires an API key. Set FANART_API_KEY in the env to enable.
 *      Free key: https://fanart.tv/get-an-api-key/
 *   2. theaudiodb.com (fallback — uses the public demo key "2", no
 *      auth needed). Returns one strArtistLogo per artist; quality
 *      varies but usually serviceable.
 *
 * MusicBrainz IDs are resolved automatically by name + disambiguation
 * with the album title, so the user does NOT have to add `mbid` fields
 * by hand. Resolved MBIDs are cached back into the JSON so subsequent
 * runs skip the lookup.
 *
 * Run it with:  node scripts/fetch-artist-logos.mjs
 *
 * Idempotent: items that already have a `logo` whose file exists on
 * disk are skipped.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src/data/top-music.json');
const OUT_DIR   = path.join(ROOT, 'public/artists');

const FANART_KEY  = process.env.FANART_API_KEY || '';
const TADB_KEY    = process.env.TADB_API_KEY || '2';   /* "2" is the public demo key */

const UA = 'YashPortfolio/1.0 (https://yashnilay.ca)';

/* ── Helpers ───────────────────────────────────────────────────── */

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   /* strip accents */
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/* ── MusicBrainz: resolve artist name → MBID ───────────────────── */

async function resolveMbid(creator, albumTitle) {
  const q = `artist:"${creator.replace(/"/g, '\\"')}"`;
  const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
  const data = await fetchJson(url);
  const list = data.artists || [];
  if (!list.length) return null;
  /* If multiple results, prefer the one whose disambiguation most
     closely matches the album title or creator. Otherwise take the
     top-scored hit (first item is highest match). */
  return list[0].id || null;
}

/* ── fanart.tv: MBID → highest-rated hdmusiclogo URL ───────────── */

async function fetchFanartLogo(mbid) {
  if (!FANART_KEY || !mbid) return null;
  try {
    const url = `https://webservice.fanart.tv/v3/music/${mbid}?api_key=${FANART_KEY}`;
    const data = await fetchJson(url);
    const candidates = [
      ...(data.hdmusiclogo || []),
      ...(data.musiclogo   || []),
    ];
    if (!candidates.length) return null;
    /* Highest-rated logo first (likes count is a string in fanart.tv). */
    candidates.sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0));
    return candidates[0].url || null;
  } catch (e) {
    console.warn(`[fanart] ${mbid} → ${e.message}`);
    return null;
  }
}

/* ── theaudiodb: artist name → strArtistLogo URL ────────────────── */

async function fetchTadbLogo(creator) {
  try {
    const url = `https://www.theaudiodb.com/api/v1/json/${TADB_KEY}/search.php?s=${encodeURIComponent(creator)}`;
    const data = await fetchJson(url);
    const artist = data?.artists?.[0];
    return artist?.strArtistLogo || artist?.strArtistThumb || null;
  } catch (e) {
    console.warn(`[tadb] "${creator}" → ${e.message}`);
    return null;
  }
}

/* ── Main loop ─────────────────────────────────────────────────── */

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const json = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  const items = json.items || [];
  let resolved = 0, skipped = 0, failed = 0;

  for (const it of items) {
    const slug   = slugify(it.creator);
    const target = path.join(OUT_DIR, `${slug}.png`);
    const rel    = `/artists/${slug}.png`;

    /* Skip if we already have a logo file on disk and the JSON points
       at it. This makes re-runs cheap; delete the file or wipe the
       `logo` field to force a refresh. */
    if (it.logo === rel && await fileExists(target)) {
      console.log(`[skip] ${it.creator} → already have ${rel}`);
      skipped++;
      continue;
    }

    /* Resolve MBID (cache back into JSON so future runs skip the lookup). */
    let mbid = it.mbid;
    if (!mbid && FANART_KEY) {
      try {
        mbid = await resolveMbid(it.creator, it.title);
        if (mbid) {
          it.mbid = mbid;
          console.log(`[mbid] ${it.creator} → ${mbid}`);
          await new Promise(r => setTimeout(r, 1100)); /* MB rate limit ~1 req/s */
        }
      } catch (e) {
        console.warn(`[mbid] ${it.creator} → ${e.message}`);
      }
    }

    /* Try fanart.tv first (higher quality), then theaudiodb. */
    let logoUrl = null;
    if (FANART_KEY && mbid) {
      logoUrl = await fetchFanartLogo(mbid);
      if (logoUrl) console.log(`[fanart] ${it.creator} → ${logoUrl}`);
    }
    if (!logoUrl) {
      logoUrl = await fetchTadbLogo(it.creator);
      if (logoUrl) console.log(`[tadb]   ${it.creator} → ${logoUrl}`);
    }

    if (!logoUrl) {
      console.warn(`[fail] no logo found for ${it.creator}`);
      failed++;
      continue;
    }

    /* Download. */
    try {
      const buf = await fetchBuffer(logoUrl);
      await fs.writeFile(target, buf);
      it.logo = rel;
      console.log(`[save] ${it.creator} → ${rel} (${(buf.length / 1024).toFixed(1)} KB)`);
      resolved++;
    } catch (e) {
      console.warn(`[dl]   ${it.creator} → ${e.message}`);
      failed++;
    }
  }

  await fs.writeFile(DATA_PATH, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`\nDone: ${resolved} resolved, ${skipped} skipped, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
