import type { Workspace } from "../types";

export type WorkspaceScene = {
  id: string;
  label: string;
  title: string;
  aliases?: readonly string[];
};

export type WorkspaceSceneDefinition = {
  label: string;
  title: string;
  defaultScene: string;
  scenes: readonly WorkspaceScene[];
};

export const workspaceSceneRegistry: Readonly<Record<Workspace, WorkspaceSceneDefinition>> = Object.freeze({
  home: {
    label: "Home",
    title: "Semantic Constellations",
    defaultScene: "core-gravity",
    scenes: [
      {
        id: "core-gravity",
        label: "Core Domain Gravity",
        title: "핵심 지식 영역",
        aliases: ["knowledge-field", "living-terrain", "system-overview", "terrain-convergence"],
      },
      {
        id: "protagonists",
        label: "Protagonist Constellations",
        title: "지식의 주인공",
        aliases: ["knowledge-gravity", "knowledge-return"],
      },
      {
        id: "vault-in-motion",
        label: "Vault in Motion",
        title: "검증된 지식 변화",
        aliases: ["freshness-field", "responsibility-partition"],
      },
      {
        id: "operational-compass",
        label: "Operational Compass",
        title: "운영 방향과 책임",
        aliases: ["link-trace", "coverage-boundary", "independent-ownership", "public-boundary"],
      },
    ],
  },
  explore: {
    label: "Explore",
    title: "Living Knowledge Graph",
    defaultScene: "graph",
    scenes: [
      { id: "graph", label: "Graph", title: "방향 지식 그래프", aliases: ["explore", "city-overview", "districts", "hubs", "sources"] },
      { id: "constellations", label: "Constellations", title: "주인공 별자리", aliases: ["clusters", "city-focus", "city-concentration"] },
      { id: "list", label: "List", title: "접근 가능한 순위 목록", aliases: ["attention-isolate"] },
    ],
  },
  observe: {
    label: "Observe",
    title: "Knowledge Relations",
    defaultScene: "global-relations",
    scenes: [
      { id: "global-relations", label: "Global Relations", title: "구역 관계", aliases: ["observe", "global-relation"] },
      { id: "protagonist-lens", label: "Protagonist Lens", title: "주인공 관계", aliases: ["hub-relations", "entity-relation"] },
    ],
  },
  flow: {
    label: "Flow",
    title: "Knowledge Flow",
    defaultScene: "verified-trails",
    scenes: [
      { id: "verified-trails", label: "Verified Trails", title: "검증된 경로", aliases: ["routes", "flow", "latest-pulse"] },
    ],
  },
  time: {
    label: "Time",
    title: "Version Evolution",
    defaultScene: "version-evolution",
    scenes: [
      { id: "version-evolution", label: "Version Evolution", title: "버전 간 변화", aliases: ["chronology", "time"] },
    ],
  },
  agency: {
    label: "Agency",
    title: "Operating Roles",
    defaultScene: "system",
    scenes: [
      { id: "system", label: "System", title: "협업 구조" },
      { id: "roles", label: "Roles", title: "책임과 증거" },
      { id: "compass", label: "Compass", title: "운영 나침반", aliases: ["evolution"] },
    ],
  },
});

export function resolveWorkspaceScene(workspace: Workspace, requested: string | null | undefined) {
  const definition = workspaceSceneRegistry[workspace];
  if (!requested) return definition.defaultScene;
  const canonical = definition.scenes.find((scene) => (
    scene.id === requested || scene.aliases?.includes(requested)
  ));
  return canonical?.id ?? null;
}

export function workspaceScene(workspace: Workspace, requested: string | null | undefined) {
  const definition = workspaceSceneRegistry[workspace];
  const resolved = resolveWorkspaceScene(workspace, requested) ?? definition.defaultScene;
  return definition.scenes.find((scene) => scene.id === resolved) ?? definition.scenes[0];
}

export function workspaceDocumentTitle(workspace: Workspace, sceneId: string) {
  const scene = workspaceScene(workspace, sceneId);
  return `${workspaceSceneRegistry[workspace].label} · ${scene.label} · Homi Vault Atlas`;
}
