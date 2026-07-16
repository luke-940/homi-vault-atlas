export const lifecycleStateOrder = ["born", "persisted", "weakened", "retired"] as const;
export type LifecycleState = (typeof lifecycleStateOrder)[number];

export interface LifecycleDeltaLike {
  state: string;
  label?: string;
  evidenceRef?: string;
  evidenceAnchor?: string;
  evidenceStatus?: string;
}

const lifecycleStateLabels: Record<LifecycleState | "unknown", string> = {
  born: "기록상 등장",
  persisted: "기록상 지속",
  weakened: "기록상 약화",
  retired: "기록상 종료",
  unknown: "미확정·미기록",
};

function isLifecycleState(value: string): value is LifecycleState {
  return (lifecycleStateOrder as readonly string[]).includes(value);
}

export function lifecycleStateLabel(value: string) {
  return isLifecycleState(value) ? lifecycleStateLabels[value] : lifecycleStateLabels.unknown;
}

export function isRecordedLifecycleDelta(
  delta: LifecycleDeltaLike,
  evidenceIds?: ReadonlySet<string>,
) {
  if (!isLifecycleState(delta.state) || delta.evidenceStatus !== "recorded") return false;
  const evidenceRef = delta.evidenceRef?.trim();
  const evidenceAnchor = delta.evidenceAnchor?.trim();
  if (!evidenceRef || !evidenceAnchor) return false;
  return evidenceIds ? evidenceIds.has(evidenceRef) : true;
}

export function recordedLifecycleDeltas<T extends LifecycleDeltaLike>(
  deltas: readonly T[],
  evidenceIds?: ReadonlySet<string>,
) {
  return deltas.filter((delta) => isRecordedLifecycleDelta(delta, evidenceIds));
}

export function recordedLifecycleStates(
  eras: readonly { deltas: readonly LifecycleDeltaLike[] }[],
  evidenceIds?: ReadonlySet<string>,
): LifecycleState[] {
  const states = new Set(
    eras.flatMap((era) => recordedLifecycleDeltas(era.deltas, evidenceIds).map((delta) => delta.state)),
  );
  return lifecycleStateOrder.filter((stateName) => states.has(stateName));
}

export function lifecycleEvidenceSummary<T extends LifecycleDeltaLike>(
  era: { deltas: readonly T[]; unknown?: readonly string[] },
  evidenceIds?: ReadonlySet<string>,
) {
  const recordedDeltas = recordedLifecycleDeltas(era.deltas, evidenceIds);
  const recordedSet = new Set(recordedDeltas.map((delta) => delta.state));
  return {
    recordedDeltas,
    unrecordedDeltas: era.deltas.filter((delta) => !isRecordedLifecycleDelta(delta, evidenceIds)),
    recordedStates: lifecycleStateOrder.filter((stateName) => recordedSet.has(stateName)),
    missingStates: lifecycleStateOrder.filter((stateName) => !recordedSet.has(stateName)),
    explicitUnknown: [...(era.unknown ?? [])],
  };
}

export function formatEraRange(value: string, eraId: number) {
  const match = value.trim().match(/^Era\s+(\d+)$/i);
  return match ? `시대 장면 ${match[1]} (Era ${match[1]})` : value || `시대 장면 ${eraId}`;
}
