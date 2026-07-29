import { useEffect, useMemo, useRef } from "react";
import type { AtlasGraphModel, CosmosLens, GraphNodeKind } from "./contracts";
import { paintMobileGraph, type ProjectedMobileNode } from "./mobile-graph-painter";

export function MobileGraphCanvas({
  graph,
  lens,
  focusId,
  previewId,
  activeDomainsOverride,
  activeKindsOverride,
  onPreview,
  onCommit,
}: {
  graph: AtlasGraphModel;
  lens: CosmosLens;
  focusId: string | null;
  previewId: string | null;
  activeDomainsOverride?: string[];
  activeKindsOverride?: GraphNodeKind[];
  onPreview(id: string | null): void;
  onCommit(id: string): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectedRef = useRef<ProjectedMobileNode[]>([]);
  const activeDomains = useMemo(() => new Set(activeDomainsOverride ?? (
    lens === "knowledge-core"
      ? ["MOC", "Papers", "Signals"]
      : lens === "project-frontiers"
        ? ["Rocket", "Groot", "Intelligence Layer"]
        : []
  )), [activeDomainsOverride, lens]);
  const activeKinds = useMemo(() => new Set(activeKindsOverride ?? []), [activeKindsOverride]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = () => {
      projectedRef.current = paintMobileGraph({
        canvas,
        context,
        graph,
        activeDomains,
        activeKinds,
        focusId,
        previewId,
      });
    };
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    draw();
    return () => resize.disconnect();
  }, [activeDomains, activeKinds, focusId, graph, lens, previewId]);

  const pick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const hit = [...projectedRef.current]
      .sort((left, right) => right.radius - left.radius)
      .find((node) => Math.hypot(node.x - x, node.y - y) <= node.radius);
    onPreview(hit?.id ?? null);
    if (event.type === "pointerup" && hit) onCommit(hit.id);
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="mobile-cosmos-canvas"
        aria-label="전체 지식 지형. 목록 화면에서 모든 노드와 관계를 키보드로 탐색할 수 있습니다."
        onPointerMove={pick}
        onPointerLeave={() => onPreview(null)}
        onPointerUp={pick}
      />
      <section className="visually-hidden" aria-label="Knowledge domain summary">
        <h2>공개 지식 영역</h2>
        <ul>
          {graph.domains.map((domain) => (
            <li key={domain.id}>
              {domain.label}: {domain.nodeIndexes.length}개 지식 노드
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
