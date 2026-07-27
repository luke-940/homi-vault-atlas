# Homi Vault Atlas v7.7 — Backbone Density Design QA

## Comparison target

- Source visual truth: local-only Gate 1 evidence, `golden-direction/home-default-depth-1440x920.png`
- Source pixels: 1569×1002, normalized proportionally into a 1440×920 frame.
- Rendered implementation: local-only Gate 3 evidence, `backbone-density-audit/09-backbone-density-design-final-1440x920.actual.png`
- Implementation pixels / CSS viewport: 1440×920 at browser DPR 2; evidence normalized to 1440×920 PNG pixels for comparison.
- State: Owner Home · `domain-backbone` · default committed selection.
- Full-view comparison: local-only evidence, `backbone-density-audit/10-golden-vs-design-final-1440x920.png`
- Focused graph comparison: local-only evidence, `backbone-density-audit/06-golden-vs-balanced-focus.png`
- Mobile evidence: local-only evidence, `backbone-density-audit/11-backbone-density-design-final-390x844.actual.png`

## Findings

- No actionable P0/P1/P2 findings remain in the revised Backbone state.
- [P3] The golden concept retains a denser atmospheric micro-field than the implementation.
  - Evidence: the source uses many illustrative micro-marks; the implementation exposes 60 factual graph nodes and 16 factual directed edges.
  - Classification: acceptable truth-bound deviation. Decorative nodes and invented edges remain prohibited.
  - Follow-up: future density may increase only when additional real, public-safe graph nodes and edges are available.

## Required fidelity surfaces

- Fonts and typography: Pretendard/Space Grotesk hierarchy, headline wrapping, domain labels, and small evidence copy remain consistent with the approved stage. Required visible text is at least 12 px.
- Spacing and layout rhythm: the 1440×920 split composition is preserved. A tall compact desktop now caps the graph plotting height instead of stretching clusters through the full viewport. At 1440×920, visible domain and protagonist labels have zero intersections and zero headline overlap.
- Colors and visual tokens: warm graphite field, MOC amber, Papers violet, Signals cyan, and Homi amber focus remain unchanged. The three domains now receive comparable visual mass.
- Image and asset fidelity: the real Homi mark is preserved. No placeholder, CSS-drawn logo, decorative fake node, or invented edge was introduced.
- Copy and content: the approved Korean headline, MOC/Papers/Signals role explanation, domain anchor copy, and provenance language remain unchanged.

## Comparison history

### Pass 1 — blocked

- P1: the 46-node Home selection rendered only 39 visible nodes and seven edges, making Backbone look like a small representative sample rather than a knowledge system.
- P1: selection order let MOC consume most of the available node budget, starving Papers and Signals.
- P2: tall compact-desktop viewports stretched the plot vertically and created excessive empty space.
- P2: the compact Papers label could intrude into the headline region.

### Fixes

- Increased factual Home capacity to 60 desktop nodes and 24 mobile nodes.
- Balanced the node budget across the three core domains before using any remainder.
- Increased deterministic factual Backbone edges to 16 desktop and eight mobile with the existing degree-four guard.
- Capped non-mobile plot height relative to viewport width and aligned label projection to the same stage metrics.
- Shifted compact-desktop domain slots away from the editorial headline.

### Pass 2 — passed

- 1440×920: 60 nodes, 16 actual directed edges; domain distribution is MOC 21, Papers 19, Signals 19, Strategy 1.
- 390×844: 24 nodes, eight actual directed edges, page horizontal overflow 0.
- Visible domain/protagonist label intersections: 0.
- Headline/domain-label intersections: 0.
- Browser console warning/error messages: 0.
- Click selection commits the exact Owner node to the URL. Escape restores the prior semantic state after dismissing the active guide state.

### Pass 3 — visual polish passed

- Replaced repeated column-like node placement with a bounded deterministic constellation scatter while preserving the build-time position signal.
- Added depth-aware luminous node cores and factual edge underglow without adding decorative nodes or relationships.
- Increased factual cross-cluster curve separation so directional paths read as spatial routes instead of a vertical wiring diagram.
- Raised the Papers depth plane and spread so MOC, Papers, and Signals now carry comparable visual mass while remaining on distinct planes.
- Rechecked 1440×920: label intersections 0, headline overlap 0, page overflow 0.
- Rechecked 390×844: 24 nodes, eight edges, page overflow 0.

## Mechanical verification

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 32 source contracts checked.
- `npm run test:public`: PASS, 114/114, worker 1.
- `npm run test:owner`: PASS, 31/31, worker 1.
- Owner build: 659 nodes, 3,644 edges, six verified routes.
- Public build: 2,480,283 bytes total.
- JavaScript: 575,483 bytes raw.
- CSS: 61,079 bytes raw, below the 60 KiB hard gate.
- No repeated local performance matrix or 24×5 run was executed.

## Residual boundary

- This is a Gate 3 local rework candidate. GitHub branch, PR, Pages, tag, and Release mutation remain 0.
- Publication audit requires a clean committed repository identity and is intentionally deferred until this local RC is committed.
- The local preview remains open for Luke’s visual decision.

final result: passed
