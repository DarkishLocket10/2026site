import * as THREE from 'three';
import { fullVert, studioFrag } from './shaders';

export function pictureFormat(renderer: THREE.WebGLRenderer): THREE.TextureDataType {
  return renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')
    ? THREE.HalfFloatType : THREE.UnsignedByteType;
}

/** A small procedural softbox stage without point-light impulses. */
export class Studio {
  readonly target: THREE.WebGLCubeRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLCubeRenderTarget(512, {
      type: pictureFormat(renderer), format: THREE.RGBAFormat,
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter, depthBuffer: false,
    });
    this.target.texture.name = 'CD procedural studio';
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: fullVert, fragmentShader: studioFrag,
      uniforms: { uFace: { value: 0 }, uSize: { value: 512 } },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false; this.scene.add(mesh);
  }
  render(): void {
    const renderer = this.renderer, previous = renderer.getRenderTarget();
    renderer.compile(this.scene, this.camera);
    // Generate mipmaps only once all six faces are complete.
    this.target.texture.generateMipmaps = false;
    for (let face = 0; face < 6; face++) {
      if (face === 5) this.target.texture.generateMipmaps = true;
      this.material.uniforms.uFace.value = face;
      renderer.setRenderTarget(this.target, face);
      renderer.clear(); renderer.render(this.scene, this.camera);
    }
    renderer.setRenderTarget(previous);
  }
  dispose(): void { this.geometry.dispose(); this.material.dispose(); this.target.dispose(); }
}
