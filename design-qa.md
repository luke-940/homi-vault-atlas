# Homi Vault Atlas v7.5 Design QA

## Comparison target

- Source visual truth path: `local-evidence/visual-audit/source-true-3d-field.png`
- Browser-rendered implementation path: `local-evidence/visual-audit/gate3-home-1440x920-candidate-v8.png`
- Same-viewport comparison path: `local-evidence/visual-audit/comparison-gate1-target-vs-gate3-candidate-v8.png`
- Implementation surface: in-app browser local HTTP preview; address intentionally remains outside repository-safe evidence.
- Primary viewport/state: 1440×920, Public profile, Home · Knowledge Field, light metadata with graphite-aubergine product field
- Normalization: the 1570×1002 concept and 1440×920 implementation have near-identical aspect ratios. The comparison evaluates composition, hierarchy, data-channel meaning, density, and interaction affordance rather than false pixel parity. Production density remains bound to the real 50-node Public projection.
- Full-view comparison evidence: both source and implementation were opened at original detail in the same comparison pass. The implementation was also reopened in the in-app browser after every P0/P1/P2 correction.
- Focused region comparison: no separate crop was required. Typography, logo asset, graph labels, focus readout, scene rail, directional traces, and camera controls were individually readable in the original-resolution evidence; label geometry and minimum text size were independently measured in the rendered DOM.

## Findings

- [Resolved P1] Home now has a data-bound spatial silhouette instead of a flat graph beside editorial copy.
  - Location: Home · Knowledge Field, 1440×920.
  - Evidence: the current implementation uses XYZ volume skins, depth-weighted near/far strokes, foreground node relief, real district routes, and exact hub references. Camera composition was compared against the approved concept at the same viewport; an over-enlarged intermediate that collided with the evidence ledger was rejected before candidate v8.
- [Resolved P2] The selected-knowledge utility card was replaced by an editorial field annotation.
  - Location: Home lower-right readout.
  - Evidence: the annotation now distinguishes node context from directional trace, names incoming/outgoing evidence, identifies district and meaningful date, and keeps Explore/Observe/Flow as subordinate text actions.
- [Resolved P2] The Home signature is now derived from Atlas semantics rather than generic glow treatment.
  - Location: Home substrate, district envelopes, node relief, direction traces, and four scene states.
  - Evidence: district color, gravity size, freshness height, structure depth, real reference direction, and selection amber each have one stable meaning. The four scenes produce four distinct screenshots and state readouts.
- [P3] The approved concept uses denser illustrative volumes than the Public runtime.
  - Location: Home Living Graph.
  - Evidence: the concept contains illustrative micro-nodes and stronger volumetric material; the implementation exposes the actual Public 50-node graph, 42 hub edges, 12 district routes, and anonymous aggregate document marks only.
  - Classification: acceptable truth-bound deviation. Adding invented nodes, fake relations, decorative stars, or glossy material would violate the North Star. Owner mode preserves the deeper real graph locally.
- [P3] The 60 KiB CSS hard gate has 31 bytes of remaining headroom.
  - Location: built stylesheet `app.cbabc491eedfb7a8.css`, 61,409 bytes.
  - Classification: accepted for this RC; future polish must replace or prune existing rules before adding styles.

## Required fidelity surfaces

- Fonts and typography: actual Pretendard Variable subset for Korean and self-hosted Space Grotesk for product Chrome; 12 px minimum UI text; no measured sub-12 px visible text in the representative matrix; headline wraps deliberately at desktop, tablet, and mobile.
- Spacing and layout rhythm: Home is the product-wide minimum. Explore, Observe, Flow, Agency, Search, inspector, and mobile siblings now share the same dark evidence field, restrained radii, amber focus, and sparse editorial annotation. At 821–1179 px Home becomes a vertical editorial sequence; at 820 px and below the dedicated mobile sibling is used.
- Colors and visual tokens: graphite-aubergine substrate, one Homi amber selection color, explicit district colors, and color-independent shape/label/line encodings. No random pastel, neon HUD, deep-sea blue wash, or decorative particle layer remains.
- Image and asset fidelity: the original Homi mark is loaded from `src/assets/brand/homi-mark-amber.svg`; no text glyph, CSS drawing, emoji, or placeholder logo substitutes it. Canvas marks are the product visualization, not replacement image assets.
- Copy and content: product Chrome stays English; interpretation stays Korean. Home states the physical record count dynamically and names `실제 방향 관계`; coverage values and graph metrics are projection-derived.

## Comparison history

1. **Blocked — flat and generic field**
   - Earlier evidence: `visual-audit/reference-captures/atlas-failed-1280x720.png` and `visual-audit/flat-field-failure-learning.md`.
   - Findings: fixed-coordinate card composition, weak spatial depth, disconnected districts, generic light utility surfaces, and reference-quality mismatch.
   - Fix: deterministic XYZ projection, bounded camera, district atmospheres, real district routes, exact hub references, selected path trace, and a data-derived cosmic substrate.
   - Post-fix evidence: `visual-audit/gate3-home-1440x920-current.png`.

2. **Blocked — Home/internal product split**
   - Findings: Home used the new spatial language while Observe, Flow, Agency, Search, inspector, and mobile states retained the inherited light admin UI.
   - Fix: one product-wide token system, dark integrated trays, district color semantics, amber selection, dark matrix/chord/route/role/search surfaces, and actual direction arrows in Flow.
   - Post-fix evidence: `visual-audit/gate3-observe-1440x920.png`, `visual-audit/gate3-flow-1440x920.png`, `visual-audit/gate3-agency-1440x920.png`, `visual-audit/gate3-search-1440x920.png`.

3. **Blocked — 1024 px compressed split**
   - Findings: Home headline and graph competed in the desktop split below 1180 px.
   - Fix: 821–1179 px now uses an editorial copy block followed by an independent 690 px graph scene.
   - Post-fix evidence: `visual-audit/gate3-home-1024x768.png`.

4. **Blocked — landscape label collisions**
   - Findings: 844×390 produced three graph-label intersections.
   - Fix: the short-height landscape state uses a five-label, gravity-ranked budget with 44 px target geometry.
   - Post-fix evidence: measured label collisions 0, horizontal overflow 0, visible sub-12 px text 0.

5. **Corrected — Luke design review reopened**
   - Home default and Link Trace were already functionally distinct, but the comparison exposed an art-direction and tactility gap.
   - Fix: data-bound territory skins, greater foreground/background separation, node relief, authored route annotation, and an integrated editorial gradient were implemented and re-compared.

6. **Corrected — flat district plates**
   - Finding: the pastel district areas read as screen-facing boards rather than spatial territories and did not change shape with the camera.
   - Fix: the boards were removed. Each district now derives a bounded XYZ envelope from its real hub and aggregate-document coordinates, then renders sparse latitude/meridian traces, an irregular projected hull, and depth-weighted near/far strokes. Context districts receive only one equator and one meridian; the selected district receives the fuller cage.
   - Resource correction: volume traces are batched into two strokes per ring instead of issuing a blurred stroke per segment.
   - Durable browser proof: candidate v8 and the approved concept are bound in one 2880×920 comparison image. The Home scenes have unique screenshot hashes, horizontal overflow is 0, and developer warning/error logs are `[]`.

7. **Candidate ready — product-wide and responsive review**
   - Explore, Observe, Flow, and Agency were recaptured in one 1440×920 contact sheet after the Home refinement. They retain the same graphite-aubergine field, amber focus, restrained borders, typographic hierarchy, and evidence semantics.
   - Home was recaptured at 390×844, 320×844, and 844×390. Both narrow widths and landscape have horizontal overflow 0; visible primary controls at 390 px are 44 px high.

## Responsive and interaction evidence

- Representative serial matrix: Home 1440, Home Link Trace 1280, Explore 1180, Observe 1024, Flow 768, Agency 390, Observe 320, Home 844×390.
- Result across all eight states: horizontal overflow 0; visible sub-12 px text 0; graph label collisions 0.
- Primary interactions tested: Home scene selection; Home → Explore; Explore Graph/Clusters/List; selected-node Inspector; Observe Global/Hub relation modes; Flow routes; Agency System/Roles; Search open/Escape; URL state changes; keyboard camera ArrowRight; focus-preserving cross-workspace journeys.
- 3D keyboard proof: camera yaw changed from `-0.3800` to `-0.3000` on ArrowRight.
- Browser console errors checked through in-app browser developer logs: `[]`.
- Reduced-motion implementation removes camera/trace motion through shared state and remains covered by the runtime contract suite.

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:public`: 98/98 passed in one serial run.
- `npm run test:owner`: 26/26 passed in one serial run.
- Current public build: 77 files, 2,287,542 bytes; JS 548,040 bytes; CSS 61,409 bytes; shape validation failures 0.
- The current refinement pass reran `typecheck`, `lint`, build shape validation, Public and Owner contract suites, the four Home scene checks, one desktop workspace contact sheet, and the bounded responsive evidence above. No Playwright matrix or repeated performance sweep was run locally.
- Clean-commit publication audit is intentionally recorded as external release evidence after this document and source tree are frozen; that immutable evidence, not a self-referential source edit, is authoritative.
- Preview handoff uses one in-app browser tab and one local server. Cleanup proof is recorded when the Gate 3 handoff ends or production work begins.
- Public/Owner visual comparison completed; the temporary Owner preview was terminated with no remaining listener.

## Open questions

- Gate 3 visual approval remains the only product decision gate. GitHub push, PR, Pages, tag, and Release remain intentionally untouched until Luke approves the local candidate.

final result: candidate_ready_for_luke_gate3
