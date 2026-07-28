import { useEffect, useMemo, useRef } from "react";
import type { AtlasGraphModel, CosmosLens } from "./contracts";

interface ProjectedNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
}

export function MobileGraphCanvas({
  graph,
  lens,
  focusId,
  previewId,
  onPreview,
  onCommit,
}: {
  graph: AtlasGraphModel;
  lens: CosmosLens;
  focusId: string | null;
  previewId: string | null;
  onPreview(id: string | null): void;
  onCommit(id: string): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectedRef = useRef<ProjectedNode[]>([]);
  const activeDomains = useMemo(() => lens === "knowledge-core"
    ? new Set(["MOC", "Papers", "Signals"])
    : lens === "project-frontiers"
      ? new Set(["Rocket", "Groot", "Intelligence Layer"])
      : new Set<string>(), [lens]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const pad = 12;
      const scaleX = (width - pad * 2) / Math.max(1, graph.bounds.width);
      const scaleY = (height - pad * 2) / Math.max(1, graph.bounds.depth);
      const horizontalScale = Math.min(scaleX, scaleY);
      const verticalScale = horizontalScale;
      const offsetX = (width - graph.bounds.width * horizontalScale) / 2;
      const offsetY = (height - graph.bounds.depth * verticalScale) / 2 - height * 0.17;
      const activeId = previewId ?? focusId;
      const active = activeId ? graph.nodeById.get(activeId) : null;
      const activeDomain = active?.domain ?? null;
      const edgeIndexes = new Set([
        ...(active?.incoming.slice(0, 6) ?? []),
        ...(active?.outgoing.slice(0, 6) ?? []),
      ]);
      const neighbors = new Set<number>();
      edgeIndexes.forEach((index) => {
        neighbors.add(graph.edges[index].source);
        neighbors.add(graph.edges[index].target);
      });
      context.lineWidth = 0.55;
      graph.edges.forEach((edge) => {
        const source = graph.nodes[edge.source];
        const target = graph.nodes[edge.target];
        const selected = edgeIndexes.has(edge.index);
        const domainVisible = !activeDomains.size
          || activeDomains.has(source.domain)
          || activeDomains.has(target.domain);
        const sharesFocusDomain = activeDomain === source.domain || activeDomain === target.domain;
        context.globalAlpha = activeId
          ? selected ? 0.82 : sharesFocusDomain ? 0.11 : 0.06
          : domainVisible ? 0.11 : 0.018;
        context.strokeStyle = selected ? "#f2b35f" : "#79838b";
        context.beginPath();
        context.moveTo(
          offsetX + source.position[0] * horizontalScale,
          offsetY + source.position[2] * verticalScale,
        );
        context.lineTo(
          offsetX + target.position[0] * horizontalScale,
          offsetY + target.position[2] * verticalScale,
        );
        context.stroke();
      });
      const maxGravity = Math.max(...graph.nodes.map((node) => node.gravity), 1);
      const projected = graph.nodes.map((node) => {
        const selected = node.id === activeId;
        const neighbor = neighbors.has(node.index);
        const domainDimmed = activeDomains.size > 0 && !activeDomains.has(node.domain);
        const sameDomain = activeDomain === node.domain;
        const radius = Math.max(1.35, 1.55 + Math.sqrt(node.gravity / maxGravity) * 5.4);
        const color = graph.domains[node.domainIndex]?.color ?? "#8c959a";
        const x = offsetX + node.position[0] * horizontalScale;
        const y = offsetY + node.position[2] * verticalScale;
        context.globalAlpha = activeId
          ? selected ? 1 : neighbor ? 0.94 : sameDomain ? 0.72 : 0.44
          : domainDimmed ? 0.2 : 0.82;
        context.fillStyle = selected ? "#f2b35f" : color;
        context.shadowColor = selected ? "#f2b35f" : color;
        context.shadowBlur = selected ? radius * 2.6 : radius * 0.4;
        context.beginPath();
        context.arc(x, y, selected ? radius * 1.24 : radius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        return { id: node.id, x, y, radius: Math.max(12, radius * 1.8), color };
      });
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = '600 12px "Pretendard Variable", sans-serif';
      graph.domains.forEach((domain) => {
        if (!domain.nodeIndexes.length) return;
        const center = domain.nodeIndexes.reduce(
          (sum, index) => {
            const node = graph.nodes[index];
            sum[0] += offsetX + node.position[0] * horizontalScale;
            sum[1] += offsetY + node.position[2] * verticalScale;
            return sum;
          },
          [0, 0],
        ).map((value) => value / domain.nodeIndexes.length);
        const textWidth = context.measureText(domain.label).width;
        const domainDimmed = activeDomains.size > 0 && !activeDomains.has(domain.label);
        context.globalAlpha = domainDimmed ? 0.42 : 0.94;
        context.fillStyle = "rgba(9, 8, 11, 0.78)";
        context.fillRect(center[0] - textWidth / 2 - 6, center[1] - 10, textWidth + 12, 20);
        context.fillStyle = "#f2ece4";
        context.fillText(domain.label, center[0], center[1] + 0.5);
      });
      context.globalAlpha = 1;
      projectedRef.current = projected;
    };
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    draw();
    return () => resize.disconnect();
  }, [activeDomains, focusId, graph, lens, previewId]);

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
