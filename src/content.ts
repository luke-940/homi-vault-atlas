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
    | "game-design"
    | "fictional-character"
    | "goal-art"
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

const artwork: Readonly<Record<string, string>> = {
  groot: "assets/groot-harbor.webp",
  "groot-art-explore": "assets/groot-harbor.webp",
  "groot-adventure": "assets/groot-harbor.webp",
  "groot-art-characters": "assets/groot-characters.webp",
  "groot-rin": "assets/groot-characters.webp",
  "groot-hana": "assets/groot-characters.webp",
  "groot-art-combat": "assets/groot-combat.webp",
  "groot-art-dialogue": "assets/groot-dialogue.webp",
  "rocket-desks": "assets/rocket-lenses.webp",
};

export function artworkFor(nodeId: string): string | undefined {
  return Object.hasOwn(artwork, nodeId) ? artwork[nodeId] : undefined;
}

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
