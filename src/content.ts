import rawContent from "../public/data/content.json" with { type: "json" };
import rawEvidence from "../public/data/evidence.json" with { type: "json" };

export type ProjectId = "rocket" | "groot" | "common" | "atlas";

export interface AtlasNode {
  id: string;
  kind:
    | "project"
    | "foundation"
    | "research-map"
    | "research-desk"
    | "research-story"
    | "scenario"
    | "knowledge-concept"
    | "research-practice";
  title: string;
  eyebrow: string;
  summary: string;
  paragraphs: string[];
  points: string[];
  state: string;
  links: string[];
}

export interface EvidenceRecord {
  id: string;
  publicationTitle: string;
  titleEdited: boolean;
  titleNote: string;
  evidenceType: string;
  basisDate: string;
  basisNote: string;
  nodeIds: string[];
  claim: string;
  limitations: string[];
  excerptParagraphs: Array<{
    label: string;
    kind: "exact_excerpt";
    form: "paragraph" | "sentence" | "sentence_sequence" | "list_item";
    text: string;
    omissions: string;
  }>;
  editorialExplanation?: {
    kind: "editorial_rewrite_not_quote";
    text: string;
  };
}

interface AtlasContent {
  schema_version: string;
  language: "ko";
  title: string;
  introduction: string;
  nodes: AtlasNode[];
  routes: Array<{
    id: string;
    title: string;
    description: string;
    steps: string[];
  }>;
  relations: Array<{
    source: string;
    target: string;
    relation: string;
    label: string;
  }>;
}

export const content = rawContent as AtlasContent;
export const evidenceRecords = rawEvidence.records as EvidenceRecord[];
export const nodes = content.nodes;
export const nodeById = new Map(nodes.map((node) => [node.id, node]));

// The common entry is an existing foundation node, not a fourth independent project.
export const projects: AtlasNode[] = [
  "rocket",
  "groot",
  "knowledge-library",
  "atlas",
].map((id) => {
  const node = nodeById.get(id);
  if (!node) throw new Error(`Missing Atlas entry: ${id}`);
  return node;
});

export function projectFor(id: string): ProjectId {
  if (id !== "common" && !nodeById.has(id)) throw new RangeError(`Unknown Atlas content route: ${id}`);
  if (id === "atlas") return "atlas";
  if (
    id === "rocket" ||
    id.startsWith("rocket-") ||
    id.startsWith("desk-") ||
    id.startsWith("horizon-")
  )
    return "rocket";
  if (id === "groot" || id.startsWith("groot-")) return "groot";
  if (
    id === "common" ||
    id.startsWith("knowledge-") ||
    id.startsWith("concept-") ||
    id === "research-cycle" ||
    id === "daily-lens" ||
    id === "weekly-lens" ||
    id === "papers-lens"
  )
    return "common";
  throw new RangeError(`Unknown Atlas content route: ${id}`);
}

const evidenceByNode = new Map<string, EvidenceRecord[]>();
for (const record of evidenceRecords) {
  for (const nodeId of record.nodeIds) {
    const existing = evidenceByNode.get(nodeId) ?? [];
    existing.push(record);
    evidenceByNode.set(nodeId, existing);
  }
}

export function evidenceFor(nodeId: string): EvidenceRecord[] {
  return [...(evidenceByNode.get(nodeId) ?? [])];
}

const artwork: Readonly<Record<string, {src:string;alt:string;caption:string}>> = {
  "rocket-desks": {src:"assets/rocket-lenses.webp",alt:"일곱 연구 질문을 각각의 렌즈 안에 표현한 삽화",caption:"일곱 질문으로 같은 변화를 읽습니다."},
  rocket: {src:"assets/illustrations/rocket-v82.webp",alt:"관측 장치와 일곱 표본 전시가 놓인 해안 연구 정원 삽화",caption:"변화를 여러 관점에서 살피는 Rocket의 연구를 표현했습니다."},
  groot: {src:"assets/illustrations/groot-v82.webp",alt:"정보와 경험을 함께 살피는 곡면 테이블과 관찰판이 놓인 숲속 정원 삽화",caption:"정보와 시간, 경험과 권한을 함께 살피는 판단의 정원입니다."},
  "groot-judgment-context": {src:"assets/illustrations/groot-v82.webp",alt:"네 관찰판과 기록 도구를 둔 열린 정원 삽화",caption:"같은 행동도 그때의 상황과 함께 읽습니다."},
  "knowledge-library": {src:"assets/illustrations/common-v82.webp",alt:"노트와 자료, 책을 펼쳐 놓은 열린 도서관과 열람 정원 삽화",caption:"오늘의 발견을 정리하고, 다음 질문에서 다시 꺼내 봅니다."},
  atlas: {src:"assets/illustrations/atlas-v82.webp",alt:"네 섬의 모형과 지도책, 측량 도구가 놓인 지도 제작자의 테이블 삽화",caption:"공간을 둘러보다가 이야기와 근거로 이어지는 Atlas를 표현했습니다."},
};
export function artworkFor(nodeId:string):string|undefined{return Object.hasOwn(artwork,nodeId)?artwork[nodeId].src:undefined;}
export function artworkDescriptionFor(nodeId:string){return Object.hasOwn(artwork,nodeId)?artwork[nodeId]:undefined;}

const normalize = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
const compact = (value: string) => normalize(value).replace(/\s/gu, "");

function initials(value: string): string {
  return [...compact(value)]
    .map((char) => {
      const code = char.codePointAt(0)!;
      return code >= 0xac00 && code <= 0xd7a3
        ? String.fromCodePoint(0x1100 + Math.floor((code - 0xac00) / 588))
        : char;
    })
    .join("");
}

const aliases: Readonly<Record<string, string[]>> = {
  rocket: ["로켓"],
  groot: ["그루트"],
  atlas: ["아틀라스"],
  "knowledge-library": ["공통 지식"],
};

const searchIndex = nodes.map((node, order) => {
  const names = [node.title, ...(aliases[node.id] ?? [])];
  const body = [
    node.id,
    ...names,
    node.eyebrow,
    node.summary,
    ...node.paragraphs,
    ...node.points,
    node.state,
  ].join(" ");
  return {
    node,
    order,
    project: projectFor(node.id),
    names: names.map(compact),
    nameInitials: names.map(initials),
    body: compact(body),
    bodyInitials: initials(body),
  };
});

/** All query terms must match; ordering favors names and remains stable for ties. */
export function searchNodes(
  query: string,
  project: ProjectId | "all" = "all",
): AtlasNode[] {
  const terms = normalize(query).split(" ").filter(Boolean);
  const matches: Array<{ node: AtlasNode; score: number; order: number }> = [];
  for (const entry of searchIndex) {
    if (project !== "all" && entry.project !== project) continue;
    let score = 0;
    let matched = true;
    for (const term of terms) {
      const isInitialQuery = /^[\u1100-\u1112]+$/u.test(term);
      const haystack = isInitialQuery ? entry.bodyInitials : entry.body;
      if (!haystack.includes(term)) {
        matched = false;
        break;
      }
      const names = isInitialQuery ? entry.nameInitials : entry.names;
      score += names.some((name) => name === term)
        ? 100
        : names.some((name) => name.startsWith(term))
          ? 40
          : names.some((name) => name.includes(term))
            ? 20
            : 1;
    }
    if (matched) matches.push({ node: entry.node, score, order: entry.order });
  }
  return matches
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ node }) => node);
}
