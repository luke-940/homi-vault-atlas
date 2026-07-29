import { ArrowLeft, FileWarning, Network } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { SafeDocumentBlock, SafeInline } from "../app/contracts";
import { useAtlas } from "../app/state";
import { useKnowledge } from "./KnowledgeProvider";

export function SafeSourceReader() {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  const nodeId = atlas.route.readerNodeId;
  const entry = knowledge.entry(nodeId);
  const shard = knowledge.shard(nodeId);
  const status = knowledge.shardState(nodeId);
  const error = knowledge.shardError(nodeId);

  useEffect(() => {
    if (nodeId && entry && status === "idle") {
      knowledge.loadDossier(nodeId).catch(() => undefined);
    }
  }, [entry, knowledge, nodeId, status]);

  if (!nodeId || !entry) {
    return (
      <main className="safe-reader safe-reader--boundary">
        <button type="button" onClick={atlas.closeReader}><ArrowLeft size={16} /> Map으로 돌아가기</button>
        <FileWarning size={24} aria-hidden="true" />
        <h1>검수된 안전 원문이 없습니다.</h1>
        <p>Atlas Builder가 정독과 section 분류를 마친 node만 Reader에 들어올 수 있습니다.</p>
      </main>
    );
  }

  if (status === "loading" || !shard) {
    return (
      <main className="safe-reader safe-reader--boundary">
        <button type="button" onClick={atlas.closeReader}><ArrowLeft size={16} /> Map으로 돌아가기</button>
        {status === "error" ? (
          <>
            <FileWarning size={24} aria-hidden="true" />
            <h1>안전 원문 shard를 확인하지 못했습니다.</h1>
            <p>{error}</p>
          </>
        ) : (
          <>
            <span className="reader-kicker">SAFE SOURCE READER</span>
            <h1>{entry.title}</h1>
            <p>공개 안전 section을 여는 중입니다.</p>
          </>
        )}
      </main>
    );
  }

  const document = shard.document;
  const requestedSection = atlas.route.readerSectionId;
  const sections = requestedSection
    ? document.sections.filter((section) => section.id === requestedSection)
    : document.sections;
  return (
    <main className="safe-reader" lang="ko">
      <header className="safe-reader__header">
        <button type="button" onClick={atlas.closeReader}><ArrowLeft size={16} /> Map으로 돌아가기</button>
        <div>
          <span className="reader-kicker">SAFE SOURCE READER · RELEASE SNAPSHOT</span>
          <h1>{document.title}</h1>
          <p>{document.notice}</p>
        </div>
        <button type="button" onClick={() => atlas.openObserveNode(nodeId)}>
          <Network size={15} aria-hidden="true" /> Observe
        </button>
      </header>
      {Object.keys(document.metadata).length ? (
        <dl className="safe-reader__metadata">
          {Object.entries(document.metadata).map(([label, value]) => (
            <div key={`${label}:${value}`}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      ) : null}
      <div className="safe-reader__boundary">
        공개 section {document.sections.length}개 · 제외 section {document.omittedSectionCount}개
        {" · "}제외 block {document.omittedBlockCount}개
      </div>
      <article className="safe-reader__document">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="reader-section">
            <SectionHeading depth={section.depth}>{section.heading}</SectionHeading>
            {section.blocks.map((block) => <ReaderBlock key={block.id} block={block} />)}
          </section>
        ))}
        {!sections.length ? (
          <p className="reader-empty">요청한 section은 이 공개 안전 스냅샷에 포함되지 않습니다.</p>
        ) : null}
      </article>
    </main>
  );
}

function ReaderBlock({ block }: { block: SafeDocumentBlock }) {
  if (block.type === "paragraph") return <p><ReaderInlines content={block.inlines} /></p>;
  if (block.type === "blockquote") {
    return <blockquote><ReaderInlines content={block.inlines} /></blockquote>;
  }
  if (block.type === "callout") {
    return (
      <aside className="reader-callout" data-callout={block.calloutType}>
        <strong>{block.calloutType ?? "Note"}</strong>
        <p><ReaderInlines content={block.inlines} /></p>
      </aside>
    );
  }
  if (block.type === "code") {
    return <pre><code data-language={block.language}>{block.text}</code></pre>;
  }
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return <Tag>{block.items.map((item, index) => <li key={index}><ReaderInlines content={item} /></li>)}</Tag>;
  }
  return (
    <div className="reader-table-wrap">
      <table>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}><ReaderInlines content={cell} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReaderInlines({ content }: { content: SafeInline[] }) {
  const atlas = useAtlas();
  return content.map((inline, index) => {
    if (inline.type === "text") return <span key={index}>{inline.text}</span>;
    if (inline.type === "private_target") {
      return (
        <span key={index} className="reader-private-link-wrap">
          {" "}<span className="reader-private-link">{inline.label}</span>{" "}
        </span>
      );
    }
    if (inline.type === "section_link") {
      return (
        <button
          type="button"
          className="reader-wikilink"
          key={index}
          onClick={() => document.getElementById(inline.sectionId)?.scrollIntoView({ block: "start" })}
        >
          {inline.label}
        </button>
      );
    }
    return (
      <button
        type="button"
        className="reader-wikilink"
        key={index}
        onClick={() => atlas.openReader(inline.nodeId, inline.sectionId)}
      >
        {inline.label}
      </button>
    );
  }) as ReactNode;
}

function SectionHeading({ depth, children }: { depth: number; children: ReactNode }) {
  if (depth <= 2) return <h2>{children}</h2>;
  if (depth === 3) return <h3>{children}</h3>;
  return <h4>{children}</h4>;
}
