import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Network,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GraphDirectoryFolder, GraphNode } from "./contracts";
import { relationSummary } from "./data";
import { useAtlas } from "./state";

const kindLabels: Record<GraphNode["kind"], string> = {
  moc_hub: "지식 허브",
  paper_gateway: "논문 관문",
  signal_domain: "신호 영역",
  signal_storyline: "신호 흐름",
  project: "프로젝트",
  project_stage: "프로젝트 단계",
  source_document: "지식 문서",
  strategy_insight: "전략 인사이트",
  aggregate_boundary: "집계 경계",
};

export function VaultStructure({ query, domain }: { query: string; domain: string | null }) {
  const atlas = useAtlas();
  const directory = atlas.runtime.graph.directory;
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const structure = useMemo(() => {
    const folderForNode = new Map<number, number>();
    directory.folders.forEach((folder) => {
      folder.nodeIndexes.forEach((nodeIndex) => folderForNode.set(nodeIndex, folder.index));
    });
    const domainMatches = (node: GraphNode) => !domain || node.domain === domain;
    const nodeMatches = new Set(atlas.runtime.graph.nodes
      .filter(domainMatches)
      .filter((node) => !normalizedQuery
        || node.label.toLocaleLowerCase("ko").includes(normalizedQuery))
      .map((node) => node.index));
    const matchingFolderRoots = new Set(directory.folders
      .filter((folder) => (!domain
        || atlas.runtime.graph.domains[folder.domainIndex]?.label === domain)
        && normalizedQuery
        && folder.label.toLocaleLowerCase("ko").includes(normalizedQuery))
      .map((folder) => folder.index));
    const visibleNodes = new Set(nodeMatches);
    for (const folderIndex of matchingFolderRoots) {
      const queue = [folderIndex];
      while (queue.length) {
        const current = directory.folders[queue.shift()!];
        current.nodeIndexes.forEach((nodeIndex) => {
          const node = atlas.runtime.graph.nodes[nodeIndex];
          if (node && domainMatches(node)) visibleNodes.add(nodeIndex);
        });
        queue.push(...current.childIndexes);
      }
    }
    const visibleFolders = new Set<number>();
    const includeAncestors = (folderIndex: number) => {
      let cursor = folderIndex;
      while (cursor >= 0 && !visibleFolders.has(cursor)) {
        visibleFolders.add(cursor);
        cursor = directory.folders[cursor]?.parentIndex ?? -1;
      }
    };
    visibleNodes.forEach((nodeIndex) => {
      const folderIndex = folderForNode.get(nodeIndex);
      if (folderIndex !== undefined) includeAncestors(folderIndex);
    });
    matchingFolderRoots.forEach(includeAncestors);
    const visibleCount = new Map<number, number>();
    for (let index = directory.folders.length - 1; index >= 0; index -= 1) {
      const folder = directory.folders[index];
      const direct = folder.nodeIndexes.filter((nodeIndex) => visibleNodes.has(nodeIndex)).length;
      const descendants = folder.childIndexes
        .reduce((sum, childIndex) => sum + (visibleCount.get(childIndex) ?? 0), 0);
      visibleCount.set(index, direct + descendants);
    }
    return { visibleFolders, visibleNodes, visibleCount };
  }, [atlas.runtime.graph, directory, domain, normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery) return;
    setExpanded((current) => new Set([...current, ...structure.visibleFolders]));
  }, [normalizedQuery, structure.visibleFolders]);

  const selected = atlas.runtime.graph.nodeById.get(atlas.route.focusId ?? "") ?? null;
  const omitted = directory.manifest.omittedNodeCount;
  return (
    <section className="vault-structure" aria-labelledby="vault-structure-title">
      <header className="vault-structure__header">
        <div>
          <p className="eyebrow">CURATED DIRECTORY · RELEASE SNAPSHOT</p>
          <h2 id="vault-structure-title">{directory.rootLabel}</h2>
          <p>
            옵시디언의 폴더 위계를 공개 지식 구조로 다시 읽습니다.
            운영 기록과 날짜성 가지는 접고, 실제 공개 제목은 그대로 유지합니다.
          </p>
        </div>
        <dl>
          <div><dt>Roots</dt><dd>{directory.rootIndexes.length}</dd></div>
          <div><dt>Folders</dt><dd>{directory.manifest.folderCount}</dd></div>
          <div><dt>Titles</dt><dd>{directory.manifest.representedNodeCount}</dd></div>
        </dl>
      </header>
      <div className="vault-structure__grid">
        <div className="vault-tree-panel">
          <ul className="vault-tree" role="tree" aria-label="Curated Homi Vault directory">
            {directory.rootIndexes
              .filter((index) => structure.visibleFolders.has(index))
              .map((index) => (
                <FolderBranch
                  key={directory.folders[index].id}
                  folder={directory.folders[index]}
                  expanded={expanded}
                  visibleFolders={structure.visibleFolders}
                  visibleNodes={structure.visibleNodes}
                  visibleCount={structure.visibleCount}
                  onToggle={(folderIndex) => setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(folderIndex)) next.delete(folderIndex);
                    else next.add(folderIndex);
                    return next;
                  })}
                />
              ))}
          </ul>
          {structure.visibleFolders.size === 0 ? (
            <p className="vault-tree__empty">해당 조건에 맞는 공개 구조가 없습니다.</p>
          ) : null}
          <p className="vault-tree__boundary">
            {omitted > 0
              ? `그래프와 List에 남아 있는 운영성 가지 ${omitted}개는 이 구조 개요에서 접었습니다.`
              : "운영성 가지는 구조 개요에서 제외했습니다."}
            {" "}전체 공개 제외 {atlas.runtime.inventory.excludedCount}개는 문서명 없이 사유로만 집계됩니다.
          </p>
        </div>
        <StructureInspector selected={selected} />
      </div>
    </section>
  );
}

function FolderBranch({
  folder,
  expanded,
  visibleFolders,
  visibleNodes,
  visibleCount,
  onToggle,
}: {
  folder: GraphDirectoryFolder;
  expanded: Set<number>;
  visibleFolders: Set<number>;
  visibleNodes: Set<number>;
  visibleCount: Map<number, number>;
  onToggle(index: number): void;
}) {
  const atlas = useAtlas();
  const open = expanded.has(folder.index);
  const childFolders = folder.childIndexes.filter((index) => visibleFolders.has(index));
  const childNodes = folder.nodeIndexes
    .filter((index) => visibleNodes.has(index))
    .map((index) => atlas.runtime.graph.nodes[index]);
  const hasChildren = childFolders.length > 0 || childNodes.length > 0;
  const domain = atlas.runtime.graph.domains[folder.domainIndex];
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined}>
      <button
        type="button"
        className="vault-tree__folder"
        onClick={() => hasChildren && onToggle(folder.index)}
        aria-label={`${folder.label}, ${visibleCount.get(folder.index) ?? 0}개 제목`}
        style={{ "--domain-color": domain?.color ?? "#8e8681" } as React.CSSProperties}
      >
        <ChevronRight className="vault-tree__chevron" size={15} aria-hidden="true" />
        {open ? <FolderOpen size={16} aria-hidden="true" /> : <Folder size={16} aria-hidden="true" />}
        <strong>{folder.label}</strong>
        <small>{visibleCount.get(folder.index) ?? 0}</small>
      </button>
      {open && hasChildren ? (
        <ul role="group">
          {childFolders.map((index) => (
            <FolderBranch
              key={atlas.runtime.graph.directory.folders[index].id}
              folder={atlas.runtime.graph.directory.folders[index]}
              expanded={expanded}
              visibleFolders={visibleFolders}
              visibleNodes={visibleNodes}
              visibleCount={visibleCount}
              onToggle={onToggle}
            />
          ))}
          {childNodes.map((node) => (
            <li key={node.id} role="treeitem">
              <button
                type="button"
                className="vault-tree__node"
                aria-current={atlas.route.focusId === node.id ? "true" : undefined}
                onFocus={() => atlas.setPreview(node.id)}
                onBlur={() => atlas.setPreview(null)}
                onPointerEnter={() => atlas.setPreview(node.id)}
                onPointerLeave={() => atlas.setPreview(null)}
                onClick={() => atlas.commitFocus(node.id)}
              >
                <FileText size={14} aria-hidden="true" />
                <span>{node.label}</span>
                <small>{kindLabels[node.kind]}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function StructureInspector({ selected }: { selected: GraphNode | null }) {
  const atlas = useAtlas();
  if (!selected) {
    return (
      <aside className="structure-inspector">
        <span>HOW TO READ</span>
        <h2>폴더는 위치를, 그래프는 관계를 설명합니다.</h2>
        <p>
          상위 폴더를 펼쳐 Vault의 책임 영역과 지식 분류를 읽고,
          제목을 선택하면 실제 관계 그래프로 이어집니다.
        </p>
        <div className="structure-inspector__roots">
          {atlas.runtime.graph.directory.rootIndexes.map((index) => {
            const folder = atlas.runtime.graph.directory.folders[index];
            const domain = atlas.runtime.graph.domains[folder.domainIndex];
            return (
              <div key={folder.id} style={{ "--domain-color": domain?.color ?? "#8e8681" } as React.CSSProperties}>
                <span>{folder.label}</span>
                <b>{folder.subtreeNodeCount}</b>
              </div>
            );
          })}
        </div>
      </aside>
    );
  }
  const summary = relationSummary(atlas.runtime.graph, selected);
  return (
    <aside className="structure-inspector">
      <span>{selected.domain} · {kindLabels[selected.kind]}</span>
      <h2>{selected.label}</h2>
      <p>
        고유 inbound {selected.gravity} · reference occurrence {selected.occurrences} ·
        incoming {selected.incoming.length} · outgoing {selected.outgoing.length}
      </p>
      <button type="button" className="primary-action" onClick={() => atlas.setExploreMode("graph")}>
        <Network size={15} aria-hidden="true" /> 관계 그래프에서 보기 <ArrowRight size={14} aria-hidden="true" />
      </button>
      <div className="structure-inspector__relations">
        {[...summary.incoming, ...summary.outgoing].slice(0, 6).map((item) => (
          <button type="button" key={item.edge.id} onClick={() => atlas.commitFocus(item.node.id)}>
            {item.direction === "incoming"
              ? <ArrowDownLeft aria-label="incoming" size={14} />
              : <ArrowUpRight aria-label="outgoing" size={14} />}
            <span>{item.node.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function NodeList({ nodes }: { nodes: GraphNode[] }) {
  const atlas = useAtlas();
  return (
    <section className="node-index" aria-label="Keyboard-operable knowledge node index">
      <p>{nodes.length.toLocaleString("ko-KR")} safe knowledge nodes</p>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onFocus={() => atlas.setPreview(node.id)}
              onBlur={() => atlas.setPreview(null)}
              onPointerEnter={() => atlas.setPreview(node.id)}
              onPointerLeave={() => atlas.setPreview(null)}
              onClick={() => atlas.openNode(node.id, "explore")}
            >
              <span className="node-index__domain">{node.domain}</span>
              <strong>{node.label}</strong>
              <span>{kindLabels[node.kind]} · inbound {node.gravity}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
