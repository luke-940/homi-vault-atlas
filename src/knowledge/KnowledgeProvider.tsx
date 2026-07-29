import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AtlasKnowledgeSearchV2,
  AtlasKnowledgeShardV1,
  AtlasKnowledgeV1,
  KnowledgeDossierIndexEntry,
} from "../app/contracts";
import { loadKnowledgeSearch, loadKnowledgeShard } from "./knowledge-loader";

type LoadState = "idle" | "loading" | "ready" | "error";

interface KnowledgeContextValue {
  index: AtlasKnowledgeV1;
  entry(nodeId: string | null): KnowledgeDossierIndexEntry | null;
  shard(nodeId: string | null): AtlasKnowledgeShardV1 | null;
  shardState(nodeId: string | null): LoadState;
  shardError(nodeId: string | null): string | null;
  loadDossier(nodeId: string): Promise<AtlasKnowledgeShardV1>;
  search: AtlasKnowledgeSearchV2 | null;
  searchState: LoadState;
  searchError: string | null;
  loadSearch(): Promise<AtlasKnowledgeSearchV2>;
}

const KnowledgeContext = createContext<KnowledgeContextValue | null>(null);

export function KnowledgeProvider({
  index,
  children,
}: {
  index: AtlasKnowledgeV1;
  children: ReactNode;
}) {
  const entries = useMemo(
    () => new Map(index.dossiers.map((entry) => [entry.nodeId, entry])),
    [index],
  );
  const shards = useRef(new Map<string, AtlasKnowledgeShardV1>());
  const states = useRef(new Map<string, LoadState>());
  const errors = useRef(new Map<string, string>());
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState<AtlasKnowledgeSearchV2 | null>(null);
  const [searchState, setSearchState] = useState<LoadState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadDossier = useCallback(async (nodeId: string) => {
    const cached = shards.current.get(nodeId);
    if (cached) return cached;
    const dossierEntry = entries.get(nodeId);
    if (!dossierEntry) throw new Error("이 노드는 아직 Atlas Builder 검수를 마치지 않았습니다.");
    states.current.set(nodeId, "loading");
    errors.current.delete(nodeId);
    setRevision((value) => value + 1);
    try {
      const loaded = await loadKnowledgeShard(index, dossierEntry);
      shards.current.set(nodeId, loaded);
      states.current.set(nodeId, "ready");
      setRevision((value) => value + 1);
      return loaded;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      states.current.set(nodeId, "error");
      errors.current.set(nodeId, message);
      setRevision((value) => value + 1);
      throw error;
    }
  }, [entries, index]);

  const loadSearch = useCallback(async () => {
    if (search) return search;
    setSearchState("loading");
    setSearchError(null);
    try {
      const loaded = await loadKnowledgeSearch(index);
      setSearch(loaded);
      setSearchState("ready");
      return loaded;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSearchState("error");
      setSearchError(message);
      throw error;
    }
  }, [index, search]);

  const value = useMemo<KnowledgeContextValue>(() => ({
    index,
    entry(nodeId) {
      return nodeId ? entries.get(nodeId) ?? null : null;
    },
    shard(nodeId) {
      return nodeId ? shards.current.get(nodeId) ?? null : null;
    },
    shardState(nodeId) {
      if (!nodeId || !entries.has(nodeId)) return "idle";
      return states.current.get(nodeId) ?? "idle";
    },
    shardError(nodeId) {
      return nodeId ? errors.current.get(nodeId) ?? null : null;
    },
    loadDossier,
    search,
    searchState,
    searchError,
    loadSearch,
  }), [
    entries,
    index,
    loadDossier,
    loadSearch,
    revision,
    search,
    searchError,
    searchState,
  ]);

  return <KnowledgeContext.Provider value={value}>{children}</KnowledgeContext.Provider>;
}

export function useKnowledge() {
  const context = useContext(KnowledgeContext);
  if (!context) throw new Error("useKnowledge must be used inside KnowledgeProvider.");
  return context;
}
