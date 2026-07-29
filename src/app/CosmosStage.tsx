import { useEffect, useMemo, useRef, useState } from "react";
import { loadSemanticSpaceModule, webglAvailable } from "../graph/semantic-space-loader";
import type {
  SemanticSpaceController,
  SemanticSpaceLabelAnchor,
  SemanticSpaceScene,
} from "../graph/semantic-space-contract";
import type { GraphNodeKind } from "./contracts";
import { relationSummary } from "./data";
import { useAtlas } from "./state";
import { buildSemanticScene, interactionLabelIds, pickDomainAnchor } from "./scene";
import { MobileGraphCanvas } from "./MobileGraphCanvas";
import { useMediaQuery } from "./useMediaQuery";

type RelationDirection = "incoming" | "outgoing" | "both";

interface LabelRenderContext {
  container: HTMLDivElement | null;
  elements: Map<string, HTMLButtonElement>;
  domainAnchorIds: Set<string>;
  relationDirections: Map<string, RelationDirection>;
  focusId: string | null;
}

function labelPriority(
  id: string,
  focusId: string | null,
  relationDirections: Map<string, RelationDirection>,
  domainAnchorIds: Set<string>,
) {
  if (id === focusId) return 3;
  if (relationDirections.has(id)) return 2;
  if (domainAnchorIds.has(id)) return 1;
  return 0;
}

function collidesWith(occupied: Array<{ x: number; y: number }>, x: number, y: number) {
  return occupied.some((point) => Math.abs(point.x - x) < 154 && Math.abs(point.y - y) < 34);
}

function availableLabelY(
  anchor: SemanticSpaceLabelAnchor,
  x: number,
  height: number,
  occupied: Array<{ x: number; y: number }>,
  canShift: boolean,
) {
  const initial = Math.max(34, Math.min(height - 34, anchor.y));
  if (!collidesWith(occupied, x, initial)) return initial;
  if (!canShift) return null;
  for (const offset of [38, -38, 76, -76, 114, -114, 152, -152]) {
    const candidate = Math.max(34, Math.min(height - 34, anchor.y + offset));
    if (!collidesWith(occupied, x, candidate)) return candidate;
  }
  return null;
}

function renderLabelAnchors(anchors: SemanticSpaceLabelAnchor[], context: LabelRenderContext) {
  const width = context.container?.clientWidth ?? 1;
  const height = context.container?.clientHeight ?? 1;
  const occupied: Array<{ x: number; y: number }> = [];
  const priority = (id: string) => labelPriority(
    id,
    context.focusId,
    context.relationDirections,
    context.domainAnchorIds,
  );
  const ordered = [...anchors].sort(
    (left, right) => priority(right.id) - priority(left.id) || left.depth - right.depth,
  );
  for (const anchor of ordered) {
    const element = context.elements.get(anchor.id);
    if (!element) continue;
    const domainAnchor = context.domainAnchorIds.has(anchor.id);
    const canShift = domainAnchor || priority(anchor.id) > 1;
    const x = Math.max(8, Math.min(width - 192, anchor.x));
    const y = availableLabelY(anchor, x, height, occupied, canShift);
    const visible = (anchor.visible || domainAnchor) && y !== null;
    element.hidden = !visible;
    if (!visible || y === null) continue;
    element.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
    occupied.push({ x, y });
  }
}

export function CosmosStage({
  mode,
  activeDomains,
  activeKinds,
}: {
  mode: "home" | "explore";
  activeDomains?: string[];
  activeKinds?: GraphNodeKind[];
}) {
  const atlas = useAtlas();
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SemanticSpaceController | null>(null);
  const setPreviewRef = useRef(atlas.setPreview);
  const commitFocusRef = useRef(atlas.commitFocus);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const labelContextRef = useRef<LabelRenderContext>({
    container: null,
    elements: labelRefs.current,
    domainAnchorIds: new Set(),
    relationDirections: new Map(),
    focusId: null,
  });
  const [webglReady, setWebglReady] = useState(false);
  const [fallback, setFallback] = useState(() => !webglAvailable());
  const qaDebug = useMemo(() => new URLSearchParams(window.location.search).has("qa"), []);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width: 1179px)");
  const mobile = useMediaQuery("(max-width: 820px)");
  const activeDomainKey = activeDomains?.join("\0") ?? "";
  const activeKindKey = activeKinds?.join("\0") ?? "";
  const stableActiveDomains = useMemo(
    () => activeDomainKey ? activeDomainKey.split("\0") : undefined,
    [activeDomainKey],
  );
  const stableActiveKinds = useMemo(
    () => activeKindKey ? activeKindKey.split("\0") as GraphNodeKind[] : undefined,
    [activeKindKey],
  );
  const domainAnchorIds = useMemo(() => new Set(
    atlas.runtime.graph.domains.flatMap((domain) => {
      const anchor = pickDomainAnchor(atlas.runtime.graph, domain.label);
      return anchor ? [anchor.id] : [];
    }),
  ), [atlas.runtime.graph]);
  const activeLabelId = atlas.previewId ?? atlas.route.focusId;
  const relationDirections = useMemo(() => {
    const directions = new Map<string, "incoming" | "outgoing" | "both">();
    const focus = activeLabelId
      ? atlas.runtime.graph.nodeById.get(activeLabelId)
      : null;
    if (!focus) return directions;
    const relations = relationSummary(atlas.runtime.graph, focus);
    for (const relation of relations.incoming) directions.set(relation.node.id, "incoming");
    for (const relation of relations.outgoing) {
      directions.set(
        relation.node.id,
        directions.has(relation.node.id) ? "both" : "outgoing",
      );
    }
    return directions;
  }, [activeLabelId, atlas.runtime.graph]);
  const scene = useMemo(() => buildSemanticScene({
    graph: atlas.runtime.graph,
    lens: atlas.route.lens,
    focusId: atlas.route.focusId,
    previewId: null,
    activeDomainsOverride: stableActiveDomains,
    activeKindsOverride: stableActiveKinds,
    compact,
    mode,
    reducedMotion,
  }), [
    atlas.route.focusId,
    atlas.route.lens,
    atlas.runtime.graph,
    compact,
    mode,
    reducedMotion,
    stableActiveDomains,
    stableActiveKinds,
  ]);
  const renderedLabelIds = useMemo(
    () => interactionLabelIds(
      atlas.runtime.graph,
      scene.labelIds,
      activeLabelId,
      compact ? 14 : 20,
    ),
    [activeLabelId, atlas.runtime.graph, compact, scene.labelIds],
  );
  labelContextRef.current = {
    container: containerRef.current,
    elements: labelRefs.current,
    domainAnchorIds,
    relationDirections,
    focusId: activeLabelId,
  };

  useEffect(() => {
    setPreviewRef.current = atlas.setPreview;
    commitFocusRef.current = atlas.commitFocus;
  }, [atlas.commitFocus, atlas.setPreview]);

  const updateLabels = (anchors: SemanticSpaceLabelAnchor[]) => {
    renderLabelAnchors(anchors, labelContextRef.current);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || fallback || mobile || !webglAvailable()) return;
    let alive = true;
    loadSemanticSpaceModule().then((module) => {
      if (!alive || controllerRef.current) return;
      controllerRef.current = module.mount(container, scene, {
        onReady() {
          setWebglReady(true);
        },
        onPreview(id) {
          setPreviewRef.current(id);
        },
        onCommit(id) {
          commitFocusRef.current(id);
        },
        onLabelFrame: updateLabels,
        onContextLost() {
          setFallback(true);
          setWebglReady(false);
        },
        onDebug(debug) {
          window.__ATLAS_RENDER_DEBUG__ = debug;
          if (qaDebug && containerRef.current) {
            const dataset = containerRef.current.dataset;
            dataset.sceneBuilds = String(debug.sceneBuilds);
            dataset.previewCommits = String(debug.previewCommits);
            dataset.cameraMoves = String(debug.cameraMoves);
            dataset.frames = String(debug.frames);
            dataset.drawCalls = String(debug.drawCalls);
            dataset.idle = String(debug.idle);
          }
        },
      });
    }).catch(() => setFallback(true));
    const resize = new ResizeObserver(([entry]) => {
      controllerRef.current?.resize(
        entry.contentRect.width,
        entry.contentRect.height,
        window.devicePixelRatio || 1,
      );
    });
    resize.observe(container);
    const visibility = () => controllerRef.current?.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive = false;
      resize.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [fallback, mobile]);

  useEffect(() => {
    controllerRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    controllerRef.current?.setLabelIds(renderedLabelIds);
  }, [renderedLabelIds, webglReady]);

  useEffect(() => {
    controllerRef.current?.setPreview(atlas.previewId);
  }, [atlas.previewId, webglReady]);

  const showCanvas = fallback || mobile;
  return (
    <div className={`cosmos-stage cosmos-stage--${mode}`} data-webgl-ready={webglReady}>
      <div ref={containerRef} className="cosmos-stage__webgl" aria-hidden="true" />
      {showCanvas ? (
        <MobileGraphCanvas
          graph={atlas.runtime.graph}
          lens={atlas.route.lens}
          focusId={atlas.route.focusId}
          previewId={atlas.previewId}
          activeDomainsOverride={stableActiveDomains}
          activeKindsOverride={stableActiveKinds}
          onPreview={atlas.setPreview}
          onCommit={atlas.commitFocus}
        />
      ) : null}
      <div className="cosmos-stage__labels" aria-hidden="true">
        {renderedLabelIds.map((id) => {
          const node = atlas.runtime.graph.nodeById.get(id);
          if (!node) return null;
          const domainAnchor = domainAnchorIds.has(id);
          const relationDirection = relationDirections.get(id);
          const focusLabel = activeLabelId === id;
          const showDomainAnchor = domainAnchor && !relationDirection && !focusLabel;
          const frontierAnchor = domainAnchor && (
            node.domain === "Rocket"
            || node.domain === "Groot"
            || node.domain === "Intelligence Layer"
          );
          return (
            <button
              key={id}
              ref={(element) => {
                if (element) labelRefs.current.set(id, element);
                else labelRefs.current.delete(id);
              }}
              type="button"
              className={`cosmos-label${domainAnchor ? " cosmos-label--domain" : ""}${frontierAnchor ? " cosmos-label--frontier" : ""}${focusLabel ? " cosmos-label--focus" : ""}${relationDirection ? ` cosmos-label--${relationDirection}` : ""}`}
              hidden
              onPointerEnter={() => atlas.setPreview(id)}
              onPointerLeave={() => atlas.setPreview(null)}
              onFocus={() => atlas.setPreview(id)}
              onBlur={() => atlas.setPreview(null)}
              onClick={() => atlas.commitFocus(id)}
            >
              <span>{showDomainAnchor ? node.domain : node.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="homi-beacon"
        onClick={() => atlas.goWorkspace("agency")}
        aria-label="Homi provenance. 제품 출처이며 지식 노드가 아닙니다. Agency로 이동"
      >
        <img src="./assets/brand/homi-mark-amber.svg" alt="" />
        <span>provenance</span>
      </button>
      {!webglReady && !showCanvas ? <div className="cosmos-stage__loading">지식 공간을 여는 중</div> : null}
    </div>
  );
}

declare global {
  interface Window {
    __ATLAS_RENDER_DEBUG__?: unknown;
  }
}
