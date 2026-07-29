import {
  Compass,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { AtlasInventoryV1, CosmosLens } from "../contracts";
import { EvidenceRail } from "../EvidenceRail";
import { LENS_COPY } from "../scene";
import { useAtlas } from "../state";
import { HomeNavigator, type HomeHighlight } from "./HomeNavigator";

export const lensOrder: CosmosLens[] = [
  "whole-vault",
  "knowledge-core",
  "project-frontiers",
  "agent-stewardship",
];

export const lensLabels: Record<CosmosLens, string> = {
  "whole-vault": "Homi Vault",
  "knowledge-core": "Knowledge Core",
  "project-frontiers": "Project Frontiers",
  "agent-stewardship": "Agent Stewardship",
};

const lensIcons = {
  "whole-vault": Orbit,
  "knowledge-core": Compass,
  "project-frontiers": Rocket,
  "agent-stewardship": ShieldCheck,
} as const;

const lensVisibleLabels: Record<CosmosLens, string> = {
  "whole-vault": "Homi Vault",
  "knowledge-core": "Core",
  "project-frontiers": "Projects",
  "agent-stewardship": "Agents",
};

export function HomeRail({
  collapsed,
  highlight,
  onToggle,
  onHighlightChange,
  showFocusedEvidence,
}: {
  collapsed: boolean;
  highlight: HomeHighlight;
  onToggle(): void;
  onHighlightChange(next: HomeHighlight): void;
  showFocusedEvidence: boolean;
}) {
  const atlas = useAtlas();
  return (
    <section
      className={`editorial-rail${collapsed ? " editorial-rail--collapsed" : ""}${atlas.route.focusId ? " editorial-rail--focused" : ""}`}
      aria-labelledby="map-console-title"
    >
      <button
        type="button"
        className="editorial-rail__toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "설명 패널 펼치기" : "설명 패널 접기"}
        title={collapsed ? "설명 패널 펼치기" : "설명 패널 접기"}
        onClick={onToggle}
      >
        {collapsed
          ? <PanelLeftOpen size={16} aria-hidden="true" />
          : <PanelLeftClose size={16} aria-hidden="true" />}
      </button>
      <MapConsole />
      <LensRail />
      <div className="editorial-rail__content">
        {atlas.route.focusId && showFocusedEvidence
          ? <EvidenceRail surface="home" />
          : !atlas.route.focusId
            ? <HomeNavigator highlight={highlight} onChange={onHighlightChange} />
            : null}
      </div>
      <CoverageLedger
        inventory={atlas.runtime.inventory}
        edgeCount={atlas.runtime.graph.manifest.edgeCount}
      />
    </section>
  );
}

function MapConsole() {
  const atlas = useAtlas();
  return (
    <header className="map-console">
      <div className="map-console__title">
        <div>
          <span>MAP CONSOLE</span>
          <h1 id="map-console-title">{lensLabels[atlas.route.lens]}</h1>
        </div>
        <time dateTime={atlas.runtime.graph.generatedAt}>
          {new Date(atlas.runtime.graph.generatedAt).toLocaleDateString("ko-KR")}
        </time>
      </div>
      <dl className="map-console__stats">
        <div><dt>Nodes</dt><dd>{atlas.runtime.graph.manifest.nodeCount.toLocaleString("ko-KR")}</dd></div>
        <div><dt>Edges</dt><dd>{atlas.runtime.graph.manifest.edgeCount.toLocaleString("ko-KR")}</dd></div>
        <div><dt>Domains</dt><dd>{atlas.runtime.graph.manifest.domainCount}</dd></div>
      </dl>
      <button type="button" className="map-console__search" onClick={() => atlas.setSearchOpen(true)}>
        <Search size={15} aria-hidden="true" />
        <span>제목·인사이트·안전 원문 검색</span>
        <kbd>⌘K</kbd>
      </button>
    </header>
  );
}

function LensRail() {
  const atlas = useAtlas();
  return (
    <nav className="lens-rail" aria-label="Knowledge lenses">
      {lensOrder.map((lens) => {
        const Icon = lensIcons[lens];
        return (
          <button
            type="button"
            key={lens}
            onClick={() => atlas.setLens(lens)}
            aria-current={atlas.route.lens === lens ? "step" : undefined}
            aria-label={lensLabels[lens]}
            title={lensLabels[lens]}
          >
            <span><Icon aria-hidden="true" size={15} strokeWidth={1.55} /></span>
            <strong>{lensVisibleLabels[lens]}</strong>
            <small>{LENS_COPY[lens].evidence}</small>
          </button>
        );
      })}
    </nav>
  );
}

export function CoverageLedger({
  inventory,
  edgeCount,
}: {
  inventory: AtlasInventoryV1;
  edgeCount: number;
}) {
  return (
    <div className="coverage-ledger">
      <span>RELEASE SNAPSHOT · NOT LIVE</span>
      <dl>
        <div><dt>Named</dt><dd>{inventory.namedCount}</dd></div>
        <div><dt>Links</dt><dd>{edgeCount.toLocaleString("ko-KR")}</dd></div>
        <div><dt>Excluded</dt><dd>{inventory.excludedCount}</dd></div>
      </dl>
    </div>
  );
}
