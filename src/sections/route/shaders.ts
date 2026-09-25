/**
 * The Route — GLSL. The sky and the terrain fog share `horizonColor()`, so distant terrain
 * and the tile edges dissolve into exactly the colour of the sky at the horizon.
 */

const noise = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
/** Triplanar value noise; flat-ish ground skips the two vertical projections. */
float tri(vec3 q, vec3 w) {
  float n = vnoise(q.xz) * w.y;
  if (w.y < 0.98) n += vnoise(q.zy) * w.x + vnoise(q.xy) * w.z;
  else n /= w.y;
  return n;
}
`;

const atmosphere = /* glsl */ `
${noise}
uniform vec3 uSunDir;
uniform vec3 uFog;
uniform vec3 uHorizon;
uniform vec3 uSkyTop;
uniform vec3 uSunGlow;

const float CLOUD_Y = 18.0;

/**
 * Sunlit sea of clouds below the horizon: the view ray hits a cloud floor (with parallax),
 * billows from value-noise fBm, warmer toward the sun, fading to flat haze at the horizon.
 */
vec3 cloudColor(vec3 d) {
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float s = dot(dh, normalize(uSunDir.xz)) * 0.5 + 0.5;
  vec3 base = mix(uFog * 1.1, mix(uFog, uHorizon, 0.55) * 1.18, s * s);
  float t = max(cameraPosition.y - CLOUD_Y, 1.0) / max(-d.y, 0.004);
  vec2 q = (cameraPosition.xz + d.xz * t) * 0.006;
  float billow = vnoise(q) * 0.55 + vnoise(q * 2.3 + 5.2) * 0.3 + vnoise(q * 5.1 + 1.7) * 0.15;
  float detail = 1.0 - smoothstep(1500.0, 6000.0, t); // no shimmer near the horizon
  vec3 shade = mix(uSkyTop * 0.95 + uFog * 0.25, base * 1.06, smoothstep(0.25, 0.75, billow));
  return mix(base, shade, detail * 0.75);
}

/** Colour at the horizon for a view direction: cool haze, warming toward the dawn sun. */
vec3 horizonColor(vec3 d) {
  vec2 dh = normalize(d.xz + vec2(1e-5));
  vec2 sh = normalize(uSunDir.xz);
  float s = dot(dh, sh) * 0.5 + 0.5;
  return mix(uFog, uHorizon, 0.2 + 0.6 * s * s * s);
}
`;



export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyFragment = /* glsl */ `
${atmosphere}
varying vec3 vDir;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float vnoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f));
}
/** Ridged 1D profile: a jagged skyline as a function of azimuth. */
float skyline(float a, float seed) {
  float h = 0.0;
  float amp = 0.5;
  float fr = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = 1.0 - abs(vnoise1(a * fr + seed) * 2.0 - 1.0);
    h += n * n * amp;
    amp *= 0.5;
    fr *= 2.1;
  }
  return h;
}
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 hz = horizonColor(d);
  if (e < 0.0) hz = mix(hz, cloudColor(d), smoothstep(0.0, -0.06, e));
  float s = max(dot(d, uSunDir), 0.0);
  float sh = dot(normalize(d.xz + vec2(1e-5)), normalize(uSunDir.xz)) * 0.5 + 0.5;
  // Dawn: a warm band just above the horizon, then quickly into the cool upper sky.
  vec3 band = mix(uHorizon, uHorizon * vec3(1.08, 0.9, 0.8), sh);
  vec3 col = mix(hz, band, smoothstep(-0.01, 0.07, e) * (0.5 + 0.5 * sh));
  col = mix(col, mix(uSkyTop * 1.25, uSkyTop, smoothstep(0.2, 0.7, e)), smoothstep(0.03, 0.3, e));
  col += uSunGlow * (pow(s, 6.0) * 0.35 + pow(s, 80.0) * 0.9 + pow(s, 1600.0) * 4.0);

  // Distant ranges poking out of the cloud sea (at infinity: no parallax needed).
  float az = atan(d.z, d.x);
  float far = 0.004 + 0.05 * skyline(az * 7.0, 11.0) * (0.55 + 0.45 * vnoise1(az * 2.0 + 3.0));
  float near = -0.012 + 0.055 * skyline(az * 4.3, 47.0) * smoothstep(0.25, 0.75, vnoise1(az * 1.3 + 9.0));
  vec3 haze = mix(hz, cloudColor(d), 0.4);
  vec3 farCol = mix(haze, uSkyTop * 0.9, 0.28 + 0.12 * sh);
  vec3 nearCol = mix(haze, uSkyTop * 0.7, 0.45 + 0.1 * sh);
  float edgeAA = fwidth(e) * 1.5;
  col = mix(col, farCol, smoothstep(far + edgeAA, far - edgeAA, e));
  col = mix(col, nearCol, smoothstep(near + edgeAA, near - edgeAA, e));
  // Tops of the ranges sink into the cloud sea.
  col = mix(col, cloudColor(d), smoothstep(0.012, -0.02, e) * 0.85);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const terrainVertex = /* glsl */ `
attribute vec3 aBake;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vBake;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normal; // terrain mesh is never rotated/scaled
  vBake = aBake;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const terrainFragment = /* glsl */ `
${atmosphere}
uniform vec3 uSunColor;
uniform vec3 uSkyLight;
uniform vec3 uBounce;
uniform vec3 uSnow;
uniform vec3 uRock;
uniform vec3 uRockDark;
uniform vec3 uMoraine;
uniform float uHeightScale;
uniform float uSnowStart;
uniform float uSnowEnd;
uniform float uRockSlope;
uniform float uFogDensity;
uniform float uHalf;
uniform float uCloudTop;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vBake;

// Bump mapping from a scalar height using screen-space derivatives (Mikkelsen).
vec3 perturb(vec3 pos, vec3 n, vec2 dHdxy) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * n - grad);
}

void main() {
  vec3 Nm = normalize(vNormal);
  float dist = distance(cameraPosition, vWorld);
  vec2 p = vWorld.xz;
  // Triplanar weights: steep faces sample vertical planes, so nothing stretches into streaks.
  vec3 tw = pow(abs(Nm), vec3(4.0));
  tw /= tw.x + tw.y + tw.z;

  float n1 = vnoise(p * 0.03);
  float n2 = tri(vWorld * 0.12, tw);
  float n3 = tri(vWorld * 0.5, tw);

  // Micro relief, faded out with distance (it would only alias far away).
  float bumpFade = 1.0 - smoothstep(140.0, 700.0, dist);
  vec3 N = Nm;
  if (bumpFade > 0.001) {
    float bh = (n2 * 1.1 + n3 * 0.55) * bumpFade;
    N = perturb(vWorld, Nm, vec2(dFdx(bh), dFdy(bh)) * 1.5);
  }

  float h01 = vWorld.y / uHeightScale;
  float steep = clamp((1.0 - Nm.y) * 2.0, 0.0, 1.0);
  float n4 = tri(vWorld * 0.3 + 7.1, tw);
  float breakup = (n1 - 0.5) * 0.16 + (n2 - 0.5) * 0.08 + (n4 - 0.5) * 0.08;

  // Snow above the snowline, sliding off steep faces; gullies hold it a little longer.
  float snowAlt = smoothstep(uSnowStart, uSnowEnd, h01 + breakup);
  float hold = 1.0 - smoothstep(uRockSlope - 0.06, uRockSlope + 0.14, steep + (n4 - 0.5) * 0.22 + (n3 - 0.5) * 0.1 - vBake.y * 0.25);
  float snow = snowAlt * hold;
  // Wind-packed patches on flatter ground lower down.
  snow = max(snow, smoothstep(0.8, 0.95, Nm.y) * smoothstep(0.12, 0.34, h01 + breakup) * 0.7);

  // Glacier: ice + snow up high, debris-covered near the snout (base camp moraine).
  float ice = vBake.z * (1.0 - smoothstep(0.4, 0.75, steep));
  float debris = (1.0 - smoothstep(0.04, 0.2, h01 + (n2 - 0.5) * 0.08))
               * (0.55 + 0.45 * smoothstep(0.35, 0.7, vnoise(vec2(p.x * 0.09, p.y * 0.02))));
  vec3 glacierCol = mix(uSnow * vec3(0.86, 0.93, 1.0), uMoraine, debris);

  vec3 rock = mix(uRock, uRockDark, clamp(vBake.y * 1.7 + (0.5 - n2) * 0.6, 0.0, 1.0));
  rock *= 0.8 + 0.38 * n3;
  rock *= 1.0 - 0.1 * (1.0 - smoothstep(250.0, 700.0, dist)) * (0.5 + 0.5 * sin(vWorld.y * 0.65 + n1 * 9.0)); // strata

  vec3 albedo = mix(rock, uSnow, snow);
  albedo = mix(albedo, glacierCol, ice * (1.0 - snow * 0.6));

  // Light: low warm sun (baked soft shadows) + cool sky hemisphere.
  float ndl = max(dot(N, uSunDir), 0.0);
  float vis = vBake.x;
  vec3 direct = uSunColor * ndl * vis;
  float ao = 1.0 - vBake.y * 0.55;
  vec3 hemi = mix(uBounce, uSkyLight, N.y * 0.5 + 0.5) * ao;
  vec3 col = albedo * (direct + hemi);

  // Snow sheen toward the sun.
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 H = normalize(uSunDir + V);
  float snowish = max(snow, ice * (1.0 - debris));
  vec3 Ns = normalize(mix(Nm, N, 0.35)); // mostly macro normal: no sparkly aliasing
  col += uSunColor * pow(max(dot(Ns, H), 0.0), 32.0) * 0.14 * snowish * vis;

  // Aerial perspective: exponential fog + low valley haze + dissolve at the tile edge.
  float fogF = 1.0 - exp(-dist * uFogDensity);
  float haze = exp(-max(vWorld.y, 0.0) * 0.016) * 0.14 * smoothstep(150.0, 1100.0, dist);
  fogF = fogF + haze * (1.0 - fogF);
  float edge = smoothstep(uHalf * 0.8, uHalf * 0.98, max(abs(vWorld.x), abs(vWorld.z)));
  fogF = clamp(max(fogF, edge), 0.0, 1.0);
  col = mix(col, horizonColor(-V), fogF);
  // Sea of clouds swallowing the low outer valleys (and the edges of the world).
  float radial = max(abs(vWorld.x), abs(vWorld.z)) / uHalf;
  float cloudTop = uCloudTop * smoothstep(0.42, 0.85, radial) + (n1 - 0.5) * 14.0;
  float cloud = smoothstep(cloudTop + 2.0, cloudTop - 16.0, vWorld.y) * smoothstep(0.4, 0.62, radial);
  cloud *= 1.0 - smoothstep(0.05, 0.4, vBake.z) * (1.0 - smoothstep(0.72, 0.86, radial));
  float cloudMix = max(cloud, edge);
  if (cloudMix > 0.001) col = mix(col, cloudColor(-V), cloudMix);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const headVertex = /* glsl */ `
uniform float uSize;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
}
`;

export const headFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(0.3, 0.16, d);
  float glow = pow(max(0.0, 1.0 - d), 2.4) * 0.55;
  float a = (core + glow) * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.93, 0.86), core * 0.55), a);
  #include <colorspace_fragment>
}
`;
