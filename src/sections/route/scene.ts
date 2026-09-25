/**
 * The Route — Three.js scene: terrain, sky, the self-drawing route line and the camera
 * choreography. No DOM beyond the canvas; the controller feeds progress and reads the
 * projected camp positions for the HTML labels.
 */
import {
  ACESFilmicToneMapping,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { route } from '../../config';
import type { Heightfield } from './heightfield';
import { framing, heroPose, type RoutePaths } from './paths';
import {
  headFragment,
  headVertex,
  skyFragment,
  skyVertex,
  terrainFragment,
  terrainVertex,
} from './shaders';

export interface RouteSceneOptions {
  /** Keeps the drawing buffer for toDataURL (dev capture only). */
  preserveDrawingBuffer?: boolean;
}

const lin = (hex: string) => new Color(hex); // ColorManagement converts sRGB hex → linear
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class RouteScene {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly scene = new Scene();
  readonly paths: RoutePaths;
  readonly hf: Heightfield;

  /** Route progress along the stops (0–1) and arc fraction drawn, after smoothing. */
  t = 0;
  s = 0;

  private terrain: Mesh<PlaneGeometry, ShaderMaterial>;
  private sky: Mesh<SphereGeometry, ShaderMaterial>;
  private lineGeo: LineGeometry;
  private ghostGeo: LineGeometry;
  private lines: Line2[] = [];
  private lineMats: LineMaterial[] = [];
  private head: Points<BufferGeometry, ShaderMaterial>;

  private target = 0; // scroll progress (0–1)
  private progress = 0; // smoothed progress
  private width = 1;
  private height = 1;
  private pullback = 1;

  // Scratch + state vectors (never reallocated per frame).
  private camPos = new Vector3();
  private camTgt = new Vector3();
  private goalPos = new Vector3();
  private goalTgt = new Vector3();
  private heroPos = new Vector3();
  private heroTgt = new Vector3();
  private endPos = new Vector3();
  private endTgt = new Vector3();
  private tmp = new Vector3();
  private tip = new Vector3();

  constructor(canvas: HTMLCanvasElement, hf: Heightfield, paths: RoutePaths, opts: RouteSceneOptions = {}) {
    this.hf = hf;
    this.paths = paths;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(lin(route.palette.fog));

    this.camera = new PerspectiveCamera(route.camera.fov, 1, 1, 6000);

    const pal = route.palette;
    const sunDir = new Vector3(...hf.sunDir).normalize();
    const atmosphere = {
      uSunDir: { value: sunDir },
      uFog: { value: lin(pal.fog) },
      uHorizon: { value: lin(pal.skyHorizon) },
      uSkyTop: { value: lin(pal.skyTop) },
      uSunGlow: { value: new Color(1.0, 0.62, 0.36) },
    };

    // --- Sky dome (follows the camera) ---------------------------------------------------
    this.sky = new Mesh(
      new SphereGeometry(3000, 24, 12),
      new ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: atmosphere,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    // --- Terrain ------------------------------------------------------------------------
    const { size, segments, heightScale, snowlineStart, snowlineEnd, rockSlope } = route.terrain;
    const geo = new PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, hf.heights[i]);
    geo.setAttribute('normal', new BufferAttribute(hf.normals, 3));
    geo.setAttribute('aBake', new BufferAttribute(hf.bake, 3));
    geo.deleteAttribute('uv');
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    this.terrain = new Mesh(
      geo,
      new ShaderMaterial({
        vertexShader: terrainVertex,
        fragmentShader: terrainFragment,
        uniforms: {
          ...atmosphere,
          uSunColor: { value: new Color(1.0, 0.66, 0.44).multiplyScalar(2.2) },
          uSkyLight: { value: lin('#7f9dc2').multiplyScalar(0.95) },
          uBounce: { value: new Color(0.16, 0.14, 0.13) },
          uSnow: { value: lin(pal.snow) },
          uRock: { value: lin(pal.rock) },
          uRockDark: { value: lin(pal.rockDark) },
          uMoraine: { value: lin('#5a5550') },
          uHeightScale: { value: heightScale },
          uSnowStart: { value: snowlineStart },
          uSnowEnd: { value: snowlineEnd },
          uRockSlope: { value: rockSlope },
          uFogDensity: { value: 0.00012 },
          uCloudTop: { value: 62 },
          uHalf: { value: size / 2 },
        },
      }),
    );
    this.scene.add(this.terrain);

    // --- Route line ---------------------------------------------------------------------
    const positions = Array.from(paths.points);
    this.lineGeo = new LineGeometry();
    this.lineGeo.setPositions(positions);
    this.ghostGeo = new LineGeometry();
    this.ghostGeo.setPositions(positions);

    const routeColor = new Color(pal.route);
    const ghostMat = new LineMaterial({
      color: 0xeef2f5,
      linewidth: 1,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    const behindMat = new LineMaterial({
      color: routeColor,
      linewidth: 2.4,
      dashed: true,
      dashSize: 5,
      gapSize: 3.6,
      transparent: true,
      opacity: 0.32,
      depthTest: false,
      depthWrite: false,
    });
    const mainMat = new LineMaterial({
      color: routeColor,
      linewidth: 3,
      dashed: true,
      dashSize: 5,
      gapSize: 3.6,
    });
    for (const m of [ghostMat, behindMat, mainMat]) m.toneMapped = false;
    this.lineMats = [ghostMat, behindMat, mainMat];

    const ghost = new Line2(this.ghostGeo, ghostMat);
    const behind = new Line2(this.lineGeo, behindMat);
    const main = new Line2(this.lineGeo, mainMat);
    ghost.renderOrder = 1;
    behind.renderOrder = 2;
    main.renderOrder = 3;
    for (const l of [ghost, behind, main]) {
      l.computeLineDistances();
      l.frustumCulled = false;
      this.scene.add(l);
    }
    this.lines = [ghost, behind, main];
    this.lineGeo.instanceCount = 0;

    // --- Drawing tip glow -----------------------------------------------------------------
    const headGeo = new BufferGeometry();
    headGeo.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    this.head = new Points(
      headGeo,
      new ShaderMaterial({
        vertexShader: headVertex,
        fragmentShader: headFragment,
        uniforms: {
          uSize: { value: 26 },
          uColor: { value: routeColor.clone() },
          uOpacity: { value: 1 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.head.frustumCulled = false;
    this.head.renderOrder = 4;
    this.scene.add(this.head);
  }

  /** Canvas size in CSS pixels. */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    const { fov, pullback } = framing(aspect);
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.pullback = pullback;
    for (const m of this.lineMats) m.resolution.set(this.width, this.height);
    this.head.material.uniforms.uSize.value = 26 * pixelRatio;
    heroPose(this.paths, aspect, fov, this.heroPos, this.heroTgt);
  }

  /** Hide the line + tip (static capture draws the route in SVG instead). */
  setRouteVisible(visible: boolean): void {
    for (const l of this.lines) l.visible = visible;
    this.head.visible = visible;
  }

  setProgress(p: number): void {
    this.target = clamp01(p);
  }

  /** Jump straight to the current goal (first frame, re-entry, static modes). */
  snap(): void {
    this.progress = this.target;
    this.computeGoal(this.progress);
    this.camPos.copy(this.goalPos);
    this.camTgt.copy(this.goalTgt);
    this.apply();
  }

  /** Advances the smoothing. Returns false once everything has settled. */
  step(dt: number): boolean {
    const kP = 1 - Math.exp(-dt * 6);
    const kC = 1 - Math.exp(-dt * route.camera.damping);
    this.progress += (this.target - this.progress) * kP;
    if (Math.abs(this.target - this.progress) < 1e-5) this.progress = this.target;
    this.computeGoal(this.progress);
    const dist = this.camPos.distanceToSquared(this.goalPos) + this.camTgt.distanceToSquared(this.goalTgt);
    this.camPos.lerp(this.goalPos, kC);
    this.camTgt.lerp(this.goalTgt, kC);
    this.apply();
    return this.progress !== this.target || dist > 0.0004;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Pre-compiles shaders; non-blocking where KHR_parallel_shader_compile exists. */
  async compile(): Promise<void> {
    this.camera.updateMatrixWorld();
    if (this.renderer.extensions.has('KHR_parallel_shader_compile')) {
      await this.renderer.compileAsync(this.scene, this.camera);
    } else {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  /**
   * Writes [x, y, inFront, routeDx] per stop's camp into `out` (CSS px). routeDx is the
   * screen-space x offset of the adjacent route (next stretch; the arrival for the last
   * camp) so labels can sit on the other side.
   */
  projectCamps(out: Float32Array): void {
    const camps = this.paths.campPos;
    const last = camps.length - 1;
    for (let k = 0; k <= last; k++) {
      this.tmp.copy(camps[k]);
      this.tmp.y += 3;
      this.tmp.project(this.camera);
      const x = (this.tmp.x * 0.5 + 0.5) * this.width;
      out[k * 4] = x;
      out[k * 4 + 1] = (0.5 - this.tmp.y * 0.5) * this.height;
      out[k * 4 + 2] = this.tmp.z < 1 && this.tmp.z > -1 ? 1 : 0;
      const s = this.paths.campS[k];
      this.paths.pointAt(k === last ? s - 0.04 : s + 0.04, this.tmp).project(this.camera);
      const nx = (this.tmp.x * 0.5 + 0.5) * this.width;
      out[k * 4 + 3] = nx - x;
    }
  }

  dispose(): void {
    this.terrain.geometry.dispose();
    this.terrain.material.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.lineGeo.dispose();
    this.ghostGeo.dispose();
    for (const m of this.lineMats) m.dispose();
    this.head.geometry.dispose();
    this.head.material.dispose();
    this.renderer.dispose();
  }

  // --- internals ---------------------------------------------------------------------------

  private computeGoal(p: number): void {
    const { drawEnd } = route.camera;
    this.t = clamp01(p / drawEnd);
    this.s = this.paths.sAt(this.t);
    if (p <= drawEnd) {
      this.flight(this.s, this.goalPos, this.goalTgt);
      return;
    }
    // Orbit: sweep around the summit's vertical axis from the end of the flight to the hero pose.
    const e = easeInOut(clamp01((p - drawEnd) / (0.97 - drawEnd)));
    this.flight(1, this.endPos, this.endTgt);
    const S = this.paths.summit;
    const a0 = Math.atan2(this.endPos.z - S.z, this.endPos.x - S.x);
    const a1 = Math.atan2(this.heroPos.z - S.z, this.heroPos.x - S.x);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const r0 = Math.hypot(this.endPos.x - S.x, this.endPos.z - S.z);
    const r1 = Math.hypot(this.heroPos.x - S.x, this.heroPos.z - S.z);
    const ang = a0 + da * e;
    const r = r0 * Math.pow(r1 / r0, e); // log-space: slow start, then the pull-out
    const y = this.endPos.y + (this.heroPos.y - this.endPos.y) * e + Math.sin(Math.PI * e) * 40;
    this.goalPos.set(S.x + Math.cos(ang) * r, y, S.z + Math.sin(ang) * r);
    const et = e * e * (3 - 2 * e);
    this.goalTgt.copy(this.endTgt).lerp(this.heroTgt, et);
  }

  /** Flight pose with the portrait pull-back applied along the view vector. */
  private flight(s: number, pos: Vector3, tgt: Vector3): void {
    this.paths.flightAt(s, pos, tgt);
    if (this.pullback !== 1) pos.sub(tgt).multiplyScalar(this.pullback).add(tgt);
  }

  private apply(): void {
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTgt);
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camPos);

    // Route drawing: whole segments via instanceCount; the glow marks the exact tip.
    this.lineGeo.instanceCount = this.paths.segmentsTo(this.s);
    this.paths.pointAt(this.s, this.tip);
    this.head.position.set(this.tip.x, this.tip.y + 0.6, this.tip.z);
  }
}
