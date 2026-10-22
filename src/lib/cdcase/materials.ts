/** Shared by colour and depth vertices. Units are mm; no time-dependent noise. */
export const warpGlsl = /* glsl */`
uniform float uWear;
uniform float uSeed;
uniform int uWarpKind; // 0 rigid, 1 PS, 2 PP, 3 sleeve, 4 tinplate
uniform vec2 uSize;
float panelHeight(vec2 p) {
  vec2 q = p / max(uSize * 0.5, vec2(1.0));
  vec2 edge = max(vec2(0.0), 1.0 - q * q);
  float seat = edge.x * edge.y;
  float phase = uSeed * 2.39996323;
  float bow = 0.12 + 0.035 * sin(q.x * 2.7 + phase) * cos(q.y * 2.2 - phase);
  if (uWarpKind == 2 || uWarpKind == 3)
    bow = 0.09 + 0.07 * sin(q.x * 3.2 + phase) * cos(q.y * 3.8 + phase * 0.7);
  if (uWarpKind == 3) bow += 0.025 * sin(p.x * 0.11 + p.y * 0.065 + phase);
  if (uWarpKind == 4) {
    vec2 dent = q - vec2(0.28 * sin(phase), 0.35 * cos(phase));
    bow = 0.22 - 0.08 * exp(-dot(dent, dent) * 12.0)
      + 0.025 * sin(q.x * 4.0 + phase) * sin(q.y * 3.0);
  }
  return clamp(bow * seat, -0.28, 0.28) * uWear;
}
bool warped(vec3 p) { return uWarpKind > 0 && abs(p.z) > 3.5; }
vec3 warpPoint(vec3 p) {
  if (warped(p)) p.z += sign(p.z) * panelHeight(p.xy);
  return p;
}
vec3 warpNormal(vec3 p, vec3 n) {
  if (!warped(p) || abs(n.z) < 0.5) return n;
  vec2 slope = vec2(panelHeight(p.xy + vec2(0.1, 0.0)) - panelHeight(p.xy - vec2(0.1, 0.0)),
    panelHeight(p.xy + vec2(0.0, 0.1)) - panelHeight(p.xy - vec2(0.0, 0.1))) / 0.2;
  return normalize(n - vec3(slope * sign(p.z) * n.z, 0.0));
}
`;

/** Object-space wear affects specular response only, never ink/diffuse colour. */
export const wearGlsl = /* glsl */`
uniform float uWear;
uniform float uSeed;
float wearHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 43.17) * 43758.5453); }
vec3 wornNormal(vec3 p, vec3 N, vec3 tangent, vec2 size, int material, out float roughness) {
  vec3 T = normalize(tangent - N * dot(N, tangent) + vec3(0.00001));
  vec3 B = normalize(cross(N, T));
  vec2 gradient = vec2(0.0);
  roughness = 0.0;
  float edge = smoothstep(0.63, 0.98, max(abs(p.x) / (size.x * 0.5), abs(p.y) / (size.y * 0.5)));
  float centre = exp(-pow((p.x - 8.0) / 25.0, 2.0));
  float hinge = 1.0 - smoothstep(3.0, 12.0, abs(p.x + size.x * 0.5));
  float density = 0.12 + 0.24 * edge + 0.12 * centre + 0.16 * hinge;
  for (int layer = 0; layer < 3; layer++) {
    float angle = (float(layer) - 1.0) * 0.19 + (wearHash(vec2(float(layer), 9.0)) - 0.5) * 0.22;
    vec2 across = vec2(cos(angle), sin(angle)), along = vec2(-across.y, across.x);
    vec2 q = vec2(dot(p.xy, across), dot(p.xy, along));
    if (material == 4) {
      vec2 radial = p.xy - vec2(-24.0 + float(layer) * 31.0, 28.0 - float(layer) * 25.0);
      float radius = max(length(radial), 1.0);
      across = radial / radius;
      q = vec2(radius, atan(radial.y, radial.x) * radius);
    }
    float span = material == 2 || material == 5 ? 13.0 : 28.0;
    q += vec2(float(layer) * 7.13, uSeed * 3.73);
    vec2 cell = floor(q / vec2(4.3, span));
    float chance = wearHash(cell + float(layer) * 19.0);
    vec2 local = mod(q, vec2(4.3, span));
    float d = local.x - (0.7 + wearHash(cell + 12.0) * 2.8);
    float width = material == 2 ? 0.11 : material == 5 ? 0.065 : 0.025;
    float pixel = max(fwidth(q.x), 0.006);
    float filtered = sqrt(width * width + pixel * pixel * 0.32);
    float stroke = exp(-d * d / (2.0 * filtered * filtered)) * width / filtered;
    float ends = smoothstep(0.8, 3.0, local.y) * (1.0 - smoothstep(span * 0.55, span * 0.94, local.y));
    float mask = step(chance, density) * ends * stroke;
    gradient += across * clamp(d / filtered, -1.0, 1.0) * mask;
    roughness += mask;
  }
  roughness = min(roughness * uWear * (material == 5 ? 0.35 : 1.0), 1.0);
  float amplitude = material == 2 ? 0.035 : material == 5 ? 0.009 : 0.026;
  return normalize(N + (T * gradient.x + B * gradient.y) * amplitude * uWear);
}
`;
