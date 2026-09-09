import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ChevronRight, Compass, FileText, Folder, Map as MapIcon, X } from "lucide-react";
import { nodeById, type ProjectId } from "./content";
import { islands, islandById, placeById, placesForNode, mapEntries, mapEntryById, containmentEdges, editorialConnections, mapReadingNote, type AtlasMapEntry, type KnowledgeObject, type MapView } from "./islands";

import type { CameraSnapshot } from "./world";

interface Props {
  view: MapView;
  camera?: CameraSnapshot;
  islandId?: ProjectId;
  selectedNodeId?: string;
  selectedPlaceId?: string;
  onPlaceChange: (id: string | undefined) => void;
  expanded: string[];
  onExpanded: (ids: string[]) => void;
  onChange: (view: MapView, island?: ProjectId, node?: string) => void;
  onClose: () => void;
  onRead: (id: string) => void;
  onEnter: (id: string) => void;
  onEnterIsland: (id: ProjectId) => void;
  onEnterPlace: (id: ProjectId, placeId: string) => void;
}
// These share the authored overview layout. Final renderer readback must confirm image alignment.
const worldBounds = { minX: -14, maxX: 14, minZ: -11, maxZ: 15 };
const worldAnchors: Record<ProjectId, [number, number]> = { rocket: [-8, -4], groot: [6, -1], common: [-7, 7], atlas: [2, 7] };
const parentOf = new Map(containmentEdges.map(edge => [edge.targetId, edge.sourceId]));
const childrenOf = new Map<string, AtlasMapEntry[]>();
for (const edge of containmentEdges) {
  const child = mapEntryById.get(edge.targetId);
  if (child) childrenOf.set(edge.sourceId, [...(childrenOf.get(edge.sourceId) ?? []), child]);
}
const roots = mapEntries.filter(entry => !parentOf.has(entry.id));
function locationLabel(entry: AtlasMapEntry) {
  const result = [entry.label], visited = new Set([entry.id]);
  let parent = parentOf.get(entry.id);
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    const item = mapEntryById.get(parent);
    if (!item) break;
    result.unshift(item.label); parent = parentOf.get(parent);
  }
  return result.join(" / ");
}
function SceneMapImage({ src, label, onAvailable, onAspect }: { src: string; label: string; onAvailable: (value: boolean) => void; onAspect: (ratio: number) => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); onAvailable(false); }, [src]);
  return failed ? <div className="map-image-unavailable" role="status"><MapIcon size={28} /><strong>지도 이미지를 불러오지 못했습니다.</strong><p>장소 목록에서 같은 이야기와 섬으로 이동할 수 있습니다.</p></div> :
    <img className="map-scene-image" src={`./${src}`} alt={label} onLoad={event => { onAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight); onAvailable(true); }} onError={() => { setFailed(true); onAvailable(false); }} />;
}

export const AtlasMap = forwardRef<HTMLElement, Props>(function AtlasMap(props, ref) {
  const { view, islandId, selectedNodeId, expanded, onExpanded, onChange } = props;
  const island = islandId ? islandById.get(islandId) : undefined;
  const candidateNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const localPlaceId = props.selectedPlaceId;
  const setLocalPlaceId = props.onPlaceChange;
  const localPlace = localPlaceId ? placeById.get(localPlaceId) : undefined;
  const selectedNode = !localPlace || localPlace.contentIds.includes(selectedNodeId || "") ? candidateNode : undefined;
  const nodePlaces = selectedNode ? placesForNode(selectedNode.id) : [];
  const selectedPlace = (localPlaceId ? placeById.get(localPlaceId) : undefined) ?? nodePlaces.find(place => place.islandId === islandId);
  const relatedConnections = selectedNode ? editorialConnections.filter(connection => connection.sourceContentId === selectedNode.id || connection.targetContentId === selectedNode.id) : [];
  const selectedLocations = selectedNode ? mapEntries.filter(entry => entry.contentNodeIds.includes(selectedNode.id)) : [];
  const [focusedRow, setFocusedRow] = useState(roots[0]?.id || "");
  const [imageAvailable, setImageAvailable] = useState(false);
  const [imageAspect, setImageAspect] = useState(1);
  const mapSurface = useRef<HTMLDivElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => { if (detail.current) detail.current.scrollTop = 0; }, [selectedNodeId]);
  const [size, setSize] = useState({ width: 640, height: 520 });
  useEffect(() => { const place = localPlaceId ? placeById.get(localPlaceId) : undefined; if (place && (place.islandId !== islandId || (selectedNodeId && !place.contentIds.includes(selectedNodeId)))) setLocalPlaceId(undefined); }, [selectedNodeId, islandId]);
  useEffect(() => {
    const surface = mapSurface.current;
    if (!surface) return;
    const observer = new ResizeObserver(() => setSize({ width: surface.clientWidth, height: surface.clientHeight }));
    observer.observe(surface);
    return () => observer.disconnect();
  }, [view, islandId]);
  useEffect(() => {
    if (!selectedNode) return;
    const next = new Set(expanded);
    for (const entry of selectedLocations) {
      let parent = parentOf.get(entry.id);
      while (parent && !next.has(parent)) { next.add(parent); parent = parentOf.get(parent); }
    }
    if (next.size !== expanded.length) onExpanded([...next]);
  }, [selectedNodeId]);
  const rows = useMemo(() => {
    const result: Array<{ entry: AtlasMapEntry; depth: number }> = [];
    function walk(entry: AtlasMapEntry, depth: number, parents: Set<string>) {
      if (parents.has(entry.id)) return;
      result.push({ entry, depth });
      if (expanded.includes(entry.id)) for (const child of childrenOf.get(entry.id) ?? []) walk(child, depth + 1, new Set([...parents, entry.id]));
    }
    for (const root of roots) walk(root, 1, new Set());
    return result;
  }, [expanded]);
  const markers = useMemo(() => {
    const data = island ? island.places.map((place, index) => ({ id: place.id, label: place.label, index, point: [place.interactionAnchor[0], place.interactionAnchor[2]] as [number, number] })) :
      islands.map((item, index) => ({ id: item.id, label: item.label, index, point: worldAnchors[item.id] }));
    const bounds = island?.mapBounds ?? worldBounds;
    const placed: Array<{ x: number; y: number }> = [];
    return data.map(marker => {
      const drawWidth = Math.min(size.width, size.height * imageAspect);
      const drawHeight = drawWidth / imageAspect;
      const actualX = (size.width - drawWidth) / 2 + (marker.point[0] - bounds.minX) / (bounds.maxX - bounds.minX) * drawWidth;
      const actualY = (size.height - drawHeight) / 2 + (marker.point[1] - bounds.minZ) / (bounds.maxZ - bounds.minZ) * drawHeight;
      let x = Math.max(24, Math.min(actualX, size.width - 24)), y = Math.max(24, Math.min(actualY, size.height - 24));
      if (island) for (let ring = 0; ring < 3 && placed.some(p => Math.hypot(p.x - x, p.y - y) < 48); ring++) {
        const choices = Array.from({ length: 8 }, (_, index) => ({ x: actualX + Math.cos(index * Math.PI / 4) * (ring + 1) * 48, y: actualY + Math.sin(index * Math.PI / 4) * (ring + 1) * 48 }));
        const fit = choices.find(p => p.x >= 24 && p.y >= 24 && p.x <= size.width - 24 && p.y <= size.height - 24 && placed.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= 48));
        if (fit) { x = fit.x; y = fit.y; break; }
      }
      placed.push({ x, y });
      return { ...marker, x, y, actualX, actualY };
    });
  }, [islandId, size, imageAspect]);
  const cameraMark = useMemo(() => {
    const camera = props.camera;
    if (!camera || camera.sceneId !== (islandId ?? "world")) return undefined;
    const bounds = island?.mapBounds ?? worldBounds;
    const width = Math.min(size.width, size.height * imageAspect), height = width / imageAspect;
    const left = (size.width - width) / 2, top = (size.height - height) / 2;
    const project = (point: [number, number, number]) => ({ x: left + (point[0] - bounds.minX) / (bounds.maxX - bounds.minX) * width, y: top + (point[2] - bounds.minZ) / (bounds.maxZ - bounds.minZ) * height });
    const contains = (point: [number, number, number]) => point[0] >= bounds.minX && point[0] <= bounds.maxX && point[2] >= bounds.minZ && point[2] <= bounds.maxZ;
    return { position: project(camera.position), target: project(camera.target), positionInside: contains(camera.position), targetInside: contains(camera.target), rect: { left, top, width, height } };
  }, [props.camera, islandId, size, imageAspect]);
  function selectPlace(place: KnowledgeObject) {
    setLocalPlaceId(place.id);
    const node = place.contentIds[0];
    onChange("islands", place.islandId, node);
  }
  function toggle(id: string) { onExpanded(expanded.includes(id) ? expanded.filter(item => item !== id) : [...expanded, id]); }
  function focusRow(id: string) {
    setFocusedRow(id);
    requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)?.focus());
  }
  function treeKey(event: React.KeyboardEvent, entry: AtlasMapEntry) {
    const index = rows.findIndex(row => row.entry.id === entry.id);
    let target: string | undefined;
    if (event.key === "ArrowDown") target = rows[Math.min(rows.length - 1, index + 1)]?.entry.id;
    if (event.key === "ArrowUp") target = rows[Math.max(0, index - 1)]?.entry.id;
    if (event.key === "Home") target = rows[0]?.entry.id;
    if (event.key === "End") target = rows.at(-1)?.entry.id;
    if (event.key === "ArrowRight" && entry.kind === "folder") {
      if (!expanded.includes(entry.id)) toggle(entry.id);
      else target = childrenOf.get(entry.id)?.[0]?.id;
    }
    if (event.key === "ArrowLeft") {
      if (entry.kind === "folder" && expanded.includes(entry.id)) toggle(entry.id);
      else target = parentOf.get(entry.id);
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "ArrowRight", "ArrowLeft"].includes(event.key)) event.preventDefault();
    if (target) focusRow(target);
  }
  const tabs = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: MapView = event.key === "Home" ? "islands" : event.key === "End" ? "vault" : view === "islands" ? "vault" : "islands";
    onChange(next, islandId, selectedNodeId);
    requestAnimationFrame(() => document.getElementById(`map-tab-${next}`)?.focus());
  };
  return <section className="atlas-map-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="atlas-map-title">
    <header className="map-heading"><div><span className="overline">PLACES & CONNECTIONS</span><h1 id="atlas-map-title" tabIndex={-1} data-modal-heading> 펼쳐 보는 지도</h1></div><button className="icon-button" aria-label="지도 닫기" onClick={props.onClose}><X size={21} /></button></header>
    <div className="map-mode-row"><div className="map-tabs" role="tablist" aria-label="지도 보기">{(["islands", "vault"] as const).map(mode => <button data-atlas-focus={`map-tab-${mode}`} id={`map-tab-${mode}`} key={mode} role="tab" aria-selected={view === mode} tabIndex={view === mode ? 0 : -1} aria-controls="map-view-content" onKeyDown={tabs} onClick={() => onChange(mode, islandId, selectedNodeId)}>{mode === "islands" ? "섬 지도" : "볼트 구조"}</button>)}</div><p>{view === "islands" ? "섬은 이야기를 만나는 장소입니다. 실제 보관 위치는 볼트 구조에서 봅니다." : "아틀라스에 담은 자료의 실제 폴더와 문서 위치를 펼쳐 봅니다."}</p></div>
    <div id="map-view-content" className={`map-body ${view}`} role="tabpanel" aria-labelledby={`map-tab-${view}`} data-map-scroll>
      {view === "islands" ? <>
        <aside className="map-place-sidebar"><h2>{island?.label || "네 개의 섬"}</h2><nav aria-label={island ? "이 섬의 장소" : "지도에서 섬 선택"}>{island ? island.places.map((place, index) => <button key={place.id} data-atlas-focus={`map-place-${place.id}`} aria-pressed={selectedPlace?.id === place.id} onClick={() => selectPlace(place)}><small>{String(index + 1).padStart(2, "0")}</small><span>{place.label}</span><ChevronRight size={15} /></button>) : islands.map((item, index) => <button key={item.id} data-atlas-focus={`map-island-${item.id}`} onClick={() => onChange("islands", item.id, candidateNode && placesForNode(candidateNode.id).some(place => place.islandId === item.id) ? candidateNode.id : undefined)}><small>{String(index + 1).padStart(2, "0")}</small><span>{item.label}</span><ChevronRight size={15} /></button>)}</nav></aside>
        <div className="map-visual-column"><div className="map-surface" ref={mapSurface}>
          <SceneMapImage src={island?.mapImage || "assets/maps/world.webp"} label={island ? `${island.label}, 같은 섬 지형을 위에서 본 지도` : "네 섬으로 이루어진 아틀라스의 전체 지도"} onAvailable={setImageAvailable} onAspect={setImageAspect} />
          {island && <button className="map-all-islands paper-button" onClick={() => onChange("islands", undefined, selectedNodeId)}><ArrowLeft size={14} /> 모든 섬</button>}
          {imageAvailable && cameraMark && <svg className="map-camera-position" width="100%" height="100%" role="img" aria-label={cameraMark.positionInside ? "현재 관람 시점과 바라보는 방향" : "바라보는 방향과 중심. 관람 시점은 지도 범위 밖입니다."}><defs><clipPath id="atlas-map-camera-clip"><rect x={cameraMark.rect.left} y={cameraMark.rect.top} width={cameraMark.rect.width} height={cameraMark.rect.height} /></clipPath></defs><g clipPath="url(#atlas-map-camera-clip)"><line x1={cameraMark.position.x} y1={cameraMark.position.y} x2={cameraMark.target.x} y2={cameraMark.target.y} />{cameraMark.positionInside && <circle className="camera-origin" cx={cameraMark.position.x} cy={cameraMark.position.y} r="7" />}{cameraMark.targetInside && <><circle className="camera-target" cx={cameraMark.target.x} cy={cameraMark.target.y} r="11" /><circle className="camera-target-dot" cx={cameraMark.target.x} cy={cameraMark.target.y} r="3" /></>}</g></svg>}
          {imageAvailable && <><svg className="map-leaders" width="100%" height="100%" aria-hidden="true">{markers.map(marker => <line key={marker.id} x1={marker.actualX} y1={marker.actualY} x2={marker.x} y2={marker.y} />)}</svg>{markers.map(marker => <button key={marker.id} data-atlas-focus={`map-marker-${marker.id}`} className={`map-marker ${selectedPlace?.id === marker.id ? "selected" : ""} ${island ? "" : "island-marker"}`} style={{ left: marker.x, top: marker.y }} aria-label={island ? `${marker.label}, 지도에서 선택` : `${marker.label} 섬 지도 펼치기`} aria-pressed={island ? selectedPlace?.id === marker.id : undefined} title={marker.label} onClick={() => island ? selectPlace(placeById.get(marker.id)!) : onChange("islands", marker.id as ProjectId, candidateNode && placesForNode(candidateNode.id).some(place => place.islandId === marker.id) ? candidateNode.id : undefined)}>{island ? String(marker.index + 1).padStart(2, "0") : marker.label.split(" · ")[0]}</button>)}</>}
        </div><p className="map-legend"><span /> {island ? "번호를 누르거나 장소 목록에서 골라 보세요." : "섬을 고르면 가까운 장소들이 펼쳐집니다."}</p>{cameraMark && imageAvailable && <p className="map-camera-legend"><span /> {cameraMark.positionInside ? "현재 관람 시점과 바라보는 곳" : "지금 바라보는 곳 · 관람 시점은 지도 범위 밖"}</p>}</div>
      </> : <>
        <div className="vault-tree" role="tree" aria-label="폴더와 문서 구조" ref={tree}>
          {rows.map(({ entry, depth }) => <button key={entry.id} role="treeitem" data-tree-id={entry.id} data-atlas-focus={`tree-${entry.id}`} aria-level={depth} aria-expanded={entry.kind === "folder" ? expanded.includes(entry.id) : undefined} aria-selected={Boolean(selectedNodeId && entry.contentNodeIds.includes(selectedNodeId))} tabIndex={focusedRow === entry.id || !rows.some(row => row.entry.id === focusedRow) && rows[0].entry.id === entry.id ? 0 : -1} style={{ paddingLeft: 12 + (depth - 1) * 22 }} onFocus={() => setFocusedRow(entry.id)} onKeyDown={event => treeKey(event, entry)} onClick={() => { if (entry.kind === "folder") toggle(entry.id); else if (entry.contentNodeIds[0]) onChange("vault", entry.islandIds[0] ?? islandId, entry.contentNodeIds[0]); }}><ChevronRight className={expanded.includes(entry.id) ? "expanded" : entry.kind === "document" ? "hidden-chevron" : ""} size={14} />{entry.kind === "folder" ? <Folder size={17} /> : <FileText size={16} />}<span>{entry.label}</span>{selectedNodeId && entry.contentNodeIds.includes(selectedNodeId) && <small>선택한 자료</small>}</button>)}
        </div><aside className="vault-selection" ref={detail}><span className="overline">자료가 놓인 곳</span><h2>{selectedNode?.title || "문서를 골라 보세요"}</h2><p>{selectedNode ? selectedLocations.length ? "이 이야기와 연결된 실제 보관 위치입니다. 한 이야기가 여러 원문 자료를 바탕으로 할 수 있습니다." : "이 이야기의 주제와 관련 자료를 아래에서 이어 볼 수 있습니다." : "폴더를 펼치고 문서를 선택하면, 아틀라스의 이야기와 연결되는 위치를 볼 수 있습니다."}</p>{selectedLocations.map(location => <div key={location.id} className="source-location"><FileText size={17} /><span>{locationLabel(location)}</span></div>)}{selectedLocations.length === 0 && selectedNode && <p className="map-scope-note">이 항목은 관련 내용을 묶어 소개하는 이야기입니다. 지도에 표시된 개별 폴더나 문서와 직접 대응하지 않습니다.</p>}{selectedNode && <section className="map-topic-connections" aria-label="주제로 이어지는 자료"><h3>주제로 이어지는 자료</h3><p>Atlas가 내용을 읽고 연결한 관계입니다. 폴더의 포함관계와 구분합니다.</p>{relatedConnections.map(connection => { const otherId = connection.sourceContentId === selectedNode.id ? connection.targetContentId : connection.sourceContentId; const other = nodeById.get(otherId); if (!other) return null; return <button key={`${connection.sourceContentId}-${connection.targetContentId}-${connection.relation}`} data-atlas-focus={`map-topic-${otherId}`} onClick={() => onChange("vault", placesForNode(otherId)[0]?.islandId, otherId)}><span>{nodeById.get(connection.sourceContentId)?.title} <ArrowRight size={12} /> {nodeById.get(connection.targetContentId)?.title}</span><strong>{other.title}</strong><small>{connection.label}</small><ChevronRight size={15} /></button>; })}{relatedConnections.length === 0 && <p className="map-scope-note">이 이야기에서 추가로 표시할 주제 연결은 없습니다.</p>}</section>}</aside>
      </>}
    </div>
    <footer className="map-selection-footer"><div><h2>{selectedNode?.title || selectedPlace?.label || island?.label || "이 세계에서 만나고 싶은 곳"}{selectedNode && selectedPlace && selectedNode.title !== selectedPlace.label && <small> · {selectedPlace.label}</small>}</h2><p>{selectedNode?.summary || selectedPlace?.question || (island ? "장소를 골라 이야기를 읽거나, 섬으로 들어가 보세요." : "지도와 자료는 같은 이야기를 서로 다른 모습으로 보여 줍니다.")}</p></div><div className="map-selection-actions">{selectedNode && <button className="button" data-atlas-focus="map-read" onClick={() => props.onRead(selectedNode.id)}><BookOpen size={16} /> 자료 읽기</button>}{selectedNode ? <button className="button outline" data-atlas-focus="map-enter-node" onClick={() => props.onEnter(selectedNode.id)}><Compass size={16} /> 섬에서 보기</button> : selectedPlace ? <button className="button outline" data-atlas-focus="map-enter-place" onClick={() => props.onEnterPlace(selectedPlace.islandId, selectedPlace.id)}>섬에서 보기 <ArrowRight size={16} /></button> : island && <button className="button outline" data-atlas-focus="map-enter-island" onClick={() => props.onEnterIsland(island.id)}>입장 <ArrowRight size={16} /></button>}</div></footer>
    <p className="map-reading-note">Atlas는 안내 섬이며 볼트의 폴더가 아닙니다. 살아 있는 지식은 여러 실제 보관 위치를 연결합니다.<span>{mapReadingNote}</span></p>
  </section>;
});
