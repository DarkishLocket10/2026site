import { wearGlsl } from './materials';
import { commonGlsl } from './shaders';

const surface = /* glsl */`
in vec3 vLocal;
in vec3 vP;
in vec3 vN;
in vec3 vPrintTangent;
out vec4 fragColor;
uniform samplerCube uRoom;
uniform sampler2D uArt;
uniform vec2 uSize;
uniform bool uMetal;
uniform bool uGloss;
uniform float uFade;
uniform float uTagScale;
uniform vec3 uPage;
${commonGlsl}
${wearGlsl}
const vec3 BLUE = vec3(0.026, 0.159, 0.672); // linear #2d6fd6
vec2 cropUv(sampler2D ink, vec2 uv, vec2 panel) {
  vec2 crop = panel / vec2(textureSize(ink, 0));
  return (uv - 0.5) * crop / max(crop.x, crop.y) + 0.5;
}
vec3 metal(vec3 ink, vec3 N, vec3 V, bool gloss, vec3 diffuseN, float roughness) {
  vec3 R = reflect(-V, N);
  float footprint = max(length(dFdx(R)), length(dFdy(R)));
  float lod = max(gloss ? 0.7 : 4.2, log2(max(footprint * 256.0, 1.0))) + roughness * (gloss ? 1.7 : 0.8);
  vec3 reflection = min(textureLod(uRoom, R, lod).rgb, vec3(gloss ? 5.0 : 2.0));
  vec3 silver = mix(ink, vec3(0.66, 0.73, 0.82), 0.68);
  vec3 T = normalize(vPrintTangent - N * dot(N, vPrintTangent) + vec3(0.00001));
  vec3 H = normalize(KEY + V);
  float brushed = exp(-pow(dot(H, T) / 0.32, 2.0)) * pow(max(dot(N, H), 0.0), 14.0);
  float F = fresnel(abs(dot(N, V)), 1.53);
  return ink * lights(diffuseN) * 0.93 + reflection * silver * (gloss ? 0.20 : 0.12)
    + reflection * F * (gloss ? 0.55 : 0.18) + silver * brushed * (gloss ? 0.015 : 0.065);
}
`;

/** Outside print and inward-facing reverse insert share a physically thick shell. */
export const panelFrag = /* glsl */`
${surface}
in float vSide;
uniform sampler2D uInside;
uniform sampler2D uBanner;
uniform sampler2D uRelief;
uniform bool uHasInside;
uniform bool uHasArt;
uniform bool uHasBanner;
uniform bool uHasRelief;
uniform bool uLid;
uniform vec3 uSpineColour;
vec3 reversePaper(vec2 uv) {
  const vec3 paper = vec3(0.93, 0.93, 0.92);
  // The inward-facing UVs read left-to-right; the outside ink seen through
  // paper must read backwards. uArt is this panel's front/back (or front fallback).
  uv.x = 1.0 - uv.x;
  vec2 artSize = uSize;
  if (uLid && !uHasBanner) {
    float header = 13.0 / uSize.y;
    if (uv.y > 1.0 - header) return paper;
    uv.y /= 1.0 - header;
    artSize.y -= 13.0;
  }
  uv = cropUv(uArt, uv, artSize);
  vec2 size = vec2(textureSize(uArt, 0));
  float footprint = max(length(dFdx(uv) * size), length(dFdy(uv) * size));
  // Slightly soften only the bleed-through, leaving actual interior art sharp.
  float lod = max(1.5, log2(max(footprint, 1.0)) + 0.5);
  vec3 ghost = textureLod(uArt, uv, lod).rgb;
  ghost = mix(vec3(dot(ghost, vec3(0.2126, 0.7152, 0.0722))), ghost, 0.15);
  return mix(paper, ghost, 0.075);
}
void main() {
  vec3 N = normalize(vN), V = -normalize(vP);
  vec2 uv = vLocal.xy / uSize + 0.5;
  bool inner = uLid ? vSide < -0.5 : vSide > 0.5;
  bool edge = abs(vSide) < 0.5;
  if ((inner && uLid) || (!inner && !uLid)) uv.x = 1.0 - uv.x;
  vec3 ink = uSpineColour * 0.72;
  bool banner = false;
  if (inner) {
    if (uHasInside) {
      // A single spread spans the left inner lid and right inner back.
      vec2 spreadUv = vec2(uv.x * 0.5 + (uLid ? 0.0 : 0.5), uv.y);
      ink = printSample(uInside, cropUv(uInside, spreadUv, vec2(uSize.x * 2.0, uSize.y)));
    } else {
      ink = uMetal ? vec3(0.55, 0.56, 0.57) : reversePaper(uv);
    }
    if (!uMetal) {
      // Thin PP absorbs light instead of adding a blue veil over the print.
      // ~78% luminance transmission head-on, ~71% at grazing incidence;
      // refraction limits the path length. Keep supplied interior art sharp, and leave
      // the denser blue body tint to the separate rails, ribs and hub shader.
      float cosine = abs(dot(N, V));
      float path = inversesqrt(1.0 - (1.0 - cosine * cosine) / (1.49 * 1.49));
      ink *= pow(vec3(0.70, 0.79, 0.88), vec3(path));
    }
  } else if (!edge) {
    vec2 artSize = uSize;
    if (!uMetal && uLid && !uHasBanner) {
      float header = 13.0 / uSize.y;
      banner = uv.y > 1.0 - header;
      if (banner) {
        vec4 wordmark = printSampleRgba(uBanner, vec2(uv.x, (uv.y - 1.0 + header) / header));
        ink = mix(BLUE * 0.68, vec3(0.94), wordmark.a);
      } else { uv.y /= 1.0 - header; artSize.y -= 13.0; }
    }
    if (!banner && uHasArt) ink = printSample(uArt, cropUv(uArt, uv, artSize));
    if (!uMetal && !uLid) ink *= vec3(0.88, 0.94, 0.99);
  }
  if (uMetal && uHasRelief && !inner && uLid && !edge) {
    // Derivative-based bump mapping in view space; opt-in only and bounded.
    vec2 reliefUv = cropUv(uRelief, uv, uSize);
    float height = dot(printSample(uRelief, reliefUv), vec3(0.2126, 0.7152, 0.0722));
    vec3 dp1 = dFdx(vP), dp2 = dFdy(vP);
    vec3 r1 = cross(dp2, N), r2 = cross(N, dp1);
    float det = dot(dp1, r1);
    vec3 gradient = (dFdx(height) * r1 + dFdy(height) * r2) / max(abs(det), 0.00001) * sign(det);
    N = normalize(N - clamp(gradient * 0.28, vec3(-0.12), vec3(0.12)));
  }
  vec3 diffuseN = N;
  float roughness;
  N = wornNormal(vLocal, N, vPrintTangent, uSize, uMetal ? (uGloss ? 4 : 5) : 2, roughness);
  vec3 colour;
  if (uMetal) colour = metal(ink, N, V, inner ? uHasInside : uGloss, diffuseN, roughness);
  else {
    vec3 R = reflect(-V, N);
    float soft = pow(max(dot(N, normalize(KEY + V)), 0.0), 16.0);
    colour = ink * lights(diffuseN) + vec3(inkSheen(N, V) * 0.12);
    if (inner || edge || banner) colour += vec3(0.55, 0.70, 1.0) * soft * 0.055
      + min(textureLod(uRoom, R, 3.4 + roughness * 1.8).rgb, vec3(3.0)) * fresnel(abs(dot(N, V)), 1.49) * 0.55;
  }
  fragColor = vec4(mix(uPage, colour, uFade), 2.0 * uFade * uTagScale);
}
`;

/** Blue PP rails have broad reflections; rolled steel edges inherit the ink. */
export const edgeFrag = /* glsl */`
${surface}
uniform sampler2D uBehind;
uniform vec2 uResolution;
uniform bool uLid;
void main() {
  vec3 N = normalize(vN), V = -normalize(vP);
  if (dot(N, V) < 0.0) N = -N;
  vec3 diffuseN = N;
  float roughness;
  N = wornNormal(vLocal, N, vPrintTangent, uSize, uMetal ? (uGloss ? 4 : 5) : 2, roughness);
  vec3 colour;
  if (uMetal) {
    vec2 uv = vLocal.xy / uSize + 0.5;
    if (!uLid) uv.x = 1.0 - uv.x;
    vec3 ink = printSample(uArt, cropUv(uArt, uv, uSize));
    bool curl = vLocal.x < -64.6 && abs(vLocal.z) < 2.0;
    colour = metal(curl ? vec3(0.38, 0.43, 0.49) : ink * 0.75, N, V, curl || uGloss, diffuseN, roughness);
  } else {
    vec4 behind = textureLod(uBehind, gl_FragCoord.xy / uResolution, 0.0);
    vec3 transmitted = behind.a / uTagScale > 1.5 ? behind.rgb : uPage;
    vec3 R = reflect(-V, N);
    float F = fresnel(abs(dot(N, V)), 1.49);
    colour = mix(transmitted * vec3(0.58, 0.76, 0.96), BLUE * lights(diffuseN), 0.44);
    colour = colour * (1.0 - F) + min(textureLod(uRoom, R, 3.8 + roughness * 1.5).rgb, vec3(3.0)) * F;
  }
  fragColor = vec4(mix(uPage, colour, uFade), 2.0 * uFade * uTagScale);
}
`;

export const trayFrag = /* glsl */`
in vec3 vN;
in vec3 vP;
in vec3 vLocal;
out vec4 fragColor;
uniform float uFade;
uniform float uTagScale;
uniform vec3 uPage;
uniform samplerCube uRoom;
uniform bool uHasDisc;
${commonGlsl}
void main() {
  vec3 N = normalize(vN), V = -normalize(vP);
  vec3 reflection = min(textureLod(uRoom, reflect(-V, N), 3.6).rgb, vec3(2.0));
  vec3 colour = vec3(0.010, 0.012, 0.015) * lights(N)
    + reflection * fresnel(abs(dot(N, V)), 1.54) * 0.48;
  // Finite-area satin lobes reveal the moulded lip/petals even between softboxes.
  colour += vec3(0.12) * pow(max(dot(N, normalize(KEY + V)), 0.0), 28.0)
    + vec3(0.035) * pow(max(dot(N, normalize(TOP + V)), 0.0), 22.0);
  // Soft contact beneath the raised disc, including its clear centre.
  float r = length(vLocal.xy - vec2(0.4, -0.5));
  float contact = (1.0 - smoothstep(58.8, 62.0, r)) * smoothstep(6.0, 9.0, r);
  if (uHasDisc && vLocal.z < -2.45) colour *= 1.0 - contact * 0.40;
  fragColor = vec4(mix(uPage, colour, uFade), 2.0 * uFade * uTagScale);
}
`;

/** A separate optical film: sharp filtered softboxes, a welded lip and shallow ripple. */
export const sleeveFrag = /* glsl */`
in vec3 vP;
in vec3 vN;
in vec3 vLocal;
in vec3 vPrintTangent;
out vec4 fragColor;
uniform float uFade;
uniform vec2 uSize;
uniform samplerCube uRoom;
${commonGlsl}
${wearGlsl}
void main() {
  vec3 N = normalize(vN), V = -normalize(vP);
  if (dot(N, V) < 0.0) N = -N;
  float roughness;
  N = wornNormal(vLocal, N, vPrintTangent, uSize, 3, roughness);
  // Pressed weld just inside the perimeter; no diffuse line over the image.
  vec2 edge = uSize * 0.5 - abs(vLocal.xy);
  float distance = min(edge.x, edge.y) - 1.05;
  float width = max(fwidth(distance), 0.09);
  float weld = exp(-pow(distance / (0.16 + width), 2.0));
  vec3 T = normalize(vPrintTangent), B = normalize(cross(N, T));
  vec2 direction = edge.x < edge.y ? vec2(sign(vLocal.x), 0.0) : vec2(0.0, sign(vLocal.y));
  N = normalize(N + (T * direction.x + B * direction.y) * weld * 0.035);
  vec3 R = reflect(-V, N);
  float footprint = max(length(dFdx(R)), length(dFdy(R)));
  float lod = max(0.35, log2(max(footprint * 256.0, 1.0))) + roughness * 1.8;
  float F = fresnel(abs(dot(N, V)), 1.49);
  vec3 reflection = min(textureLod(uRoom, R, lod).rgb, vec3(8.0));
  // Premultiplied optical overlay preserves saturated, sharply filtered print.
  fragColor = vec4(reflection * F * uFade, F * uFade);
}
`;

export const shadowFrag = /* glsl */`
in vec3 vWorld;
out vec4 fragColor;
uniform mat4 uCaseInverse[2];
uniform mat4 uLidInverse[2];
uniform vec4 uShadow[2];
uniform int uCount;
uniform vec3 uPage;
uniform float uTagScale;
uniform vec2 uSize;
uniform float uDepth;
float panel(vec3 p, vec3 L, float z, float scale) {
  if (abs(L.z) < 0.0001) return 0.0;
  float t = (z - p.z) / L.z;
  if (t < 0.0) return 0.0;
  float incidence = abs(L.z) * scale;
  float soft = (1.6 + t * 0.2 / max(scale, 0.05)) / max(incidence, 0.12);
  vec2 q = abs((p + L * t).xy) - uSize * 0.5 + 3.0;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 3.0;
  return (1.0 - smoothstep(-soft, soft, sd)) * smoothstep(0.025, 0.15, incidence);
}
void main() {
  vec3 light = normalize(vec3(-0.3, 0.48, 1.0));
  float lit = 1.0;
  for (int i = 0; i < 2; i++) {
    if (i >= uCount) break;
    vec3 p = (uCaseInverse[i] * vec4(vWorld, 1.0)).xyz;
    vec3 L = (uCaseInverse[i] * vec4(light, 0.0)).xyz;
    float dark = panel(p, L, -uDepth * 0.5, uShadow[i].y) * 0.34;
    p = (uLidInverse[i] * vec4(vWorld, 1.0)).xyz;
    L = (uLidInverse[i] * vec4(light, 0.0)).xyz;
    dark += panel(p, L, uDepth * 0.5, uShadow[i].y) * 0.30;
    lit *= 1.0 - clamp(dark * uShadow[i].x, 0.0, 0.8);
  }
  fragColor = vec4(uPage * lit, lit * uTagScale);
}
`;
