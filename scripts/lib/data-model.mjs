export function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareNames(left, right) {
  return compareText(left.name, right.name);
}

export function comparePaths(left, right) {
  return compareText(left.path, right.path);
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function canonicalizeRecords(records) {
  if (!Array.isArray(records)) {
    throw new TypeError("Canonical records must be an array.");
  }
  return records
    .map((record) => stableValue(record))
    .sort((left, right) => comparePaths(left, right));
}

export function assertCandidateCurrentStateBoundary({
  baseline,
  candidate,
  live,
  expectedOfficialCursor,
}) {
  const cursors = [
    baseline?.officialCursor,
    candidate?.officialCursor,
    live?.officialCursor,
    expectedOfficialCursor,
  ];
  if (!cursors.every(Number.isInteger)) {
    throw new Error("Build blocked: baseline, candidate, live, and expected cursors must be integers.");
  }
  if (live.officialCursor !== expectedOfficialCursor) {
    throw new Error(
      `Build blocked: expected official cursor ${expectedOfficialCursor}, received ${live.officialCursor}.`,
    );
  }
  if (baseline.officialCursor > live.officialCursor) {
    throw new Error("Build blocked: historical baseline cursor cannot be ahead of live Current State.");
  }
  const stateValues = [candidate?.stateSnapshot, live?.stateSnapshot];
  const hashValues = [candidate?.currentStateHash, live?.currentStateHash];
  if (stateValues.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("Build blocked: candidate and live Current State snapshots must be non-empty strings.");
  }
  if (hashValues.some((value) => typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value))) {
    throw new Error("Build blocked: candidate and live Current State hashes must be SHA-256 values.");
  }
  if (
    candidate.officialCursor !== live.officialCursor
    || candidate.stateSnapshot !== live.stateSnapshot
    || candidate.currentStateHash !== live.currentStateHash
  ) {
    throw new Error("Build blocked: candidate input and live Current State are not the same cursor, snapshot, and hash.");
  }
  return {
    officialCursor: live.officialCursor,
    stateSnapshot: live.stateSnapshot,
    currentStateHash: live.currentStateHash,
    baselineCursor: baseline.officialCursor,
    baselineIsNotFuture: true,
  };
}

export const dailyRoutePathPrefixes = ["Research/Daily/", "Research/Weekly/"];

export function isDailyRouteMember(filePath, explicitPaths = []) {
  return dailyRoutePathPrefixes.some((prefix) => filePath.startsWith(prefix))
    || new Set(explicitPaths).has(filePath);
}

export function dailyRouteMembershipContract(explicitPaths) {
  return {
    kind: "scoped_paths_plus_explicit_surfaces",
    pathPrefixes: [...dailyRoutePathPrefixes],
    explicitPaths: [...explicitPaths],
    titleRegexMembershipAllowed: false,
  };
}

export function temporalEvidence(path, anchor, needle, sourceClass) {
  return { path, anchor, needle, sourceClass };
}

export function locateMarkdownSection(source, anchor) {
  const lines = String(source).split(/\r?\n/);
  let headingIndex = -1;
  let headingLevel = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match?.[2]?.trim() === anchor) {
      headingIndex = index;
      headingLevel = match[1].length;
      break;
    }
  }
  if (headingIndex < 0) return null;
  let endIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match && match[1].length <= headingLevel) {
      endIndex = index;
      break;
    }
  }
  return {
    anchor,
    headingLine: headingIndex + 1,
    bodyStartIndex: headingIndex + 1,
    endIndex,
    bodyLines: lines.slice(headingIndex + 1, endIndex),
  };
}

export function temporalDeltaReceiptsComplete(eras) {
  return Array.isArray(eras) && eras.every((era) => (
    Array.isArray(era.deltas) && era.deltas.every((delta) => (
      delta.evidenceStatus === "recorded"
      && delta.evidenceReceipt?.schema === "homi.atlas.temporal_delta_evidence.v1"
      && delta.evidenceReceipt?.supportRule === "exact_substring_inside_scoped_markdown_section"
      && Boolean(delta.evidenceReceipt?.receiptId)
      && Boolean(delta.evidenceSpan?.excerpt)
      && Boolean(delta.evidenceRef)
      && Boolean(delta.evidenceAnchor)
    ))
  ));
}
