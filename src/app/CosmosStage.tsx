import { useEffect, useMemo, useRef, useState } from "react";
import { loadSemanticSpaceModule, webglAvailable } from "../graph/semantic-space-loader";
import type {
  SemanticSpaceController,
  SemanticSpaceLabelAnchor,
  SemanticSpaceScene,
} from "../graph/semantic-space-contract";
import { useAtlas } from "./state";
import { buildSemanticScene, pickDomainAnchor } from "./scene";
import { MobileGraphCanvas } from "./MobileGraphCanvas";

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  MOC: "MISSION · KNOWLEDGE · CONTEXT",
  Papers: "RESEARCH · EVIDENCE · INSIGHTS",
  Signals: "OBSERVATIONS · TRENDS · EVENTS",
  Rocket: "RESEARCH · PRODUCT · OPERATIONS",
  Groot: "STRATEGY · PRODUCT · INCUBATION",
  "Intelligence Layer": "SOURCES · CONTEXT · ACCESS",
  Strategy: "INSIGHTS · OPTIONS · PRIORITIES",
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function CosmosStage({
  mode,
  activeDomains,
}: {
  mode: "home" | "explore";
  activeDomains?: string[];
}) {
  const atlas = useAtlas();
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SemanticSpaceController | null>(null);
  const setPreviewRef = useRef(atlas.setPreview);
  const commitFocusRef = useRef(atlas.commitFocus);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const [webglReady, setWebglReady] = useState(false);
  const [fallback, setFallback] = useState(() => !webglAvailable());
  const qaDebug = useMemo(() => new URLSearchParams(window.location.search).has("qa"), []);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width: 1179px)");
  const mobile = useMediaQuery("(max-width: 820px)");
  const activeDomainKey = activeDomains?.join("\0") ?? "";
  const stableActiveDomains = useMemo(
    () => activeDomainKey ? activeDomainKey.split("\0") : undefined,
    [activeDomainKey],
  );
  const domainAnchorIds = useMemo(() => new Set(
    atlas.runtime.graph.domains.flatMap((domain) => {
      const anchor = pickDomainAnchor(atlas.runtime.graph, domain.label);
      return anchor ? [anchor.id] : [];
    }),
  ), [atlas.runtime.graph]);
  const scene = useMemo(() => buildSemanticScene({
    graph: atlas.runtime.graph,
    lens: atlas.route.lens,
    focusId: atlas.route.focusId,
    previewId: null,
    activeDomainsOverride: stableActiveDomains,
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
  ]);

  useEffect(() => {
    setPreviewRef.current = atlas.setPreview;
    commitFocusRef.current = atlas.commitFocus;
  }, [atlas.commitFocus, atlas.setPreview]);

  const updateLabels = (anchors: SemanticSpaceLabelAnchor[]) => {
    const container = containerRef.current;
    const width = container?.clientWidth ?? 1;
    const height = container?.clientHeight ?? 1;
    const occupied: Array<{ x: number; y: number }> = [];
    const ordered = [...anchors].sort((left, right) => {
      const leftAnchor = domainAnchorIds.has(left.id) ? 1 : 0;
      const rightAnchor = domainAnchorIds.has(right.id) ? 1 : 0;
      return rightAnchor - leftAnchor || left.depth - right.depth;
    });
    for (const anchor of ordered) {
      const element = labelRefs.current.get(anchor.id);
      if (!element) continue;
      const domainAnchor = domainAnchorIds.has(anchor.id);
      const safeX = Math.max(8, Math.min(width - 192, anchor.x));
      let safeY = Math.max(34, Math.min(height - 34, anchor.y));
      let collides = occupied.some((point) => Math.abs(point.x - safeX) < 154 && Math.abs(point.y - safeY) < 34);
      if (domainAnchor && collides) {
        for (const offset of [38, -38, 76, -76, 114, -114, 152, -152]) {
          const candidateY = Math.max(34, Math.min(height - 34, anchor.y + offset));
          const candidateCollides = occupied.some(
            (point) => Math.abs(point.x - safeX) < 154 && Math.abs(point.y - candidateY) < 34,
          );
          if (!candidateCollides) {
            safeY = candidateY;
            collides = false;
            break;
          }
        }
      }
      const visible = (anchor.visible || domainAnchor) && !collides;
      element.hidden = !visible;
      if (visible) {
        element.style.transform = `translate3d(${Math.round(safeX)}px,${Math.round(safeY)}px,0)`;
        occupied.push({ x: safeX, y: safeY });
      }
    }
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
          onPreview={atlas.setPreview}
          onCommit={atlas.commitFocus}
        />
      ) : null}
      <div className="cosmos-stage__labels" aria-hidden="true">
        {scene.labelIds.map((id) => {
          const node = atlas.runtime.graph.nodeById.get(id);
          if (!node) return null;
          const domainAnchor = domainAnchorIds.has(id);
          return (
            <button
              key={id}
              ref={(element) => {
                if (element) labelRefs.current.set(id, element);
                else labelRefs.current.delete(id);
              }}
              type="button"
              className="cosmos-label"
              hidden
              onPointerEnter={() => atlas.setPreview(id)}
              onPointerLeave={() => atlas.setPreview(null)}
              onFocus={() => atlas.setPreview(id)}
              onBlur={() => atlas.setPreview(null)}
              onClick={() => atlas.commitFocus(id)}
            >
              <span>{domainAnchor ? node.domain : node.label}</span>
              <small>{domainAnchor ? DOMAIN_DESCRIPTIONS[node.domain] ?? node.domain : node.domain}</small>
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
