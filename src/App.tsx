import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Search,
  X,
  Plus,
  Minus,
  Compass,
  BookOpen,
  Pause,
  Play,
  SlidersHorizontal,
  ChevronRight,
  Layers,
  RotateCcw,
  Download,
  Check,
  Link as LinkIcon,
  Map as MapIcon,
  List,
  HelpCircle,
  ChevronLeft,
  Move,
} from "lucide-react";
import {
  content,
  nodes,
  projects,
  nodeById,
  evidenceRecords,
  evidenceFor,
  artworkFor,
  artworkDescriptionFor,
  projectFor,
  searchNodes,
  type AtlasNode,
  type ProjectId,
} from "./content";
import type { AtlasWorld, CameraSnapshot, SceneState, PlacePosition } from "./world";
import { islands, islandById, placeById, placesForNode, knowledgeObjects, type KnowledgeObject } from "./islands";
import { useAtlasNavigation, type UISnapshot } from "./atlas-navigation";
import { AtlasMap } from "./AtlasMap";
import { captureSceneHistory, resolveSceneReturn } from "./scene-return";

const destinations: Record<
  ProjectId,
  { name: string; caption: string; entry: string; number: string }
> = {
  rocket: {
    name: "Rocket",
    caption: "변화의 관측소",
    entry: "rocket",
    number: "01",
  },
  groot: {
    name: "Groot",
    caption: "생각이 뿌리내리는 섬",
    entry: "groot",
    number: "02",
  },
  common: {
    name: "살아 있는 지식",
    caption: "다음 질문을 위한 기억",
    entry: "knowledge-library",
    number: "03",
  },
  atlas: {
    name: "Atlas",
    caption: "세계와 지식을 만나는 입구",
    entry: "atlas",
    number: "04",
  },
};
const worldIds = Object.keys(destinations) as ProjectId[];
function nodePath(id: string) {
  return `${projects.some(n => n.id === id) ? "/project/" : "/story/"}${id}`;
}
function QuoteText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
        .map((part, i) =>
          part.startsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : part.startsWith("`") ? (
            <code key={i}>{part.slice(1, -1)}</code>
          ) : (
            <React.Fragment key={i}>{part}</React.Fragment>
          ),
        )}
    </>
  );
}
function NodeLink({ id, compact = false }: { id: string; compact?: boolean }) {
  const n = nodeById.get(id);
  if (!n) return null;
  return (
    <a
      className={`node-link ${compact ? "compact" : ""}`}
      href={`#${nodePath(id)}`}
    >
      <span>
        <small>{n.eyebrow}</small>
        <strong>{n.title}</strong>
        {!compact && <p>{n.summary}</p>}
      </span>
      <ArrowUpRight size={19} />
    </a>
  );
}
function Artwork({
  node,
  large = false,
}: {
  node: AtlasNode;
  large?: boolean;
}) {
  const src = artworkFor(node.id);
  const description = artworkDescriptionFor(node.id);
  if (!src) return null;
  return (
    <figure className={`artwork ${large ? "large" : ""}`}>
      <img
        src={`./${src}`}
        alt={description?.alt ?? "프로젝트 설명 삽화"}
        loading="lazy"
      />
      <figcaption>
        <span>생성 삽화 · 개념 표현</span>
        {description?.caption}
      </figcaption>
    </figure>
  );
}

function LensExplorer() {
  const lens = nodeById.get("rocket-desks")!;
  const [selected, setSelected] = useState(lens.links[0]);
  const n = nodeById.get(selected)!;
  return (
    <section className="lens-explorer" aria-label="일곱 연구 질문">
      <div className="section-label">한 가지 렌즈를 골라 보세요</div>
      <div className="lens-tabs">
        {lens.links.map((id, i) => (
          <button
            key={id}
            aria-pressed={selected === id}
            onClick={() => setSelected(id)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {nodeById.get(id)!.title}
          </button>
        ))}
      </div>
      <div className="lens-detail" aria-live="polite">
        <small>{n.eyebrow}</small>
        <h2>{n.title}</h2>
        <p>{n.summary}</p>
        <a className="text-link" href={`#${nodePath(n.id)}`}>
          이 질문 자세히 보기 <ArrowUpRight size={16} />
        </a>
      </div>
    </section>
  );
}

function ProjectShortcuts({ node }: { node: AtlasNode }) {
  if (node.id === "groot")
    return (
      <div className="project-shortcuts" aria-label="Groot의 철학과 연구">
        {["groot-judgment-roots", "groot-appropriate-reliance", "groot-judgment-update"].map(
          (id, i) => (
            <a href={`#${nodePath(id)}`} key={id}>
              <small>{["판단의 뿌리", "함께 생각하기", "판단의 변화"][i]}</small>
              <strong>{nodeById.get(id)!.title}</strong>
              <ArrowUpRight size={15} />
            </a>
          ),
        )}
      </div>
    );
  if (node.id === "rocket-desks") return <LensExplorer />;
  return null;
}


export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [worldEpoch, setWorldEpoch] = useState(0);
  const [sceneState, setSceneState] = useState<SceneState>({ sceneId: "world", stage: "loading" });
  const [selectedIsland, setSelectedIsland] = useState<ProjectId>();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  const [selectedContentId, setSelectedContentId] = useState<string>();
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filter, setFilter] = useState<ProjectId | "all">("all");
  const [mapPlaceId, setMapPlaceId] = useState<string>();
  const [mapExpanded, setMapExpanded] = useState<string[]>([]);
  const [entryHint, setEntryHint] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [tour, setTour] = useState<{ id: string; step: number } | null>(null);
  const [reduced, setReduced] = useState(() => {
    try { const v = localStorage.getItem("atlas-reduced-motion"); if (v !== null) return v === "true"; } catch {}
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [quality, setQuality] = useState<"auto" | "high" | "low">(() => {
    try { const saved = localStorage.getItem("atlas-quality"); if (saved === "high" || saved === "low") return saved; } catch {}
    return "auto";
  });
  const host = useRef<HTMLDivElement>(null);
  const background = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const modal = useRef<HTMLElement | null>(null);
  const world = useRef<AtlasWorld | null>(null);
  const worldMemory = useRef<CameraSnapshot | undefined>(undefined);
  const labels = useRef<Record<string, HTMLButtonElement | null>>({});
  const placeLabels = useRef<Record<string, HTMLButtonElement | null>>({});
  const placeLeaders = useRef<Record<string, SVGLineElement | null>>({});
  const positions = useRef<Record<string, PlacePosition>>({});
  const composing = useRef(false);
  const pendingContent = useRef<string | undefined>(undefined);
  const pendingCameraCommand = useRef<((renderer: AtlasWorld) => void) | undefined>(undefined);
  const sceneRequest = useRef(0);
  const ui = useRef<UISnapshot>({ search: "", filter: "all", readerScroll: 0, searchScroll: 0, mapScroll: 0, mapExpanded: [] });
  const focusSerial = useRef(0);
  const captureUI = (): UISnapshot => {
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body && !el.dataset.atlasFocus) el.dataset.atlasFocus = `return-${++focusSerial.current}`;
    const focusHref = el?.closest<HTMLAnchorElement>("a[href]")?.getAttribute("href") ?? undefined;
    const scope = el?.closest('[role="dialog"]') ?? document;
    const links = focusHref ? [...scope.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(a => a.getAttribute("href") === focusHref) : [];
    return {
      ...ui.current,
      ...(world.current ? captureSceneHistory(world.current.sceneState, world.current.captureCamera()) : {}),
      readerScroll: panel.current?.scrollTop ?? ui.current.readerScroll,
      searchScroll: document.querySelector<HTMLElement>(".search-results")?.scrollTop ?? ui.current.searchScroll,
      mapScroll: document.querySelector<HTMLElement>("[data-map-scroll]")?.scrollTop ?? ui.current.mapScroll,
      mapTreeScroll: document.querySelector<HTMLElement>(".vault-tree")?.scrollTop ?? ui.current.mapTreeScroll,
      mapDetailScroll: document.querySelector<HTMLElement>(".vault-selection")?.scrollTop ?? ui.current.mapDetailScroll,
      focusKey: el?.dataset.atlasFocus,
      focusHref, focusHrefIndex: Math.max(0, links.indexOf(el as HTMLAnchorElement)),
    };
  };
  const navigation = useAtlasNavigation(captureUI);
  const { route, entry, go } = navigation;
  const [path, query = ""] = route.split("?");
  const parts = path.split("/").filter(Boolean);
  const type = parts[0] || "world";
  const id = parts[1] || "";
  const params = new URLSearchParams(query);
  const current = nodeById.get(id);
  const record = type === "evidence" ? evidenceRecords.find(r => r.id === id) : undefined;
  const from = params.get("from");
  const sourceNode = record ? nodeById.get(from && record.nodeIds.includes(from) ? from : record.nodeIds[0]) : current;
  const isWorld = type === "world";
  const routeIsland = type === "island" ? islandById.get(id as ProjectId) : undefined;
  const isMap = type === "map";
  const isCollection = ["projects", "flow", "routes"].includes(type);
  const hasPanel = Boolean(((type === "project" || type === "story") && current) || record || isCollection);
  const auxModal = entry.ui?.modal ?? null;
  const modalKind = auxModal || (isMap ? "map" : hasPanel ? "reader" : null);
  const searchOpen = modalKind === "search";
  const [sceneRequested, setSceneRequested] = useState(false);
  const wantsScene = isWorld || Boolean(routeIsland);
  useEffect(() => { if (wantsScene) setSceneRequested(true); }, [wantsScene]);
  const invalid = !isWorld && !routeIsland && !isMap && !hasPanel;
  const activeProject = sourceNode ? projectFor(sourceNode.id) : routeIsland?.id;
  const activeIsland = sceneState.sceneId === "world" ? undefined : islandById.get(sceneState.sceneId);
  const inIsland = Boolean(activeIsland);
  const selectedPlace = selectedPlaceId ? placeById.get(selectedPlaceId) : undefined;
  const invalidPlaceRequested = Boolean(routeIsland && params.get("place") && placeById.get(params.get("place")!)?.islandId !== routeIsland.id);
  const selectedNode = nodeById.get(selectedContentId || selectedPlace?.contentIds[0] || "");
  const mapGuide = selectedPlace?.actions.find(action => action.action === "open-map" && action.projectId);
  const guideNode = mapGuide?.action === "open-map" && mapGuide.projectId
    ? nodeById.get(destinations[mapGuide.projectId].entry) : undefined;
  const selectedIslandNode = selectedIsland ? nodeById.get(destinations[selectedIsland].entry) : undefined;
  const results = searchNodes(search, filter);
  const activeTour = tour ? content.routes.find(r => r.id === tour.id) : undefined;
  const currentState = useRef({ route, sceneState, selectedIsland, selectedPlaceId, modalKind });
  currentState.current = { route, sceneState, selectedIsland, selectedPlaceId, modalKind };
  ui.current = { ...ui.current, selectedIsland, selectedPlaceId, selectedContentId, search, filter, mapExpanded, mapPlaceId, modal: auxModal };

  function openModal(kind: "search" | "help" | "reading-help" | "places") { go(route, { modal: kind }); }
  function closeModal() {
    const fallback = sourceNode ? nodePath(destinations[projectFor(sourceNode.id)].entry) : "/world";
    navigation.close(fallback === route ? "/world" : fallback);
  }
  const closeRef = useRef(closeModal);
  closeRef.current = closeModal;
  function openMap(nodeId?: string, islandId?: ProjectId) {
    const place = nodeId ? placesForNode(nodeId)[0] : undefined;
    const island = islandId ?? place?.islandId ?? activeIsland?.id;
    setMapPlaceId(selectedPlace && selectedPlace.islandId === island && (!nodeId || selectedPlace.contentIds.includes(nodeId)) ? selectedPlace.id : place?.id);
    const q = new URLSearchParams({ view: "islands" });
    if (island) q.set("island", island);
    if (nodeId) q.set("node", nodeId);
    go(`/map?${q}`);
  }
  function enterIsland(project: ProjectId, placeId?: string, nodeId?: string) {
    if (world.current?.sceneId === "world") worldMemory.current = world.current.captureCamera();
    pendingContent.current = nodeId;
    go(`/island/${project}${placeId ? `?place=${encodeURIComponent(placeId)}` : ""}`);
  }
  function showNodeOnIsland(nodeId: string) {
    const place = placesForNode(nodeId)[0];
    if (place) enterIsland(place.islandId, place.id, nodeId);
    else enterIsland(projectFor(nodeId), undefined, nodeId);
  }
  function selectIsland(project: ProjectId) {
    setSelectedIsland(project);
    setSelectedPlaceId(undefined);
    world.current?.focus(project);
  }
  function selectPlace(placeId: string) {
    const place = placeById.get(placeId);
    if (!place) return;
    pendingContent.current = undefined;
    go(`/island/${place.islandId}?place=${encodeURIComponent(placeId)}`, { replace: true });
  }
  function closePlace() {
    const snapshot = world.current?.captureCamera();
    if (snapshot) pendingCameraCommand.current = renderer => { void renderer.restoreCamera({ ...snapshot, selectedPlaceId: undefined }); };
    setSelectedPlaceId(undefined); setSelectedContentId(undefined);
    if (routeIsland) go(`/island/${routeIsland.id}`, { replace: true });
  }
  function resetCamera() {
    world.current?.reset();
    setSelectedIsland(undefined); setSelectedPlaceId(undefined); setSelectedContentId(undefined);
    if (routeIsland) go(`/island/${routeIsland.id}`, { replace: true });
  }
  function actionFor(action: KnowledgeObject["actions"][number]) {
    if (action.action === "open-reader" && action.nodeId) go(`${nodePath(action.nodeId)}${action.section ? `?section=${encodeURIComponent(action.section.id)}` : ""}`);
    else if (action.action === "open-map") {
      const q = new URLSearchParams({ view: action.view || "islands" });
      const targetIsland = action.projectId ?? activeIsland?.id;
      if (targetIsland) q.set("island", targetIsland);
      go(`/map?${q}`);
    } else if (action.action === "open-camera-help") openModal("help");
    else if (action.action === "open-reading-help") openModal("reading-help");
  }
  function updateLabels() {
    const area = host.current;
    if (!area) return;
    const width = area.clientWidth, height = area.clientHeight;
    const mobile = width <= 800;
    const maxLabels = mobile ? 2 : 3;
    const selected = currentState.current.selectedPlaceId;
    const project = currentState.current.sceneState.sceneId;
    const places = project === "world" ? [] : islandById.get(project)?.places ?? [];
    const candidates = places.filter(p => positions.current[p.id]?.visible)
      .sort((a, b) => (a.id === selected ? -1 : b.id === selected ? 1 : positions.current[a.id].depth - positions.current[b.id].depth));
    const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const place of places) {
      const el = placeLabels.current[place.id], p = positions.current[place.id];
      if (!el) continue;
      const rank = candidates.findIndex(item => item.id === place.id);
      let visible = Boolean(p?.visible && rank >= 0 && rank < maxLabels && !currentState.current.modalKind && place.id !== currentState.current.selectedPlaceId);
      let x = 0, y = 0;
      if (visible) {
        const w = Math.min(el.offsetWidth || 170, width - 32), h = el.offsetHeight || 44;
        const right = !mobile && selected ? width - 400 : width - 20;
        x = Math.max(16, Math.min(p.x - w / 2, right - w));
        y = Math.max(100, Math.min(p.y - h - 12, height - (mobile && selected ? 390 : 100)));
        if (occupied.some(r => Math.abs(r.x - x) < (r.w + w) / 2 && Math.abs(r.y - y) < 58)) y -= 58;
        if (y < 100 || right < w + 20) visible = false;
        if (visible) occupied.push({ x, y, w, h });
      }
      const leader = placeLeaders.current[place.id];
      if (leader) {
        leader.style.visibility = visible ? "visible" : "hidden";
        leader.setAttribute("x1", String(p?.x ?? 0)); leader.setAttribute("y1", String(p?.y ?? 0));
        leader.setAttribute("x2", String(x + (el.offsetWidth || 170) / 2)); leader.setAttribute("y2", String(y + (el.offsetHeight || 44)));
      }
      el.style.visibility = visible ? "visible" : "hidden";
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.style.setProperty("--pin-offset-x", `${p ? p.x - x : 0}px`);
      el.style.setProperty("--pin-offset-y", `${p ? p.y - y : 0}px`);
    }
  }
  const callbacks = useRef({ selectIsland, selectPlace, updateLabels });
  callbacks.current = { selectIsland, selectPlace, updateLabels };

  useEffect(() => {
    if (!sceneRequested) return;
    let disposed = false;
    import("./world").then(({ AtlasWorld }) => {
      if (disposed || !host.current) return;
      try {
        world.current = new AtlasWorld(host.current, {
          initialScene: routeIsland?.id ?? "world",
          onReady: () => setReady(true),
          onError: setError,
          onSelect: project => callbacks.current.selectIsland(project),
          onSelectPlace: placeId => callbacks.current.selectPlace(placeId),
          onSceneState: state => { setSceneState(state); if (state.stage === "ready") setError(""); },
          onPlaces: value => { positions.current = value; callbacks.current.updateLabels(); },
          onProject: value => {
            const area = host.current;
            if (!area) return;
            for (const [key, position] of Object.entries(value)) {
              const el = labels.current[key];
              if (!el) continue;
              const half = Math.max(72, el.offsetWidth / 2);
              const mobile = area.clientWidth <= 800;
              el.style.left = `${Math.max(half + 12, Math.min(position.x, area.clientWidth - half - 12))}px`;
              el.style.top = `${Math.max(mobile ? 188 : 30, Math.min(position.y, area.clientHeight - (mobile ? 210 : 225)))}px`;
              el.style.transform = "translateX(-50%)";
              el.style.visibility = position.visible && currentState.current.sceneState.sceneId === "world" ? "visible" : "hidden";
            }
          },
        });
        world.current.setReduced(reduced);
        world.current.setQuality(quality);
        setWorldEpoch(value => value + 1);
      } catch {
        setError("이 환경에서는 3D 화면을 열 수 없습니다. 지도와 자료 읽기는 계속 이용할 수 있습니다.");
      }
    }).catch(() => setError("장면을 불러오지 못했습니다. 지도와 자료 읽기는 계속 이용할 수 있습니다."));
    return () => { disposed = true; world.current?.dispose(); world.current = null; };
  }, [retry, sceneRequested]);
  useEffect(() => { world.current?.setReduced(reduced); }, [reduced]);
  useEffect(() => { world.current?.setQuality(quality); try { localStorage.setItem("atlas-quality", quality); } catch {} }, [quality]);
  useEffect(() => {
    world.current?.setPaused(Boolean(modalKind));
    if (background.current) background.current.inert = Boolean(modalKind);
    callbacks.current.updateLabels();
  }, [modalKind, ready, selectedPlaceId]);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => { try { if (localStorage.getItem("atlas-reduced-motion") !== null) return; } catch {} setReduced(preference.matches); };
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  function toggleReduced() { setReduced(value => { try { localStorage.setItem("atlas-reduced-motion", String(!value)); } catch {} return !value; }); }

  useEffect(() => {
    const snapshot = entry.ui;
    if (navigation.restoring && snapshot) {
      setSelectedIsland(snapshot.selectedIsland);
      setSelectedPlaceId(snapshot.selectedPlaceId);
      setSelectedContentId(snapshot.selectedContentId);
      setSearch(snapshot.search || ""); setSearchDraft(snapshot.search || "");
      setFilter(snapshot.filter || "all"); setMapExpanded(snapshot.mapExpanded || []); setMapPlaceId(snapshot.mapPlaceId);
    }
    if (!world.current) return;
    const generation = ++sceneRequest.current;
    const sync = async () => {
      const renderer = world.current;
      if (!renderer) return;
      const sceneReturn = resolveSceneReturn(routeIsland?.id ?? (isWorld ? "world" : undefined),
        navigation.restoring, snapshot, renderer.sceneState);
      if (sceneReturn.kind === "camera") {
        await renderer.restoreCamera(sceneReturn.camera, sceneReturn.sceneId);
      } else if (sceneReturn.kind === "retain") {
        // Closing Reader/map must not replace a failed or pending destination
        // with the last successfully loaded island behind that overlay.
      } else if (routeIsland) {
        const target = params.get("place");
        const place = target ? placeById.get(target) : undefined;
        const validPlace = place?.islandId === routeIsland.id ? place : undefined;
        const node = pendingContent.current;
        pendingContent.current = undefined;
        setSelectedIsland(undefined); setSelectedPlaceId(validPlace?.id);
        setSelectedContentId(node && validPlace?.contentIds.includes(node) ? node : validPlace?.contentIds[0]);
        if (renderer.sceneId !== routeIsland.id || renderer.sceneState.sceneId !== routeIsland.id || renderer.sceneState.stage !== "ready") {
          await renderer.enterIsland(routeIsland.id, validPlace?.id);
          setEntryHint(true);
        } else if (validPlace) renderer.focusPlace(validPlace.id);
      } else if (isWorld) {
        if (renderer.sceneId !== "world" || renderer.sceneState.sceneId !== "world" || renderer.sceneState.stage !== "ready") await renderer.showWorld(worldMemory.current);
      } else if (sceneReturn.kind === "navigate") {
        if (sceneReturn.sceneId === "world") await renderer.showWorld();
        else await renderer.enterIsland(sceneReturn.sceneId, snapshot?.selectedPlaceId);
      } else if (!entry.ui?.camera && activeProject && renderer.sceneId === "world") {
        renderer.focus(activeProject);
      }
      if (generation === sceneRequest.current) {
        renderer.setPaused(Boolean(modalKind));
        const command = pendingCameraCommand.current;
        if (command && !modalKind) { pendingCameraCommand.current = undefined; command(renderer); }
      }
    };
    void sync();
  }, [entry.key, worldEpoch]);

  useLayoutEffect(() => {
    const root = modal.current;
    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      if (navigation.restoring && entry.ui) {
        if (panel.current) panel.current.scrollTop = entry.ui.readerScroll || 0;
        const list = document.querySelector<HTMLElement>(".search-results");
        if (list) list.scrollTop = entry.ui.searchScroll || 0;
        const map = document.querySelector<HTMLElement>("[data-map-scroll]");
        if (map) map.scrollTop = entry.ui.mapScroll || 0;
        const tree = document.querySelector<HTMLElement>(".vault-tree"), detail = document.querySelector<HTMLElement>(".vault-selection");
        if (tree) tree.scrollTop = entry.ui.mapTreeScroll || 0;
        if (detail) detail.scrollTop = entry.ui.mapDetailScroll || 0;
      } else if (panel.current && modalKind === "reader") panel.current.scrollTop = 0;
      const key = navigation.restoring ? entry.ui?.focusKey : undefined;
      const saved = key ? document.querySelector<HTMLElement>(`[data-atlas-focus="${CSS.escape(key)}"]`) : null;
      const href = navigation.restoring ? entry.ui?.focusHref : undefined;
      const savedLink = href ? [...(root ?? document).querySelectorAll<HTMLAnchorElement>("a[href]")].filter(a => a.getAttribute("href") === href)[entry.ui?.focusHrefIndex ?? 0] : undefined;
      const retainedMapFocus = !navigation.restoring && modalKind === "map" && root?.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
      const target = saved && !saved.closest("[inert]") ? saved : savedLink || retainedMapFocus || root?.querySelector<HTMLElement>("input") ||
        root?.querySelector<HTMLElement>("[data-modal-heading]") || (modalKind === "reader" ? panel.current : root?.querySelector<HTMLElement>("button,a[href]")) ||
        document.querySelector<HTMLElement>(".place-summary h2,.island-caption,.world-canvas canvas,.world-intro h1");
      target?.focus({ preventScroll: true });
    };
    const frame = requestAnimationFrame(restore);
    if (navigation.restoring) void document.fonts.ready.then(() => requestAnimationFrame(restore));
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [entry.key, modalKind]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (modalKind) { event.preventDefault(); closeRef.current(); }
        else if (selectedPlaceId) closePlace();
        else if (selectedIsland) setSelectedIsland(undefined);
        return;
      }
      if (event.key === "Home" && !modalKind && (event.target as HTMLElement).tagName === "CANVAS") resetCamera();
      if (event.key === "Tab" && modalKind && modal.current) {
        const items = [...modal.current.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href],select,[tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !modal.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === "/" && !event.isComposing && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault(); if (!searchOpen) openModal("search");
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [modalKind, selectedPlaceId, selectedIsland, route]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#/"]');
      if (!link || link.hasAttribute("download")) return;
      event.preventDefault(); go(link.getAttribute("href")!.slice(1));
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [go]);

  useEffect(() => {
    if (!tour || !activeTour || !current || !["project", "story"].includes(type)) return;
    const step = activeTour.steps.indexOf(current.id);
    if (step >= 0 && step !== tour.step) setTour({ ...tour, step });
  }, [route]);

  function beginTour(t: (typeof content.routes)[number]) { setTour({ id: t.id, step: 0 }); go(nodePath(t.steps[0])); }
  function tourMove(delta: number) {
    if (!tour || !activeTour) return;
    const step = tour.step + delta;
    if (step >= 0 && step < activeTour.steps.length) { setTour({ ...tour, step }); go(nodePath(activeTour.steps[step])); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setCopyFailed(false); setTimeout(() => setCopied(false), 1800); }
    catch { setCopyFailed(true); }
  }
  const mapNode = params.get("node") || undefined;
  const mapIslandParam = params.get("island");
  const mapIsland = mapIslandParam && islandById.has(mapIslandParam as ProjectId) ? mapIslandParam as ProjectId : undefined;
  function updateMap(view: "islands" | "vault", island?: ProjectId, nodeId?: string) {
    const q = new URLSearchParams({ view });
    if (island) q.set("island", island);
    if (nodeId) q.set("node", nodeId);
    go(`/map?${q}`, { replace: true });
  }
  function moveFromHelp(dx: number, dz: number) { pendingCameraCommand.current = renderer => renderer.pan(dx, dz); closeModal(); }
  const focusedSection = current && params.get("section") ? knowledgeObjects.flatMap(place => place.actions).find(action => action.action === "open-reader" && action.nodeId === current.id && action.section?.id === params.get("section")) : undefined;
  const focusedParagraph = focusedSection?.action === "open-reader" ? focusedSection.section?.index : undefined;
  useLayoutEffect(() => {
    if (focusedParagraph === undefined || navigation.restoring) return;
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(".focused-paragraph")?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [entry.key, focusedParagraph]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty("--atlas-visual-height", `${viewport?.height ?? innerHeight}px`);
      document.documentElement.style.setProperty("--atlas-visual-top", `${viewport?.offsetTop ?? 0}px`);
    };
    update(); viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, []);
  const modalRef = (el: HTMLElement | null) => { modal.current = el; };
  const children = selectedPlace ? activeIsland?.subInteractions.filter(p => p.parentId === selectedPlace.id) ?? [] : [];
  return (
    <>
      <a className="skip-link" href="#reading-content" onClick={event => { event.preventDefault(); go("/projects"); }}>프로젝트와 자료로 바로 가기</a>
      <main className={`app atlas-v81 atlas-v82 ${hasPanel ? "has-panel" : ""} ${record ? "has-reader" : ""} ${isCollection ? "has-collection" : ""} ${inIsland ? "in-island" : ""} ${selectedIsland && !inIsland ? "island-preview-open" : ""} ${selectedPlace && inIsland ? "place-panel-open" : ""} ${modalKind ? "modal-open" : ""}`}>
        <div ref={background} className="exploration-background">
          <header className="topbar">
            <a href="#/world" className="brand" aria-label="Homi Atlas 세계로"><span className="brand-mark">H</span><span>HOMI <b>ATLAS</b><small>OUR WORK, IN A WORLD.</small></span></a>
            <nav aria-label="주 메뉴">
              <a className={isWorld || routeIsland ? "active" : ""} href="#/world">세계</a>
              <a className={type === "projects" ? "active" : ""} href="#/projects">프로젝트</a>
              <a className={type === "flow" ? "active" : ""} href="#/flow">지식의 흐름</a>
              <button className="desktop-map" data-atlas-focus="nav-map" onClick={() => openMap(selectedContentId)}><MapIcon size={16} /> 지도</button>
              <button className="desktop-find" data-atlas-focus="nav-search" onClick={() => openModal("search")}>자료 찾기 <Search size={16} /></button>
            </nav>
            <span className="edition">FIELD NOTES · 08.2</span>
            <div className="mobile-top-actions"><button aria-label="지도" onClick={() => openMap(selectedContentId)}><MapIcon size={18} /><span>지도</span></button><button aria-label="자료 찾기" onClick={() => openModal("search")}><Search size={18} /><span>찾기</span></button></div>
          </header>
          <div className="world-area">
            <div className="world-canvas" ref={host} />
            <div className="world-vignette" />
            {!error && ready && !inIsland && <div className="world-labels" aria-label="세계의 네 섬">
              {worldIds.map(project => <button key={project} ref={el => { labels.current[project] = el; }} className={`world-label ${selectedIsland === project ? "selected" : ""}`} aria-pressed={selectedIsland === project} aria-label={`${destinations[project].name} — ${destinations[project].caption}, 섬 소개 선택`} data-atlas-focus={`world-${project}`} onClick={() => selectIsland(project)}><span className="label-dot" /><span><small>{destinations[project].number} / {destinations[project].caption}</small><strong>{destinations[project].name}</strong></span><ArrowUpRight size={16} /></button>)}
            </div>}
            {activeIsland && ready && !error && <>
              <div className="island-heading"><button className="paper-button" onClick={() => go("/world")}><ArrowLeft size={16} /> 전체 세계</button><h1 tabIndex={-1} className="island-caption">{destinations[activeIsland.id].name}<span>{destinations[activeIsland.id].caption}</span></h1></div>
              <button className="places-list-button paper-button" onClick={() => openModal("places")}><List size={17} /> 장소 목록 <span>{activeIsland.places.length}</span></button>
              {sceneState.stage === "ready" && <div className="place-markers" aria-label={`${activeIsland.label}의 가까운 장소`}>
                <svg className="place-leaders" width="100%" height="100%" aria-hidden="true">{activeIsland.places.map(place => <line key={place.id} ref={el => { placeLeaders.current[place.id] = el; }} />)}</svg>
                {activeIsland.places.map(place => <button key={place.id} ref={el => { placeLabels.current[place.id] = el; }} className={`place-marker ${selectedPlaceId === place.id ? "selected" : ""}`} data-atlas-focus={`place-${place.id}`} onClick={() => selectPlace(place.id)} aria-pressed={selectedPlaceId === place.id}><span className="place-marker-dot" /><span>{place.label}</span><ArrowUpRight size={14} /></button>)}
              </div>}
              {entryHint && !selectedPlace && sceneState.stage === "ready" && <aside className="entry-guide"><button aria-label="입장 안내 닫기" className="icon-button" onClick={() => setEntryHint(false)}><X size={17} /></button><small>{invalidPlaceRequested ? "장소 주소를 확인해 주세요" : "여기서부터 둘러보세요"}</small><strong>{activeIsland.places[0]?.label}</strong><p>{invalidPlaceRequested ? "이 섬에서 해당 장소를 찾지 못해 입구를 펼쳤습니다. 장소 목록에서 다시 골라 보세요." : "풍경을 움직여 가까이 다가가거나, 장소 이름을 눌러 보세요."}</p></aside>}
              {reduced && <div className="motion-badge"><Pause size={13} /> 움직임 줄이기 켜짐</div>}
            </>}
            {(!ready || error) && <div className={`world-loading ${error ? "failed" : ""}`} style={{backgroundImage:"linear-gradient(#123b4099,#123b40d9),url(./assets/maps/loading-world.webp)"}} role="status">
              {error ? <><div><Compass size={26} /><small className="fallback-art-caption">풍경을 불러오지 못해도 지도와 자료를 읽을 수 있습니다.</small><p>{error}</p><div className="failure-actions"><button className="button" onClick={() => { setError(""); setReady(false); setRetry(v => v + 1); }}>3D 다시 불러오기 <RotateCcw size={16} /></button><button className="button outline" onClick={() => openMap()}>지도 보기 <MapIcon size={16} /></button></div><a className="fallback-reading-link" href="./reading.html">글로만 읽기</a></div></> : <><span className="loading-ring" /><span>우리의 세계를 펼치는 중</span><small>풍경을 준비하는 동안에도 자료를 읽을 수 있습니다.</small><a className="text-link light" href="./reading.html">글로만 읽기 <BookOpen size={16} /></a></>}
            </div>}
            {ready && sceneState.stage !== "ready" && !error && <aside className={`island-load-notice ${sceneState.stage === "error" ? "failed" : ""}`} role="status"><strong>{sceneState.stage === "loading" ? "섬을 가까이 펼치는 중" : "섬을 불러오지 못했습니다"}</strong><p>{sceneState.message || "지금 보이는 풍경은 준비가 끝날 때까지 유지됩니다."}</p><div>{sceneState.stage === "error" && routeIsland && <button className="button" onClick={() => void world.current?.enterIsland(routeIsland.id, params.get("place") || undefined)}>섬 다시 불러오기</button>}<button className="button outline" onClick={() => { ++sceneRequest.current; go("/world"); }}>전체 세계</button>{routeIsland && <button className="text-link" onClick={() => go(nodePath(destinations[routeIsland.id].entry))}>소개 읽기</button>}</div></aside>}
            {isWorld && !error && <section className="world-intro"><div className="overline"><span /> A WORLD OF IDEAS & MAKING</div><h1 tabIndex={-1}>생각이 자라고,<br />세계가 만들어지는 곳.</h1><p>변화를 읽고, 새로운 세계를 만들고,<br />발견을 다음 질문으로 이어 갑니다.</p><a className="text-link light" href="#/routes">길을 따라 둘러보기 <ArrowUpRight size={16} /></a></section>}
            {isWorld && !error && !selectedIsland && <section className="discovery-dock" aria-label="여기서 시작해 보세요"><a className="featured-story" href="#/island/groot"><div><span className="overline">EXPLORE GROOT</span><h2>생각이 뿌리내리는<br />섬을 거닐다.</h2><p>AI에게 일을 맡겨도, 내 판단은 어떻게 이어질까?</p><span className="text-link">Groot로 들어가기 <ArrowUpRight size={16} /></span></div><figure><img src="./assets/maps/groot.webp" alt="Groot 철학과 연구를 만나는 섬 지도" /><figcaption>철학과 연구의 섬</figcaption></figure></a><a className="dock-question" href="#/story/rocket-clocks"><small>ROCKET · 변화의 관측소</small><h3>가능해진 일은<br />언제 현실이 될까?</h3><span>서로 다른 속도의 세 가지 시계 <ArrowUpRight size={16} /></span></a><a className="dock-question" href="#/flow"><small>OUR KNOWLEDGE</small><h3>오늘의 발견은<br />어디에 남을까?</h3><span>발견에서 다음 판단까지 <ArrowUpRight size={16} /></span></a></section>}
            {selectedIsland && !inIsland && !error && <aside className="island-preview" aria-label={`${destinations[selectedIsland].name} 섬 소개`}><button className="icon-button panel-dismiss" aria-label="섬 선택 닫기" onClick={() => setSelectedIsland(undefined)}><X size={18} /></button><span className="overline">{destinations[selectedIsland].number} / {destinations[selectedIsland].caption}</span><h2>{destinations[selectedIsland].name}</h2><p>{selectedIslandNode?.summary}</p><span className="preview-count">{islandById.get(selectedIsland)?.places.length}곳의 장소 · 자유롭게 둘러보기</span><div className="selection-actions"><button className="button" data-atlas-focus="island-enter" onClick={() => enterIsland(selectedIsland)}>입장 <ArrowRight size={17} /></button><button className="button outline" data-atlas-focus="island-introduction" onClick={() => go(nodePath(destinations[selectedIsland].entry))}>소개 읽기 <BookOpen size={17} /></button></div><small className="preview-note">풍경을 움직여 탐험하고, 궁금한 이야기는 펼쳐 읽습니다.</small></aside>}
            {selectedPlace && inIsland && sceneState.stage === "ready" && !error && <aside className="place-summary" aria-label={`${selectedPlace.label} 설명`}><button className="icon-button panel-dismiss" aria-label="장소 설명 닫기" onClick={closePlace}><X size={18} /></button><span className="overline">{destinations[selectedPlace.islandId].name} · {selectedPlace.label}</span><h2 tabIndex={-1}>{selectedNode?.title || selectedPlace.label}</h2><p>{selectedNode?.summary || (selectedPlace.question === selectedPlace.label ? guideNode?.summary : undefined) || selectedPlace.question}</p>{selectedNode && <small className="place-state">{selectedNode.state}</small>}{selectedPlace.contentIds.length > 1 && <div className="place-content-tabs" aria-label="이 장소의 이야기">{selectedPlace.contentIds.map(nodeId => <button key={nodeId} aria-pressed={selectedNode?.id === nodeId} onClick={() => setSelectedContentId(nodeId)}>{nodeById.get(nodeId)?.title}</button>)}</div>}{children.length > 0 && <div className="subobject-list" aria-label="가까이 볼 대상">{children.map(place => <button key={place.id} onClick={() => selectPlace(place.id)}>{place.label}<ArrowUpRight size={14} /></button>)}</div>}<div className="selection-actions">{selectedNode ? <><button className="button" data-atlas-focus="place-read" onClick={() => { const action = selectedPlace.actions.find(a => a.action === "open-reader" && a.nodeId === selectedNode.id); if (action) actionFor(action); else go(nodePath(selectedNode.id)); }}>자료 읽기 <BookOpen size={17} /></button><button className="button outline" data-atlas-focus="place-map" onClick={() => openMap(selectedNode.id, selectedPlace.islandId)}>지도에서 보기 <MapIcon size={17} /></button></> : selectedPlace.actions.map((action, index) => <button key={index} className={`button ${index ? "outline" : ""}`} onClick={() => actionFor(action)}>{action.label}<ArrowRight size={16} /></button>)}</div></aside>}
            {!error && ready && <div className="world-tools"><span className="interaction-hint">드래그해 둘러보기 · 스크롤로 가까이</span><div className="tool-group"><button aria-label="가까이 보기" title="가까이 보기" onClick={() => world.current?.zoom(0.82)}><Plus size={18} /></button><button aria-label="멀리 보기" title="멀리 보기" onClick={() => world.current?.zoom(1.22)}><Minus size={18} /></button><button aria-label="왼쪽으로 돌려 보기" title="왼쪽으로 돌려 보기" onClick={() => world.current?.rotate(-Math.PI / 12)}><ChevronLeft size={18} /></button><button aria-label="오른쪽으로 돌려 보기" title="오른쪽으로 돌려 보기" onClick={() => world.current?.rotate(Math.PI / 12)}><ChevronRight size={18} /></button><button aria-label="처음 시점" title="처음 시점" onClick={resetCamera}><RotateCcw size={17} /></button><button aria-label="조작 안내와 화면 설정" title="조작 안내와 화면 설정" onClick={() => openModal("help")}><HelpCircle size={18} /></button></div></div>}
            {isWorld && !error && <footer className="world-footer"><span>HOMI ATLAS · VOL. 08.2</span><span>장소는 이야기로, 이야기는 근거로.</span></footer>}
          </div>
          {invalid && <section className="not-found"><Compass size={28} /><h1>이 주소에서 찾을 수 있는 자료가 없습니다.</h1><p>세계와 자료 목록에서 다시 이어갈 수 있습니다.</p><button className="button" onClick={() => go("/world", { replace: true })}>전체 세계 <ArrowRight size={16} /></button><a href="./reading.html">글로만 읽기</a></section>}
        </div>
        {modalKind === "reader" && <aside id="reading-content" ref={el => { panel.current = el; modalRef(el); }} tabIndex={-1} role="dialog" aria-modal="true" aria-label={record ? "근거 읽기" : current?.title || "프로젝트 안내"} className={`reading-panel ${isCollection ? "collection-panel" : ""} ${record ? "evidence-panel" : ""}`}>
          <div className="panel-toolbar"><button className="text-link" onClick={closeModal}><ArrowLeft size={16} />{entry.canBack ? "이전 화면으로" : sourceNode ? "프로젝트로 돌아가기" : "전체 세계"}</button><div><button className="icon-button" aria-label={copied ? "링크 복사됨" : "이 화면 링크 복사"} onClick={copyLink}>{copied ? <Check size={17} /> : <LinkIcon size={17} />}</button><button className="icon-button" aria-label="읽기 닫기" onClick={closeModal}><X size={20} /></button></div></div>
        {activeTour && tour && (
          <div className="tour-bar" aria-label="안내 탐험">
            <span>
              <small>이야기를 따라</small>
              <strong>{activeTour.title}</strong>
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="이전 이야기"
                disabled={tour.step === 0}
                onClick={() => tourMove(-1)}
              >
                <ArrowLeft size={18} />
              </button>
              <span>
                {tour.step + 1} / {activeTour.steps.length}
              </span>
              <button
                className="icon-button"
                aria-label="다음 이야기"
                disabled={tour.step === activeTour.steps.length - 1}
                onClick={() => tourMove(1)}
              >
                <ArrowRight size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="안내 탐험 끝내기"
                onClick={() => setTour(null)}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
          {(copied || copyFailed) && <p className="copy-feedback" role="status">{copied ? "이 화면의 링크를 복사했습니다." : "자동 복사를 사용할 수 없습니다. 주소창의 링크를 복사해 주세요."}</p>}
            {current && (type === "project" || type === "story") && (
              <article className="story-content">
                <div className="overline">
                  {destinations[projectFor(current.id)].number} /{" "}
                  {current.eyebrow}
                </div>
                <h1>{current.title}</h1>
                <p className="story-lead">{current.summary}</p>
                <div className="status">
                  <span />
                  {current.state}
                </div>
                <Artwork node={current} large />
                <ProjectShortcuts node={current} />
                <div className="prose">
                  {current.paragraphs.map((p, i) => (
                    <p key={i} className={focusedParagraph === i ? "focused-paragraph" : undefined}>{p}</p>
                  ))}
                </div>
                {current.points.length > 0 && (
                  <ol className="idea-points">
                    {current.points.map((p, i) => (
                      <li key={i}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <p>{p}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {current.id === "rocket" && (
                  <a className="visual-entry" href="#/story/rocket-desks">
                    <img
                      src="./assets/rocket-lenses.webp"
                      alt="일곱 연구 렌즈의 표현"
                    />
                    <span>
                      <small>하나의 변화, 일곱 개의 질문</small>
                      <strong>
                        일곱 개의 렌즈 <ArrowUpRight size={18} />
                      </strong>
                    </span>
                  </a>
                )}
                {current.links.length > 0 && (
                  <section className="story-section">
                    <div className="section-label">
                      이어서 읽기{" "}
                      <span>
                        {String(current.links.length).padStart(2, "0")}
                      </span>
                    </div>
                    {current.links.map((link) => (
                      <NodeLink key={link} id={link} compact />
                    ))}
                  </section>
                )}
                {evidenceFor(current.id).length > 0 && (
                  <section className="evidence-entry">
                    <div>
                      <BookOpen size={21} />
                      <h2>설명 너머의 근거</h2>
                    </div>
                    <p>이 이야기는 어떤 자료에서 왔을까요?</p>
                    {evidenceFor(current.id).map((r) => (
                      <a
                        key={r.id}
                        href={`#/evidence/${r.id}?from=${current.id}`}
                      >
                        <span>
                          {r.publicationTitle}
                          <small>
                            {r.basisDate} ·{" "}
                            {r.excerptParagraphs.length
                              ? "선별한 원문 발췌"
                              : "편집한 설명"}
                          </small>
                        </span>
                        <ArrowUpRight size={18} />
                      </a>
                    ))}
                  </section>
                )}
                {content.relations.filter(
                  (r) => r.source === current.id || r.target === current.id,
                ).length > 0 && (
                  <section className="story-section related">
                    <div className="section-label">함께 읽으면 좋은 이야기</div>
                    {content.relations
                      .filter(
                        (r) =>
                          r.source === current.id || r.target === current.id,
                      )
                      .map((r, i) => {
                        const other = nodeById.get(
                          r.source === current.id ? r.target : r.source,
                        );
                        return other ? (
                          <a href={`#${nodePath(other.id)}`} key={i}>
                            <strong>
                              {other.title}
                              <ArrowUpRight size={15} />
                            </strong>
                            <p>{r.label}</p>
                          </a>
                        ) : null;
                      })}
                  </section>
                )}
                <p className="basis-note">
                  현재 설명은 각 근거 자료에 표시된 기준일을 따릅니다.
                </p>
              </article>
            )}
            {record && (
              <article className="story-content evidence-content">
                <div className="overline">SOURCE READER / 근거 읽기</div>
                <h1>{record.publicationTitle}</h1>
                <p className="story-lead">{record.claim}</p>
                <div className="evidence-meta">
                  <span>{record.evidenceType}</span>
                  <span>기준일 {record.basisDate}</span>
                </div>
                <p className="basis-explanation">{record.basisNote}</p>
                {record.titleEdited && (
                  <p className="editorial-note">{record.titleNote}</p>
                )}
                {record.excerptParagraphs.map((p, i) => (
                  <section className="excerpt" key={i}>
                    <div className="section-label">
                      {String(i + 1).padStart(2, "0")} / {p.label}
                      <span>원문 발췌</span>
                    </div>
                    <blockquote>
                      <QuoteText text={p.text} />
                    </blockquote>
                    {p.omissions && <small>{p.omissions}</small>}
                  </section>
                ))}
                {record.editorialExplanation && (
                  <section className="editorial-block">
                    <div className="section-label">Atlas가 풀어 쓴 설명</div>
                    <p>{record.editorialExplanation.text}</p>
                    <small>원문 인용과 구분한 편집 설명입니다.</small>
                  </section>
                )}
                {record.limitations.length > 0 && (
                  <details className="source-limits">
                    <summary>이 자료를 읽을 때 함께 볼 점</summary>
                    {record.limitations.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </details>
                )}
                <section className="story-section">
                  <div className="section-label">이 근거로 이어지는 이야기</div>
                  {record.nodeIds.map((n) => (
                    <NodeLink id={n} key={n} compact />
                  ))}
                </section>
              </article>
            )}
            {type === "projects" && (
              <article className="story-content">
                <div className="overline">PLACES & PURPOSES</div>
                <h1>
                  서로 다른 질문,
                  <br />
                  함께 만드는 세계.
                </h1>
                <p className="story-lead">
                  각 프로젝트가 향하는 곳과 그동안 쌓아 온 연구를 만나 보세요.
                </p>
                <div className="project-grid">
                  {projects.map((n) => (
                    <a href={`#${nodePath(n.id)}`} key={n.id}>
                      {artworkFor(n.id) && <img className="project-card-art" src={`./${artworkFor(n.id)}`} alt={artworkDescriptionFor(n.id)?.alt} loading="lazy" />}
                      <span className="project-index">
                        {destinations[projectFor(n.id)].number}
                      </span>
                      <small>{n.eyebrow}</small>
                      <h2>
                        {n.title}
                        <ArrowUpRight size={24} />
                      </h2>
                      <p>{n.summary}</p>
                      <span className="project-state">{n.state}</span>
                    </a>
                  ))}
                </div>
                <a className="button outline" href="#/routes">
                  이야기를 따라 둘러보기 <ArrowRight size={17} />
                </a>
              </article>
            )}
            {type === "flow" && (
              <article className="story-content">
                <div className="overline">THE LIFE OF KNOWLEDGE</div>
                <h1>
                  읽은 것은
                  <br />
                  다음 일로 이어집니다.
                </h1>
                <p className="story-lead">
                  발견을 모으는 데서 끝나지 않습니다. 해석하고, 연결하고, 다시
                  쓸 수 있도록 돌봅니다.
                </p>
                <div className="knowledge-flow">
                  {[
                    "daily-lens",
                    "weekly-lens",
                    "papers-lens",
                    "knowledge-library",
                    "knowledge-upkeep",
                  ].map((n, i) => (
                    <div className="flow-step" key={n}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <NodeLink id={n} />
                    </div>
                  ))}
                </div>
                <p className="editorial-note">
                  단계마다 역할이 다릅니다. 논문을 깊이 읽는 일은 매일·매주의
                  해석과 나란히 지식을 더합니다.
                </p>
                <section className="story-section">
                  <div className="section-label">지식을 이해하는 작은 질문</div>
                  {[
                    "concept-evidence",
                    "concept-memory",
                    "concept-graphs",
                    "concept-world-model",
                    "concept-agent",
                    "concept-trust",
                    "concept-reuse",
                  ].map((n) => (
                    <NodeLink id={n} key={n} compact />
                  ))}
                </section>
              </article>
            )}
            {type === "routes" && (
              <article className="story-content">
                <div className="overline">CHOOSE A THREAD</div>
                <h1>
                  어떤 이야기가
                  <br />
                  궁금한가요?
                </h1>
                <p className="story-lead">
                  질문 하나를 골라 이어진 장소와 자료를 따라가 보세요. 언제든
                  다른 길로 나갈 수 있습니다.
                </p>
                <div className="tour-list">
                  {content.routes.map((t, i) => (
                    <button key={t.id} onClick={() => beginTour(t)}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <h2>{t.title}</h2>
                        <p>{t.description}</p>
                        <small>{t.steps.length}개의 이야기</small>
                      </div>
                      <ArrowUpRight size={22} />
                    </button>
                  ))}
                </div>
              </article>
            )}
          <footer className="reader-footer"><a href="#/world">HOMI ATLAS</a><a href="./data/content.json" download="homi-atlas-content.json"><Download size={14} /> 이야기 데이터(JSON) 받기</a></footer>
        </aside>}
        {modalKind === "map" && <AtlasMap ref={modalRef} camera={ready ? entry.ui?.camera : undefined} view={params.get("view") === "vault" ? "vault" : "islands"} islandId={mapIsland} selectedNodeId={mapNode} selectedPlaceId={mapPlaceId} onPlaceChange={setMapPlaceId} expanded={mapExpanded} onExpanded={setMapExpanded} onChange={updateMap} onClose={closeModal} onRead={nodeId => go(nodePath(nodeId))} onEnter={showNodeOnIsland} onEnterIsland={project => enterIsland(project)} onEnterPlace={(project, placeId) => enterIsland(project, placeId)} />}
        {searchOpen && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeModal(); }}><section ref={modalRef} className="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-title"><div className="search-heading"><h1 className="overline" id="search-title">이 세계의 이야기 찾기</h1><button className="icon-button" aria-label="검색 닫기" onClick={closeModal}><X size={20} /></button></div><label className="search-input"><Search size={23} /><input value={searchDraft} onChange={event => { setSearchDraft(event.target.value); if (!composing.current) setSearch(event.target.value); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; setSearch(event.currentTarget.value); }} placeholder="프로젝트, 이야기, 궁금한 개념" aria-label="검색어" autoComplete="off" data-atlas-focus="search-input" /><kbd>ESC</kbd></label><div className="search-filters" aria-label="검색 범위">{(["all", ...worldIds] as const).map(project => <button key={project} aria-pressed={filter === project} onClick={() => setFilter(project)}>{project === "all" ? "모든 이야기" : destinations[project].name}</button>)}</div><div className="search-count" aria-live="polite">{search ? `“${search}”와 이어지는` : "지금 둘러볼 수 있는"} 이야기 {results.length}개 <small>아틀라스에 담은 이야기에서 찾습니다.</small></div><div className="search-results">{results.map(node => <article className="search-result" key={node.id}><small>{destinations[projectFor(node.id)].name} / {node.eyebrow}</small><h2>{node.title}</h2><p>{node.summary}</p><div className="search-destinations"><button data-atlas-focus={`search-read-${node.id}`} onClick={() => go(nodePath(node.id))}><BookOpen size={15} /> 자료 읽기</button><button data-atlas-focus={`search-map-${node.id}`} onClick={() => openMap(node.id)}><MapIcon size={15} /> 지도에서 보기</button><button data-atlas-focus={`search-island-${node.id}`} onClick={() => showNodeOnIsland(node.id)}><Compass size={15} /> 섬에서 보기</button></div></article>)}{!results.length && <div className="search-empty"><BookOpen size={28} /><h2>다른 말로 찾아볼까요?</h2><p>‘기억’, ‘판단’, ‘연구’처럼 짧은 말로 찾아보세요.</p>{filter !== "all" && <button className="text-link" onClick={() => setFilter("all")}>전체에서 찾기 <ArrowRight size={16} /></button>}<button className="text-link" onClick={() => { setSearch(""); setSearchDraft(""); setFilter("all"); }}>모든 이야기 보기 <ArrowRight size={16} /></button></div>}</div></section></div>}
        {modalKind === "help" && <div className="modal-backdrop"><section ref={modalRef} className="camera-help-dialog" role="dialog" aria-modal="true" aria-labelledby="camera-help-title"><button className="icon-button panel-dismiss" aria-label="조작 안내 닫기" onClick={closeModal}><X size={20} /></button><span className="overline">자유롭게, 가까이</span><h1 id="camera-help-title" tabIndex={-1} data-modal-heading>풍경을 둘러보는 방법</h1><div className="camera-help-grid"><section><h2>마우스와 터치</h2><p>드래그하면 주위를 둘러봅니다. 스크롤하거나 두 손가락을 벌리면 가까이 다가갑니다.</p><p>섬 안에서는 오른쪽 드래그, Shift와 드래그, 두 손가락을 함께 움직여 자리를 옮길 수 있습니다.</p></section><section><h2>키보드</h2><p>섬 화면이 선택된 상태에서 방향키로 이동합니다. Q·E로 회전하고 +·−로 거리를 바꿉니다. Home을 누르면 처음 시점으로 돌아갑니다.</p><p>Tab으로 풍경 밖의 버튼과 자료로 이동할 수 있습니다.</p></section></div><div className="camera-pan-controls" aria-label="카메라 위치 이동"><Move size={17} /><button onClick={() => moveFromHelp(0, -2)}>앞으로</button><button onClick={() => moveFromHelp(-2, 0)}>왼쪽</button><button onClick={() => moveFromHelp(2, 0)}>오른쪽</button><button onClick={() => moveFromHelp(0, 2)}>뒤로</button></div><div className="preference-row"><button aria-pressed={reduced} onClick={toggleReduced}><Pause size={17} /><span>움직임 줄이기<small>물과 나뭇잎, 자동 시점 전환을 멈춥니다.</small></span><strong>{reduced ? "켜짐" : "꺼짐"}</strong></button><label className="quality-preference"><Layers size={17} /><span>화면 품질<small>자동은 움직임에 맞춰 해상도와 효과를 조절합니다.</small></span><select aria-label="화면 품질" value={quality} onChange={event => setQuality(event.target.value as "auto" | "high" | "low")}><option value="auto">자동</option><option value="high">선명하게</option><option value="low">가볍게</option></select></label></div><p className="editorial-note">장소의 크기와 위치는 이야기를 표현하는 구성입니다. 성과나 중요도의 순위가 아닙니다.</p><a className="text-link" href="./reading.html">글로만 읽기 <BookOpen size={16} /></a></section></div>}
        {modalKind === "reading-help" && <div className="modal-backdrop"><section ref={modalRef} className="camera-help-dialog" role="dialog" aria-modal="true" aria-labelledby="reading-help-title"><button className="icon-button panel-dismiss" aria-label="자료 읽기 안내 닫기" onClick={closeModal}><X size={20} /></button><span className="overline">이야기에서 근거로</span><h1 id="reading-help-title" tabIndex={-1} data-modal-heading>자료는 이렇게 읽습니다.</h1><div className="reading-help-steps"><section><span>01</span><h2>먼저, 이야기의 뜻을 읽습니다.</h2><p>프로젝트가 향하는 곳과 현재 상태를 짧은 설명으로 만납니다.</p></section><section><span>02</span><h2>궁금한 대목은 근거로 이어갑니다.</h2><p>‘설명 너머의 근거’에서 기준일과 선별한 원문 발췌를 확인할 수 있습니다. Atlas가 풀어 쓴 설명은 원문과 구분합니다.</p></section><section><span>03</span><h2>다시, 탐색을 이어 갑니다.</h2><p>읽기 화면 위쪽의 돌아가기 버튼으로 탐색을 이어 갑니다. 풍경에서 시작했다면 보던 장소와 시점이 유지됩니다.</p></section></div><div className="selection-actions"><button className="button" onClick={() => go("/projects")}>이야기 둘러보기 <BookOpen size={17} /></button><button className="button outline" onClick={() => openModal("search")}>자료 찾기 <Search size={17} /></button></div></section></div>}
        {modalKind === "places" && activeIsland && <div className="modal-backdrop"><section ref={modalRef} className="places-dialog" role="dialog" aria-modal="true" aria-labelledby="places-title"><button className="icon-button panel-dismiss" aria-label="장소 목록 닫기" onClick={closeModal}><X size={20} /></button><span className="overline">{activeIsland.label}</span><h1 id="places-title" tabIndex={-1} data-modal-heading>어디를 가까이 볼까요?</h1><p>장소를 고르면 풍경 속으로 다가갑니다.</p><div className="island-place-list">{activeIsland.places.map((place, index) => <button key={place.id} data-atlas-focus={`list-${place.id}`} onClick={() => selectPlace(place.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{place.label}</strong><small>{place.question}</small></div><ArrowUpRight size={17} /></button>)}</div></section></div>}

      </main>
    </>
  );
}
