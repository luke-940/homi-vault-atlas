# Homi Vault Atlas Architecture

## Purpose

Atlas is repeatedly extended across releases, so a green test suite is not
enough. Every change must leave the next change easier to make. This contract
guards against the two long-horizon failure modes highlighted by
SlopCodeBench: redundant growth and structural erosion through concentrated
complexity.

## Dependency direction

Production code follows one direction:

1. `src/app/contracts.ts` and decoded data models
2. pure feature models and indexes
3. shared semantic state and URL codec
4. feature composition
5. renderer and DOM presentation

Feature composition may depend on shared state and knowledge loaders. Shared
state may not import a feature component. The Three.js engine may not import
React, knowledge presentation, or workspace components.

## Feature ownership

- `Home` owns Map Console composition, the default Map Index, transient
  domain/kind highlight, and a presentation-only rail width. Facet changes may
  update renderer material buffers but must not touch semantic route state,
  graph coordinates, camera, labels, or dossier identity. The list reuses the
  shared graph index and committed focus; it is not a second selection engine.
- `Observe` owns its mode deck, domain matrix, node relation map, directed
  relation proof, and evidence reader. It does not live in the miscellaneous
  analysis workspace module.
- `AnalysisViews` owns Flow, Time, Agency, and their shared compact workspace
  bar only.
- `Knowledge` owns dossier, evidence, safe source, shard loading, and claim
  presentation after committed selection. It does not own the Home default
  state or workspace routing.
- `SemanticSpaceRenderer` owns WebGL lifecycle and picking. React owns labels,
  accessible controls, and evidence. Focus styling may reveal actual incident
  edge direction, but it may not change authored graph coordinates or camera.
  Transient preview may update only interaction buffers and dynamic label
  anchors; it may not rebuild the scene.
  Committed self-light is one batched GPU point layer whose alpha and color
  attributes may change; it may not replace node geometry or create a second
  scene.
- `MobileGraphCanvas` owns pointer composition only. Its projection, actual-edge,
  node, and domain-label painting live in `mobile-graph-painter.ts` so new
  highlight semantics cannot reconcentrate the former monolithic draw function.

Each production selector has one component-definition owner. Responsive and
state layers may alter layout, but may not recreate a component.

## Change protocol

Every new production responsibility must:

1. identify the responsibility it replaces in
   `docs/replacement-ledger.json`;
2. preserve its behavior contract;
3. remove the old implementation in the same change;
4. add a focused behavior or architecture check;
5. leave no version-specific class, feature flag, duplicate renderer, or
   compatibility adapter unless the product contract explicitly requires it.

## Automated erosion gates

`npm run architecture` measures production TS/TSX with a source-aware
structural scanner that removes comments and literals before locating function
bodies and decision points.

- no function may exceed cyclomatic complexity 18;
- no feature module may exceed 650 lines;
- total production TS/TSX must remain at or below 12,500 lines;
- complexity mass in functions at complexity 10 or higher must remain below
  35% of total function complexity;
- `Home.tsx` remains composition-only and below 120 lines;
- `AnalysisViews.tsx` may not regain Observe responsibilities;
- Home selectors live in `home.css`;
- Observe selectors live in `observe.css`;
- version-specific selectors and `!important` remain forbidden.

The metric is a guardrail, not a quality score. A passing result does not waive
human review of naming, cohesion, dependency direction, or replacement
completeness.

Pre-existing complexity that is outside the changed responsibility may be
listed only in `docs/architecture-debt-ratchet.json`. Its measured ceiling may
never increase, and a new file may not be added to the ratchet merely to make a
change pass.

## Release evidence

Architecture evidence records:

- production line count;
- function count and maximum complexity;
- high-complexity mass ratio;
- source CSS bytes and selector ownership;
- replacement-ledger status;
- focused behavior tests.

The final owner receipt reports this evidence alongside product QA. It never
substitutes for Chrome visual and interaction proof.
