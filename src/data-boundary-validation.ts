import type { AtlasData } from "./types";
import { collectAtlasShapeFailures } from "./data-contract";
import {
  collectAtlasReferenceFailures,
  restoreRelationBrowserWireDefaults,
} from "./data";

const ownerOnlyProjectNames = new Set(["Rocket", "Groot", "Intelligence Layer"]);

export function collectPublicProjectCountDisclosureFailures(candidate: AtlasData): string[] {
  if (candidate.publication.profile !== "public") return [];
  const failures: string[] = [];
  if (candidate.inventory.publicTitlePolicy.projectCountDisclosure !== "combined_non_attributable") {
    failures.push("inventory-policy:not-combined-non-attributable");
  }
  const privateCoverage = candidate.inventory.coverage.filter((row) => ownerOnlyProjectNames.has(row.label));
  if (privateCoverage.length > 0) failures.push("inventory:project-specific-coverage");
  const combinedCoverage = candidate.inventory.coverage.filter((row) => row.label === "Independent Projects");
  if (combinedCoverage.length !== 1) failures.push("inventory:combined-project-coverage-count");
  const projectLabeledGraph = candidate.graph.nodes
    .map((row) => row.label)
    .filter((label) => [...ownerOnlyProjectNames].some((name) => label === name || label.startsWith(`${name} `)));
  if (projectLabeledGraph.length > 0) failures.push("graph:project-specific-count-surface");
  if (candidate.graph.nodes.some((node) => node.kind === "project_stage")) {
    failures.push("graph:public-project-stage");
  }
  return failures;
}

export function validateAtlasPacksAtBoundary(candidate: unknown): AtlasData {
  const restored = restoreRelationBrowserWireDefaults(candidate);
  const shapeFailures = collectAtlasShapeFailures(restored);
  if (shapeFailures.length > 0) {
    const details = shapeFailures
      .slice(0, 8)
      .map((failure) => `${failure.path}: ${failure.message}`)
      .join(" | ");
    throw new Error(`Atlas v7 데이터 계약 위반: ${details}`);
  }
  const validated = restored as AtlasData;
  const projectCountFailures = collectPublicProjectCountDisclosureFailures(validated);
  if (projectCountFailures.length > 0) {
    throw new Error(`Atlas v7 공개 프로젝트 수 비공개 계약 위반: ${projectCountFailures.join(", ")}`);
  }
  const referenceFailures = collectAtlasReferenceFailures(validated);
  if (referenceFailures.length > 0) {
    throw new Error(`Atlas v7 데이터 참조 무결성 실패: ${referenceFailures.slice(0, 12).join(", ")}`);
  }
  return validated;
}
