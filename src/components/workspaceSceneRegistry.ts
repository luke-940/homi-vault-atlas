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
    title: "Meaningful Space Living Graph",
    defaultScene: "knowledge-field",
    scenes: [
      {
        id: "knowledge-field",
        label: "Knowledge Field",
        title: "방향 지식 지형",
        aliases: ["living-terrain", "system-overview", "terrain-convergence"],
      },
      {
        id: "knowledge-gravity",
        label: "Knowledge Gravity",
        title: "지식 중력",
        aliases: ["knowledge-return"],
      },
      {
        id: "freshness-field",
        label: "Freshness Field",
        title: "의미 있는 최신성",
        aliases: ["responsibility-partition"],
      },
      {
        id: "link-trace",
        label: "Link Trace",
        title: "실제 방향 경로",
        aliases: ["coverage-boundary", "independent-ownership", "public-boundary"],
      },
    ],
  },
  explore: {
    label: "Explore",
    title: "Living Knowledge Graph",
    defaultScene: "graph",
    scenes: [
      { id: "graph", label: "Graph", title: "방향 지식 그래프", aliases: ["explore", "city-overview", "districts", "hubs", "sources"] },
      { id: "clusters", label: "Clusters", title: "구역별 밀도", aliases: ["city-focus", "city-concentration"] },
      { id: "list", label: "List", title: "접근 가능한 순위 목록", aliases: ["attention-isolate"] },
    ],
  },
  observe: {
    label: "Observe",
    title: "Knowledge Relations",
    defaultScene: "global-relations",
    scenes: [
      { id: "global-relations", label: "Global Relations", title: "구역 관계", aliases: ["observe", "global-relation"] },
      { id: "hub-relations", label: "Hub Relations", title: "허브 관계", aliases: ["entity-relation"] },
    ],
  },
  flow: {
    label: "Flow",
    title: "Knowledge Flow",
    defaultScene: "routes",
    scenes: [
      { id: "routes", label: "Verified Routes", title: "확인된 경로", aliases: ["flow", "latest-pulse"] },
    ],
  },
  time: {
    label: "Time",
    title: "Recorded Time",
    defaultScene: "chronology",
    scenes: [
      { id: "chronology", label: "Recorded Chronology", title: "기록된 시간", aliases: ["time"] },
    ],
  },
  agency: {
    label: "Agency",
    title: "Operating Roles",
    defaultScene: "system",
    scenes: [
      { id: "system", label: "System", title: "협업 구조" },
      { id: "roles", label: "Roles", title: "책임과 증거" },
      { id: "evolution", label: "Evolution", title: "역할 전문화" },
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
