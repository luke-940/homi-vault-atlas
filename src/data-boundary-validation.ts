import type { AtlasData } from "./types";
import { collectAtlasShapeFailures } from "./data-contract";
import {
  collectAtlasReferenceFailures,
  restoreRelationBrowserWireDefaults,
} from "./data";

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
  const referenceFailures = collectAtlasReferenceFailures(validated);
  if (referenceFailures.length > 0) {
    throw new Error(`Atlas v7 데이터 참조 무결성 실패: ${referenceFailures.slice(0, 12).join(", ")}`);
  }
  return validated;
}
