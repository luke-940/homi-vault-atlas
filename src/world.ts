import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { ProjectId } from "./content";

export const anchors: Record<ProjectId, [number, number, number]> = {
  rocket: [-8, 0, -4],
  groot: [6, 0, -1],
  common: [-7, 0, 7],
  atlas: [2, 0, 7],
};
type Options = {
  onReady: () => void;
  onError: (reason: string) => void;
  onSelect: (id: ProjectId) => void;
  onProject: (
    positions: Record<string, { x: number; y: number; visible: boolean }>,
  ) => void;
};
const waterVertex = `varying vec3 vWorld; uniform float uTime; void main(){vec3 p=position; p.y+=sin(p.x*.35+uTime*.22)*.025+sin(p.z*.41-uTime*.17)*.018; vec4 w=modelMatrix*vec4(p,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const waterFragment = `precision highp float; varying vec3 vWorld; uniform float uTime; uniform vec3 uCamera;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float swell(vec2 p){return noise(p*.38)*.5+noise(p*1.5)*.25+noise(p*5.0)*.125;}
void main(){vec2 p=vWorld.xz;float t=uTime*.05;float n=swell(p+vec2(t,-t*.7));float a=swell(p+vec2(.05,0)+vec2(t,-t*.7));float b=swell(p+vec2(0,.05)+vec2(t,-t*.7));vec3 normal=normalize(vec3((n-a)*8.,1.,(n-b)*8.));vec3 V=normalize(uCamera-vWorld);float fr=pow(1.-max(dot(V,normal),0.),3.);vec3 col=mix(vec3(.018,.13,.15),vec3(.065,.30,.31),n);col=mix(col,vec3(.29,.42,.40),fr*.5);vec3 H=normalize(normalize(vec3(-.6,1.,-.4))+V);float s=pow(max(dot(normal,H),0.),150.);col+=vec3(.65,.7,.51)*s*.25;float lines=pow(max(0.,sin(p.x*6.+p.y*2.+n*18.+t*3.)),20.);col+=vec3(.08,.19,.18)*lines*.04;float fog=1.-exp(-length(p)*.012);col=mix(col,vec3(.035,.14,.16),fog);gl_FragColor=vec4(col,1.);}`;

export class AtlasWorld {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(37, 1, 0.1, 220);
  controls: OrbitControls;
  model: THREE.Group | null = null;
  private observer: ResizeObserver;
  private composer: EffectComposer;
  private ao: SSAOPass;
  private output: OutputPass;
  private frame = 0;
  private disposed = false;
  private reduced = false;
  private paused = false;
  private quality: "high" | "low" = "high";
  private water: THREE.Mesh;
  private started = performance.now();
  private destination: {
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null = null;
  private raycaster = new THREE.Raycaster();
  private pointerDown: { x: number; y: number } | null = null;
  private envTarget: THREE.WebGLRenderTarget;
  private last = performance.now();
  private lastRender = 0;
  private contextLost = false;
  private samples: number[] = [];
  private options: Options;
  private host: HTMLElement;
  private sun: THREE.DirectionalLight;
  constructor(host: HTMLElement, options: Options) {
    this.host = host;
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.setClearColor("#0b343b");
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.35;
    room.dispose();
    pmrem.dispose();
    this.scene.fog = new THREE.FogExp2("#123c40", 0.006);
    this.scene.add(new THREE.HemisphereLight("#cee9df", "#364d49", 1.25));
    this.sun = new THREE.DirectionalLight("#ffe4b5", 2.5);
    this.sun.position.set(-18, 28, -12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -24,
      right: 24,
      top: 24,
      bottom: -24,
      near: 1,
      far: 90,
    });
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const fill = new THREE.DirectionalLight("#88c9d0", 0.65);
    fill.position.set(18, 9, 16);
    this.scene.add(fill);
    const waterGeometry = new THREE.PlaneGeometry(180, 180, 96, 96);
    waterGeometry.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      waterGeometry,
      new THREE.ShaderMaterial({
        vertexShader: waterVertex,
        fragmentShader: waterFragment,
        uniforms: {
          uTime: { value: 0 },
          uCamera: { value: this.camera.position },
        },
      }),
    );
    this.water.position.y = -0.25;
    this.scene.add(this.water);
    this.camera.position.set(
      host.clientWidth < 700 ? 23 : 12,
      host.clientWidth < 700 ? 30 : 18,
      host.clientWidth < 700 ? 35 : 24,
    );
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(-1, 0.5, 2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 57;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.15;
    this.controls.rotateSpeed = 0.45;
    this.controls.zoomSpeed = 0.7;
    this.controls.addEventListener("start", () => {
      this.destination = null;
    });
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new SSAOPass(this.scene, this.camera, 512, 512, 16);
    this.ao.kernelRadius = 2.2;
    this.ao.minDistance = 0.0004;
    this.ao.maxDistance = 0.025;
    this.composer.addPass(this.ao);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.renderer.info.autoReset = false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener("pointerdown", this.onDown);
    this.renderer.domElement.addEventListener("pointerup", this.onUp);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    new GLTFLoader().load(
      "./assets/atlas-world.glb",
      (gltf) => {
        if (this.disposed) {
          this.disposeObject(gltf.scene);
          return;
        }
        this.model = gltf.scene;
        this.model.traverse((o: any) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.scene.add(this.model);
        options.onReady();
      },
      undefined,
      () =>
        options.onError(
          "3D 장면을 불러오지 못했습니다. 아래의 프로젝트에서 같은 자료를 읽을 수 있습니다.",
        ),
    );
    this.animate();
  }
  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    if (width > 900) {
      this.camera.setViewOffset(
        width,
        height,
        -width * 0.08,
        height * 0.03,
        width,
        height,
      );
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(width, height);
  }
  private onDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };
  private onUp = (e: PointerEvent) => {
    const d = this.pointerDown;
    this.pointerDown = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7 || !this.model)
      return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = this.raycaster.intersectObject(this.model, true)[0];
    let o: THREE.Object3D | null | undefined = hit?.object;
    while (o) {
      if (o.name.startsWith("project_")) {
        const id = o.name.slice(8) as ProjectId;
        if (id in anchors) this.options.onSelect(id);
        return;
      }
      o = o.parent;
    }
  };
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.paused = true;
    this.options.onError(
      "3D 화면의 연결이 끊겼습니다. 프로젝트와 자료 읽기는 계속 사용할 수 있습니다.",
    );
  };
  focus(id?: ProjectId) {
    if (!id) {
      const mobile = this.host.clientWidth < 700;
      this.destination = {
        position: new THREE.Vector3(
          mobile ? 23 : 12,
          mobile ? 30 : 18,
          mobile ? 35 : 24,
        ),
        target: new THREE.Vector3(-1, 0.5, 2),
      };
    } else {
      const [x, , z] = anchors[id];
      const narrow = this.host.clientWidth < 550;
      this.destination = {
        position: new THREE.Vector3(
          x + (narrow ? 12 : 10),
          narrow ? 16 : 13,
          z + 16,
        ),
        target: new THREE.Vector3(x, 1.6, z),
      };
    }
    if (this.reduced && this.destination) {
      this.camera.position.copy(this.destination.position);
      this.controls.target.copy(this.destination.target);
      this.destination = null;
    }
  }
  setReduced(value: boolean) {
    this.reduced = value;
    if (value && this.destination) {
      this.camera.position.copy(this.destination.position);
      this.controls.target.copy(this.destination.target);
      this.destination = null;
    }
  }
  setPaused(value: boolean) {
    this.paused = value;
  }
  setQuality(value: "high" | "low") {
    this.quality = value;
    this.renderer.setPixelRatio(
      value === "low" ? 1 : Math.min(devicePixelRatio, 1.6),
    );
    this.renderer.shadowMap.enabled = value === "high";
    this.composer.setPixelRatio(
      value === "low" ? 1 : Math.min(devicePixelRatio, 1.6),
    );
    this.resize();
  }
  zoom(delta: number) {
    const offset = this.camera.position
      .clone()
      .sub(this.controls.target)
      .multiplyScalar(delta);
    if (offset.length() >= 10 && offset.length() <= 57) {
      this.camera.position.copy(this.controls.target).add(offset);
      this.destination = null;
    }
  }
  private animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (document.hidden || this.contextLost) return;
    if (this.destination) {
      const t = 1 - Math.exp(-dt * 5);
      this.camera.position.lerp(this.destination.position, t);
      this.controls.target.lerp(this.destination.target, t);
      if (this.camera.position.distanceTo(this.destination.position) < 0.02)
        this.destination = null;
    }
    this.controls.update();
    if (!this.reduced && !this.paused)
      (this.water.material as THREE.ShaderMaterial).uniforms.uTime.value =
        (now - this.started) / 1000;
    const renderInterval = this.destination
      ? 1000 / 60
      : this.paused || this.reduced
        ? 1000 / 15
        : this.quality === "low"
          ? 1000 / 24
          : 1000 / 40;
    if (now - this.lastRender < renderInterval) return;
    const renderMs = this.lastRender ? now - this.lastRender : 0;
    this.lastRender = now;
    this.renderer.info.reset();
    if (this.quality === "high") this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    const positions: Record<
      string,
      { x: number; y: number; visible: boolean }
    > = {};
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    for (const [id, a] of Object.entries(anchors)) {
      const v = new THREE.Vector3(...a).project(this.camera);
      positions[id] = {
        x: (v.x * 0.5 + 0.5) * w,
        y: (-0.5 * v.y + 0.5) * h,
        visible:
          v.z < 1 && v.x > -0.95 && v.x < 0.95 && v.y > -0.95 && v.y < 0.95,
      };
    }
    this.options.onProject(positions);
    if (this.model && renderMs > 0) this.samples.push(renderMs);
    if (this.samples.length > 180) this.samples.shift();
    (window as any).__ATLAS_DIAGNOSTICS__ = {
      loaded: !!this.model,
      quality: this.quality,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      frameMs: this.samples.length
        ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length
        : null,
      camera: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
  };
  private disposeObject(o: THREE.Object3D) {
    const materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    o.traverse((n: any) => {
      n.geometry?.dispose();
      for (const m of Array.isArray(n.material) ? n.material : [n.material])
        if (m) materials.add(m);
    });
    for (const m of materials) {
      for (const v of Object.values(m))
        if (v instanceof THREE.Texture) textures.add(v);
      m.dispose();
    }
    for (const t of textures) {
      t.dispose();
      (t.source?.data as any)?.close?.();
    }
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onUp);
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    this.disposeObject(this.scene);
    this.envTarget.dispose();
    this.sun.shadow.map?.dispose();
    this.ao.dispose();
    this.output.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
