// Resolve album artwork at build time using the keyless iTunes Search API.
// Cached per-build so repeat lookups (or repeated dev-server renders) are cheap.

const cache = new Map<string, string | null>();

export async function resolveSongArtwork(
  title?: string,
  artist?: string,
): Promise<string | null> {
  if (!title) return null;
  const key = `${title}::${artist ?? ''}`.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  const term = encodeURIComponent([title, artist].filter(Boolean).join(' '));
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=1`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) { cache.set(key, null); return null; }
    const data = await res.json() as { results?: Array<{ artworkUrl100?: string }> };
    const small = data.results?.[0]?.artworkUrl100 ?? null;
    // Bump from 100x100 → 600x600 for crisp retina rendering
    const hi = small ? small.replace('100x100', '600x600') : null;
    cache.set(key, hi);
    return hi;
  } catch {
    cache.set(key, null);
    return null;
  }
}
