import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  FogExp2,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  PointLight,
  Points,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
  TorusGeometry,
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
const EDGE_SEGMENTS = 7;
const UP = new Vector3(0, 1, 0);
const HIDDEN_COLOR = new Color(0x000000);
const EDGE_COLOR = new Color(0xa8bdd0);
const EDGE_FOCUS_COLOR = new Color(0xe5bb73);
const PATH_COLOR = new Color(0xf2c983);
const CORRIDOR_COLOR = new Color(0x7fa0b8);
const tmpObject = new Object3D();
const tmpColor = new Color();
const tmpVector = new Vector3();
const tmpVectorB = new Vector3();
const tmpQuaternion = new Quaternion();
const tmpMatrix = new Matrix4();

function geometryKind(node: SemanticSpaceNode) {
  if (node.kind === "moc_hub") return "moc";
  if (node.kind === "paper_gateway") return "paper";
  if (node.kind === "signal_domain" || node.kind === "signal_storyline") return "signal";
  if (node.kind === "district") return "district";
  if (node.kind === "aggregate_boundary") return "aggregate";
  return "knowledge";
}

function geometryFor(kind: string) {
  if (kind === "moc") return new IcosahedronGeometry(1, 1);
  if (kind === "paper") return new OctahedronGeometry(1, 0);
  if (kind === "signal") return new TetrahedronGeometry(1, 0);
  if (kind === "district") return new TorusGeometry(1, 0.055, 6, 32);
  if (kind === "aggregate") return new OctahedronGeometry(1, 0);
  return new SphereGeometry(1, 12, 8);
}

function baseMaterial(kind: string) {
  return new ShaderMaterial({
    transparent: kind === "district" || kind === "aggregate",
    depthWrite: kind !== "district",
    uniforms: {
      uOpacity: {
        value: kind === "district" ? 0.78 : kind === "aggregate" ? 0.56 : 0.96,
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
        vec3 key = normalize(vec3(-0.34, 0.58, 0.74));
        float diffuse = max(dot(normal, key), 0.0);
        float hemisphere = normal.y * 0.5 + 0.5;
        float rim = pow(1.0 - max(dot(normal, normalize(vViewDirection)), 0.0), 2.6);
        vec3 matte = vSemanticColor * (0.42 + diffuse * 0.54 + hemisphere * 0.18);
        vec3 edgeLight = mix(vSemanticColor, vec3(1.0, 0.88, 0.72), 0.28) * rim * 0.36;
        gl_FragColor = vec4(matte + edgeLight, uOpacity);
        #include <tonemapping_fragment>
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
  const normal = new Vector3(
    -delta.z,
    Math.abs(delta.x) * 0.08 + length * (0.035 + Math.abs(routeBias) * 0.025),
    delta.x,
  ).normalize();
  if (routeBias < 0) normal.multiplyScalar(-1);
  const bend = edge.semanticKind === "district_corridor"
    ? Math.min(110, length * 0.22)
    : edge.semanticKind === "directed_path"
      ? Math.min(70, length * 0.14)
      : Math.min(62, length * (0.075 + Math.abs(routeBias) * 0.055));
  const midpoint = source.clone().add(target).multiplyScalar(0.5).addScaledVector(normal, bend);
  const points: Vector3[] = [];
  for (let index = 0; index <= EDGE_SEGMENTS; index += 1) {
    const t = index / EDGE_SEGMENTS;
    const inverse = 1 - t;
    points.push(source.clone().multiplyScalar(inverse * inverse)
      .add(midpoint.clone().multiplyScalar(2 * inverse * t))
      .add(target.clone().multiplyScalar(t * t)));
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
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.domElement.className = "semantic-space-webgl";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.append(this.renderer.domElement);

    this.scene3d.fog = new FogExp2(0x080a0f, 0.00013);
    this.scene3d.add(new AmbientLight(0xe7ded2, 1.28));
    this.scene3d.add(new HemisphereLight(0xdfe9f4, 0x24180e, 1.28));
    const keyLight = new PointLight(0xffd39a, 3.8, 2_800, 1.55);
    keyLight.position.set(-460, 380, 560);
    this.scene3d.add(keyLight);
    const rimLight = new PointLight(0x789aca, 2.65, 2_200, 1.7);
    rimLight.position.set(520, -180, -420);
    this.scene3d.add(rimLight);

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
      (this.edgeState.arrows.material as MeshStandardMaterial).dispose();
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
        const scale = kind === "signal"
          ? new Vector3(node.radius * 0.95, node.radius * 1.35, node.radius * 0.9)
          : kind === "paper"
            ? new Vector3(node.radius * 0.86, node.radius * 1.18, node.radius * 0.72)
            : kind === "district"
              ? new Vector3(node.radius, node.radius, node.radius)
              : new Vector3(node.radius, node.radius, node.radius);
        tmpObject.position.set(...node.position);
        tmpObject.scale.copy(scale);
        tmpObject.rotation.set(
          kind === "district" ? -0.38 + (index % 3) * 0.08 : (index % 3) * 0.12,
          (index * 0.618) % Math.PI,
          kind === "signal" ? -0.28 : (index % 2) * 0.08,
        );
        tmpObject.updateMatrix();
        mesh.setMatrixAt(index, tmpObject.matrix);
        const authoredColor = new Color(node.color).multiplyScalar(
          kind === "aggregate" ? 0.52 : kind === "district" ? 0.76 : 0.82,
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
    nodes.forEach((node, index) => {
      positions.set(node.position, index * 3);
      const color = new Color(node.color);
      colors.set([color.r, color.g, color.b], index * 3);
      sizes[index] = Math.max(32, Math.min(220, node.halo * 3.8));
      alpha[index] = node.kind === "aggregate_boundary" ? 0.3 : 0.68;
    });
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const colorAttribute = new BufferAttribute(colors, 3);
    const alphaAttribute = new BufferAttribute(alpha, 1);
    colorAttribute.setUsage(DynamicDrawUsage);
    alphaAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute("color", colorAttribute);
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
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
          gl_PointSize = clamp(aSize * (540.0 / max(260.0, -mvPosition.z)), 16.0, 220.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
          float soft = smoothstep(0.5, 0.04, distanceFromCenter);
          float core = smoothstep(0.18, 0.0, distanceFromCenter);
          gl_FragColor = vec4(vColor, (soft * 0.58 + core * 0.22) * vAlpha);
        }
      `,
    });
    this.haloPoints = new Points(geometry, material);
    this.haloPoints.frustumCulled = false;
    this.haloAlpha = alphaAttribute;
    this.haloColors = colorAttribute;
    this.scene3d.add(this.haloPoints);
  }

  private buildEdges(edges: SemanticSpaceEdge[]) {
    const linePositions = new Float32Array(edges.length * EDGE_SEGMENTS * 2 * 3);
    const lineColors = new Float32Array(linePositions.length);
    const arrowGeometry = new ConeGeometry(1, 4, 7);
    arrowGeometry.translate(0, 2, 0);
    const arrowMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.76,
      metalness: 0.02,
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
      const scale = Math.max(1.8, Math.min(4.8, 1.4 + Math.sqrt(edge.weight) * 0.45));
      tmpMatrix.compose(end, tmpQuaternion, new Vector3(scale, scale * 1.35, scale));
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
      opacity: 0.78,
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
          ? 0.52
          : node.kind === "district"
            ? 0.76
            : 0.82;
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
          ? isActive ? 1 : isNeighbor ? 0.64 : 0.04
          : node.kind === "aggregate_boundary" ? 0.3 : 0.68;
        if (isActive) base.lerp(new Color(0xffd28b), 0.52);
        colors.set([base.r, base.g, base.b], index * 3);
      });
      this.haloAlpha.needsUpdate = true;
      this.haloColors.needsUpdate = true;
    }
    if (this.edgeState) {
      const colors = this.edgeState.lineColors.array as Float32Array;
      this.edgeState.edges.forEach((edge, edgeIndex) => {
        const visible = visibleEdgeIds.has(edge.id);
        const color = !visible
          ? HIDDEN_COLOR
          : edge.semanticKind === "directed_path"
            ? PATH_COLOR
            : activeId
              ? EDGE_FOCUS_COLOR
              : edge.semanticKind === "district_corridor"
                ? CORRIDOR_COLOR
                : EDGE_COLOR;
        const renderedColor = tmpColor.copy(color).multiplyScalar(
          visible ? Math.min(1.42, 0.86 + Math.sqrt(Math.max(1, edge.weight)) * 0.075) : 1,
        );
        for (let segment = 0; segment < this.edgeState!.lineSegmentsPerEdge; segment += 1) {
          const offset = (edgeIndex * this.edgeState!.lineSegmentsPerEdge + segment) * 6;
          colors.set([
            renderedColor.r,
            renderedColor.g,
            renderedColor.b,
            renderedColor.r,
            renderedColor.g,
            renderedColor.b,
          ], offset);
        }
        this.edgeState!.arrows.setColorAt(edgeIndex, renderedColor);
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
      duration: 520,
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
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
