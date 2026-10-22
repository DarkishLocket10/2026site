import manifest from '../data/homepage-images.json';

const sizes: Record<string, { width: number; height: number }> = manifest;

/** Intrinsic dimensions of the local homepage derivatives; remote art has a reserved box. */
export function imageSize(url: string | null | undefined, width = 1200, height = 900) {
  const size = url ? sizes[url] : undefined;
  return { width: size?.width ?? width, height: size?.height ?? height };
}
