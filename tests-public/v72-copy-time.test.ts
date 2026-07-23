import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, test } from "vitest";
import { installPublicAtlasDomFixture } from "./atlas-packs.fixture";

type InsightPack = {
  schema: string;
  items: Array<{
    kind: string;
    headline: string;
    metric: { value: number | string; label: string; unit?: string };
    caveat: string;
    targetScene: { relationPairId?: string };
  }>;
};

type RelationPack = {
  matrix: Array<{
    id: string;
    source: string;
    target: string;
    wikilink: number;
    wikilinkForward: number;
    wikilinkReverse: number;
  }>;
};

type TimeModelModule = typeof import("../src/views/time-model");

let timeModel: TimeModelModule;

function readJson<T>(...segments: string[]) {
  return JSON.parse(readFileSync(path.resolve(...segments), "utf8")) as T;
}

function readJavaScriptPack(filePath: string, name: string) {
  const context: { window: Record<string, unknown> } = { window: {} };
  runInNewContext(readFileSync(path.resolve(filePath), "utf8"), context);
  const packs = context.window.__HOMI_ATLAS_V7_PACKS__ as Record<string, unknown>;
  return JSON.parse(JSON.stringify(packs[name]));
}

beforeAll(async () => {
  installPublicAtlasDomFixture();
  Object.assign(window, {
    location: { hash: "#time?era=11", href: "http://127.0.0.1/#time?era=11" },
    history: { replaceState() {} },
    matchMedia: () => ({
      matches: false,
      media: "",
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    }),
    addEventListener() {},
    removeEventListener() {},
    localStorage: { getItem: () => "1", setItem() {} },
  });
  timeModel = await import("../src/views/time-model");
});

describe("v7.2 Home relation copy", () => {
  test("binds the strongest insight to the fresh bidirectional matrix maximum", () => {
    const insight = readJson<InsightPack>("public-safe", "data", "insight.json");
    const relation = readJson<RelationPack>("public-safe", "data", "relation.json");
    const strongest = insight.items.find((item) => item.kind === "strongest_relation")!;
    const pair = relation.matrix.find((item) => item.id === strongest.targetScene.relationPairId)!;
    const matrixMaximum = Math.max(...relation.matrix.map((item) => item.wikilink));

    expect(insight.schema).toBe("atlas.insight.v1");
    expect(strongest.metric).toEqual({ value: matrixMaximum, label: "양방향 해결 링크 합계", unit: "회" });
    expect(strongest.headline).toContain(`${matrixMaximum}회`);
    expect(strongest.headline).toContain(pair.source);
    expect(strongest.headline).toContain(pair.target);
    expect(pair.wikilinkForward + pair.wikilinkReverse).toBe(pair.wikilink);
    expect(pair.wikilink).toBe(strongest.metric.value);
    expect(strongest.caveat).toContain(String(pair.wikilinkForward));
    expect(strongest.caveat).toContain(String(pair.wikilinkReverse));
    expect(strongest.caveat).toContain("fresh resolved link occurrence");
  });

  test("keeps public JSON and JavaScript insight packs behaviorally identical", () => {
    const json = readJson<InsightPack>("public-safe", "data", "insight.json");
    const javaScript = readJavaScriptPack("public-safe/data/insight.js", "insight");
    const strongest = json.items.find((item) => item.kind === "strongest_relation")!;

    expect(javaScript).toEqual(json);
    expect(json.schema).toBe("atlas.insight.v1");
    expect(strongest.headline).toContain("↔");
    expect(strongest.headline).toContain("양방향 해결 링크 합계");
    expect(strongest.metric.label).toBe("양방향 해결 링크 합계");
  });
});

describe("v7.2 recorded-only time semantics", () => {
  test("accepts only lifecycle deltas with recorded state and resolvable evidence", () => {
    const evidenceIds = new Set(["doc:known"]);
    const deltas = [
      { state: "born", label: "확인됨", evidenceStatus: "recorded", evidenceRef: "doc:known", evidenceAnchor: "section" },
      { state: "persisted", label: "상태 미기록", evidenceStatus: "not_recorded", evidenceRef: "doc:known", evidenceAnchor: "section" },
      { state: "weakened", label: "문서 없음", evidenceStatus: "recorded", evidenceRef: "doc:missing", evidenceAnchor: "section" },
      { state: "retired", label: "위치 없음", evidenceStatus: "recorded", evidenceRef: "doc:known", evidenceAnchor: "" },
      { state: "unknown", label: "미확정", evidenceStatus: "recorded", evidenceRef: "doc:known", evidenceAnchor: "section" },
    ];

    expect(timeModel.recordedLifecycleDeltas(deltas, evidenceIds).map((delta) => delta.label)).toEqual(["확인됨"]);
    expect(timeModel.recordedLifecycleStates([{ deltas }], evidenceIds)).toEqual(["born"]);

    const summary = timeModel.lifecycleEvidenceSummary({ deltas, unknown: ["별도 미확정"] }, evidenceIds);
    expect(summary.recordedDeltas).toHaveLength(1);
    expect(summary.unrecordedDeltas).toHaveLength(4);
    expect(summary.recordedStates).toEqual(["born"]);
    expect(summary.missingStates).toEqual(["persisted", "weakened", "retired"]);
    expect(summary.explicitUnknown).toEqual(["별도 미확정"]);
  });

  test("returns no invented born state when no lifecycle evidence is recorded", () => {
    const deltas = [{
      state: "born",
      label: "근거 없음",
      evidenceStatus: "recorded",
      evidenceRef: "doc:missing",
      evidenceAnchor: "section",
    }];
    expect(timeModel.recordedLifecycleStates([{ deltas }], new Set(["doc:known"]))).toEqual([]);
  });

  test("publishes no lifecycle state when public chronology evidence is unavailable", () => {
    const temporal = readJson<{ eras: Array<{ deltas: Array<Record<string, string>> }> }>("public-safe", "data", "temporal.json");
    const entity = readJson<{ entities: Array<{ id: string }> }>("public-safe", "data", "entity.json");
    const evidenceIds = new Set(entity.entities.map((item) => item.id));

    expect(entity.entities).toHaveLength(6);
    expect(temporal.eras).toEqual([]);
    expect(timeModel.recordedLifecycleStates(temporal.eras, evidenceIds)).toEqual([]);
  });

  test("renders only verified version movement when a release delta exists", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AtlasStateProvider } = await import("../src/state");
    const { TimeView } = await import("../src/views/TimeView");
    const markup = renderToStaticMarkup(
      React.createElement(AtlasStateProvider, null, React.createElement(TimeView)),
    );
    expect(markup).toContain("이전 릴리스 이후 검증된 지식 변화만 읽습니다");
    expect(markup).toContain("파일 mtime과 실행 건수는 지식 변화로 세지 않습니다");
    expect(markup).not.toContain("data-testid=\"era-small-multiples\"");
    expect(markup).not.toMatch(/새로 생김 집계 \d+|미확정 변화 \d+/);
  });

  test("uses Korean-first lifecycle and era labels", () => {
    expect(timeModel.lifecycleStateLabel("born")).toBe("기록상 등장");
    expect(timeModel.lifecycleStateLabel("persisted")).toBe("기록상 지속");
    expect(timeModel.lifecycleStateLabel("unknown")).toBe("미확정·미기록");
    expect(timeModel.formatEraRange("Era 7", 7)).toBe("시대 장면 7 (Era 7)");
  });
});
