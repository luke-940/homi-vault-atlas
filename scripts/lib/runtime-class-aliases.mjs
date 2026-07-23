const aliasCandidates = Object.freeze([
  "home-v75-copy-block",
  "living-graph-canvas",
  "home-v76-domain-legend",
  "graph-label-layer",
  "home-v75-scenes",
  "spatial-editorial-index__item",
  "home-v75-boundary",
  "explore-v75-mobile-clusters",
  "workspace-scene-switch",
  "workspace-shell",
  "command-actions",
  "mobile-relation-preview",
  "workspace-title",
  "explore-v75-controls",
  "workspace-tab",
  "workspace-main",
  "observation-surface",
  "home-v76-system-anchor",
  "home-v76",
  "mobile-ranked-list",
  "mobile-theatre-action",
  "view-switch",
  "explore-v75-clusters",
  "atlas-app",
  "command-bar",
  "explore-v75-graph-panel",
  "explore-v75-list-layout",
  "home-v75",
  "mobile-layer-switch",
  "spatial-workspace-frame",
  "workspace-header",
  "workspace-header-tools",
  "workspace-honest-empty",
  "brand-lockup",
  "icon-button",
  "matrix-comparison-key",
  "pair-readout",
  "tool-button",
  "inspector-actions",
  "spatial-disclosure-trigger",
  "home-v76-system-origin",
  "home-v75-evidence-primary",
  "home-v75-evidence-secondary",
  "home-v75-evidence-profile",
  "home-v75-evidence-action",
  "graph-hover-tooltip",
  "graph-camera-controls",
  "spatial-command-rail",
  "spatial-stage-layout",
  "spatial-stage-axes",
  "spatial-stage-axes--subdued",
  "spatial-evidence-rail",
  "explore-v75-insight",
  "explore-v75-directions",
  "explore-constellation-layout",
  "explore-constellation-rail",
  "explore-constellation-stage",
  "explore-constellation-brief",
  "graph-ranked-list",
  "explore-v75-path-result",
  "home-v76-protagonist-rail",
  "home-v76-movement-rail",
  "home-v76-compass-rail",
  "home-v75-editorial",
  "home-v75-graph-shell",
  "home-v75-evidence",
  "home-v75-evidence-metric",
  "home-v75-evidence-direction-count",
  "home-v75-relation-names",
  "home-v75-movement-delta",
  "home-v75-actions",
  "explore-v75-layout",
  "explore-v75-axes",
  "explore-v75-boundary",
  "explore-v75-path",
  "explore-v75-empty",
  "graph-accessible-list",
  "home-v75-page",
  "home-v75-scenes-title",
  "home-v75-eyebrow",
  "home-v75-lock-state",
  "spatial-disclosure",
  "spatial-disclosure-body",
  "explore-path-intro",
  "workspace-breadcrumb",
  "explore-command-rail",
  "spatial-stage",
  "spatial-stage--full-bleed",
  "spatial-evidence-rail__action",
  "spatial-evidence-rail__proof",
  "version-seam__metric",
  "mobile-navigation",
  "agency-scene-rail",
  "agency-authority-bus",
  "flow-spatial-layout",
  "search-section-label",
  "hub-relations-grid",
  "agency-system-map",
  "agency-snapshot-boundary",
  "agency-roles-scene",
  "agency-role-detail",
  "agency-principal",
  "agency-mobile-role-picker",
  "agency-compass-grid",
  "agency-actor-row",
  "version-seam__stage",
  "version-seam__brief",
  "version-seam__journey",
  "version-seam__caveat",
  "flow-spatial-stage",
  "workspace-answer",
  "version-seam__metrics",
  "version-seam",
]);

const classBoundary = (className) => new RegExp(
  `(?<![A-Za-z0-9_-])${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`,
  "g",
);

function aliasFor(index) {
  return `a${index.toString(36)}`;
}

export function aliasRuntimeSelector(selector) {
  let nextSelector = selector;
  for (const [index, className] of aliasCandidates.entries()) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    nextSelector = nextSelector.replace(new RegExp(`\\.${escaped}(?![A-Za-z0-9_-])`, "g"), `.${aliasFor(index)}`);
  }
  return nextSelector;
}

export function aliasRuntimeClasses({ javascript, stylesheet }) {
  let nextJavascript = javascript;
  let nextStylesheet = stylesheet;
  const applied = [];

  for (const [index, className] of aliasCandidates.entries()) {
    const selector = `.${className}`;
    const boundary = classBoundary(className);
    if (!nextStylesheet.includes(selector) || !boundary.test(nextJavascript)) {
      throw new Error(`Runtime class alias blocked: ${className} is not bound in both CSS and JavaScript.`);
    }
    boundary.lastIndex = 0;
    const alias = aliasFor(index);
    nextStylesheet = nextStylesheet.replace(boundary, alias);
    nextJavascript = nextJavascript.replace(boundary, alias);
    applied.push({ source: className, alias });
  }

  return {
    javascript: nextJavascript,
    stylesheet: nextStylesheet,
    applied,
  };
}
