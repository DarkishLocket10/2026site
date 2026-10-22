import * as THREE from 'three';
import type { CaseKind, CdDisc } from './types';
import { buildBooklet, buildDisc, buildInlay, buildLid, buildSpine, buildTray } from './geometry';
import { Motion, PoseMatrices } from './motion';
import { pictureFormat, Studio } from './studio';
import * as shaders from './shaders';
import * as portrait from './portrait-shaders';
import { CASE_SPECS, buildKeepPanel, buildKeepShell, buildKeepSpine, buildSteelTray, bluRayBanner } from './formats';
import type { Parts } from './geometry';

type Uniforms = Record<string, THREE.IUniform>;
export interface CaseArtwork { art: THREE.Texture; cover: THREE.Texture; back: THREE.Texture | null; bookletInside?: THREE.Texture | null; inside?: THREE.Texture | null; relief?: THREE.Texture | null; hasBanner?: boolean; scan: boolean }
interface PlasticGroup { rods: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; sheets: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; depth: number; matrix: THREE.Matrix4 }
interface PaperMeshes { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; depth: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }
interface CaseMeshes {
  matrices: PoseMatrices;
  tray: PlasticGroup; lid: PlasticGroup;
  booklet: PaperMeshes; spine: PaperMeshes; inlay: PaperMeshes; fittings: PaperMeshes[];
  disc: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  depth: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  trayHit: THREE.Mesh; lidHit: THREE.Mesh;
  index: number;
}

export class Pipeline {
  readonly camera = new THREE.PerspectiveCamera(28, 1, 1, 12000);
  readonly studio: Studio;
  readonly hitPlanes: THREE.Mesh[] = [];
  private readonly opaque = new THREE.Scene();
  private readonly plastic = new THREE.Scene();
  private readonly screen = new THREE.Scene();
  private readonly screenCamera = new THREE.Camera();
  private readonly screenMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly rtOpaque: THREE.WebGLRenderTarget;
  private readonly rtPlastic: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly copy: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly shadow: THREE.ShaderMaterial;
  private readonly shared: Uniforms;
  private readonly page = new THREE.Color('#ffffff');
  private readonly resolution = new THREE.Vector2(1, 1);
  private readonly rect = new THREE.Vector4(0, 0, 1, 1);
  private readonly cases: [CaseMeshes, CaseMeshes];
  private readonly ordered: PlasticGroup[] = [];
  private readonly point = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly inverseCases = [new THREE.Matrix4(), new THREE.Matrix4()];
  private readonly inverseLids = [new THREE.Matrix4(), new THREE.Matrix4()];
  private readonly shadowCases = [new THREE.Vector4(), new THREE.Vector4()];
  private readonly trays: Parts[];
  private readonly lidGeometry: Parts;
  private readonly discsGeometry = [buildDisc(), buildDisc({ innerRadius: 15 })];
  private readonly bookletGeometry: THREE.BufferGeometry;
  private readonly inlayGeometry: THREE.BufferGeometry;
  private readonly spineGeometry: THREE.BufferGeometry;
  private readonly hitGeometry: THREE.PlaneGeometry;
  private readonly hitOffset: THREE.Matrix4;
  private readonly steelTray: Parts | null;
  private readonly banner: THREE.CanvasTexture | null;
  private readonly hitMatrix = new THREE.Matrix4();
  private width = 1; private height = 1;
  private rx = 0; private ry = 0; private rw = 1; private rh = 1;
  private groupCount = 0;
  openScale = 1;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly discs: readonly CdDisc[], private readonly textures: readonly CaseArtwork[], private readonly spineTextures: readonly THREE.Texture[], coarse: boolean, private readonly kind: CaseKind = 'jewel', private readonly wear = 0.35) {
    const spec = CASE_SPECS[kind], jewel = kind === 'jewel';
    this.trays = jewel ? [buildTray(), buildTray({ clearCentre: true })]
      : [buildKeepShell(kind, false), buildKeepShell(kind, false, true)];
    this.lidGeometry = jewel ? buildLid() : buildKeepShell(kind, true);
    this.bookletGeometry = jewel ? buildBooklet() : buildKeepPanel(kind, true);
    this.inlayGeometry = jewel ? buildInlay() : buildKeepPanel(kind, false);
    this.spineGeometry = jewel ? buildSpine() : buildKeepSpine(kind);
    this.hitGeometry = new THREE.PlaneGeometry(spec.width, spec.height);
    this.hitOffset = new THREE.Matrix4().makeTranslation(0, 0, spec.depth / 2);
    this.steelTray = kind === 'steelbook' ? buildSteelTray() : null;
    this.banner = kind === 'bluray' ? bluRayBanner() : null;
    if (this.banner) {
      this.banner.colorSpace = THREE.SRGBColorSpace;
      this.banner.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    this.studio = new Studio(renderer);
    const type = pictureFormat(renderer), hdr = type !== THREE.UnsignedByteType;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const supported: Int32Array = gl.getInternalformatParameter(gl.RENDERBUFFER, hdr ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
    let samples = 0;
    for (let i = 0; i < supported.length; i++) if (supported[i] <= 4) samples = Math.max(samples, supported[i]);
    const target = (depth: boolean, msaa = 0) => new THREE.WebGLRenderTarget(1, 1, {
      type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: depth, stencilBuffer: false, samples: msaa, generateMipmaps: false,
    });
    // Printed paper, the disc's rim and shadow edges need MSAA as much as the plastic does.
    this.rtOpaque = target(true, samples);
    this.rtPlastic = [target(true, samples), target(true, samples)];
    this.shared = {
      uPage: { value: this.page }, uResolution: { value: this.resolution },
      // Byte mode reserves roughly 32 alpha levels for shadow light before solid tags.
      uProj: { value: this.camera.projectionMatrix }, uTagScale: { value: hdr ? 1 : 1 / 8 },
      uRoom: { value: this.studio.target.texture }, uRoomSize: { value: 512 },
    };
    this.copy = this.material(shaders.fullVert, shaders.copyFrag, { uInput: { value: null } }, true);
    const picture = { uPicture: { value: this.rtOpaque.texture }, uOpaque: { value: this.rtOpaque.texture }, uRect: { value: this.rect }, uTagScale: this.shared.uTagScale };
    this.composite = this.material(shaders.fullVert, shaders.compositeFrag, {
      ...picture, uTransparent: { value: true }, uPage: this.shared.uPage,
    }, true);
    const screenGeometry = new THREE.BufferGeometry();
    screenGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.screenMesh = new THREE.Mesh(screenGeometry, this.copy); this.screenMesh.frustumCulled = false;
    this.screen.add(this.screenMesh);
    this.shadow = this.material(shaders.shadowVert, jewel ? shaders.shadowFrag : portrait.shadowFrag, {
      ...this.shared, uCaseInverse: { value: this.inverseCases }, uLidInverse: { value: this.inverseLids },
      uShadow: { value: this.shadowCases }, uCount: { value: 1 },
      uSize: { value: new THREE.Vector2(spec.width, spec.height) }, uDepth: { value: spec.depth },
    });
    this.shadow.depthWrite = false;
    const shadowGeometry = new THREE.PlaneGeometry(8000, 8000);
    const shadow = new THREE.Mesh(shadowGeometry, this.shadow);
    shadow.position.z = -42; // the case floats a few centimetres above the page
    shadow.renderOrder = -1; shadow.frustumCulled = false;
    this.opaque.add(shadow);
    const depthMaterial = this.material(shaders.depthVert, shaders.depthFrag, {});
    depthMaterial.colorWrite = false; depthMaterial.side = THREE.DoubleSide;
    const hitMaterial = this.material(shaders.depthVert, shaders.depthFrag, {});
    hitMaterial.side = THREE.DoubleSide;
    const group = (matrix: THREE.Matrix4, lid: boolean): PlasticGroup => {
      const geometry = lid ? this.lidGeometry : this.trays[0];
      const rodsMaterial = this.material(jewel ? shaders.rodVert : shaders.paperVert, jewel ? shaders.rodFrag : portrait.edgeFrag, {
        ...this.shared, uSize: { value: new THREE.Vector2(spec.width, spec.height) },
        uMetal: { value: kind === 'steelbook' }, uGloss: { value: false }, uLid: { value: lid }, uArt: { value: textures[0].cover },
        uBehind: { value: this.rtOpaque.texture }, uDepth: { value: 14 }, uIor: { value: 1.59 },
        uSamples: { value: coarse ? 1 : 2 }, uFade: { value: 1 }, uAbsorb: { value: new THREE.Vector3(0.0042, 0.003, 0.0026) },
      });
      const sheetMaterial = this.material(shaders.sheetVert, jewel ? shaders.sheetFrag : portrait.sleeveFrag, {
        ...this.shared, uFade: { value: 1 }, uSize: { value: new THREE.Vector2(spec.width, spec.height) },
        uWarpKind: { value: jewel ? 1 : kind === 'bluray' ? 3 : 0 },
      });
      sheetMaterial.transparent = true; sheetMaterial.depthWrite = false;
      sheetMaterial.polygonOffset = true; sheetMaterial.polygonOffsetFactor = 1; sheetMaterial.polygonOffsetUnits = 4;
      sheetMaterial.blending = THREE.CustomBlending;
      sheetMaterial.blendSrc = THREE.OneFactor; sheetMaterial.blendDst = THREE.OneMinusSrcAlphaFactor;
      sheetMaterial.blendSrcAlpha = THREE.ZeroFactor; sheetMaterial.blendDstAlpha = THREE.OneFactor;
      const rods = this.mesh(geometry.rods, rodsMaterial), sheets = this.mesh(geometry.sheets, sheetMaterial);
      this.plastic.add(rods, sheets);
      return { rods, sheets, depth: 0, matrix };
    };
    const createCase = (): CaseMeshes => {
      const matrices = new PoseMatrices(kind);
      const tray = group(matrices.tray, false), lid = group(matrices.lid, true);
      const discMaterial = this.material(shaders.discVert, shaders.discFrag, {
        uArt: { value: textures[0].art }, uDiscType: { value: 0 }, uBase: { value: 0 }, uArtIn: { value: 18 }, uPrintOut: { value: 58 }, uScan: { value: false },
        uFade: { value: 1 }, uTagScale: this.shared.uTagScale,
      });
      const disc = this.mesh(this.discsGeometry[0], discMaterial), depth = this.mesh(this.discsGeometry[0], depthMaterial);
      depth.renderOrder = -1000;
      this.opaque.add(disc); this.plastic.add(depth);
      const paper = (geometry: THREE.BufferGeometry, fragment: string, texture: Uniforms): PaperMeshes => {
        const material = this.material(shaders.paperVert, fragment, {
          ...this.shared, ...texture, uFade: { value: 1 }, uTagScale: this.shared.uTagScale,
        });
        const panelDepth = this.material(shaders.depthVert, shaders.depthFrag, { ...material.uniforms });
        panelDepth.colorWrite = false; panelDepth.side = THREE.DoubleSide;
        const mesh = this.mesh(geometry, material), depth = this.mesh(geometry, panelDepth);
        depth.renderOrder = -1000;
        this.opaque.add(mesh); this.plastic.add(depth);
        return { mesh, depth };
      };
      const panelUniforms = (lid: boolean): Uniforms => ({
        uArt: { value: textures[0].cover }, uInside: { value: textures[0].cover }, uHasInside: { value: false },
        uSize: { value: new THREE.Vector2(spec.width - 2.4, spec.height - 2.4) },
        uMetal: { value: kind === 'steelbook' }, uGloss: { value: false }, uLid: { value: lid },
        uWarpKind: { value: jewel ? 0 : kind === 'steelbook' ? 4 : 2 },
        uHasArt: { value: true }, uHasBanner: { value: false }, uBanner: { value: this.banner },
        uRelief: { value: textures[0].cover }, uHasRelief: { value: false },
        uSpineColour: { value: new THREE.Color() },
      });
      const booklet = paper(this.bookletGeometry, jewel ? shaders.bookletFrag : portrait.panelFrag, panelUniforms(true));
      const spine = paper(this.spineGeometry, shaders.spineFrag, { uSpine: { value: spineTextures[0] } });
      const inlay = paper(this.inlayGeometry, jewel ? shaders.inlayFrag : portrait.panelFrag, {
        ...panelUniforms(false), uBack: { value: textures[0].back }, uHasBack: { value: false },
      });
      const fittings = this.steelTray ? [this.steelTray.rods, this.steelTray.sheets].map(geometry => paper(geometry, portrait.trayFrag, { uHasDisc: { value: true } })) : [];
      const trayHit = this.mesh(this.hitGeometry, hitMaterial), lidHit = this.mesh(this.hitGeometry, hitMaterial);
      this.hitPlanes.push(trayHit, lidHit);
      return { matrices, tray, lid, booklet, spine, inlay, fittings, disc, depth, trayHit, lidHit, index: -1 };
    };
    this.cases = [createCase(), createCase()];
    for (const c of this.cases) this.ordered.push(c.tray, c.lid);
    this.geometries.push(screenGeometry, shadowGeometry, this.hitGeometry, this.bookletGeometry, this.spineGeometry, this.inlayGeometry, this.lidGeometry.rods, this.lidGeometry.sheets, ...this.discsGeometry);
    for (const tray of this.trays) this.geometries.push(tray.rods, tray.sheets);
    if (this.steelTray) this.geometries.push(this.steelTray.rods, this.steelTray.sheets);
  }
  private material(vertexShader: string, fragmentShader: string, uniforms: Uniforms, screen = false): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms: {
        uWear: { value: 0 }, uSeed: { value: 0 }, uWarpKind: { value: 0 }, uSize: { value: new THREE.Vector2(142, 125) }, ...uniforms,
      },
      depthTest: !screen, depthWrite: !screen, blending: THREE.NoBlending,
    });
    this.materials.push(material); return material;
  }
  private mesh(geometry: THREE.BufferGeometry, material: THREE.ShaderMaterial): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.frustumCulled = false;
    return mesh;
  }
  private matrix(mesh: THREE.Mesh, matrix: THREE.Matrix4): void { mesh.matrix.copy(matrix); mesh.matrixWorld.copy(matrix); }
  setPage(colour: string | null, transparent = colour === null): void {
    this.page.set(colour ?? '#ffffff'); this.composite.uniforms.uTransparent.value = transparent;
  }
  resize(width: number, height: number, aspect: number): void {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    this.resolution.set(this.width, this.height);
    this.camera.aspect = aspect;
    const tangent = Math.tan(14 * Math.PI / 180);
    const spec = CASE_SPECS[this.kind];
    const distance = this.kind === 'jewel'
      ? Math.max(125 / 0.62, 142 / (0.70 * aspect)) / (2 * tangent)
      : Math.max(spec.height / 0.70, spec.width / (0.70 * aspect)) / (2 * tangent);
    this.camera.position.set(0, 0, distance); this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(true);
    this.openScale = Math.min(1.04, 0.92 * (2 * distance * tangent * aspect) / (2 * spec.width + 6));
    this.rtOpaque.setSize(this.width, this.height);
    for (const target of this.rtPlastic) target.setSize(this.width, this.height);
  }
  compile(): void {
    this.studio.render();
    this.renderer.compile(this.opaque, this.camera);
    // Include pane/rod programs and opaque depth occluders even before animation.
    for (const c of this.cases) { for (const f of c.fittings) f.depth.visible = true; c.depth.visible = true; c.booklet.depth.visible = true; c.spine.depth.visible = true; c.inlay.depth.visible = true; c.tray.rods.visible = true; c.tray.sheets.visible = true; c.lid.rods.visible = true; c.lid.sheets.visible = true; }
    this.renderer.compile(this.plastic, this.camera);
    for (const material of [this.copy, this.composite]) {
      this.screenMesh.material = material; this.renderer.compile(this.screen, this.screenCamera);
    }
    const gl = this.renderer.getContext();
    for (const program of this.renderer.info.programs ?? []) {
      if (!gl.getProgramParameter(program.program as WebGLProgram, gl.LINK_STATUS)) throw new Error(`CD shader link failed: ${gl.getProgramInfoLog(program.program as WebGLProgram)}`);
    }
  }
  update(motion: Motion): void {
    this.groupCount = 0;
    this.shadow.uniforms.uCount.value = motion.count;
    for (let i = 0; i < 2; i++) {
      const c = this.cases[i], moving = motion.cases[i], active = i < motion.count;
      const hasDisc = active && this.discs[moving.index].discType !== 'none';
      c.disc.visible = hasDisc; c.depth.visible = hasDisc;
      for (const f of c.fittings) { f.mesh.visible = active; f.depth.visible = active; }
      c.booklet.mesh.visible = active; c.booklet.depth.visible = active;
      c.spine.mesh.visible = active; c.spine.depth.visible = active;
      c.inlay.mesh.visible = active; c.inlay.depth.visible = active;
      c.trayHit.visible = active; c.lidHit.visible = active;
      c.tray.rods.visible = false; c.tray.sheets.visible = false; c.lid.rods.visible = false; c.lid.sheets.visible = false;
      if (!active) continue;
      const disc = this.discs[moving.index];
      if (c.index !== moving.index) {
        c.index = moving.index;
        const clear = disc.base === undefined || disc.base === 'print' || disc.base === 'holo';
        const variant = clear ? 1 : 0;
        c.disc.geometry = this.discsGeometry[variant]; c.depth.geometry = c.disc.geometry;
        const trayVariant = this.kind === 'jewel' ? variant : disc.discType === 'none' ? 0 : variant;
        c.tray.rods.geometry = this.trays[trayVariant].rods; c.tray.sheets.geometry = this.trays[trayVariant].sheets;
        const artwork = this.textures[moving.index];
        const value = disc.wear ?? this.wear;
        const wear = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0.35;
        for (const mesh of [c.tray.rods, c.tray.sheets, c.lid.rods, c.lid.sheets, c.booklet.mesh, c.inlay.mesh]) {
          mesh.material.uniforms.uWear.value = wear;
          mesh.material.uniforms.uSeed.value = moving.index + 1;
        }
        c.disc.material.uniforms.uArt.value = artwork.art;
        c.disc.material.uniforms.uScan.value = artwork.scan;
        c.booklet.mesh.material.uniforms.uArt.value = artwork.cover;
        c.booklet.mesh.material.uniforms.uInside.value = artwork.bookletInside ?? artwork.cover;
        c.booklet.mesh.material.uniforms.uHasInside.value = !!artwork.bookletInside;
        c.disc.material.uniforms.uDiscType.value = (disc.discType ?? (this.kind === 'jewel' ? 'cd' : 'bluray')) === 'bluray' ? 1 : disc.discType === 'dvd' ? 2 : 0;
        if (this.kind !== 'jewel') {
          for (const panel of [c.booklet, c.inlay]) {
            const u = panel.mesh.material.uniforms;
            u.uInside.value = artwork.inside ?? artwork.cover;
            u.uHasInside.value = !!artwork.inside;
            u.uGloss.value = disc.finish === 'gloss';
            u.uHasBanner.value = artwork.hasBanner ?? !!disc.hasBanner;
            u.uHasRelief.value = !!artwork.relief;
            u.uRelief.value = artwork.relief ?? artwork.cover;
            u.uSpineColour.value.set(disc.spineColour ?? disc.accent ?? '#444');
          }
          c.inlay.mesh.material.uniforms.uArt.value = artwork.back ?? artwork.cover;
          c.inlay.mesh.material.uniforms.uHasArt.value = !!artwork.back;
          c.lid.rods.material.uniforms.uArt.value = artwork.cover;
          c.tray.rods.material.uniforms.uArt.value = artwork.back ?? artwork.cover;
          c.lid.rods.material.uniforms.uGloss.value = disc.finish === 'gloss';
          c.tray.rods.material.uniforms.uGloss.value = disc.finish === 'gloss';
        }
        c.spine.mesh.material.uniforms.uSpine.value = this.spineTextures[moving.index];
        c.inlay.mesh.material.uniforms.uBack.value = artwork.back;
        c.inlay.mesh.material.uniforms.uHasBack.value = artwork.back !== null;
        c.inlay.mesh.material.uniforms.uSpineColour.value.set(disc.spineColour ?? disc.accent ?? '#444');
        c.disc.material.uniforms.uBase.value = disc.base === 'holo' ? 1 : disc.base === 'gold' ? 2 : disc.base === 'vinyl' ? 3 : 0;
        c.disc.material.uniforms.uArtIn.value = artwork.scan ? (clear ? 15 : 7.5) : disc.artIn ?? 18;
        c.disc.material.uniforms.uPrintOut.value = artwork.scan ? 60 : disc.printOut ?? 58;
      }
      c.matrices.update(moving.pose, motion, this.openScale);
      for (const f of c.fittings) {
        this.matrix(f.mesh, c.matrices.tray); this.matrix(f.depth, c.matrices.tray);
        f.mesh.material.uniforms.uFade.value = moving.pose.fade;
        f.mesh.material.uniforms.uHasDisc.value = hasDisc;
      }
      this.matrix(c.disc, c.matrices.disc); this.matrix(c.depth, c.matrices.disc);
      this.matrix(c.booklet.mesh, c.matrices.lid); this.matrix(c.booklet.depth, c.matrices.lid);
      this.matrix(c.spine.mesh, c.matrices.tray); this.matrix(c.spine.depth, c.matrices.tray);
      this.matrix(c.inlay.mesh, c.matrices.tray); this.matrix(c.inlay.depth, c.matrices.tray);
      this.matrix(c.tray.rods, c.matrices.tray); this.matrix(c.tray.sheets, c.matrices.tray);
      this.matrix(c.lid.rods, c.matrices.lid); this.matrix(c.lid.sheets, c.matrices.lid);
      this.matrix(c.trayHit, c.matrices.tray);
      this.hitMatrix.copy(c.matrices.lid).multiply(this.hitOffset); this.matrix(c.lidHit, this.hitMatrix);
      c.disc.material.uniforms.uFade.value = moving.pose.fade;
      c.booklet.mesh.material.uniforms.uFade.value = moving.pose.fade;
      c.spine.mesh.material.uniforms.uFade.value = moving.pose.fade;
      c.inlay.mesh.material.uniforms.uFade.value = moving.pose.fade;
      c.tray.rods.material.uniforms.uFade.value = moving.pose.fade; c.tray.sheets.material.uniforms.uFade.value = moving.pose.fade;
      c.lid.rods.material.uniforms.uFade.value = moving.pose.fade; c.lid.sheets.material.uniforms.uFade.value = moving.pose.fade;
      this.inverseCases[i].copy(c.matrices.tray).invert(); this.inverseLids[i].copy(c.matrices.lid).invert();
      const scale = this.point.setFromMatrixScale(c.matrices.tray).x;
      const dark = disc.base === 'vinyl' ? 0.3 : disc.base === 'gold' || disc.base === 'holo' ? 0.24 : 0.2;
      this.shadowCases[i].set(moving.pose.fade, scale, dark, 7.5);
      c.tray.depth = this.centre.set(0, 0, -1).applyMatrix4(c.matrices.tray).applyMatrix4(this.camera.matrixWorldInverse).z;
      c.lid.depth = this.centre.set(0, 0, 4).applyMatrix4(c.matrices.lid).applyMatrix4(this.camera.matrixWorldInverse).z;
      this.ordered[this.groupCount++] = c.tray; this.ordered[this.groupCount++] = c.lid;
    }
    // Four entries at most; insertion sort needs no temporary arrays or callbacks.
    for (let i = 1; i < this.groupCount; i++) {
      const group = this.ordered[i]; let j = i - 1;
      while (j >= 0 && this.ordered[j].depth > group.depth) { this.ordered[j + 1] = this.ordered[j]; j--; }
      this.ordered[j + 1] = group;
    }
    this.bounds();
  }
  private bounds(): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < this.groupCount; i++) for (let corner = 0; corner < 8; corner++) {
      const spec = CASE_SPECS[this.kind];
      const hw = this.kind === 'jewel' ? 74 : spec.width / 2 + 3;
      const hh = this.kind === 'jewel' ? 65 : spec.height / 2 + 3;
      const hz = this.kind === 'jewel' ? 7 : spec.depth / 2 + 2;
      this.point.set(corner & 1 ? hw : -hw, corner & 2 ? hh : -hh, corner & 4 ? hz : -hz)
        .applyMatrix4(this.ordered[i].matrix).project(this.camera);
      minX = Math.min(minX, this.point.x); minY = Math.min(minY, this.point.y);
      maxX = Math.max(maxX, this.point.x); maxY = Math.max(maxY, this.point.y);
    }
    const padX = (maxX - minX) * 0.04 + 0.04, padY = (maxY - minY) * 0.04 + 0.04;
    this.rx = Math.max(0, Math.floor((minX - padX + 1) * 0.5 * this.width));
    this.ry = Math.max(0, Math.floor((minY - padY + 1) * 0.5 * this.height));
    const right = Math.min(this.width, Math.ceil((maxX + padX + 1) * 0.5 * this.width));
    const top = Math.min(this.height, Math.ceil((maxY + padY + 1) * 0.5 * this.height));
    this.rw = Math.max(0, right - this.rx); this.rh = Math.max(0, top - this.ry);
    if (!this.rw || !this.rh) this.rect.set(2, 2, 2, 2);
    else this.rect.set(this.rx / this.width, this.ry / this.height, right / this.width, top / this.height);
  }
  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.renderer.setRenderTarget(target); this.screenMesh.material = material;
    this.renderer.render(this.screen, this.screenCamera);
  }
  render(): void {
    const renderer = this.renderer;
    renderer.setRenderTarget(this.rtOpaque); renderer.clear(); renderer.render(this.opaque, this.camera);
    let previous = this.rtOpaque;
    if (this.rw && this.rh) for (let i = 0; i < this.groupCount; i++) {
      const group = this.ordered[i], target = this.rtPlastic[i % 2];
      target.scissor.set(this.rx, this.ry, this.rw, this.rh); target.scissorTest = true;
      renderer.setRenderTarget(target); renderer.clear();
      this.copy.uniforms.uInput.value = previous.texture; this.pass(this.copy, target);
      group.rods.material.uniforms.uBehind.value = previous.texture;
      group.rods.visible = true; group.sheets.visible = true;
      renderer.render(this.plastic, this.camera);
      group.rods.visible = false; group.sheets.visible = false;
      previous = target;
    }
    this.composite.uniforms.uPicture.value = previous.texture;
    this.pass(this.composite, null);
  }
  dispose(): void {
    this.studio.dispose(); this.banner?.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.rtOpaque.dispose(); this.rtPlastic[0].dispose(); this.rtPlastic[1].dispose();
    this.opaque.clear(); this.plastic.clear(); this.screen.clear(); this.hitPlanes.length = 0;
  }
}
