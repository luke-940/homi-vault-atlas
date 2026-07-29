import { useState } from "react";
import { CosmosStage } from "./CosmosStage";
import { EvidenceRail } from "./EvidenceRail";
import { CoverageLedger, HomeRail, lensLabels } from "./home/HomeRail";
import type { HomeHighlight } from "./home/HomeNavigator";
import { useResizableRail } from "./home/useResizableRail";
import { useAtlas } from "./state";
import { useMediaQuery } from "./useMediaQuery";

export function Home() {
  const atlas = useAtlas();
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [highlight, setHighlight] = useState<HomeHighlight>({
    domain: null,
    kind: null,
    query: "",
  });
  const rail = useResizableRail();
  const mobile = useMediaQuery("(max-width: 820px)");
  const lensDomains = atlas.route.lens === "knowledge-core"
    ? ["MOC", "Papers", "Signals"]
    : atlas.route.lens === "project-frontiers"
      ? ["Rocket", "Groot", "Intelligence Layer"]
      : [];
  const activeDomains = highlight.domain ? [highlight.domain] : lensDomains;

  return (
    <main
      ref={rail.layoutRef}
      style={rail.layoutStyle}
      className={`home-layout${railCollapsed ? " home-layout--rail-collapsed" : ""}${atlas.route.focusId ? " home-layout--has-focus" : ""}`}
    >
      <HomeRail
        collapsed={railCollapsed}
        highlight={highlight}
        onToggle={() => setRailCollapsed((collapsed) => !collapsed)}
        onHighlightChange={setHighlight}
        showFocusedEvidence={!mobile}
      />
      {railCollapsed ? null : <div className="home-rail-resizer" {...rail.separatorProps} />}
      <section className="home-stage" aria-label={`${lensLabels[atlas.route.lens]} spatial graph`}>
        <CosmosStage
          mode="home"
          activeDomains={activeDomains.length ? activeDomains : undefined}
          activeKinds={highlight.kind ? [highlight.kind] : undefined}
        />
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
      {mobile ? (
        <section className="mobile-home-meta" aria-label="Selected node and release coverage">
          <EvidenceRail surface="home" />
          <CoverageLedger
            inventory={atlas.runtime.inventory}
            edgeCount={atlas.runtime.graph.manifest.edgeCount}
          />
        </section>
      ) : null}
    </main>
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
