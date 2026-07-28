import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  FogExp2,
  InstancedMesh,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
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
  SemanticSpaceLabelAnchor,
  SemanticSpaceNode,
  SemanticSpaceScene,
} from "./semantic-space-contract";
import {
  buildEdgeField,
  buildHaloField,
  geometryFamily,
  nodeGeometry,
  nodeMaterial,
  type EdgeField,
} from "./semantic-space-resources";

type NodeBucket = { mesh: InstancedMesh; ids: string[] };
const MAX_DPR = 1.5;
const up = new Vector3(0, 1, 0);
const tempObject = new Object3D();
const tempQuaternion = new Quaternion();
const tempMatrix = new Matrix4();
const amber = new Color("#f2b35f");
const hidden = new Color("#050507");

function copyDebug(debug: SemanticSpaceDebugCounters) {
  return { ...debug };
}

export class SemanticSpaceEngine implements SemanticSpaceController {
  private readonly renderer: WebGLRenderer;
  private readonly scene3d = new Scene();
  private readonly camera = new PerspectiveCamera(46, 1, 1, 8_000);
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly buckets: NodeBucket[] = [];
  private readonly hitIds = new Map<InstancedMesh, string[]>();
  private readonly callbacks: SemanticSpaceCallbacks;
  private scene: SemanticSpaceScene;
  private nodeById = new Map<string, SemanticSpaceNode>();
  private positionById = new Map<string, Vector3>();
  private edgeIndexesByNode = new Map<string, { incoming: number[]; outgoing: number[] }>();
  private edges: EdgeField | null = null;
  private halo: ReturnType<typeof buildHaloField> | null = null;
  private frame = 0;
  private pointerFrame = 0;
  private settleUntil = 0;
  private visible = true;
  private disposed = false;
  private hoveredId: string | null = null;
  private previewId: string | null = null;
  private focusId: string | null = null;
  private pointerDown: { x: number; y: number; moved: boolean } | null = null;
  private cameraTween: {
    start: number;
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
    previewId: null,
    focusId: null,
  };

  constructor(container: HTMLElement, scene: SemanticSpaceScene, callbacks: SemanticSpaceCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.className = "cosmos-webgl";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.append(this.renderer.domElement);

    this.scene3d.fog = new FogExp2(0x0b090d, 0.000055);
    this.scene3d.add(new AmbientLight(0xf0d8c2, 2.05));
    const key = new DirectionalLight(0xffdfb5, 2.8);
    key.position.set(-380, 680, 920);
    this.scene3d.add(key);
    const fill = new DirectionalLight(0x7899bc, 1.55);
    fill.position.set(740, -120, 240);
    this.scene3d.add(fill);

    this.camera.position.set(...scene.camera.position);
    this.camera.fov = scene.camera.fov;
    this.camera.updateProjectionMatrix();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...scene.camera.target);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.46;
    this.controls.zoomSpeed = 0.58;
    this.controls.minDistance = scene.camera.minDistance;
    this.controls.maxDistance = scene.camera.maxDistance;
    this.controls.minPolarAngle = 0.32;
    this.controls.maxPolarAngle = Math.PI * 0.72;
    this.controls.update();
    this.installEvents();
    this.rebuild(scene);
    this.resize(container.clientWidth || 1, container.clientHeight || 1, window.devicePixelRatio || 1);
    queueMicrotask(callbacks.onReady);
  }

  private installEvents() {
    const canvas = this.renderer.domElement;
    this.controls.addEventListener("start", () => {
      this.settleUntil = performance.now() + 580;
      this.schedule();
    });
    this.controls.addEventListener("change", () => {
      this.debugState.cameraMoves += 1;
      this.settleUntil = performance.now() + 360;
      this.schedule();
    });
    this.controls.addEventListener("end", () => {
      this.settleUntil = performance.now() + 260;
      this.schedule();
    });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
  }

  private removeEvents() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("pointercancel", this.onPointerCancel);
    canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.setVisible(false);
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
    if (this.pointerFrame) return;
    this.pointerFrame = requestAnimationFrame(() => {
      this.pointerFrame = 0;
      this.pick();
    });
  };

  private onPointerUp = () => {
    if (this.pointerDown && !this.pointerDown.moved && this.hoveredId) {
      this.callbacks.onCommit(this.hoveredId);
    }
    this.pointerDown = null;
  };

  private onPointerLeave = () => {
    this.pointerDown = null;
    this.applyHover(null);
  };

  private onPointerCancel = () => {
    this.pointerDown = null;
  };

  private pick() {
    if (!this.visible || this.disposed) return;
    this.debugState.raycasts += 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.buckets.map((bucket) => bucket.mesh), false);
    let next: string | null = null;
    for (const hit of hits) {
      if (!(hit.object instanceof InstancedMesh) || hit.instanceId === undefined) continue;
      next = this.hitIds.get(hit.object)?.[hit.instanceId] ?? null;
      if (next) break;
    }
    this.applyHover(next);
  }

  private applyHover(next: string | null) {
    if (next === this.hoveredId) return;
    this.hoveredId = next;
    this.previewId = next;
    this.debugState.previewCommits += 1;
    this.callbacks.onPreview(next);
    this.updateAppearance();
  }

  private clearGraph() {
    for (const bucket of this.buckets) {
      this.scene3d.remove(bucket.mesh);
      bucket.mesh.geometry.dispose();
      const materials = Array.isArray(bucket.mesh.material) ? bucket.mesh.material : [bucket.mesh.material];
      materials.forEach((material) => material.dispose());
    }
    this.buckets.length = 0;
    this.hitIds.clear();
    if (this.edges) {
      this.scene3d.remove(this.edges.lines, this.edges.arrows);
      this.edges.lines.geometry.dispose();
      const lineMaterials = Array.isArray(this.edges.lines.material)
        ? this.edges.lines.material
        : [this.edges.lines.material];
      lineMaterials.forEach((material) => material.dispose());
      this.edges.arrows.geometry.dispose();
      const arrowMaterials = Array.isArray(this.edges.arrows.material)
        ? this.edges.arrows.material
        : [this.edges.arrows.material];
      arrowMaterials.forEach((material) => material.dispose());
      this.edges = null;
    }
    if (this.halo) {
      this.scene3d.remove(this.halo.points);
      this.halo.points.geometry.dispose();
      this.halo.points.material.dispose();
      this.halo = null;
    }
  }

  private rebuild(scene: SemanticSpaceScene) {
    this.clearGraph();
    this.scene = scene;
    this.previewId = scene.previewId;
    this.focusId = scene.focusId;
    this.nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
    this.positionById = new Map(scene.nodes.map((node) => [node.id, new Vector3(...node.position)]));
    this.edgeIndexesByNode = new Map(scene.nodes.map((node) => [node.id, { incoming: [], outgoing: [] }]));
    scene.edges.forEach((edge, index) => {
      this.edgeIndexesByNode.get(edge.sourceId)?.outgoing.push(index);
      this.edgeIndexesByNode.get(edge.targetId)?.incoming.push(index);
    });
    for (const indexes of this.edgeIndexesByNode.values()) {
      const byWeight = (left: number, right: number) => scene.edges[right].weight - scene.edges[left].weight
        || scene.edges[left].id.localeCompare(scene.edges[right].id, "en");
      indexes.incoming.sort(byWeight);
      indexes.outgoing.sort(byWeight);
    }
    const groups = new Map<string, SemanticSpaceNode[]>();
    for (const node of scene.nodes) {
      const family = geometryFamily(node.kind);
      const items = groups.get(family) ?? [];
      items.push(node);
      groups.set(family, items);
    }
    for (const [family, nodes] of groups) {
      const mesh = new InstancedMesh(nodeGeometry(family), nodeMaterial(family), nodes.length);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      nodes.forEach((node, index) => {
        const seed = ((index * 0.61803398875) % 1) * Math.PI;
        tempObject.position.set(...node.position);
        tempObject.rotation.set(seed * 0.08, seed, family === "paper" ? 0.34 : 0);
        const scale = family === "paper"
          ? [node.radius * 0.82, node.radius * 1.28, node.radius * 0.68]
          : family === "signal"
            ? [node.radius * 0.9, node.radius * 1.22, node.radius * 0.9]
            : family === "project"
              ? [node.radius * 1.04, node.radius * 0.86, node.radius * 0.92]
              : [node.radius, node.radius, node.radius];
        tempObject.scale.set(scale[0], scale[1], scale[2]);
        tempObject.updateMatrix();
        mesh.setMatrixAt(index, tempObject.matrix);
        mesh.setColorAt(index, new Color(node.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene3d.add(mesh);
      const ids = nodes.map((node) => node.id);
      this.buckets.push({ mesh, ids });
      this.hitIds.set(mesh, ids);
    }
    this.halo = buildHaloField(scene.nodes);
    this.scene3d.add(this.halo.points);
    this.edges = buildEdgeField(scene.edges, this.positionById, this.nodeById);
    this.scene3d.add(this.edges.lines, this.edges.arrows);
    this.debugState.sceneBuilds += 1;
    this.debugState.visibleNodes = scene.nodes.length;
    this.updateAppearance();
  }

  private activeEdges(activeId: string | null) {
    if (!activeId) return [] as number[];
    const indexes = this.edgeIndexesByNode.get(activeId);
    if (!indexes) return [];
    return [...indexes.incoming.slice(0, 6), ...indexes.outgoing.slice(0, 6)];
  }

  private updateAppearance() {
    const activeId = this.previewId ?? this.focusId;
    const activeDomain = activeId ? this.nodeById.get(activeId)?.domain ?? null : null;
    const activeEdgeIndexes = this.activeEdges(activeId);
    const activeEdges = new Set(activeEdgeIndexes);
    const neighborIds = new Set<string>();
    for (const index of activeEdgeIndexes) {
      neighborIds.add(this.scene.edges[index].sourceId);
      neighborIds.add(this.scene.edges[index].targetId);
    }
    const activeDomains = new Set(this.scene.activeDomains);
    for (const bucket of this.buckets) {
      bucket.ids.forEach((id, index) => {
        const node = this.nodeById.get(id)!;
        const color = new Color(node.color);
        const frontier = node.domain === "Rocket"
          || node.domain === "Groot"
          || node.domain === "Intelligence Layer";
        const domainDimmed = activeDomains.size > 0 && !activeDomains.has(node.domain);
        const sameDomain = activeDomain === node.domain;
        if (activeId && id !== activeId && !neighborIds.has(id) && sameDomain) {
          color.multiplyScalar(frontier ? 1.16 : 0.78);
        } else if (activeId && id !== activeId && !neighborIds.has(id)) color.multiplyScalar(0.52);
        else if (id === activeId) color.lerp(amber, 0.58).multiplyScalar(1.22);
        else if (activeId && neighborIds.has(id)) color.multiplyScalar(frontier ? 1.28 : 1.08);
        else if (domainDimmed) color.multiplyScalar(0.24);
        else color.multiplyScalar(frontier ? 2.15 : 0.92);
        bucket.mesh.setColorAt(index, color);
      });
      if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
    }
    if (this.halo) {
      const alpha = this.halo.alpha.array as Float32Array;
      const colors = this.halo.colors.array as Float32Array;
      this.scene.nodes.forEach((node, index) => {
        const color = new Color(node.color);
        const selected = node.id === activeId;
        const neighbor = neighborIds.has(node.id);
        const frontier = node.domain === "Rocket"
          || node.domain === "Groot"
          || node.domain === "Intelligence Layer";
        const domainDimmed = activeDomains.size > 0 && !activeDomains.has(node.domain);
        const sameDomain = activeDomain === node.domain;
        alpha[index] = activeId
          ? selected ? 1 : neighbor ? frontier ? 0.9 : 0.74 : sameDomain ? frontier ? 0.62 : 0.36 : 0.22
          : domainDimmed ? 0.1 : frontier ? 1 : 0.5;
        if (selected) color.lerp(amber, 0.64);
        colors.set([color.r, color.g, color.b], index * 3);
      });
      this.halo.alpha.needsUpdate = true;
      this.halo.colors.needsUpdate = true;
    }
    this.updateEdges(activeEdges, activeId, activeDomain);
    this.debugState.visibleEdges = activeId ? activeEdges.size : this.scene.edges.length;
    this.debugState.materialUpdates += 1;
    this.debugState.previewId = this.previewId;
    this.debugState.focusId = this.focusId;
    this.callbacks.onDebug?.(copyDebug(this.debugState));
    this.schedule();
  }

  private updateEdges(activeEdges: Set<number>, activeId: string | null, activeDomain: string | null) {
    if (!this.edges) return;
    const colors = this.edges.lineColors.array as Float32Array;
    const baseColors = this.edges.baseColors;
    this.scene.edges.forEach((edge, edgeIndex) => {
      const source = this.nodeById.get(edge.sourceId)!;
      const target = this.nodeById.get(edge.targetId)!;
      const selected = activeEdges.has(edgeIndex);
      const domainActive = !this.scene.activeDomains.length
        || this.scene.activeDomains.includes(source.domain)
        || this.scene.activeDomains.includes(target.domain);
      const sharesFocusDomain = activeDomain === source.domain || activeDomain === target.domain;
      const intensity = activeId
        ? selected ? 1.05 : sharesFocusDomain ? 0.075 : 0.042
        : domainActive
          ? Math.min(
            this.scene.activeDomains.length ? 0.24 : 0.16,
            (this.scene.activeDomains.length ? 0.055 : 0.035) + Math.log1p(edge.weight) * 0.024,
          )
          : 0.012;
      for (let segment = 0; segment < this.edges!.segments; segment += 1) {
        const offset = (edgeIndex * this.edges!.segments + segment) * 6;
        for (let component = 0; component < 6; component += 1) {
          const amberComponent = component % 3 === 0 ? amber.r : component % 3 === 1 ? amber.g : amber.b;
          colors[offset + component] = selected
            ? amberComponent * intensity
            : baseColors[offset + component] * intensity;
        }
      }
    });
    this.edges.lineColors.needsUpdate = true;
    const activeEdgeIndexes = [...activeEdges];
    for (let slot = 0; slot < 12; slot += 1) {
      const edgeIndex = activeEdgeIndexes[slot];
      if (edgeIndex === undefined) {
        this.edges.arrows.setColorAt(slot, hidden);
        tempObject.position.set(0, -10_000, 0);
        tempObject.scale.setScalar(0.001);
        tempObject.updateMatrix();
        this.edges.arrows.setMatrixAt(slot, tempObject.matrix);
        continue;
      }
      const points = this.edges.edgePoints[edgeIndex];
      const end = points.at(-1)!;
      const before = points.at(-2)!;
      tempQuaternion.setFromUnitVectors(up, end.clone().sub(before).normalize());
      const scale = Math.min(3.8, 1.25 + Math.sqrt(this.scene.edges[edgeIndex].weight) * 0.34);
      tempMatrix.compose(end, tempQuaternion, new Vector3(scale, scale, scale));
      this.edges.arrows.setMatrixAt(slot, tempMatrix);
      this.edges.arrows.setColorAt(slot, amber);
    }
    this.edges.arrows.instanceMatrix.needsUpdate = true;
    if (this.edges.arrows.instanceColor) this.edges.arrows.instanceColor.needsUpdate = true;
  }

  private moveCamera(camera: AuthoredCamera, duration = 480) {
    const toPosition = new Vector3(...camera.position);
    const toTarget = new Vector3(...camera.target);
    this.camera.fov = camera.fov;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = camera.minDistance;
    this.controls.maxDistance = camera.maxDistance;
    if (this.scene.reducedMotion || duration === 0) {
      this.camera.position.copy(toPosition);
      this.controls.target.copy(toTarget);
      this.controls.update();
      this.schedule();
      return;
    }
    this.cameraTween = {
      start: performance.now(),
      duration,
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition,
      toTarget,
    };
    this.schedule();
  }

  private updateCameraTween(now: number) {
    if (!this.cameraTween) return false;
    const progress = Math.min(1, (now - this.cameraTween.start) / this.cameraTween.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    this.camera.position.lerpVectors(this.cameraTween.fromPosition, this.cameraTween.toPosition, eased);
    this.controls.target.lerpVectors(this.cameraTween.fromTarget, this.cameraTween.toTarget, eased);
    this.controls.update();
    if (progress >= 1) this.cameraTween = null;
    return progress < 1;
  }

  private labelAnchors(): SemanticSpaceLabelAnchor[] {
    const width = this.renderer.domElement.clientWidth || 1;
    const height = this.renderer.domElement.clientHeight || 1;
    return this.scene.labelIds.map((id) => {
      const position = this.positionById.get(id);
      if (!position) return { id, x: 0, y: 0, depth: 1, visible: false };
      const projected = position.clone().project(this.camera);
      const visible = projected.z > -1 && projected.z < 1
        && projected.x > -0.94 && projected.x < 0.94
        && projected.y > -0.94 && projected.y < 0.94;
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
    const tweening = this.updateCameraTween(now);
    const controlsMoving = this.controls.update();
    this.renderer.render(this.scene3d, this.camera);
    this.debugState.frames += 1;
    this.debugState.drawCalls = this.renderer.info.render.calls;
    this.debugState.idle = false;
    this.callbacks.onLabelFrame(this.labelAnchors());
    this.callbacks.onDebug?.(copyDebug(this.debugState));
    if (tweening || controlsMoving || now < this.settleUntil) this.schedule();
    else {
      this.debugState.idle = true;
      this.callbacks.onDebug?.(copyDebug(this.debugState));
    }
  };

  private schedule() {
    if (this.frame || !this.visible || this.disposed) return;
    this.frame = requestAnimationFrame(this.render);
  }

  private cancelFrames() {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.pointerFrame) cancelAnimationFrame(this.pointerFrame);
    this.frame = 0;
    this.pointerFrame = 0;
  }

  setScene(scene: SemanticSpaceScene) {
    const graphChanged = scene.graphVersion !== this.scene.graphVersion;
    const cameraChanged = scene.lens !== this.scene.lens;
    this.scene = scene;
    this.previewId = scene.previewId;
    this.focusId = scene.focusId;
    if (graphChanged) this.rebuild(scene);
    else this.updateAppearance();
    if (cameraChanged) this.moveCamera(scene.camera);
  }

  setPreview(id: string | null) {
    if (id === this.previewId) return;
    this.previewId = id;
    this.debugState.previewCommits += 1;
    this.updateAppearance();
  }

  setFocus(id: string | null) {
    if (id === this.focusId) return;
    this.focusId = id;
    this.updateAppearance();
    if (!id) this.moveCamera(this.scene.camera);
  }

  resize(width: number, height: number, dpr: number) {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    this.renderer.setPixelRatio(Math.min(MAX_DPR, Math.max(1, dpr || 1)));
    this.renderer.setSize(safeWidth, safeHeight, false);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.schedule();
  }

  resetCamera() {
    this.moveCamera(this.scene.camera);
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible) this.schedule();
    else this.cancelFrames();
  }

  debug() {
    return copyDebug(this.debugState);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFrames();
    this.removeEvents();
    this.controls.dispose();
    this.clearGraph();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
