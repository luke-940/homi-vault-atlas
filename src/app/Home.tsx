import { ArrowRight, Compass, FolderTree, Orbit, Rocket, RotateCcw, ShieldCheck } from "lucide-react";
import type { CosmosLens } from "./contracts";
import { CosmosStage } from "./CosmosStage";
import { EvidenceRail } from "./EvidenceRail";
import { LENS_COPY } from "./scene";
import { useAtlas } from "./state";
import type { AtlasInventoryV1 } from "./contracts";

const lensOrder: CosmosLens[] = [
  "whole-vault",
  "knowledge-core",
  "project-frontiers",
  "agent-stewardship",
];

const lensLabels: Record<CosmosLens, string> = {
  "whole-vault": "Whole Vault",
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

export function Home() {
  const atlas = useAtlas();
  const copy = LENS_COPY[atlas.route.lens];
  const inventory = atlas.runtime.inventory;
  const activeDomains = atlas.route.lens === "knowledge-core"
    ? ["MOC", "Papers", "Signals"]
    : atlas.route.lens === "project-frontiers"
      ? ["Rocket", "Groot", "Intelligence Layer"]
      : [];
  return (
    <main className="home-layout">
      <section className="editorial-rail" aria-labelledby="home-title">
        <div className="editorial-rail__copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 id="home-title">{copy.title}</h1>
          <p className="lede" lang="ko">{copy.description}</p>
          <div className="home-actions">
            <button type="button" className="primary-action" onClick={() => atlas.goWorkspace("explore")}>
              전체 지형 탐색 <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button type="button" className="quiet-action" onClick={() => atlas.setExploreMode("structure")}>
              <FolderTree size={14} aria-hidden="true" /> Vault Structure
            </button>
            <button
              type="button"
              className="quiet-action"
              onClick={() => atlas.commitFocus(null)}
              disabled={!atlas.route.focusId}
            >
              <RotateCcw size={14} aria-hidden="true" /> Reset focus
            </button>
          </div>
        </div>
        <nav className="lens-rail" aria-label="Knowledge lenses">
          {lensOrder.map((lens) => {
            const Icon = lensIcons[lens];
            return (
              <button
                type="button"
                key={lens}
                onClick={() => atlas.setLens(lens)}
                aria-current={atlas.route.lens === lens ? "step" : undefined}
              >
                <span><Icon aria-hidden="true" size={15} strokeWidth={1.55} /></span>
                <strong>{lensLabels[lens]}</strong>
                <small>{LENS_COPY[lens].evidence}</small>
              </button>
            );
          })}
        </nav>
        <EvidenceRail />
        <CoverageLedger inventory={inventory} edgeCount={atlas.runtime.graph.manifest.edgeCount} />
      </section>
      <section className="home-stage" aria-label={`${lensLabels[atlas.route.lens]} spatial graph`}>
        <CosmosStage mode="home" />
        {activeDomains.length ? (
          <div className="domain-legend" aria-label="Domain legend">
            {atlas.runtime.graph.domains
              .filter((domain) => activeDomains.includes(domain.label))
              .map((domain) => (
                <span key={domain.id} style={{ "--domain-color": domain.color } as React.CSSProperties}>
                  {domain.label}
                </span>
              ))}
          </div>
        ) : null}
        {atlas.route.lens === "agent-stewardship" ? <StewardshipBand /> : null}
      </section>
      <section className="mobile-home-meta" aria-label="Selected node and release coverage">
        <EvidenceRail />
        <CoverageLedger inventory={inventory} edgeCount={atlas.runtime.graph.manifest.edgeCount} />
      </section>
    </main>
  );
}

function CoverageLedger({
  inventory,
  edgeCount,
}: {
  inventory: AtlasInventoryV1;
  edgeCount: number;
}) {
  return (
    <div className="coverage-ledger">
      <span>RELEASE SNAPSHOT · NOT LIVE STATUS</span>
      <dl>
        <div><dt>Named</dt><dd>{inventory.namedCount}</dd></div>
        <div><dt>Directed links</dt><dd>{edgeCount.toLocaleString("ko-KR")}</dd></div>
        <div><dt>Excluded</dt><dd>{inventory.excludedCount}</dd></div>
      </dl>
    </div>
  );
}

function StewardshipBand() {
  const atlas = useAtlas();
  const agency = atlas.runtime.agency;
  if (!agency) return null;
  return (
    <div className="stewardship-band">
      <span className="stewardship-band__principal">{agency.principal.label} · Direction</span>
      <div>
        {agency.actors.map((actor) => (
          <button type="button" key={actor.id} onClick={() => atlas.goWorkspace("agency")}>
            <strong>{actor.label}</strong>
            <span>{actor.publicOutput ?? actor.purpose}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
