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
]);

const classBoundary = (className) => new RegExp(
  `(?<![A-Za-z0-9_-])${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`,
  "g",
);

function aliasFor(index) {
  return `a${index.toString(36)}`;
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
