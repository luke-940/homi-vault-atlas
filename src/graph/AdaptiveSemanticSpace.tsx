import { Focus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AtlasGraphV1,
  MatrixCell,
  OperationalAlignment,
} from "../types";
import { graphNodeLabel, type FreshnessBucket } from "./model";
import { LivingGraphCanvas } from "./LivingGraphCanvas";
import { buildSemanticSpaceScene } from "./semantic-space-adapter";
import type {
  SemanticSpaceController,
  SemanticSpaceDebugCounters,
  SemanticSpaceLabelAnchor,
  SemanticSpaceSceneKind,
  SemanticSpacePresentation,
} from "./semantic-space-contract";
import { loadSemanticSpaceModule, semanticSpaceSupported } from "./semantic-space-loader";

type Status = "fallback" | "loading" | "ready";

export function AdaptiveSemanticSpace({
  graph,
  scene = "field",
  focusId,
  previewId = null,
  districtId = null,
  freshness = "all",
  from = null,
  to = null,
  mobile = false,
  reducedMotion = false,
  presentation = "workspace",
  districtRelationMatrix = [],
  onSelect,
  onHover,
  persistentLabelIds = [],
  highlightNodeIds = [],
  operationalAlignment = null,
  operationalActorLabel = null,
  committedSelectionId,
  className = "",
}: {
  graph: AtlasGraphV1;
  scene?: SemanticSpaceSceneKind;
  focusId: string | null;
  previewId?: string | null;
  districtId?: string | null;
  freshness?: FreshnessBucket;
  from?: string | null;
  to?: string | null;
  mobile?: boolean;
  reducedMotion?: boolean;
  presentation?: SemanticSpacePresentation;
  districtRelationMatrix?: readonly MatrixCell[];
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  persistentLabelIds?: readonly string[];
  highlightNodeIds?: readonly string[];
  operationalAlignment?: OperationalAlignment | null;
  operationalActorLabel?: string | null;
  committedSelectionId?: string | null;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRootRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SemanticSpaceController | null>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const [status, setStatus] = useState<Status>(() =>
    !mobile && semanticSpaceSupported() ? "loading" : "fallback");
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const currentFocus = committedSelectionId === undefined ? focusId : committedSelectionId;
  const semanticScene = useMemo(() => buildSemanticSpaceScene({
    graph,
    matrix: districtRelationMatrix,
    kind: scene,
    presentation,
    focusId,
    previewId: null,
    districtId,
    freshness,
    from,
    to,
    persistentLabelIds,
    reducedMotion,
    labelBudget: presentation === "home" ? 13 : 18,
  }), [
    districtId,
    districtRelationMatrix,
    focusId,
    freshness,
    from,
    graph,
    persistentLabelIds,
    presentation,
    reducedMotion,
    scene,
    to,
  ]);
  const nodeById = useMemo(
    () => new Map(semanticScene.nodes.map((node) => [node.id, node])),
    [semanticScene.nodes],
  );
  const labelNodes = useMemo(
    () => semanticScene.labelIds.flatMap((id) => {
      const node = nodeById.get(id);
      return node ? [node] : [];
    }),
    [nodeById, semanticScene.labelIds],
  );
  const latestSceneRef = useRef(semanticScene);
  latestSceneRef.current = semanticScene;
  const interactionRef = useRef({ focusId, previewId });
  interactionRef.current = { focusId, previewId };

  useEffect(() => {
    if (mobile || !semanticSpaceSupported()) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setStatus("fallback");
      return;
    }
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let resizeFrame = 0;
    let visibilityHandler: (() => void) | null = null;
    setStatus("loading");
    loadSemanticSpaceModule()
      .then((module) => {
        if (cancelled || !engineRootRef.current) return;
        const controller = module.mount(engineRootRef.current, latestSceneRef.current, {
          onReady() {
            if (!cancelled) setStatus("ready");
          },
          onPreview(id) {
            onHover?.(id);
          },
          onCommit(id) {
            onSelect(id);
          },
          onLabelFrame(anchors: SemanticSpaceLabelAnchor[]) {
            const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
            const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
            for (const [id, element] of labelRefs.current) {
              const anchor = anchorById.get(id);
              if (!anchor?.visible) {
                element.hidden = true;
                continue;
              }
              element.style.transform = `translate3d(${Math.round(anchor.x)}px, ${Math.round(anchor.y)}px, 0) translate(-50%, calc(-100% - 10px))`;
              element.style.setProperty("--semantic-label-depth", String(anchor.depth));
              const width = Math.max(44, element.offsetWidth);
              const height = Math.max(24, element.offsetHeight);
              const box = {
                left: anchor.x - width / 2,
                right: anchor.x + width / 2,
                top: anchor.y - height - 10,
                bottom: anchor.y - 10,
              };
              const force = id === interactionRef.current.previewId || id === interactionRef.current.focusId;
              const overlaps = occupied.some((prior) =>
                !(box.right + 5 < prior.left || box.left - 5 > prior.right
                  || box.bottom + 4 < prior.top || box.top - 4 > prior.bottom));
              const crossesEditorialRail = presentation === "home"
                && anchor.x < Math.min(460, root.clientWidth * 0.36);
              element.hidden = (overlaps || crossesEditorialRail) && !force;
              if (!element.hidden) occupied.push(box);
            }
          },
          onContextLost() {
            controllerRef.current?.dispose();
            controllerRef.current = null;
            setStatus("fallback");
          },
          onDebug(debug: SemanticSpaceDebugCounters) {
            if (hostRef.current) hostRef.current.dataset.semanticDebug = JSON.stringify(debug);
          },
        });
        controllerRef.current = controller;
        const root = engineRootRef.current;
        observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry || resizeFrame) return;
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            controller.resize(
              entry.contentRect.width,
              entry.contentRect.height,
              window.devicePixelRatio || 1,
            );
          });
        });
        observer.observe(root);
        visibilityHandler = () => controller.setVisible(document.visibilityState === "visible");
        document.addEventListener("visibilitychange", visibilityHandler);
      })
      .catch(() => {
        if (!cancelled) setStatus("fallback");
      });
    return () => {
      cancelled = true;
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
    // Mount the lazy engine once. Scene, focus and preview have dedicated
    // imperative update effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

  useEffect(() => {
    controllerRef.current?.setScene(semanticScene);
  }, [semanticScene]);

  useEffect(() => {
    controllerRef.current?.setPreview(previewId);
  }, [previewId]);

  useEffect(() => {
    controllerRef.current?.setFocus(focusId);
  }, [focusId]);

  const activeKeyboardNode = semanticScene.nodes[Math.min(keyboardIndex, Math.max(0, semanticScene.nodes.length - 1))] ?? null;

  return (
    <div
      ref={hostRef}
      className={`semantic-space-host is-${status} ${className}`.trim()}
      style={{
        background: "radial-gradient(ellipse at 73% 49%,rgba(170,119,65,.17),transparent 36%),radial-gradient(ellipse at 51% 73%,rgba(60,83,112,.12),transparent 34%),radial-gradient(circle at 84% 24%,rgba(115,80,119,.07),transparent 24%),linear-gradient(138deg,#0a0905 0%,#080704 54%,#06070a 100%)",
      }}
      data-renderer={status === "ready" ? "three" : "canvas2d"}
      data-semantic-space="atlas.semantic_space_renderer.v1"
    >
      {status !== "ready" && <div className="semantic-space-fallback">
        <LivingGraphCanvas
          graph={graph}
          scene={scene}
          focusId={focusId}
          previewId={previewId}
          districtId={districtId}
          freshness={freshness}
          from={from}
          to={to}
          mobile={mobile}
          reducedMotion={reducedMotion}
          presentation={presentation}
          districtRelationMatrix={districtRelationMatrix}
          onSelect={onSelect}
          onHover={onHover}
          persistentLabelIds={persistentLabelIds}
          highlightNodeIds={highlightNodeIds}
          operationalAlignment={operationalAlignment}
          operationalActorLabel={operationalActorLabel}
          committedSelectionId={committedSelectionId}
        />
      </div>}
      {!mobile && status !== "fallback" && (
        <>
          <div ref={engineRootRef} className="semantic-space-engine" />
          <div className="semantic-space-labels graph-label-layer" aria-hidden="true">
            {labelNodes.map((node) => (
              <button
                key={node.id}
                ref={(element) => {
                  if (element) labelRefs.current.set(node.id, element);
                  else labelRefs.current.delete(node.id);
                }}
                type="button"
                className={`${node.id === currentFocus ? "is-focused" : ""}${node.id === previewId ? " is-preview" : ""}`}
                onPointerEnter={() => onHover?.(node.id)}
                onPointerLeave={() => onHover?.(null)}
                onClick={() => onSelect(node.id)}
                tabIndex={-1}
              >
                {node.label}
              </button>
            ))}
          </div>
          <div className="semantic-space-camera-tools graph-camera-controls" lang="ko">
            <span className="sr-only"><Focus size={13} aria-hidden="true" /> 드래그로 공간 회전 · 스크롤로 거리 조절</span>
            <button type="button" aria-label="3D 시점 복귀" onClick={() => controllerRef.current?.resetCamera()}>
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          </div>
          <div
            className="semantic-space-accessible-map graph-accessible-list"
            role="listbox"
            tabIndex={0}
            aria-label="3D 지식 공간의 키보드 탐색"
            aria-activedescendant={activeKeyboardNode ? `semantic-node-${activeKeyboardNode.id}` : undefined}
            onFocus={() => activeKeyboardNode && onHover?.(activeKeyboardNode.id)}
            onBlur={() => onHover?.(null)}
            onKeyDown={(event) => {
              if (!semanticScene.nodes.length) return;
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                const next = (keyboardIndex + 1) % semanticScene.nodes.length;
                setKeyboardIndex(next);
                onHover?.(semanticScene.nodes[next].id);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = (keyboardIndex - 1 + semanticScene.nodes.length) % semanticScene.nodes.length;
                setKeyboardIndex(next);
                onHover?.(semanticScene.nodes[next].id);
              } else if ((event.key === "Enter" || event.key === " ") && activeKeyboardNode) {
                event.preventDefault();
                onSelect(activeKeyboardNode.id);
              } else if (event.key === "Escape") {
                event.preventDefault();
                controllerRef.current?.resetCamera();
                onHover?.(null);
              }
            }}
          >
            {semanticScene.nodes.map((node, index) => (
              <div
                key={node.id}
                id={`semantic-node-${node.id}`}
                role="option"
                aria-selected={node.id === currentFocus}
                data-active={index === keyboardIndex ? "true" : undefined}
              >
                {graphNodeLabel(graph.nodes.find((item) => item.id === node.id)!)}
                {" · "}
                참조 문서 {node.gravity}
                {" · "}
                들어옴 {node.incomingCount}
                {" · "}
                나감 {node.outgoingCount}
              </div>
            ))}
          </div>
          {status === "loading" && <span className="semantic-space-loading" role="status">3D 지식 공간 준비 중</span>}
        </>
      )}
    </div>
  );
}
