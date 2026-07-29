import type {
  AtlasKnowledgeSearchV2,
  AtlasKnowledgeShardV1,
  AtlasKnowledgeV1,
  KnowledgeDossierIndexEntry,
  KnowledgeSearchEntry,
} from "../app/contracts";

const shardPromises = new Map<string, Promise<AtlasKnowledgeShardV1>>();
let searchPromise: Promise<AtlasKnowledgeSearchV2> | null = null;

async function sha256Hex(text: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("이 브라우저에서는 지식 shard 무결성을 확인할 수 없습니다.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function injectScript(path: string, marker: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-atlas-lazy="${marker}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`지식 asset을 열지 못했습니다: ${marker}`)), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = new URL(path, document.baseURI).href;
    script.async = true;
    script.dataset.atlasLazy = marker;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`지식 asset을 열지 못했습니다: ${marker}`));
    }, { once: true });
    document.head.append(script);
  });
}

async function verifyRegisteredJson(
  registered: { jsonText: string; jsonSha256: string } | undefined,
  expectedSha256: string,
) {
  if (!registered || typeof registered.jsonText !== "string") {
    throw new Error("지식 shard가 등록되지 않았습니다.");
  }
  if (registered.jsonSha256 !== expectedSha256) {
    throw new Error("지식 shard 선언 hash가 manifest와 다릅니다.");
  }
  const actual = await sha256Hex(registered.jsonText);
  if (actual !== expectedSha256) {
    throw new Error("지식 shard bytes가 manifest와 다릅니다.");
  }
  const wire = JSON.parse(registered.jsonText) as {
    schema?: string;
    encoding?: string;
    innerJsonSha256?: string;
    innerBytes?: number;
    payload?: string;
  };
  if (wire.schema !== "atlas.knowledge_wire.v1"
    || wire.encoding !== "gzip_base64_v1"
    || typeof wire.innerJsonSha256 !== "string"
    || typeof wire.innerBytes !== "number"
    || typeof wire.payload !== "string"
    || typeof globalThis.DecompressionStream !== "function") {
    throw new Error("이 브라우저에서는 압축된 지식 shard를 안전하게 열 수 없습니다.");
  }
  const compressed = Uint8Array.from(atob(wire.payload), (value) => value.charCodeAt(0));
  const decompressed = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const innerJsonText = await new Response(decompressed).text();
  if (new TextEncoder().encode(innerJsonText).byteLength !== wire.innerBytes
    || await sha256Hex(innerJsonText) !== wire.innerJsonSha256) {
    throw new Error("압축된 지식 shard의 내부 bytes가 manifest와 다릅니다.");
  }
  return JSON.parse(innerJsonText) as unknown;
}

export function loadKnowledgeShard(
  knowledge: AtlasKnowledgeV1,
  entry: KnowledgeDossierIndexEntry,
) {
  const current = shardPromises.get(entry.nodeId);
  if (current) return current;
  const promise = (async () => {
    const indexed = knowledge.dossiers.find((item) => item.nodeId === entry.nodeId);
    if (!indexed
      || indexed.shardPath !== entry.shardPath
      || indexed.shardJsonSha256 !== entry.shardJsonSha256) {
      throw new Error("dossier index와 shard manifest가 일치하지 않습니다.");
    }
    await injectScript(entry.shardPath, `knowledge:${entry.nodeId}`);
    const raw = await verifyRegisteredJson(
      window.__HOMI_ATLAS_KNOWLEDGE_SHARDS__?.[entry.nodeId],
      entry.shardJsonSha256,
    );
    const shard = raw as Partial<AtlasKnowledgeShardV1> | null;
    if (!shard
      || shard.schema !== "atlas.knowledge_shard.v1"
      || shard.nodeId !== entry.nodeId
      || shard.dossier?.nodeId !== entry.nodeId
      || shard.document?.nodeId !== entry.nodeId) {
      throw new Error("지식 shard schema 또는 node binding이 올바르지 않습니다.");
    }
    return shard as AtlasKnowledgeShardV1;
  })();
  shardPromises.set(entry.nodeId, promise);
  promise.catch(() => shardPromises.delete(entry.nodeId));
  return promise;
}

export function loadKnowledgeSearch(knowledge: AtlasKnowledgeV1) {
  if (searchPromise) return searchPromise;
  searchPromise = (async () => {
    if (!knowledge.search?.javascriptPath || !knowledge.search.jsonSha256) {
      throw new Error("검색 index가 아직 준비되지 않았습니다.");
    }
    await injectScript(knowledge.search.javascriptPath, "knowledge-search");
    const raw = await verifyRegisteredJson(
      window.__HOMI_ATLAS_KNOWLEDGE_SEARCH__,
      knowledge.search.jsonSha256,
    );
    const search = raw as Partial<AtlasKnowledgeSearchV2> | null;
    if (!search
      || search.schema !== "atlas.knowledge_search.v2"
      || search.encoding !== "string_table_delta_postings_v1"
      || !Array.isArray(search.strings)
      || !Array.isArray(search.entries)
      || !Array.isArray(search.terms)) {
      throw new Error("검색 index schema가 올바르지 않습니다.");
    }
    if (search.manifest?.entryCount !== search.entries.length
      || search.manifest?.termCount !== search.terms.length) {
      throw new Error("검색 index manifest가 일치하지 않습니다.");
    }
    return search as AtlasKnowledgeSearchV2;
  })();
  searchPromise.catch(() => {
    searchPromise = null;
  });
  return searchPromise;
}

function normalizeSearchTerms(value: string) {
  return [...new Set(value
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 2))];
}

export function queryKnowledgeSearch(
  search: AtlasKnowledgeSearchV2,
  query: string,
  limit = 30,
): KnowledgeSearchEntry[] {
  const queryTerms = normalizeSearchTerms(query);
  if (!queryTerms.length) return [];
  const scores = new Map<number, number>();
  for (const queryTerm of queryTerms) {
    for (const [termIndex, entryDeltas] of search.terms) {
      const term = search.strings[termIndex];
      if (!term || (!term.includes(queryTerm) && !queryTerm.includes(term))) continue;
      const exactBonus = term === queryTerm ? 4 : 1;
      let entryIndex = 0;
      for (const delta of entryDeltas) {
        entryIndex += delta;
        scores.set(entryIndex, (scores.get(entryIndex) ?? 0) + exactBonus);
      }
    }
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, limit)
    .map(([entryIndex]) => {
      const row = search.entries[entryIndex];
      const value = (index: number) => search.strings[index] || undefined;
      return {
        id: `search:${entryIndex}`,
        kind: value(row[0]) as KnowledgeSearchEntry["kind"],
        nodeId: value(row[1]),
        sectionId: value(row[2]),
        label: value(row[3]) ?? "Knowledge",
        detail: value(row[4]) ?? "",
        fromNodeId: value(row[5]),
        toNodeId: value(row[6]),
      };
    });
}
