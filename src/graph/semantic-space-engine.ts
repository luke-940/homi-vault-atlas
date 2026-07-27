import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  FogExp2,
  GridHelper,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  Points,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type {
  AuthoredCamera,
  SemanticSpaceCallbacks,
  SemanticSpaceController,
  SemanticSpaceDebugCounters,
  SemanticSpaceEdge,
  SemanticSpaceEvidenceMark,
  SemanticSpaceLabelAnchor,
  SemanticSpaceNode,
  SemanticSpaceScene,
} from "./semantic-space-contract";

type MeshBucket = {
  mesh: InstancedMesh;
  ids: string[];
};

type EdgeGeometryState = {
  lines: LineSegments;
  arrows: InstancedMesh;
  edges: SemanticSpaceEdge[];
  lineColors: BufferAttribute;
  lineSegmentsPerEdge: number;
};

const MAX_DPR = 1.5;
const EDGE_SEGMENTS = 16;
const UP = new Vector3(0, 1, 0);
const HIDDEN_COLOR = new Color(0x000000);
const EDGE_COLOR = new Color(0x9ab5c6);
const EDGE_FOCUS_COLOR = new Color(0xefb760);
const PATH_COLOR = new Color(0xf2c983);
const CORRIDOR_COLOR = new Color(0x789aae);
const tmpObject = new Object3D();
const tmpColor = new Color();
const tmpQuaternion = new Quaternion();
const tmpMatrix = new Matrix4();

function geometryKind(node: SemanticSpaceNode) {
  if (node.kind === "moc_hub") return "moc";
  if (node.kind === "paper_gateway") return "paper";
  if (node.kind === "signal_domain" || node.kind === "signal_storyline") return "signal";
  if (node.kind === "project" || node.kind === "project_stage") return "project";
  if (node.kind === "district") return "district";
  if (node.kind === "aggregate_boundary") return "aggregate";
  return "knowledge";
}

function geometryFor(kind: string) {
  if (kind === "paper") return new OctahedronGeometry(1, 0);
  return new SphereGeometry(1, kind === "aggregate" ? 10 : 18, kind === "aggregate" ? 7 : 12);
}

function baseMaterial(kind: string) {
  return new ShaderMaterial({
    transparent: kind === "district" || kind === "aggregate",
    depthWrite: kind !== "district",
    uniforms: {
      uOpacity: {
        value: kind === "district" ? 0.8 : kind === "aggregate" ? 0.54 : 0.98,
      },
    },
    vertexShader: `
      varying vec3 vSemanticColor;
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;
      void main() {
        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 viewPosition = viewMatrix * worldPosition;
        vSemanticColor = instanceColor;
        vViewNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      #include <common>
      uniform float uOpacity;
      varying vec3 vSemanticColor;
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;
      void main() {
        vec3 normal = normalize(vViewNormal);
        vec3 key = normalize(vec3(-0.38, 0.58, 0.72));
        float diffuse = max(dot(normal, key), 0.0);
        float hemisphere = normal.y * 0.5 + 0.5;
        float facing = max(dot(normal, normalize(vViewDirection)), 0.0);
        float core = pow(facing, 2.4);
        float rim = pow(1.0 - facing, 3.6);
        vec3 matte = vSemanticColor * (0.82 + diffuse * 0.12 + hemisphere * 0.05);
        vec3 warmCore = mix(vSemanticColor, vec3(1.0, 0.91, 0.77), 0.14) * core * 0.14;
        vec3 edgeLight = mix(vSemanticColor, vec3(0.98, 0.86, 0.68), 0.08) * rim * 0.035;
        gl_FragColor = vec4(matte + warmCore + edgeLight, uOpacity);
        #include <colorspace_fragment>
      }
    `,
  });
}

function cameraPosition(camera: AuthoredCamera) {
  const horizontal = Math.cos(camera.pitch) * camera.distance;
  return new Vector3(
    camera.target[0] + Math.sin(camera.yaw) * horizontal,
    camera.target[1] + Math.sin(camera.pitch) * camera.distance,
    camera.target[2] + Math.cos(camera.yaw) * horizontal,
  );
}

function edgeRouteBias(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}

function edgeCurve(source: Vector3, target: Vector3, edge: SemanticSpaceEdge) {
  const delta = target.clone().sub(source);
  const length = Math.max(1, delta.length());
  const routeBias = edgeRouteBias(edge.id);
  const normal = new Vector3(-delta.z, 0, delta.x);
  if (normal.lengthSq() < 0.0001) normal.set(1, 0, 0);
  normal.normalize().multiplyScalar(routeBias < 0 ? -1 : 1);
  const bend = edge.semanticKind === "district_corridor"
    ? Math.min(124, length * 0.24)
    : edge.semanticKind === "directed_path"
      ? Math.min(86, length * 0.16)
      : Math.min(78, length * (0.09 + Math.abs(routeBias) * 0.06));
  const lift = Math.min(92, 22 + length * (0.08 + Math.abs(routeBias) * 0.035));
  const controlA = source.clone()
    .lerp(target, 0.31)
    .addScaledVector(normal, bend)
    .add(new Vector3(0, lift, 0));
  const controlB = source.clone()
    .lerp(target, 0.69)
    .addScaledVector(normal, bend * 0.72)
    .add(new Vector3(0, lift * 0.78, 0));
  const points: Vector3[] = [];
  for (let index = 0; index <= EDGE_SEGMENTS; index += 1) {
    const t = index / EDGE_SEGMENTS;
    const inverse = 1 - t;
    points.push(source.clone().multiplyScalar(inverse * inverse * inverse)
      .add(controlA.clone().multiplyScalar(3 * inverse * inverse * t))
      .add(controlB.clone().multiplyScalar(3 * inverse * t * t))
      .add(target.clone().multiplyScalar(t * t * t)));
  }
  return points;
}

function publicDebug(debug: SemanticSpaceDebugCounters) {
  return { ...debug };
}

export class SemanticSpaceEngine implements SemanticSpaceController {
  private container: HTMLElement;
  private callbacks: SemanticSpaceCallbacks;
  private renderer: WebGLRenderer;
  private scene3d = new Scene();
  private camera = new PerspectiveCamera(42, 1, 1, 8_000);
  private controls: OrbitControls;
  private authoredCamera: AuthoredCamera;
  private authoredCameraPosition: Vector3;
  private nodeById = new Map<string, SemanticSpaceNode>();
  private positionById = new Map<string, Vector3>();
  private buckets: MeshBucket[] = [];
  private nodeHitMap = new Map<InstancedMesh, string[]>();
  private edgeState: EdgeGeometryState | null = null;
  private haloPoints: Points | null = null;
  private haloAlpha: BufferAttribute | null = null;
  private haloColors: BufferAttribute | null = null;
  private evidencePoints: Points | null = null;
  private evidenceAlpha: BufferAttribute | null = null;
  private orientationGrid: GridHelper;
  private labelIds: string[] = [];
  private currentScene: SemanticSpaceScene;
  private previewId: string | null = null;
  private focusId: string | null = null;
  private hoveredId: string | null = null;
  private visible = true;
  private disposed = false;
  private frame = 0;
  private pendingPointerFrame = 0;
  private pointer = new Vector2();
  private raycaster = new Raycaster();
  private occlusionRaycaster = new Raycaster();
  private settleUntil = 0;
  private pointerDown: { x: number; y: number; moved: boolean } | null = null;
  private focusAnimation: {
    started: number;
    duration: number;
    fromPosition: Vector3;
    fromTarget: Vector3;
    toPosition: Vector3;
    toTarget: Vector3;
  } | null = null;
  private debugState: SemanticSpaceDebugCounters = {
    frames: 0,
    sceneBuilds: 0,
    materialUpdates: 0,
    raycasts: 0,
    previewCommits: 0,
    cameraMoves: 0,
    drawCalls: 0,
    visibleNodes: 0,
    visibleEdges: 0,
    idle: true,
    cameraPosition: [0, 0, 0],
    cameraTarget: [0, 0, 0],
    previewId: null,
    focusId: null,
  };

  constructor(container: HTMLElement, scene: SemanticSpaceScene, callbacks: SemanticSpaceCallbacks) {
    this.container = container;
    this.currentScene = scene;
    this.callbacks = callbacks;
    this.authoredCamera = scene.camera;
    this.authoredCameraPosition = cameraPosition(scene.camera);
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.className = "semantic-space-webgl";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.append(this.renderer.domElement);

    this.scene3d.fog = new FogExp2(0x08090d, 0.00016);
    this.orientationGrid = new GridHelper(1_360, 28, 0x3a2d1d, 0x1d2020);
    this.orientationGrid.position.set(26, -268, 112);
    const gridMaterials = Array.isArray(this.orientationGrid.material)
      ? this.orientationGrid.material
      : [this.orientationGrid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.13;
      material.depthWrite = false;
    }
    this.scene3d.add(this.orientationGrid);

    this.camera.position.copy(this.authoredCameraPosition);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.62;
    this.controls.minDistance = scene.camera.minDistance;
    this.controls.maxDistance = scene.camera.maxDistance;
    this.controls.minAzimuthAngle = scene.camera.yaw - (55 * Math.PI / 180);
    this.controls.maxAzimuthAngle = scene.camera.yaw + (55 * Math.PI / 180);
    const polar = Math.PI / 2 - scene.camera.pitch;
    this.controls.minPolarAngle = Math.max(0.16, polar - (30 * Math.PI / 180));
    this.controls.maxPolarAngle = Math.min(Math.PI - 0.16, polar + (30 * Math.PI / 180));
    this.controls.target.set(...scene.camera.target);
    this.controls.update();
    this.installEvents();
    this.rebuild(scene);
    this.resize(container.clientWidth || 1, container.clientHeight || 1, window.devicePixelRatio || 1);
    queueMicrotask(() => callbacks.onReady());
  }

  private installEvents() {
    const canvas = this.renderer.domElement;
    this.controls.addEventListener("start", () => {
      this.pointerDown = null;
      this.settleUntil = performance.now() + 700;
      this.schedule();
    });
    this.controls.addEventListener("change", () => {
      this.debugState.cameraMoves += 1;
      this.settleUntil = performance.now() + 460;
      this.schedule();
    });
    this.controls.addEventListener("end", () => {
      this.settleUntil = performance.now() + 460;
      this.schedule();
    });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
  }

  private removeEvents() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerCancel);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.visible = false;
    this.cancelFrame();
    this.callbacks.onContextLost();
  };

  private onPointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY, moved: false };
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.pointerDown
      && Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > 4) {
      this.pointerDown.moved = true;
    }
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
      -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1,
    );
    if (this.pendingPointerFrame) return;
    this.pendingPointerFrame = requestAnimationFrame(() => {
      this.pendingPointerFrame = 0;
      this.updateHoverFromRaycast();
    });
  };

  private onPointerUp = () => {
    if (this.pointerDown && !this.pointerDown.moved && this.hoveredId) {
      this.callbacks.onCommit(this.hoveredId);
    }
    this.pointerDown = null;
  };

  private onPointerCancel = () => {
    this.pointerDown = null;
  };

  private onPointerLeave = () => {
    this.pointerDown = null;
    if (this.hoveredId !== null) {
      this.hoveredId = null;
      this.previewId = null;
      this.debugState.previewCommits += 1;
      this.callbacks.onPreview(null);
      this.updateInteractionMaterials();
    }
  };

  private updateHoverFromRaycast() {
    if (!this.visible || this.disposed) return;
    this.debugState.raycasts += 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.buckets.map((bucket) => bucket.mesh), false);
    let next: string | null = null;
    for (const hit of hits) {
      if (!(hit.object instanceof InstancedMesh) || hit.instanceId === undefined) continue;
      next = this.nodeHitMap.get(hit.object)?.[hit.instanceId] ?? null;
      if (next) break;
    }
    if (next === this.hoveredId) return;
    this.hoveredId = next;
    this.previewId = next;
    this.debugState.previewCommits += 1;
    this.callbacks.onPreview(next);
    this.updateInteractionMaterials();
  }

  private clearObjects() {
    for (const bucket of this.buckets) {
      this.scene3d.remove(bucket.mesh);
      bucket.mesh.geometry.dispose();
      (bucket.mesh.material as ShaderMaterial).dispose();
    }
    this.buckets = [];
    this.nodeHitMap.clear();
    if (this.edgeState) {
      this.scene3d.remove(this.edgeState.lines, this.edgeState.arrows);
      this.edgeState.lines.geometry.dispose();
      (this.edgeState.lines.material as LineBasicMaterial).dispose();
      this.edgeState.arrows.geometry.dispose();
      (this.edgeState.arrows.material as MeshBasicMaterial).dispose();
      this.edgeState = null;
    }
    if (this.haloPoints) {
      this.scene3d.remove(this.haloPoints);
      this.haloPoints.geometry.dispose();
      (this.haloPoints.material as ShaderMaterial).dispose();
      this.haloPoints = null;
      this.haloAlpha = null;
      this.haloColors = null;
    }
    if (this.evidencePoints) {
      this.scene3d.remove(this.evidencePoints);
      this.evidencePoints.geometry.dispose();
      (this.evidencePoints.material as ShaderMaterial).dispose();
      this.evidencePoints = null;
      this.evidenceAlpha = null;
    }
  }

  private rebuild(scene: SemanticSpaceScene) {
    this.clearObjects();
    this.debugState.sceneBuilds += 1;
    this.currentScene = scene;
    this.nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
    this.positionById = new Map(scene.nodes.map((node) => [node.id, new Vector3(...node.position)]));
    this.labelIds = scene.labelIds;
    this.previewId = scene.previewId;
    this.focusId = scene.focusId;
    const grouped = new Map<string, SemanticSpaceNode[]>();
    for (const node of scene.nodes) {
      const kind = geometryKind(node);
      const group = grouped.get(kind) ?? [];
      group.push(node);
      grouped.set(kind, group);
    }
    for (const [kind, nodes] of grouped) {
      const geometry = geometryFor(kind);
      const mesh = new InstancedMesh(geometry, baseMaterial(kind), nodes.length);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      nodes.forEach((node, index) => {
        const scale = kind === "paper"
            ? new Vector3(node.radius * 0.84, node.radius * 1.2, node.radius * 0.64)
            : kind === "project"
              ? new Vector3(node.radius * 1.18, node.radius * 0.72, node.radius * 0.58)
            : kind === "district"
              ? new Vector3(node.radius, node.radius * 0.94, node.radius)
              : kind === "aggregate"
                ? new Vector3(node.radius * 0.68, node.radius * 0.68, node.radius * 0.68)
              : new Vector3(node.radius, node.radius, node.radius);
        const rotationSeed = edgeRouteBias(node.id);
        tmpObject.position.set(...node.position);
        tmpObject.scale.copy(scale);
        tmpObject.rotation.set(
          kind === "district" || kind === "signal" || kind === "moc" || kind === "knowledge"
            ? 0
            : rotationSeed * 0.28,
          (index * 0.618 + rotationSeed * 0.4) % Math.PI,
          kind === "paper" || kind === "project" ? rotationSeed * 0.16 : 0,
        );
        tmpObject.updateMatrix();
        mesh.setMatrixAt(index, tmpObject.matrix);
        const authoredColor = new Color(node.color).multiplyScalar(
          kind === "aggregate" ? 0.58 : kind === "district" ? 0.96 : 1.02,
        );
        mesh.setColorAt(index, authoredColor);
      });
      mesh.instanceColor?.setUsage(DynamicDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene3d.add(mesh);
      const ids = nodes.map((node) => node.id);
      this.buckets.push({ mesh, ids });
      this.nodeHitMap.set(mesh, ids);
    }
    this.buildHalos(scene.nodes);
    this.buildEvidenceMarks(scene.evidenceMarks);
    this.buildEdges(scene.edges);
    this.updateInteractionMaterials();
    this.debugState.visibleNodes = scene.nodes.length;
    this.schedule();
  }

  private buildHalos(nodes: SemanticSpaceNode[]) {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(nodes.length * 3);
    const colors = new Float32Array(nodes.length * 3);
    const sizes = new Float32Array(nodes.length);
    const alpha = new Float32Array(nodes.length);
    const ring = new Float32Array(nodes.length);
    nodes.forEach((node, index) => {
      positions.set(node.position, index * 3);
      const color = new Color(node.color);
      colors.set([color.r, color.g, color.b], index * 3);
      sizes[index] = Math.max(36, Math.min(220, node.halo * 4.1));
      alpha[index] = node.kind === "aggregate_boundary" ? 0.22 : 0.7;
      ring[index] = node.kind === "district" ? 1 : node.kind === "moc_hub" ? 0.62 : 0;
    });
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const colorAttribute = new BufferAttribute(colors, 3);
    const alphaAttribute = new BufferAttribute(alpha, 1);
    colorAttribute.setUsage(DynamicDrawUsage);
    alphaAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute("color", colorAttribute);
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", alphaAttribute);
    geometry.setAttribute("aRing", new BufferAttribute(ring, 1));
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aRing;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRing;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vRing = aRing;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (540.0 / max(260.0, -mvPosition.z)), 16.0, 220.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRing;
        void main() {
          float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
          float normalizedRadius = distanceFromCenter * 2.0;
          float aura = smoothstep(1.0, 0.02, normalizedRadius);
          float core = smoothstep(0.24, 0.0, normalizedRadius);
          float ringBand = 1.0 - smoothstep(0.024, 0.055, abs(normalizedRadius - 0.3));
          float innerRing = 1.0 - smoothstep(0.02, 0.05, abs(normalizedRadius - 0.17));
          float opacity = (
            aura * 0.27
            + core * 0.16
            + ringBand * vRing * 0.42
            + innerRing * vRing * 0.12
          ) * vAlpha;
          gl_FragColor = vec4(vColor, opacity);
        }
      `,
    });
    this.haloPoints = new Points(geometry, material);
    this.haloPoints.frustumCulled = false;
    this.haloAlpha = alphaAttribute;
    this.haloColors = colorAttribute;
    this.scene3d.add(this.haloPoints);
  }

  private buildEvidenceMarks(marks: SemanticSpaceEvidenceMark[]) {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(marks.length * 3);
    const colors = new Float32Array(marks.length * 3);
    const sizes = new Float32Array(marks.length);
    const alpha = new Float32Array(marks.length);
    marks.forEach((mark, index) => {
      positions.set(mark.position, index * 3);
      const color = new Color(mark.color);
      colors.set([color.r, color.g, color.b], index * 3);
      sizes[index] = mark.size;
      alpha[index] = mark.opacity;
    });
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
    const alphaAttribute = new BufferAttribute(alpha, 1);
    alphaAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aAlpha", alphaAttribute);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (980.0 / max(260.0, -mvPosition.z)), 1.6, 8.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float core = smoothstep(0.5, 0.06, d);
          gl_FragColor = vec4(vColor, core * vAlpha);
        }
      `,
    });
    this.evidencePoints = new Points(geometry, material);
    this.evidencePoints.frustumCulled = false;
    this.evidenceAlpha = alphaAttribute;
    this.scene3d.add(this.evidencePoints);
  }

  private buildEdges(edges: SemanticSpaceEdge[]) {
    const linePositions = new Float32Array(edges.length * EDGE_SEGMENTS * 2 * 3);
    const lineColors = new Float32Array(linePositions.length);
    const arrowGeometry = new ConeGeometry(1, 4, 7);
    arrowGeometry.translate(0, 2, 0);
    const arrowMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    const arrows = new InstancedMesh(arrowGeometry, arrowMaterial, edges.length);
    arrows.instanceMatrix.setUsage(DynamicDrawUsage);
    const positionById = this.positionById;
    edges.forEach((edge, edgeIndex) => {
      const source = positionById.get(edge.sourceId);
      const target = positionById.get(edge.targetId);
      if (!source || !target) return;
      const points = edgeCurve(source, target, edge);
      for (let segment = 0; segment < EDGE_SEGMENTS; segment += 1) {
        const offset = (edgeIndex * EDGE_SEGMENTS + segment) * 6;
        linePositions.set(points[segment].toArray(), offset);
        linePositions.set(points[segment + 1].toArray(), offset + 3);
      }
      const end = points[points.length - 1];
      const beforeEnd = points[points.length - 2];
      const direction = end.clone().sub(beforeEnd).normalize();
      tmpQuaternion.setFromUnitVectors(UP, direction);
      const scale = Math.max(1.35, Math.min(3.6, 1.05 + Math.sqrt(edge.weight) * 0.34));
      tmpMatrix.compose(end, tmpQuaternion, new Vector3(scale, scale * 1.24, scale));
      arrows.setMatrixAt(edgeIndex, tmpMatrix);
      arrows.setColorAt(edgeIndex, HIDDEN_COLOR);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(linePositions, 3));
    const lineColorAttribute = new BufferAttribute(lineColors, 3);
    lineColorAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute("color", lineColorAttribute);
    const lines = new LineSegments(geometry, new LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: AdditiveBlending,
    }));
    lines.frustumCulled = false;
    arrows.frustumCulled = false;
    arrows.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
    this.scene3d.add(lines, arrows);
    this.edgeState = {
      lines,
      arrows,
      edges,
      lineColors: lineColorAttribute,
      lineSegmentsPerEdge: EDGE_SEGMENTS,
    };
  }

  private visibleEdgeIds(activeId: string | null) {
    if (!this.edgeState) return new Set<string>();
    if (!activeId) {
      return new Set(this.edgeState.edges.filter((edge) => edge.defaultVisible).map((edge) => edge.id));
    }
    const activeNode = this.nodeById.get(activeId);
    if (activeNode?.kind === "district") {
      return new Set(this.edgeState.edges
        .filter((edge) => {
          const source = this.nodeById.get(edge.sourceId);
          const target = this.nodeById.get(edge.targetId);
          return edge.semanticKind === "exact_reference"
            && (source?.clusterId === activeNode.clusterId || target?.clusterId === activeNode.clusterId);
        })
        .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id, "en"))
        .slice(0, 12)
        .map((edge) => edge.id));
    }
    const incoming = this.edgeState.edges
      .filter((edge) => edge.targetId === activeId && edge.semanticKind === "exact_reference")
      .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id, "en"))
      .slice(0, 6);
    const outgoing = this.edgeState.edges
      .filter((edge) => edge.sourceId === activeId && edge.semanticKind === "exact_reference")
      .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id, "en"))
      .slice(0, 6);
    return new Set([...incoming, ...outgoing].map((edge) => edge.id));
  }

  private updateInteractionMaterials() {
    const activeId = this.previewId ?? this.focusId;
    const visibleEdgeIds = this.visibleEdgeIds(activeId);
    const neighborIds = new Set<string>();
    if (this.edgeState) {
      for (const edge of this.edgeState.edges) {
        if (!visibleEdgeIds.has(edge.id)) continue;
        neighborIds.add(edge.sourceId);
        neighborIds.add(edge.targetId);
      }
    }
    for (const bucket of this.buckets) {
      bucket.ids.forEach((id, index) => {
        const node = this.nodeById.get(id)!;
        const base = new Color(node.color);
        const baseStrength = node.kind === "aggregate_boundary"
          ? 0.64
          : node.kind === "district"
            ? 0.92
            : 1;
        if (activeId && id !== activeId && !neighborIds.has(id)) {
          base.multiplyScalar(0.1);
        } else if (id === activeId) {
          base.lerp(new Color(0xffd28b), 0.36).multiplyScalar(1.08);
        } else if (activeId && neighborIds.has(id)) {
          base.multiplyScalar(0.9);
        } else {
          base.multiplyScalar(baseStrength);
        }
        bucket.mesh.setColorAt(index, base);
      });
      if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
    }
    if (this.haloAlpha && this.haloColors) {
      const alpha = this.haloAlpha.array as Float32Array;
      const colors = this.haloColors.array as Float32Array;
      this.currentScene.nodes.forEach((node, index) => {
        const base = new Color(node.color);
        const isActive = node.id === activeId;
        const isNeighbor = neighborIds.has(node.id);
        alpha[index] = activeId
          ? isActive ? 0.94 : isNeighbor ? 0.58 : 0.035
          : node.kind === "aggregate_boundary" ? 0.2 : 0.56;
        if (isActive) base.lerp(new Color(0xffd28b), 0.52);
        colors.set([base.r, base.g, base.b], index * 3);
      });
      this.haloAlpha.needsUpdate = true;
      this.haloColors.needsUpdate = true;
    }
    if (this.evidenceAlpha) {
      const alpha = this.evidenceAlpha.array as Float32Array;
      this.currentScene.evidenceMarks.forEach((mark, index) => {
        const parentActive = mark.parentId === activeId;
        const sameCluster = activeId
          ? this.nodeById.get(activeId)?.clusterId === mark.clusterId
          : false;
        alpha[index] = activeId
          ? parentActive
            ? Math.min(0.78, mark.opacity * 1.55)
            : sameCluster
              ? mark.opacity * 0.66
              : mark.opacity * 0.08
          : mark.opacity;
      });
      this.evidenceAlpha.needsUpdate = true;
    }
    if (this.edgeState) {
      const colors = this.edgeState.lineColors.array as Float32Array;
      this.edgeState.edges.forEach((edge, edgeIndex) => {
        const visible = visibleEdgeIds.has(edge.id);
        const sourceColor = new Color(this.nodeById.get(edge.sourceId)?.color ?? "#9ab5c6");
        const targetColor = new Color(this.nodeById.get(edge.targetId)?.color ?? "#9ab5c6");
        const fixedColor = !visible
          ? HIDDEN_COLOR
          : edge.semanticKind === "directed_path"
            ? PATH_COLOR
            : activeId
              ? EDGE_FOCUS_COLOR
              : edge.semanticKind === "district_corridor"
                ? CORRIDOR_COLOR
                : null;
        const intensity = visible
          ? Math.min(1.34, 0.8 + Math.sqrt(Math.max(1, edge.weight)) * 0.07)
          : 1;
        for (let segment = 0; segment < this.edgeState!.lineSegmentsPerEdge; segment += 1) {
          const offset = (edgeIndex * this.edgeState!.lineSegmentsPerEdge + segment) * 6;
          const startT = segment / this.edgeState!.lineSegmentsPerEdge;
          const endT = (segment + 1) / this.edgeState!.lineSegmentsPerEdge;
          const startColor = fixedColor
            ? tmpColor.copy(fixedColor)
            : sourceColor.clone().lerp(targetColor, startT).lerp(EDGE_COLOR, 0.3);
          const endColor = fixedColor
            ? fixedColor
            : sourceColor.clone().lerp(targetColor, endT).lerp(EDGE_COLOR, 0.3);
          colors.set([
            startColor.r * intensity,
            startColor.g * intensity,
            startColor.b * intensity,
            endColor.r * intensity,
            endColor.g * intensity,
            endColor.b * intensity,
          ], offset);
        }
        const arrowColor = fixedColor ?? targetColor.lerp(EDGE_COLOR, 0.25);
        this.edgeState!.arrows.setColorAt(edgeIndex, arrowColor.clone().multiplyScalar(intensity));
      });
      this.edgeState.lineColors.needsUpdate = true;
      if (this.edgeState.arrows.instanceColor) this.edgeState.arrows.instanceColor.needsUpdate = true;
      this.debugState.visibleEdges = visibleEdgeIds.size;
    }
    this.debugState.materialUpdates += 1;
    this.callbacks.onDebug?.(publicDebug(this.debugState));
    this.schedule();
  }

  private moveCameraToFocus(id: string | null) {
    const target = id ? this.positionById.get(id) : null;
    const nextTarget = target?.clone() ?? new Vector3(...this.authoredCamera.target);
    const currentDirection = this.camera.position.clone().sub(this.controls.target).normalize();
    const authoredDistance = this.authoredCamera.distance;
    const distance = id
      ? Math.max(this.authoredCamera.minDistance, Math.min(this.authoredCamera.maxDistance, authoredDistance * 0.82))
      : authoredDistance;
    if (id && this.currentScene.presentation === "home") {
      // The editorial rail occupies the left side of Home. Keep a committed
      // constellation inside the authored graph stage instead of centering it
      // under the headline.
      const screenRight = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
      const halfViewWidth = distance
        * Math.tan(MathUtils.degToRad(this.camera.fov * 0.5))
        * this.camera.aspect;
      nextTarget.addScaledVector(screenRight, -halfViewWidth * 0.38);
    }
    const nextPosition = nextTarget.clone().addScaledVector(
      id ? currentDirection : this.authoredCameraPosition.clone().sub(nextTarget).normalize(),
      distance,
    );
    if (this.currentScene.reducedMotion) {
      this.camera.position.copy(nextPosition);
      this.controls.target.copy(nextTarget);
      this.controls.update();
      this.schedule();
      return;
    }
    this.focusAnimation = {
      started: performance.now(),
      duration: 420,
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: nextPosition,
      toTarget: nextTarget,
    };
    this.schedule();
  }

  private updateCameraAnimation(now: number) {
    if (!this.focusAnimation) return false;
    const progress = Math.min(1, (now - this.focusAnimation.started) / this.focusAnimation.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    this.camera.position.lerpVectors(this.focusAnimation.fromPosition, this.focusAnimation.toPosition, eased);
    this.controls.target.lerpVectors(this.focusAnimation.fromTarget, this.focusAnimation.toTarget, eased);
    this.controls.update();
    if (progress >= 1) this.focusAnimation = null;
    return progress < 1;
  }

  private labelAnchors(): SemanticSpaceLabelAnchor[] {
    const width = this.renderer.domElement.clientWidth || 1;
    const height = this.renderer.domElement.clientHeight || 1;
    return this.labelIds.map((id) => {
      const position = this.positionById.get(id);
      if (!position) return { id, x: 0, y: 0, depth: 1, visible: false };
      const projected = position.clone().project(this.camera);
      const inView = projected.z > -1 && projected.z < 1
        && projected.x > -1.08 && projected.x < 1.08
        && projected.y > -1.08 && projected.y < 1.08;
      let visible = inView;
      if (visible) {
        const direction = position.clone().sub(this.camera.position);
        const distance = direction.length();
        this.occlusionRaycaster.set(this.camera.position, direction.normalize());
        const first = this.occlusionRaycaster.intersectObjects(this.buckets.map((bucket) => bucket.mesh), false)[0];
        if (first && first.distance < distance - Math.max(1, this.nodeById.get(id)?.radius ?? 1)) {
          const hitId = first.object instanceof InstancedMesh && first.instanceId !== undefined
            ? this.nodeHitMap.get(first.object)?.[first.instanceId]
            : null;
          visible = hitId === id;
        }
      }
      return {
        id,
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        depth: projected.z,
        visible,
      };
    });
  }

  private render = (now: number) => {
    this.frame = 0;
    if (!this.visible || this.disposed) return;
    const cameraAnimating = this.updateCameraAnimation(now);
    const controlsMoving = this.controls.update();
    this.renderer.render(this.scene3d, this.camera);
    this.debugState.cameraPosition = this.camera.position.toArray();
    this.debugState.cameraTarget = this.controls.target.toArray();
    this.debugState.previewId = this.previewId;
    this.debugState.focusId = this.focusId;
    this.debugState.frames += 1;
    this.debugState.drawCalls = this.renderer.info.render.calls;
    this.debugState.idle = false;
    this.callbacks.onLabelFrame(this.labelAnchors());
    this.callbacks.onDebug?.(publicDebug(this.debugState));
    if (cameraAnimating || controlsMoving || now < this.settleUntil) {
      this.schedule();
    } else {
      this.debugState.idle = true;
      this.callbacks.onDebug?.(publicDebug(this.debugState));
    }
  };

  private schedule() {
    if (this.frame || !this.visible || this.disposed) return;
    this.frame = requestAnimationFrame(this.render);
  }

  private cancelFrame() {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.pendingPointerFrame) cancelAnimationFrame(this.pendingPointerFrame);
    this.frame = 0;
    this.pendingPointerFrame = 0;
  }

  setScene(scene: SemanticSpaceScene) {
    const rebuild = scene.id !== this.currentScene.id;
    const focusChanged = scene.focusId !== this.focusId;
    this.currentScene = scene;
    this.authoredCamera = scene.camera;
    this.authoredCameraPosition = cameraPosition(scene.camera);
    this.controls.minDistance = scene.camera.minDistance;
    this.controls.maxDistance = scene.camera.maxDistance;
    if (rebuild) this.rebuild(scene);
    else {
      this.labelIds = scene.labelIds;
      this.previewId = scene.previewId;
      this.focusId = scene.focusId;
      this.updateInteractionMaterials();
    }
    if (focusChanged) this.moveCameraToFocus(scene.focusId);
  }

  setPreview(id: string | null) {
    if (id === this.previewId) return;
    this.previewId = id;
    this.debugState.previewCommits += 1;
    this.updateInteractionMaterials();
  }

  setFocus(id: string | null) {
    if (id === this.focusId) return;
    this.focusId = id;
    this.updateInteractionMaterials();
    this.moveCameraToFocus(id);
  }

  resize(width: number, height: number, dpr: number) {
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    this.renderer.setPixelRatio(Math.min(MAX_DPR, Math.max(1, dpr || 1)));
    this.renderer.setSize(nextWidth, nextHeight, false);
    this.camera.aspect = nextWidth / nextHeight;
    this.camera.updateProjectionMatrix();
    this.schedule();
  }

  resetCamera() {
    this.focusId = null;
    this.previewId = null;
    this.moveCameraToFocus(null);
    this.updateInteractionMaterials();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible) this.schedule();
    else this.cancelFrame();
  }

  debug() {
    return publicDebug(this.debugState);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFrame();
    this.removeEvents();
    this.controls.dispose();
    this.clearObjects();
    this.orientationGrid.geometry.dispose();
    const gridMaterials = Array.isArray(this.orientationGrid.material)
      ? this.orientationGrid.material
      : [this.orientationGrid.material];
    gridMaterials.forEach((material) => material.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
