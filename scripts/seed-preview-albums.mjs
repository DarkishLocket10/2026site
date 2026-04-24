#!/usr/bin/env node
// Populates src/data/top-albums.json with sample data + real iTunes cover art
// for local preview. NOT for production — the Dec 3 workflow will overwrite
// this with real Last.fm data on first run.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outPath = resolve(__dirname, '..', 'src', 'data', 'top-albums.json');

const samples = [
  { artist: 'Radiohead',           name: 'In Rainbows',                 playcount: 312 },
  { artist: 'Kendrick Lamar',      name: 'To Pimp a Butterfly',         playcount: 287 },
  { artist: 'Tame Impala',         name: 'Currents',                    playcount: 264 },
  { artist: 'Frank Ocean',         name: 'Blonde',                      playcount: 238 },
  { artist: 'Tyler, the Creator',  name: 'Flower Boy',                  playcount: 219 },
  { artist: 'Lorde',               name: 'Melodrama',                   playcount: 194 },
  { artist: 'Beyoncé',             name: 'Renaissance',                 playcount: 176 },
  { artist: 'Silk Sonic',          name: 'An Evening with Silk Sonic',  playcount: 158 },
  { artist: 'Harry Styles',        name: "Harry's House",               playcount: 143 },
  { artist: 'Olivia Rodrigo',      name: 'SOUR',                        playcount: 121 },
];

async function itunesArtwork(artist, name) {
  try {
    const term = encodeURIComponent(`${artist} ${name}`);
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

const albums = [];
for (let i = 0; i < samples.length; i += 1) {
  const s = samples[i];
  const image = await itunesArtwork(s.artist, s.name);
  albums.push({
    rank: i + 1,
    name: s.name,
    artist: s.artist,
    playcount: s.playcount,
    url: `https://www.last.fm/music/${encodeURIComponent(s.artist)}/${encodeURIComponent(s.name)}`,
    image,
    imageSource: image ? 'itunes' : null,
  });
  console.log(`  ${i + 1}. ${s.artist} — ${s.name} → ${image ? 'OK' : 'no art'}`);
}

const output = {
  user: 'DarkishLocket10',
  period: '12month',
  updatedAt: new Date().toISOString(),
  albums,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`\nWrote ${albums.length} preview albums to ${outPath}`);
