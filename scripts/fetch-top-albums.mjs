#!/usr/bin/env node
// Fetches top 10 albums from Last.fm for the last 12 months, enriches
// missing cover art via the iTunes Search API, and writes the result to
// src/data/top-albums.json. Run by .github/workflows/refresh-top-albums.yml
// once a year (Dec 3) and manually via `workflow_dispatch` for testing.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LASTFM_USERNAME = 'DarkishLocket10';
const PERIOD = '12month';
const LIMIT = 10;

const apiKey = process.env.LASTFM_API_KEY;
if (!apiKey) {
  console.error('Missing LASTFM_API_KEY environment variable.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outPath = resolve(__dirname, '..', 'src', 'data', 'top-albums.json');

// Last.fm returns a well-known "star" placeholder image for albums it doesn't
// have art for — its hash shows up across every placeholder URL.
const PLACEHOLDER_HASHES = [/2a96cbd8b46e442fc41c2b86b821562f/i];

function isPlaceholderUrl(url) {
  if (!url || !url.trim()) return true;
  return PLACEHOLDER_HASHES.some((p) => p.test(url));
}

function pickLastFmImage(images) {
  if (!Array.isArray(images)) return null;
  const preferred = ['extralarge', 'large', 'medium'];
  for (const size of preferred) {
    const entry = images.find((i) => i?.size === size);
    const url = entry?.['#text'];
    if (url && !isPlaceholderUrl(url)) {
      return url.replace(/^http:\/\//, 'https://');
    }
  }
  return null;
}

async function fetchLastFmTopAlbums() {
  const params = new URLSearchParams({
    method: 'user.gettopalbums',
    user: LASTFM_USERNAME,
    period: PERIOD,
    limit: String(LIMIT),
    api_key: apiKey,
    format: 'json',
  });
  const url = `https://ws.audioscrobbler.com/2.0/?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Last.fm request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`Last.fm API error ${data.error}: ${data.message}`);
  }
  return data.topalbums?.album ?? [];
}

async function fetchItunesArtwork(artist, album) {
  try {
    const term = encodeURIComponent(`${artist} ${album}`);
    const url = `https://itunes.apple.com/search?term=${term}&entity=album&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const first = data.results?.[0];
    if (!first?.artworkUrl100) return null;
    return first.artworkUrl100.replace(/\/100x100bb\./, '/600x600bb.');
  } catch {
    return null;
  }
}

async function normalizeAlbum(album, rank) {
  const name = album?.name ?? '';
  const artist = album?.artist?.name ?? '';
  const playcount = Number(album?.playcount ?? 0);
  const url = album?.url ?? '';

  let image = pickLastFmImage(album?.image);
  let imageSource = image ? 'lastfm' : null;

  if (!image && name && artist) {
    const itunesImg = await fetchItunesArtwork(artist, name);
    if (itunesImg) {
      image = itunesImg;
      imageSource = 'itunes';
    }
  }

  return { rank, name, artist, playcount, url, image, imageSource };
}

async function main() {
  console.log(`Fetching top ${LIMIT} albums for ${LASTFM_USERNAME} (period=${PERIOD})...`);
  const raw = await fetchLastFmTopAlbums();

  if (!raw.length) {
    // Refuse to overwrite previous data with an empty list — fail loudly so
    // the workflow surfaces the issue and the user can investigate.
    console.error('Last.fm returned 0 albums. Aborting to preserve prior data.');
    process.exit(2);
  }

  const albums = [];
  for (let i = 0; i < raw.length; i += 1) {
    const a = await normalizeAlbum(raw[i], i + 1);
    albums.push(a);
    console.log(
      `  ${a.rank}. ${a.artist} — ${a.name} (${a.playcount} plays, img: ${a.imageSource ?? 'none'})`
    );
  }

  const output = {
    user: LASTFM_USERNAME,
    period: PERIOD,
    updatedAt: new Date().toISOString(),
    albums,
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${albums.length} albums to ${outPath}`);
}

main().catch((err) => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
