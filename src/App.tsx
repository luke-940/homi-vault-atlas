import React, { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import {
  content,
  nodes,
  projects,
  nodeById,
  evidenceRecords,
  evidenceFor,
  artworkFor,
  projectFor,
  searchNodes,
  type AtlasNode,
  type ProjectId,
} from "./content";
import type { AtlasWorld } from "./world";

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
    caption: "살아 보고 싶은 세계",
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
function navigate(path: string) {
  window.location.hash = path;
}
function nodePath(id: string) {
  return `${projects.some((n) => n.id === id) ? "/project/" : "/story/"}${id}`;
}
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/world");
  useEffect(() => {
    const update = () => setRoute(location.hash.slice(1) || "/world");
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return route;
}
function useDialog(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const previous = document.activeElement as HTMLElement;
    const root = ref.current;
    const first = root.querySelector<HTMLElement>(
      'input,button,a[href],[tabindex="0"]',
    );
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const items = [
          ...root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,a[href],select,[tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
        const a = items[0],
          b = items.at(-1);
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b?.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
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
  if (!src) return null;
  const rocket = projectFor(node.id) === "rocket";
  return (
    <figure className={`artwork ${large ? "large" : ""}`}>
      <img
        src={`./${src}`}
        alt={
          rocket
            ? "서로 다른 연구 질문을 표현한 일곱 관측 장치의 제작 이미지"
            : `${node.title} — Groot의 목표 원화`
        }
        loading="lazy"
      />
      <figcaption>
        <span>{rocket ? "연구 구조 표현" : "목표 원화"}</span>
        {rocket
          ? "서로 다른 질문으로 같은 변화를 읽습니다."
          : "만들고자 하는 장면입니다. 현재 실행 화면과 구분합니다."}
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
          이 질문을 더 읽기 <ArrowUpRight size={16} />
        </a>
      </div>
    </section>
  );
}

function ProjectShortcuts({ node }: { node: AtlasNode }) {
  if (node.id === "groot")
    return (
      <div className="project-shortcuts" aria-label="Groot의 세 가지 하루">
        {["groot-adventure", "groot-living", "groot-relationships"].map(
          (id, i) => (
            <a href={`#${nodePath(id)}`} key={id}>
              <small>{["모험", "생활", "관계"][i]}</small>
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
  const route = useRoute();
  const [path, query = ""] = route.split("?");
  const parts = path.split("/").filter(Boolean);
  const type = parts[0] || "world";
  const id = parts[1] || "";
  const current = nodeById.get(id);
  const record =
    type === "evidence" ? evidenceRecords.find((r) => r.id === id) : undefined;
  const from = new URLSearchParams(query).get("from");
  const sourceNode = record
    ? nodeById.get(from || "") || nodeById.get(record.nodeIds[0])
    : current;
  const activeProject = sourceNode
    ? projectFor(sourceNode.id)
    : type === "flow"
      ? "common"
      : undefined;
  const isWorld = type === "world";
  const isCollection =
    type === "projects" || type === "flow" || type === "routes";
  const hasPanel = Boolean(
    ((type === "project" || type === "story") && current) ||
      record ||
      isCollection,
  );
  const invalid = !isWorld && !hasPanel;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProjectId | "all">("all");
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [low, setLow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tour, setTour] = useState<{ id: string; step: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<AtlasWorld | null>(null);
  const labels = useRef<Record<string, HTMLAnchorElement | null>>({});
  const main = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const scrollMemory = useRef<Record<string, number>>({});
  const routeRef = useRef(activeProject);
  routeRef.current = activeProject;
  useDialog(searchOpen, dialog, () => setSearchOpen(false));
  useEffect(() => {
    let disposed = false;
    import("./world")
      .then(({ AtlasWorld }) => {
        if (disposed || !host.current) return;
        try {
          world.current = new AtlasWorld(host.current, {
            onReady: () => {
              setReady(true);
              world.current?.focus(routeRef.current);
            },
            onError: setError,
            onSelect: (p) => navigate(nodePath(destinations[p].entry)),
            onProject: (positions) => {
              for (const [key, p] of Object.entries(positions)) {
                const el = labels.current[key];
                if (el) {
                  el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,0)`;
                  el.style.visibility = p.visible ? "visible" : "hidden";
                }
              }
            },
          });
          world.current.setReduced(reduced);
        } catch {
          setError(
            "이 환경에서는 3D 화면을 열 수 없습니다. 프로젝트에서 같은 이야기와 자료를 만날 수 있습니다.",
          );
        }
      })
      .catch(() =>
        setError(
          "장면을 불러오지 못했습니다. 프로젝트와 자료 읽기는 계속 사용할 수 있습니다.",
        ),
      );
    return () => {
      disposed = true;
      world.current?.dispose();
      world.current = null;
    };
  }, []);
  useEffect(() => {
    world.current?.focus(activeProject);
    panel.current?.scrollTo({ top: scrollMemory.current[route] || 0 });
  }, [route]);
  useEffect(() => {
    world.current?.setReduced(reduced);
  }, [reduced]);
  useEffect(() => {
    world.current?.setQuality(low ? "low" : "high");
  }, [low]);
  useEffect(() => {
    world.current?.setPaused(searchOpen || Boolean(record));
  }, [searchOpen, record]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && !searchOpen) {
        setSettingsOpen(false);
        if (hasPanel) navigate("/world");
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [searchOpen, hasPanel]);
  useEffect(() => {
    if (main.current) (main.current as any).inert = searchOpen;
  }, [searchOpen]);
  const results = searchNodes(search, filter);
  const activeTour = tour
    ? content.routes.find((r) => r.id === tour.id)
    : undefined;
  function beginTour(t: (typeof content.routes)[number]) {
    setTour({ id: t.id, step: 0 });
    navigate(nodePath(t.steps[0]));
  }
  function tourMove(delta: number) {
    if (!tour || !activeTour) return;
    const step = tour.step + delta;
    if (step >= 0 && step < activeTour.steps.length) {
      setTour({ ...tour, step });
      navigate(nodePath(activeTour.steps[step]));
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  const panelClose = () => navigate("/world");
  return (
    <>
      <a
        className="skip-link"
        href="#reading-content"
        onClick={(e) => {
          e.preventDefault();
          navigate("/projects");
          setTimeout(() => panel.current?.focus(), 100);
        }}
      >
        프로젝트와 자료로 바로 가기
      </a>
      <main
        ref={main}
        className={`app ${hasPanel ? "has-panel" : ""} ${record ? "has-reader" : ""} ${isCollection ? "has-collection" : ""}`}
      >
        <header className="topbar">
          <a href="#/world" className="brand" aria-label="Homi Atlas 세계로">
            <span className="brand-mark">H</span>
            <span>
              HOMI <b>ATLAS</b>
              <small>OUR WORK, IN A WORLD.</small>
            </span>
          </a>
          <nav aria-label="주 메뉴">
            <a className={isWorld ? "active" : ""} href="#/world">
              세계
            </a>
            <a
              className={
                type === "projects" ||
                (activeProject && activeProject !== "common")
                  ? "active"
                  : ""
              }
              href="#/projects"
            >
              프로젝트
            </a>
            <a className={type === "flow" ? "active" : ""} href="#/flow">
              지식의 흐름
            </a>
            <button onClick={() => setSearchOpen(true)}>
              자료 찾기 <Search size={16} />
            </button>
          </nav>
          <span className="edition">FIELD NOTES · 08</span>
          <button
            className="icon-button mobile-search"
            aria-label="자료 찾기"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={20} />
          </button>
        </header>
        <div className="world-area">
          <div className="world-canvas" ref={host} />
          <div className="world-vignette" />
          {!error && ready && (
            <div
              className={`world-labels ${hasPanel ? "focused" : ""}`}
              aria-label="세계의 목적지"
            >
              {worldIds.map((p) => (
                <a
                  key={p}
                  href={`#${nodePath(destinations[p].entry)}`}
                  ref={(el) => {
                    labels.current[p] = el;
                  }}
                  className={`world-label ${activeProject === p ? "selected" : ""}`}
                  aria-label={`${destinations[p].name} — ${destinations[p].caption}`}
                >
                  <span className="label-dot" />
                  <span>
                    <small>
                      {destinations[p].number} / {destinations[p].caption}
                    </small>
                    <strong>{destinations[p].name}</strong>
                  </span>
                  <ArrowUpRight size={16} />
                </a>
              ))}
            </div>
          )}
          {(!ready || error) && (
            <div
              className={`world-loading ${error ? "failed" : ""}`}
              role="status"
            >
              {error ? (
                <>
                  <img
                    src="./assets/groot-harbor.webp"
                    alt="Groot 항구의 목표 원화"
                  />
                  <div>
                    <Compass size={24} />
                    <small className="fallback-art-caption">
                      Groot 목표 원화
                    </small>
                    <p>{error}</p>
                    <a className="button" href="#/projects">
                      프로젝트 둘러보기 <ArrowRight size={16} />
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <span className="loading-ring" />
                  <span>우리의 세계를 펼치는 중</span>
                  <small>처음 만나는 풍경은 잠시 시간이 걸릴 수 있어요.</small>
                </>
              )}
            </div>
          )}
          {isWorld && (
            <section className="world-intro">
              <div className="overline">
                <span /> A WORLD OF IDEAS & MAKING
              </div>
              <h1>
                생각이 자라고,
                <br />
                세계가 만들어지는 곳.
              </h1>
              <p>
                변화를 읽고, 새로운 세계를 만들고,
                <br />
                발견을 다음 질문으로 이어 갑니다.
              </p>
              <a className="text-link light" href="#/routes">
                길을 따라 둘러보기 <ArrowUpRight size={16} />
              </a>
            </section>
          )}
          {isWorld && (
            <section
              className="discovery-dock"
              aria-label="여기서 시작해 보세요"
            >
              <a className="featured-story" href="#/project/groot">
                <div>
                  <span className="overline">EXPLORE GROOT</span>
                  <h2>
                    살아 보고 싶은
                    <br />
                    세계를 만들다.
                  </h2>
                  <p>모험과 생활, 관계가 이어지는 항구.</p>
                  <span className="text-link">
                    Groot로 들어가기 <ArrowUpRight size={16} />
                  </span>
                </div>
                <figure>
                  <img
                    src="./assets/groot-harbor.webp"
                    alt="Groot 항구의 목표 원화"
                  />
                  <figcaption>목표 원화</figcaption>
                </figure>
              </a>
              <a className="dock-question" href="#/story/rocket-clocks">
                <small>ROCKET · 변화의 관측소</small>
                <h3>
                  가능해진 일은
                  <br />
                  언제 현실이 될까?
                </h3>
                <span>
                  서로 다른 속도의 세 가지 시계 <ArrowUpRight size={16} />
                </span>
              </a>
              <a className="dock-question" href="#/flow">
                <small>OUR KNOWLEDGE</small>
                <h3>
                  오늘의 발견은
                  <br />
                  어디에 남을까?
                </h3>
                <span>
                  발견에서 다음 판단까지 <ArrowUpRight size={16} />
                </span>
              </a>
            </section>
          )}
          {!isWorld && (
            <a className="world-back" href="#/world">
              <ArrowLeft size={16} /> 전체 세계
            </a>
          )}
          <div className="world-tools">
            <span className="interaction-hint">
              드래그해 둘러보기 · 스크롤로 가까이
            </span>
            <div className="tool-group">
              <button
                aria-label="가까이 보기"
                title="가까이 보기"
                onClick={() => world.current?.zoom(0.82)}
              >
                <Plus size={17} />
              </button>
              <button
                aria-label="멀리 보기"
                title="멀리 보기"
                onClick={() => world.current?.zoom(1.22)}
              >
                <Minus size={17} />
              </button>
              <button
                aria-label="카메라 처음 위치"
                title="카메라 처음 위치"
                onClick={() => world.current?.focus(activeProject)}
              >
                <RotateCcw size={16} />
              </button>
              <button
                aria-label="화면 설정"
                title="화면 설정"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen(!settingsOpen)}
              >
                <SlidersHorizontal size={16} />
              </button>
            </div>
          </div>
          {settingsOpen && (
            <div className="settings">
              <strong>편안한 탐험</strong>
              <button
                aria-pressed={reduced}
                onClick={() => setReduced(!reduced)}
              >
                {reduced ? <Play size={16} /> : <Pause size={16} />}움직임
                줄이기 <span>{reduced ? "켜짐" : "꺼짐"}</span>
              </button>
              <button aria-pressed={low} onClick={() => setLow(!low)}>
                <Layers size={16} />
                가벼운 화면 <span>{low ? "켜짐" : "꺼짐"}</span>
              </button>
              <a href="./reading.html">
                <BookOpen size={16} /> 글로만 읽기
              </a>
              <p>
                장소의 크기와 위치는 표현을 위한 구성입니다. 성과나 중요도의
                순위가 아닙니다.
              </p>
            </div>
          )}
          {isWorld && (
            <footer className="world-footer">
              <span>HOMI ATLAS · VOL. 08</span>
              <span>
                자료 기준 2026.09.07 <span className="footer-divider">/</span>{" "}
                장소는 이야기로, 이야기는 근거로.
              </span>
            </footer>
          )}
        </div>
        {hasPanel && (
          <aside
            id="reading-content"
            ref={panel}
            onScroll={(e) => {
              scrollMemory.current[route] = e.currentTarget.scrollTop;
            }}
            tabIndex={-1}
            className={`reading-panel ${isCollection ? "collection-panel" : ""} ${record ? "evidence-panel" : ""}`}
            aria-label={
              record ? "근거 읽기" : current?.title || "프로젝트 안내"
            }
          >
            <div className="panel-toolbar">
              <button
                className="text-link"
                onClick={() => {
                  if (record && sourceNode) navigate(nodePath(sourceNode.id));
                  else if (current && !projects.includes(current))
                    navigate(
                      nodePath(destinations[projectFor(current.id)].entry),
                    );
                  else panelClose();
                }}
              >
                <ArrowLeft size={16} />
                {record
                  ? "이야기로 돌아가기"
                  : current && !projects.includes(current)
                    ? destinations[projectFor(current.id)].name
                    : "세계로 돌아가기"}
              </button>
              <div>
                <button
                  className="icon-button"
                  aria-label={copied ? "링크 복사됨" : "이 화면 링크 복사"}
                  title="이 화면 링크 복사"
                  onClick={copyLink}
                >
                  {copied ? <Check size={17} /> : <LinkIcon size={17} />}
                </button>
                <button
                  className="icon-button"
                  aria-label="읽기 닫기"
                  onClick={panelClose}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
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
                    <p key={i}>{p}</p>
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
                      더 가까이 보기{" "}
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
                  현재 상태는 2026년 9월 7일 확인한 자료를 기준으로 설명합니다.
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
                  프로젝트가 향하는 곳과 지금 만들고 있는 것을 만나 보세요.
                </p>
                <div className="project-grid">
                  {projects.map((n) => (
                    <a href={`#${nodePath(n.id)}`} key={n.id}>
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
            <footer className="reader-footer">
              <a href="#/world">HOMI ATLAS</a>
              <a href="./data/content.json" download="homi-atlas-content.json">
                <Download size={14} /> 이야기 데이터
              </a>
            </footer>
          </aside>
        )}
        {invalid && (
          <section className="not-found">
            <Compass size={28} />
            <h1>새로운 세계에서 다시 만나요.</h1>
            <p>이 주소의 자료는 현재 아틀라스에 없습니다.</p>
            <a className="button" href="#/world">
              세계로 가기 <ArrowRight size={16} />
            </a>
          </section>
        )}
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
      </main>
      {searchOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <div
            ref={dialog}
            className="search-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-title"
          >
            <div className="search-heading">
              <span className="overline" id="search-title">
                이 세계의 이야기 찾기
              </span>
              <button
                className="icon-button"
                aria-label="검색 닫기"
                onClick={() => setSearchOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <label className="search-input">
              <Search size={23} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="프로젝트, 이야기, 궁금한 개념"
                aria-label="검색어"
                autoComplete="off"
              />
              <kbd>ESC</kbd>
            </label>
            <div className="search-filters" aria-label="검색 범위">
              {(["all", ...worldIds] as const).map((f) => (
                <button
                  key={f}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "모든 이야기" : destinations[f].name}
                </button>
              ))}
            </div>
            <div className="search-count" aria-live="polite">
              {search ? `“${search}”와 이어지는` : "지금 둘러볼 수 있는"} 이야기{" "}
              {results.length}개
            </div>
            <div className="search-results">
              {results.map((n) => (
                <a
                  key={n.id}
                  href={`#${nodePath(n.id)}`}
                  onClick={() => setSearchOpen(false)}
                >
                  <span>
                    <small>
                      {destinations[projectFor(n.id)].name} / {n.eyebrow}
                    </small>
                    <strong>{n.title}</strong>
                    <p>{n.summary}</p>
                  </span>
                  <ChevronRight size={18} />
                </a>
              ))}
              {!results.length && (
                <div className="search-empty">
                  <BookOpen size={28} />
                  <h2>다른 말로 찾아볼까요?</h2>
                  <p>‘기억’, ‘항구’, ‘연구’처럼 짧은 단어로 찾아보세요.</p>
                  <button
                    className="text-link"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    모든 이야기 보기 <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
