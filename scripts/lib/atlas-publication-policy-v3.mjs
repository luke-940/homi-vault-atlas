import path from "node:path";
import { scanOperatingExposure, scanPrivacyText } from "./privacy-scanner.mjs";
import { structureKindForDocument } from "./profile-contract.mjs";

const rawDateTitle = /^\d{4}(?:-\d{2}){1,2}(?:\b|[_ -])/;
const dispositions = new Set(["knowledge", "maintenance", "sensitive", "unsupported"]);
export const internalKnowledgeMarkerPattern = /\b(?:SI|SR)[-–—_ ]?\d+\b|\[\d{1,3}\]/gi;
export const privateOperatingReferencePattern = /\b(?:Intellible\s+)?(?:Current Decisions Registry|Direction and Decision Ledger|Program Current State and Resume Capsule)\b/gi;
export const privateRelativeFilePattern = /(?<![:/])\b[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._~%+@=-]+)+\.(?:png|jpe?g|webp|gif|svg|tsv|csv|json|ya?ml|md|txt|pdf|mov|mp4|zip|html?|tsx?|jsx?|mjs|cjs)\b/gi;
export const privateRelativeDirectoryPattern = /(?<![:/])\b(?:derived|manifests?|artifacts?|outputs?|workspaces?|screenshots?|contact-sheets?|blind-pairwise|mobile-crops|assets?|docs?|scripts?|src|tests?|node_modules)\/(?:[A-Za-z0-9._~%+@=-]+\/)+/gi;

function topLevel(relativePath) {
  return relativePath.split("/")[0] ?? "";
}

function matchesExcludedSegment(relativePath, policy) {
  const segments = relativePath.split("/");
  return policy.excludedPathSegments.some((segment) => segments.includes(segment));
}

export function normalizePublicDisplayTitle(title, policy) {
  let display = String(title).normalize("NFC").trim();
  if (policy.display.stripLeadingStrategyCode) {
    let previous;
    do {
      previous = display;
      display = display
        .replace(/^(?:SI|SR)-\d+\s*[-—–:]\s*/i, "")
        .replace(/^(?:SI|SR)-\d+\s+/i, "");
    } while (display !== previous);
  }
  if (policy.display.stripLeadingBracketNumber) {
    display = display.replace(/^\[\d+\]\s*/, "");
  }
  return display.replace(/\s+/g, " ").trim();
}

export function sanitizePublicKnowledgeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(privateOperatingReferencePattern, "비공개 운영 문서")
    .replace(privateRelativeFilePattern, "내부 파일 경로 제외")
    .replace(privateRelativeDirectoryPattern, "내부 파일 경로 제외")
    .replace(internalKnowledgeMarkerPattern, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*]/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([·|:/–—-])(?:\s*[·|:/–—-])+/g, "$1")
    .replace(/^[\s·|,/():;–—-]+|[\s·|,/(:;–—-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsInternalKnowledgeMarker(value) {
  if (typeof value === "string") {
    internalKnowledgeMarkerPattern.lastIndex = 0;
    return internalKnowledgeMarkerPattern.test(value);
  }
  if (Array.isArray(value)) return value.some(containsInternalKnowledgeMarker);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsInternalKnowledgeMarker);
  }
  return false;
}

export function validatePublicationPolicyV3(policy) {
  const failures = [];
  if (policy?.schema !== "atlas.publication_policy.v3") failures.push("schema");
  if (policy?.mode !== "actual_safe_names_and_reviewed_sections") failures.push("mode");
  if (!Array.isArray(policy?.publicRoots) || policy.publicRoots.length !== 6) failures.push("public-roots");
  if (new Set(policy?.publicRoots ?? []).size !== policy?.publicRoots?.length) failures.push("public-root-duplicates");
  if (!Array.isArray(policy?.sectionTaxonomy)
    || policy.sectionTaxonomy.length !== dispositions.size
    || policy.sectionTaxonomy.some((value) => !dispositions.has(value))) failures.push("section-taxonomy");
  if (!Array.isArray(policy?.sectionHints?.maintenanceBlockPatterns)
    || policy.sectionHints.maintenanceBlockPatterns.length === 0) failures.push("maintenance-block-patterns");
  if (policy?.reader?.allowRawHtml !== false) failures.push("raw-html");
  if (policy?.reader?.allowImagesByDefault !== false) failures.push("image-default");
  if (policy?.review?.required !== true || policy.review.requiredDocumentStatus !== "reviewed") failures.push("review");
  if (policy?.reconciliation?.requireDocumentUnclassifiedZero !== true
    || policy?.reconciliation?.requireSectionUnclassifiedZero !== true
    || policy?.reconciliation?.requireClaimEvidenceCoverage !== true
    || policy?.reconciliation?.requireGraphDossierReaderOneToOne !== true) failures.push("reconciliation");
  return failures;
}

export function graphAdmissionPolicyFromV3(policy) {
  const failures = validatePublicationPolicyV3(policy);
  if (failures.length) {
    throw new Error(`Graph admission blocked: invalid publication policy v3 (${failures.join(", ")}).`);
  }
  return {
    schema: "atlas.publication_policy.v2",
    version: policy.version,
    mode: "actual_safe_names",
    publicRoots: policy.publicRoots,
    ownerAdditionalRoots: policy.ownerAdditionalRoots ?? [],
    conditionalRoots: policy.conditionalRoots,
    excludedPathSegments: policy.excludedPathSegments,
    excludedBasenames: policy.excludedBasenames,
    excludedTitlePatterns: policy.excludedTitlePatterns,
    display: {
      ...policy.display,
      indexDocumentsBecomeDomainMetadata: true,
    },
    forbiddenRuntimeFields: [
      "body",
      "frontmatter",
      "relativePath",
      "sourcePath",
      "sourceHash",
      "receipt",
      "workOrder",
      "batch",
      "cursor",
    ],
    reconciliation: {
      requireUnclassifiedZero: true,
      aggregateMode: policy.reconciliation.aggregateMode ?? "none",
    },
  };
}

export function classifyDocumentCandidateV3(record, policy) {
  const failures = validatePublicationPolicyV3(policy);
  if (failures.length) throw new Error(`Publication policy v3 blocked: ${failures.join(", ")}.`);
  const root = topLevel(record.relativePath);
  const basename = path.posix.basename(record.relativePath, ".md");
  const kind = structureKindForDocument(record.relativePath, record.frontmatter);
  let disposition = "candidate";
  let reason = null;
  if (matchesExcludedSegment(record.relativePath, policy)) {
    disposition = "excluded";
    reason = "excluded_path";
  } else if (policy.excludedBasenames.includes(basename)) {
    disposition = "excluded";
    reason = "structural_scaffolding";
  } else if (rawDateTitle.test(basename)) {
    disposition = "excluded";
    reason = "dated_note";
  } else if (policy.excludedTitlePatterns.some((pattern) => new RegExp(pattern, "i").test(basename))) {
    disposition = "excluded";
    reason = "operating_surface";
  } else if (kind === "strategy_request") {
    disposition = "excluded";
    reason = "strategy_request";
  } else if (!policy.publicRoots.includes(root)
    && !(root === "Strategy" && policy.conditionalRoots?.Strategy?.admitKinds?.includes(kind))) {
    disposition = "excluded";
    reason = "unsupported_root";
  }
  const displayTitle = normalizePublicDisplayTitle(record.title, policy);
  const titleFindings = [
    ...scanPrivacyText(displayTitle, { path: "title" }),
    ...scanOperatingExposure(displayTitle, { path: "title" }),
  ];
  if (disposition === "candidate" && (!displayTitle || titleFindings.length)) {
    disposition = "excluded";
    reason = !displayTitle ? "empty_display_title" : "sensitive_title";
  }
  return {
    disposition,
    reason,
    domain: root,
    kind,
    displayTitle,
    titleFindings: titleFindings.map((finding) => finding.id).sort(),
  };
}

export function hintedSectionDispositionV3(heading, policy) {
  const value = String(heading ?? "").trim();
  if (!value) return "maintenance";
  if ((policy.sectionHints?.unsupportedHeadingPatterns ?? [])
    .some((pattern) => new RegExp(pattern, "i").test(value))) return "unsupported";
  if ((policy.sectionHints?.maintenanceHeadingPatterns ?? [])
    .some((pattern) => new RegExp(pattern, "i").test(value))) return "maintenance";
  return "knowledge";
}

export function validateSectionReviewV3(review, parsedSectionIds, policy) {
  const failures = [];
  if (review?.status !== policy.review.requiredDocumentStatus) failures.push("review-status");
  const decisions = review?.sectionDecisions ?? [];
  const byId = new Map(decisions.map((item) => [item.sectionId, item]));
  if (byId.size !== decisions.length) failures.push("duplicate-section-decision");
  const defaultDisposition = review?.defaultDisposition ?? null;
  if (defaultDisposition !== null && !dispositions.has(defaultDisposition)) {
    failures.push("invalid-default-section-disposition");
  }
  for (const sectionId of parsedSectionIds) {
    const decision = byId.get(sectionId);
    if (!decision) {
      if (!defaultDisposition) failures.push(`unclassified-section:${sectionId}`);
    } else if (!dispositions.has(decision.disposition)) {
      failures.push(`invalid-section-disposition:${sectionId}`);
    }
  }
  for (const sectionId of byId.keys()) {
    if (!parsedSectionIds.includes(sectionId)) failures.push(`orphan-section-decision:${sectionId}`);
  }
  return [...new Set(failures)];
}
