import { warpGlsl, wearGlsl } from './materials';

// All stages use GLSL ES 3.00. Three supplies the standard mesh attributes/matrices.
export const commonGlsl = /* glsl */`
const float PI = 3.141592653589793;
const vec3 KEY = vec3(-0.625, 0.218, 0.750);
const vec3 STRIP = vec3(0.725, 0.028, 0.688);
const vec3 TOP = vec3(0.031, 0.786, 0.618);
const vec3 BOUNCE = vec3(0.069, -0.722, 0.688);
float lights(vec3 N) {
  return 0.42 + 0.30 * max(dot(N, KEY), 0.0) + 0.20 * max(dot(N, STRIP), 0.0)
    + 0.16 * max(dot(N, TOP), 0.0) + 0.08 * max(dot(N, BOUNCE), 0.0);
}
float sat(float x) { return clamp(x, 0.0, 1.0); }
float fresnel(float c, float ior) {
  float f = (ior - 1.0) / (ior + 1.0); f *= f;
  return f + (1.0 - f) * pow(1.0 - sat(c), 5.0);
}
float band(float x, float centre, float width, float edge) {
  return 1.0 - smoothstep(width, width + edge, abs(x - centre));
}
// Integrate the long axis of a tilted print footprint without choosing a blurry
// isotropic mip. Explicit LOD keeps this consistent across WebGL2 drivers.
vec4 printSampleRgba(sampler2D ink, vec2 uv) {
  vec2 size = vec2(textureSize(ink, 0));
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float lx = length(dx * size), ly = length(dy * size);
  vec2 axis = lx > ly ? dx : dy;
  float major = max(lx, ly);
  float minor = abs(dx.x * dy.y - dx.y * dy.x) * size.x * size.y / max(major, 0.0001);
  float taps = clamp(ceil(major / max(minor, 1.0)), 1.0, 4.0);
  float lod = max(0.0, log2(max(max(minor, major / taps), 1.0)));
  vec4 inkSum = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    if (float(i) >= taps) break;
    inkSum += textureLod(ink, uv + axis * ((float(i) + 0.5) / taps - 0.5), lod);
  }
  return inkSum / taps;
}
vec3 printSample(sampler2D ink, vec2 uv) { return printSampleRgba(ink, uv).rgb; }
// Subpixel machining/paper fibres average to zero instead of sparkling in motion.
float filteredGrain(float phase) {
  float footprint = fwidth(phase);
  return sin(phase) * (1.0 - smoothstep(0.5, 3.141593, footprint));
}
float inkSheen(vec3 N, vec3 V) {
  float key = pow(max(dot(N, normalize(KEY + V)), 0.0), 38.0);
  float fill = pow(max(dot(N, normalize(TOP + V)), 0.0), 26.0);
  return key * 0.065 + fill * 0.025;
}
float backdrop(vec3 d) {
  vec2 p = d.xy / max(abs(d.z), 0.08);
  return (1.0 - smoothstep(0.30, 0.68, length(p))) * step(d.z, 0.0);
}
vec3 room(vec3 d) {
  vec2 p = d.xy / max(abs(d.z), 0.08);
  float c;
  if (d.z < 0.0) {
    float rr = length(p);
    c = 0.065 * (1.0 - 0.5 * smoothstep(0.4, 1.6, rr)) + 0.18 * (1.0 - smoothstep(0.05, 0.14, rr));
    float flags = band(p.x, -0.78, 0.085, 0.008) + band(p.x, 0.47, 0.05, 0.008)
      + band(p.x, 1.42, 0.12, 0.01) + band(p.x, -2.1, 0.22, 0.012)
      + band(p.y, -0.58, 0.07, 0.01) + band(p.y, 0.93, 0.11, 0.008)
      + band(p.y, 1.91, 0.16, 0.01) + band(p.y, -1.61, 0.13, 0.01);
    c *= 1.0 - 0.97 * sat(flags);
    c += 1.7 * (band(p.x, -0.33, 0.022, 0.012) + band(p.x, 0.88, 0.035, 0.018)
      + band(p.x, -1.27, 0.04, 0.016) + band(p.x, 2.4, 0.09, 0.02));
    c += 1.4 * (band(p.y, 0.21, 0.025, 0.012) + band(p.y, -0.97, 0.04, 0.018)
      + band(p.y, 1.39, 0.06, 0.02) + band(p.y, -2.7, 0.1, 0.03));
  } else {
    c = 0.02 + 0.025 * sat(d.y + 0.4);
    c += 24.0 * band(p.x, -0.84, 0.08, 0.045) * band(p.y, 0.22, 0.68, 0.14);
    c += 18.0 * band(p.x, 1.05, 0.055, 0.04) * band(p.y, 0.04, 0.82, 0.16);
    c += 13.0 * band(p.y, 1.27, 0.065, 0.06) * band(p.x, 0.05, 0.65, 0.17);
    c += 15.0 * band(p.x + p.y * 0.25, -1.8, 0.04, 0.04) * band(p.y, 0.0, 0.9, 0.1);
    c += 0.7 * band(p.y, -1.05, 0.24, 0.3) * band(p.x, 0.1, 0.8, 0.3);
    c *= 1.0 - 0.97 * sat(band(p.x, -0.42, 0.09, 0.02) + band(p.y, 0.56, 0.06, 0.02));
  }
  return vec3(c) * vec3(0.96, 0.985, 1.0);
}
vec3 studio(vec3 d) { return mix(room(d), vec3(1.15), backdrop(d) * 0.85); }
vec3 glare(vec3 d) { return max(studio(d) - 0.45, vec3(0.0)); }
`;

export const fullVert = /* glsl */`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
export const studioFrag = /* glsl */`
in vec2 vUv;
out vec4 fragColor;
uniform int uFace;
uniform float uSize;
${commonGlsl}
vec3 faceDir(int face, vec2 p) {
  if (face == 0) return normalize(vec3(1.0, -p.y, -p.x));
  if (face == 1) return normalize(vec3(-1.0, -p.y, p.x));
  if (face == 2) return normalize(vec3(p.x, 1.0, p.y));
  if (face == 3) return normalize(vec3(p.x, -1.0, -p.y));
  if (face == 4) return normalize(vec3(p.x, -p.y, 1.0));
  return normalize(vec3(-p.x, -p.y, -1.0));
}
void main() {
  vec4 sum = vec4(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec2 offset = (vec2(float(x), float(y)) + 0.5) / 4.0 - 0.5;
    vec3 d = faceDir(uFace, (vUv + offset / uSize) * 2.0 - 1.0);
    sum += vec4(room(d), 0.0);
  }
  fragColor = sum / 16.0;
}
`;

export const rodVert = /* glsl */`
out vec3 vLocal;
out vec3 vPrintTangent;
in vec3 aCentre;
in vec3 aSide;
in vec3 aSize;
in float aCap;
centroid out vec3 vP;
centroid out vec3 vN;
centroid out vec3 vC;
centroid out vec3 vU;
centroid out vec3 vW;
centroid out vec3 vSize;
centroid out float vCap;
void main() {
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  float scale = length(modelMatrix[0].xyz);
  vLocal = position; vPrintTangent = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0));
  vP = p.xyz; vN = normalize(normalMatrix * normal);
  vC = (modelViewMatrix * vec4(aCentre, 1.0)).xyz;
  vU = normalize(mat3(modelViewMatrix) * aSide);
  vW = normalize(mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0));
  vSize = aSize * scale; vCap = aCap;
  gl_Position = projectionMatrix * p;
}
`;
export const rodFrag = /* glsl */`
in vec3 vLocal;
in vec3 vPrintTangent;
uniform vec2 uSize;
centroid in vec3 vP;
centroid in vec3 vN;
centroid in vec3 vC;
centroid in vec3 vU;
centroid in vec3 vW;
centroid in vec3 vSize;
centroid in float vCap;
out vec4 fragColor;
uniform sampler2D uBehind;
uniform samplerCube uRoom;
uniform vec2 uResolution;
uniform float uRoomSize;
uniform mat4 uProj;
uniform float uDepth;
uniform float uIor;
uniform int uSamples;
uniform float uFade;
uniform vec3 uAbsorb;
uniform vec3 uPage;
uniform float uTagScale;
${commonGlsl}
${wearGlsl}
vec4 environment(vec3 dir, float lod) {
  return textureLod(uRoom, dir, lod);
}
vec4 outside(vec3 p, vec3 dir, float lod) {
  vec4 value = environment(dir, lod);
  float alignment = dot(dir, normalize(p));
  if (alignment > 0.965) {
    vec4 projected = uProj * vec4(p + dir * uDepth, 1.0);
    vec2 uv = projected.xy / projected.w * 0.5 + 0.5;
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) {
      vec4 picture = textureLod(uBehind, uv, 0.0);
      float tag = picture.a / uTagScale;
      float mixAmount = smoothstep(0.965, 0.99, alignment);
      // Empty page transmits less than the disc: the room's stripes remain visible.
      if (tag < 1.5) {
        picture.rgb = uPage;
        // The page is only behind near-straight rays. Off-axis exits see the
        // studio flags, which supply the grey body and black refraction bands.
        mixAmount *= 0.10 * smoothstep(0.992, 0.9995, alignment);
      }
      value.rgb = mix(value.rgb, picture.rgb, mixAmount);
      value.a *= 1.0 - mixAmount;
    }
  }
  return value;
}
// Intersect the far rectangle wall, then replace corner hits with a circle exit.
float exitProfile(vec2 q, vec2 d, vec3 size, out vec2 n) {
  vec2 safeD = vec2(d.x < 0.0 ? -max(abs(d.x), 1e-5) : max(abs(d.x), 1e-5),
                    d.y < 0.0 ? -max(abs(d.y), 1e-5) : max(abs(d.y), 1e-5));
  vec2 wall = (sign(safeD) * size.xy - q) / safeD;
  float distance = max(0.001, min(wall.x, wall.y));
  vec2 hit = q + d * distance;
  vec2 core = size.xy - size.z;
  if (abs(hit.x) > core.x && abs(hit.y) > core.y) {
    vec2 centre = sign(hit) * core;
    vec2 rel = q - centre;
    float a = max(dot(d, d), 1e-7), b = dot(rel, d);
    float discriminant = b * b - a * (dot(rel, rel) - size.z * size.z);
    if (discriminant >= 0.0) distance = max(0.001, (-b + sqrt(discriminant)) / a);
    hit = q + d * distance;
    n = normalize(hit - centre);
  } else n = wall.x < wall.y ? vec2(sign(safeD.x), 0.0) : vec2(0.0, sign(safeD.y));
  return min(distance, 200.0);
}
vec4 throughRod(vec3 p, vec3 incident, vec3 normal, float lod) {
  vec3 direction = refract(incident, normal, 1.0 / uIor);
  vec3 origin = p + direction * 0.004;
  vec3 throughput = vec3(1.0);
  vec4 result = vec4(0.0);
  vec3 U = normalize(vU), W = normalize(vW);
  for (int bounce = 0; bounce < 4; bounce++) {
    vec3 relative = origin - vC;
    vec2 q = vec2(dot(relative, U), dot(relative, W));
    vec2 d = vec2(dot(direction, U), dot(direction, W));
    vec2 exitN;
    float distance = exitProfile(q, d, vSize, exitN);
    origin += direction * distance;
    vec3 N = normalize(U * exitN.x + W * exitN.y);
    vec3 transmit = refract(direction, -N, uIor);
    bool trapped = dot(transmit, transmit) < 0.001;
    float F = trapped ? 1.0 : fresnel(abs(dot(direction, N)), uIor);
    throughput *= exp(-uAbsorb * distance);
    // TIR keeps all energy in the rod; a tangent direction avoids a singular lookup.
    vec3 escape = trapped ? normalize(direction - N * dot(direction, N) + N * 0.001) : transmit;
    vec4 background = outside(origin, escape, lod);
    result.rgb += throughput * (1.0 - F) * background.rgb;
    result.a += dot(throughput, vec3(0.333333)) * (1.0 - F) * background.a;
    throughput *= F;
    direction = reflect(direction, N);
    origin += direction * 0.004;
  }
  result.rgb += throughput * environment(direction, lod).rgb * 0.6;
  return result;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 behind = textureLod(uBehind, uv, 0.0);
  vec3 baseN = normalize(vN), V = -normalize(vP);
  if (dot(baseN, V) < 0.0) baseN = -baseN;
  float roughness;
  baseN = wornNormal(vLocal, baseN, vPrintTangent, uSize, 1, roughness);
  vec3 R = reflect(-V, baseN);
  float spread = max(length(dFdx(R)), length(dFdy(R)));
  float lod = clamp(log2(max(spread * uRoomSize * 0.5, 1.0)), 0.0, 9.0) + roughness * 1.5;
  vec3 dp = dFdx(vP) * 0.22 + dFdy(vP) * 0.17;
  vec3 dn = dFdx(baseN) * 0.22 + dFdy(baseN) * 0.17;
  vec4 sum = vec4(0.0);
  for (int sampleIndex = 0; sampleIndex < 2; sampleIndex++) {
    if (sampleIndex >= uSamples) break;
    float offset = uSamples == 1 ? 0.0 : (sampleIndex == 0 ? -1.0 : 1.0);
    vec3 p = vP + dp * offset, N = normalize(baseN + dn * offset);
    vec3 I = normalize(p);
    float F = fresnel(dot(-I, N), uIor);
    vec3 Rk = reflect(I, N);
    vec4 mirror = environment(Rk, lod);
    mirror.rgb = mix(mirror.rgb, uPage, backdrop(Rk));
    vec4 through = throughRod(p, I, N, lod);
    sum += mirror * F + through * (1.0 - F);
  }
  sum /= float(uSamples);
  sum = mix(sum, vec4(behind.rgb * 0.86, 0.0), smoothstep(0.5, 0.95, vCap));
  fragColor = vec4(mix(behind.rgb, sum.rgb, uFade), 2.0 * uTagScale);
}
`;

export const sheetVert = /* glsl */`
in float aThick;
out vec3 vP;
out vec3 vN;
out float vThick;
out vec3 vLocal;
out vec3 vPrintTangent;
${warpGlsl}
void main() {
  vec4 p = modelViewMatrix * vec4(warpPoint(position), 1.0);
  vP = p.xyz; vN = normalize(normalMatrix * warpNormal(position, normal));
  vLocal = position; vPrintTangent = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0));
  vThick = aThick * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * p;
}
`;
export const sheetFrag = /* glsl */`
in vec3 vP;
in vec3 vN;
in float vThick;
in vec3 vLocal;
in vec3 vPrintTangent;
uniform vec2 uSize;
uniform samplerCube uRoom;
out vec4 fragColor;
uniform float uFade;
${commonGlsl}
${wearGlsl}
void main() {
  vec3 V = -normalize(vP), N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;
  float roughness;
  N = wornNormal(vLocal, N, vPrintTangent, uSize, 1, roughness);
  float cosine = max(dot(N, V), 0.001), F = fresnel(cosine, 1.59);
  float F0 = fresnel(1.0, 1.59);
  float Fall = F + (1.0 - F) * (1.0 - F) * F;
  float Fall0 = F0 + (1.0 - F0) * (1.0 - F0) * F0;
  float path = vThick / sqrt(1.0 - (1.0 - cosine * cosine) / (1.59 * 1.59));
  float absorbed = 1.0 - exp(-0.003 * path);
  float takes = max(Fall - Fall0, 0.0) + Fall0 * 0.05 + absorbed * 0.5;
  vec3 R = reflect(-V, N);
  vec3 sheen = min(textureLod(uRoom, R, 0.65 + roughness * 2.0).rgb, vec3(4.0)) * Fall * 0.42
    + min(room(R), vec3(1.2)) * max(Fall - Fall0, 0.0);
  vec3 tint = vec3(0.002, 0.004, 0.008) * (1.0 - cosine);
  fragColor = vec4((sheen + tint) * uFade, min(takes, 0.96) * uFade);
}
`;

export const discVert = /* glsl */`
in float aFace;
out vec3 vLocal;
out vec3 vP;
out vec3 vN;
out vec3 vRadial;
out vec3 vTangent;
out float vFace;
void main() {
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  vec2 radial = normalize(position.xy);
  vLocal = position; vP = p.xyz; vN = normalize(normalMatrix * normal);
  vRadial = normalize(mat3(modelViewMatrix) * vec3(radial, 0.0));
  vTangent = normalize(mat3(modelViewMatrix) * vec3(-radial.y, radial.x, 0.0));
  vFace = aFace; gl_Position = projectionMatrix * p;
}
`;
export const discFrag = /* glsl */`
in vec3 vLocal;
in vec3 vP;
in vec3 vN;
in vec3 vRadial;
in vec3 vTangent;
in float vFace;
out vec4 fragColor;
uniform sampler2D uArt;
uniform int uBase;
uniform int uDiscType; // 0 CD, 1 Blu-ray, 2 DVD
uniform bool uScan;
uniform float uArtIn;
uniform float uPrintOut;
uniform float uFade;
uniform float uTagScale;
${commonGlsl}
// Smooth wavelength bumps, with a second red lobe at the violet end.
vec3 spectral(float wavelength) {
  vec3 x = (vec3(wavelength) - vec3(610.0, 545.0, 450.0)) / vec3(65.0, 52.0, 48.0);
  vec3 colour = max(vec3(0.0), vec3(1.0) - x * x);
  colour *= colour;
  colour.r += 0.24 * exp(-pow((wavelength - 405.0) / 24.0, 2.0));
  return colour * smoothstep(380.0, 405.0, wavelength) * (1.0 - smoothstep(700.0, 760.0, wavelength));
}
vec3 grating(vec3 L, vec3 V, float spread) {
  vec3 H = L + V;
  float u = abs(dot(H, normalize(vRadial)));
  float off = dot(H, normalize(vTangent)) / spread;
  if (uDiscType == 1) return (spectral(320.0 * u) + 0.28 * spectral(640.0 * u)) * exp(-off * off * 2.0);
  if (uDiscType == 2) return (spectral(740.0 * u) + 0.45 * spectral(370.0 * u)) * exp(-off * off * 1.3);
  return (spectral(1600.0 * u) + 0.75 * spectral(800.0 * u) + 0.45 * spectral(533.0 * u)) * exp(-off * off);
}
void main() {
  vec3 N = normalize(vN), V = -normalize(vP);
  vec3 R = reflect(-V, N);
  float r = length(vLocal.xy), cosv = abs(dot(N, V));
  vec4 scan = printSampleRgba(uArt, vLocal.xy / 120.0 + 0.5);
  vec3 art = scan.rgb;
  float aa = max(fwidth(r), 0.035);
  float dataBand = smoothstep(21.5 - aa, 22.0 + aa, r) * (1.0 - smoothstep(59.0 - aa, 59.5 + aa, r));
  vec3 rainbow = grating(KEY, V, 0.05) * 1.6 + grating(STRIP, V, 0.045) * 1.4
    + grating(TOP, V, 0.06) * 0.9 + grating(BOUNCE, V, 0.16) * 0.35;
  float brush = filteredGrain(r * 115.0) * 0.018;
  float brushedLight = exp(-pow(dot(normalize(KEY + V), normalize(vTangent)) / 0.19, 2.0)) * 0.07
    + exp(-pow(dot(normalize(STRIP + V), normalize(vTangent)) / 0.14, 2.0)) * 0.04;
  vec3 silver = min(studio(R), vec3(1.8)) * 0.42
    + vec3(0.48, 0.50, 0.53) * (0.7 + 0.3 * max(dot(N, KEY), 0.0) + brush + brushedLight);
  if (uDiscType == 1) silver = silver * vec3(0.34, 0.40, 0.68) + vec3(0.025, 0.015, 0.055);
  if (uDiscType == 2) silver *= vec3(0.92, 0.80, 0.94);
  vec3 colour = silver + rainbow * dataBand;
  if (vFace < 0.5) {
    if (uBase == 1) colour = studio(R) * 0.07 + 0.012 + rainbow * dataBand;
    if (uBase < 2) {
      colour *= 1.0 - 0.32 * band(r, 16.6, 0.35, 0.35);
      float printed = smoothstep(uArtIn - aa, uArtIn + 0.25 + aa, r)
        * (1.0 - smoothstep(uPrintOut - 0.25 - aa, uPrintOut + aa, r));
      // Lacquered ink has a broad, low-energy highlight; aluminium remains
      // visible only in the unprinted annulus and under the clear outer rim.
      vec3 label = art * (lights(N) + 0.025) + vec3(inkSheen(N, V))
        + min(glare(R), vec3(1.2)) * fresnel(cosv, 1.48) * 0.12;
      if (!uScan) colour = mix(colour, label, printed);
      colour += min(glare(R), vec3(1.5)) * 0.06 * band(r, 58.5, 0.45, 0.15);
    } else if (uBase == 2) {
      float engraving = uScan ? 1.0 : dot(art, vec3(0.2126, 0.7152, 0.0722));
      float grain = 0.96 + 0.04 * filteredGrain(r * 125.0);
      colour = vec3(0.83, 0.51, 0.14) * (0.42 + 0.58 * engraving) * lights(N) * grain
        + min(studio(R), vec3(3.0)) * vec3(0.48, 0.31, 0.09);
    } else {
      float groove = 0.75 + 0.25 * filteredGrain(r * 90.0);
      float gap = band(r, 31.0, 0.45, 0.2) + band(r, 42.0, 0.35, 0.2) + band(r, 52.0, 0.5, 0.2);
      vec3 H = normalize(KEY + V);
      float sheen = exp(-pow(dot(H, normalize(vTangent)) / 0.12, 2.0));
      colour = vec3(0.012, 0.014, 0.018) + vec3(0.14, 0.16, 0.19) * sheen * groove * (1.0 - 0.6 * sat(gap));
      if (!uScan) colour = mix(colour, art * lights(N), 1.0 - smoothstep(23.0, 24.0, r));
    }
    if (uScan) {
      // The square is exactly 120 mm, including the hub print. Geometry owns
      // the hole/clear centre; alpha owns ink coverage, never surface opacity.
      // Discard nearly transparent scan residue while retaining partial ink.
      float printed = smoothstep(0.02, 0.08, scan.a) * scan.a;
      vec3 label = art * (lights(N) + 0.025) + vec3(inkSheen(N, V))
        + min(glare(R), vec3(1.2)) * fresnel(cosv, 1.48) * 0.12;
      colour = mix(colour, label, printed);
    }
  } else if (vFace < 1.5) {
    colour = mix(vec3(0.18) + min(studio(R), vec3(1.2)) * 0.2, colour, smoothstep(14.6, 15.0, r));
    colour *= 1.0 - 0.25 * band(r, 16.6, 0.3, 0.2);
  } else colour = vec3(0.24, 0.26, 0.28) + min(studio(R), vec3(2.0)) * 0.24;
  fragColor = vec4(mix(vec3(1.0), colour, uFade), 2.0 * uFade * uTagScale);
}
`;

// The booklet and both spine faces are opaque printed paper, before plastic refraction.
export const paperVert = /* glsl */`
out vec3 vLocal;
out vec3 vP;
out vec3 vN;
out vec3 vPrintTangent;
out vec2 vUv;
out float vSide;
${warpGlsl}
void main() {
  vec4 p = modelViewMatrix * vec4(warpPoint(position), 1.0);
  vLocal = position; vP = p.xyz; vN = normalize(normalMatrix * warpNormal(position, normal));
  vPrintTangent = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0));
  vUv = uv; vSide = normal.z;
  gl_Position = projectionMatrix * p;
}
`;
export const bookletFrag = /* glsl */`
in vec3 vLocal;
in vec3 vP;
in vec3 vN;
in float vSide;
out vec4 fragColor;
uniform sampler2D uArt;
uniform sampler2D uInside;
uniform bool uHasInside;
uniform float uFade;
uniform float uTagScale;
${commonGlsl}
void main() {
  vec3 N = normalize(vN), V = -normalize(vP), R = reflect(-V, N);
  vec2 local = vLocal.xy - vec2(3.5, 0.0);
  vec2 uv = local / 120.5 + 0.5;
  vec3 colour;
  if (vSide > 0.5) {
    vec3 art = printSample(uArt, uv);
    float fibre = filteredGrain(local.x * 94.0 + local.y * 131.0) * 0.006;
    colour = art * (lights(N) + fibre) + vec3(inkSheen(N, V) * 0.22)
      + min(glare(R), vec3(1.2)) * fresnel(abs(dot(N, V)), 1.5) * 0.08;
  } else if (vSide < -0.5) {
    vec2 innerUv = vec2(1.0 - uv.x, uv.y);
    vec2 crop = vec2(120.5) / vec2(textureSize(uInside, 0));
    innerUv = (innerUv - 0.5) * crop / max(crop.x, crop.y) + 0.5;
    vec3 art = printSample(uInside, innerUv);
    if (!uHasInside) art = mix(vec3(dot(art, vec3(0.2126, 0.7152, 0.0722))), art, 0.72) * 0.48;
    colour = art * lights(N) + vec3(inkSheen(N, V) * 0.12);
  } else colour = vec3(0.83, 0.82, 0.78) * lights(N);
  fragColor = vec4(mix(vec3(1.0), colour, uFade), 2.0 * uFade * uTagScale);
}
`;
export const spineFrag = /* glsl */`
in vec3 vP;
in vec3 vN;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSpine;
uniform float uFade;
uniform float uTagScale;
${commonGlsl}
void main() {
  vec3 N = normalize(vN), V = -normalize(vP), R = reflect(-V, N);
  vec3 colour = printSample(uSpine, vUv) * (0.25 + 0.75 * lights(N))
    + vec3(inkSheen(N, V) * 0.3)
    + min(glare(R), vec3(1.2)) * fresnel(abs(dot(N, V)), 1.48) * 0.10;
  fragColor = vec4(mix(vec3(1.0), colour, uFade), 2.0 * uFade * uTagScale);
}
`;

export const inlayFrag = /* glsl */`
in vec3 vLocal;
in vec3 vP;
in vec3 vN;
in float vSide;
out vec4 fragColor;
uniform sampler2D uBack;
uniform bool uHasBack;
uniform vec3 uSpineColour;
uniform float uFade;
uniform float uTagScale;
${commonGlsl}
void main() {
  vec3 N = normalize(vN), V = -normalize(vP);
  vec3 paper = uSpineColour * 0.72;
  if (vLocal.z > -4.9 || abs(vSide) < 0.5) paper = uSpineColour * 0.72;
  else if (uHasBack) {
    vec2 size = vec2(textureSize(uBack, 0));
    vec2 card = vec2(136.5, 123.0);
    vec2 crop = card / size;
    crop /= max(crop.x, crop.y);
    vec2 uv = (vLocal.xy - vec2(2.25, 0.0)) / card;
    if (vSide < -0.5) uv.x = -uv.x;
    vec4 ink = printSampleRgba(uBack, uv * crop + 0.5);
    paper = mix(paper, ink.rgb, ink.a);
  }
  float fibre = filteredGrain(vLocal.x * 94.0 + vLocal.y * 131.0) * 0.006;
  vec3 colour = paper * (lights(N) + fibre) + vec3(inkSheen(N, V) * (uHasBack ? 0.22 : 0.04));
  fragColor = vec4(mix(vec3(1.0), colour, uFade), 2.0 * uFade * uTagScale);
}
`;

export const shadowVert = /* glsl */`
out vec3 vWorld;
void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }
`;
export const shadowFrag = /* glsl */`
in vec3 vWorld;
out vec4 fragColor;
uniform mat4 uCaseInverse[2];
uniform mat4 uLidInverse[2];
uniform vec4 uShadow[2]; // fade, scale, disc darkness, inner radius
uniform int uCount;
uniform vec3 uPage;
uniform float uTagScale;
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
float panel(vec3 p, vec3 L, float z, float scale, float base, float rim, vec2 centre, vec2 halfSize, float radius) {
  if (abs(L.z) < 0.0001) return 0.0;
  float t = (z - p.z) / L.z;
  if (t < 0.0) return 0.0;
  // A softbox, not a point: the penumbra widens quickly with distance to the page.
  // At grazing light incidence the projected footprint stretches. Broaden the
  // local filter by the same amount, avoiding a knife-edge shadow at half-open.
  float incidence = abs(L.z) * scale;
  float soft = (1.6 + t * 0.2 / max(scale, 0.05)) / max(incidence, 0.12);
  float sd = roundedBox((p + L * t).xy - centre, halfSize, radius);
  float inside = 1.0 - smoothstep(-soft, soft, sd);
  float edge = smoothstep(-5.0 - soft, -5.0 + soft, sd);
  return inside * (base + rim * edge) * smoothstep(0.025, 0.15, incidence);
}
void main() {
  vec3 light = normalize(vec3(-0.3, 0.48, 1.0));
  float lit = 1.0;
  for (int i = 0; i < 2; i++) {
    if (i >= uCount) break;
    vec3 p = (uCaseInverse[i] * vec4(vWorld, 1.0)).xyz;
    vec3 L = (uCaseInverse[i] * vec4(light, 0.0)).xyz;
    float dark = panel(p, L, -2.0, uShadow[i].y, 0.02, 0.08, vec2(0.0), vec2(71.0, 62.5), 1.5);
    float paper = panel(p, L, -4.95, uShadow[i].y, 0.26, 0.0, vec2(2.25, 0.0), vec2(68.25, 61.5), 0.0);
    float disc = 0.0;
    if (abs(L.z) > 0.0001) {
      float t = (-1.8 - p.z) / L.z;
      float soft = 1.6 + max(t, 0.0) * 0.2 / max(uShadow[i].y, 0.05);
      float r = length((p + L * t).xy - vec2(3.5, 0.0));
      if (t > 0.0) disc = (1.0 - smoothstep(60.0 - soft, 60.0 + soft, r))
        * smoothstep(uShadow[i].w - soft, uShadow[i].w + soft, r) * uShadow[i].z;
    }
    // Paper and disc block the same light; don't count their overlap twice.
    dark += max(paper, disc);
    p = (uLidInverse[i] * vec4(vWorld, 1.0)).xyz;
    L = (uLidInverse[i] * vec4(light, 0.0)).xyz;
    dark += panel(p, L, 4.4, uShadow[i].y, 0.03, 0.05, vec2(2.25, 0.0), vec2(68.75, 62.5), 1.4);
    dark += panel(p, L, 3.35, uShadow[i].y, 0.26, 0.0, vec2(3.5, 0.0), vec2(60.25), 0.6);
    // Sky/ambient occlusion: light from the whole room is blocked straight
    // under the case, a broad soft darkening that grounds it.
    {
      vec3 q = (uCaseInverse[i] * vec4(vWorld, 1.0)).xyz;
      vec3 up = (uCaseInverse[i] * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
      if (abs(up.z) > 0.0001) {
        float t = (-2.0 - q.z) / up.z;
        float sd = roundedBox((q + up * max(t, 0.0)).xy, vec2(66.0, 58.0), 10.0);
        float reach = 14.0 + max(t, 0.0) * 0.35 / max(uShadow[i].y, 0.05);
        dark += t > 0.0 ? 0.12 * (1.0 - smoothstep(-reach, reach, sd)) : 0.0;
      }
    }
    lit *= 1.0 - clamp(dark * uShadow[i].x, 0.0, 0.9);
  }
  fragColor = vec4(uPage * lit, lit * uTagScale);
}
`;

export const copyFrag = /* glsl */`
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uInput;
void main() { fragColor = textureLod(uInput, vUv, 0.0); }
`;

const pictureGlsl = /* glsl */`
uniform sampler2D uPicture;
uniform sampler2D uOpaque;
uniform vec4 uRect;
uniform float uTagScale;
vec4 picture(vec2 uv) {
  bool inside = all(greaterThanEqual(uv, uRect.xy)) && all(lessThanEqual(uv, uRect.zw));
  return inside ? textureLod(uPicture, uv, 0.0) : textureLod(uOpaque, uv, 0.0);
}
`;
export const compositeFrag = /* glsl */`
in vec2 vUv;
out vec4 fragColor;
uniform bool uTransparent;
uniform vec3 uPage;
${pictureGlsl}
vec3 srgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec4 p = picture(vUv);
  float tag = p.a / uTagScale;
  vec3 c = p.rgb;
  if (!uTransparent || tag >= 1.5) fragColor = vec4(srgb(c), 1.0);
  else {
    // The DOM blends in sRGB. Convert linear shadow transmission too, so a
    // transparent canvas does not cast a much darker shadow than an opaque one.
    float transmission = srgb(vec3(clamp(tag, 0.0, 1.0))).r;
    float alpha = max(1.0 - transmission, clamp(tag - 1.0, 0.0, 1.0));
    vec3 colour = srgb(c), page = srgb(uPage);
    // Resolved MSAA pixels can contain both print/plastic and the receiver.
    // Retain their colour instead of misclassifying the entire edge as shadow.
    vec3 coverage = (page - colour) / max(page, vec3(0.0001));
    alpha = max(alpha, max(max(coverage.r, coverage.g), coverage.b));
    alpha = clamp(alpha, 0.0, 1.0);
    fragColor = vec4(max(colour - page * (1.0 - alpha), vec3(0.0)), alpha);
  }
}
`;

export const depthVert = /* glsl */`
${warpGlsl}
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(warpPoint(position), 1.0); }
`;
export const depthFrag = /* glsl */`
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }
`;
