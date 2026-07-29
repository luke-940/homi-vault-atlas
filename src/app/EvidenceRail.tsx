import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { DossierDock } from "../knowledge/DossierDock";
import { useKnowledge } from "../knowledge/KnowledgeProvider";
import { activeNode, useAtlas } from "./state";

export function EvidenceRail({
  compact = false,
  surface = "home",
}: {
  compact?: boolean;
  surface?: "home" | "explore" | "observe";
}) {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  if (atlas.route.focusId) {
    return <DossierDock nodeId={atlas.route.focusId} compact={compact} surface={surface} />;
  }
  const preview = activeNode(atlas);
  const entry = preview ? knowledge.entry(preview.id) : null;
  return (
    <section className={`map-preview${compact ? " map-preview--compact" : ""}`}>
      {preview ? (
        <>
          <span>{preview.domain} · {preview.kind.replaceAll("_", " ")}</span>
          <h2>{preview.label}</h2>
          <p>{entry?.readerSummary ?? "이 노드는 아직 Atlas Builder의 심층 검수를 기다리고 있습니다."}</p>
          <dl className="relation-metrics">
            <div data-direction="incoming">
              <dt><ArrowDownLeft size={12} /> Incoming</dt><dd>{preview.incoming.length}</dd>
            </div>
            <div data-direction="outgoing">
              <dt><ArrowUpRight size={12} /> Outgoing</dt><dd>{preview.outgoing.length}</dd>
            </div>
          </dl>
          {!entry
            ? <small>검수 대기 · releaseEligible=false</small>
            : <small>선택하면 dossier를 엽니다.</small>}
        </>
      ) : (
        <>
          <span>KNOWLEDGE MAP</span>
          <p>노드에 손을 올리면 이름과 실제 방향 관계가 드러납니다. 선택하면 근거와 원문을 읽을 수 있습니다.</p>
        </>
      )}
    </section>
  );
}
