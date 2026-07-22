# Homi Vault Atlas v7.5 Design QA

## Comparison target

- Source visual truth path: `local-evidence/visual-audit/source-true-3d-field.png`
- Browser-rendered implementation path: `home-link-trace-after-node-luminance-r2.png`
- Same-viewport comparison path: `comparison-link-trace-before-vs-node-luminance-r2.png`
- Implementation surface: in-app browser local HTTP preview; address intentionally remains outside repository-safe evidence.
- Primary viewport/state: 1440×920, Public profile, Home · Knowledge Field, light metadata with graphite-aubergine product field
- Normalization: the 1570×1002 concept and 1440×920 implementation have near-identical aspect ratios. The comparison evaluates composition, hierarchy, data-channel meaning, density, and interaction affordance rather than false pixel parity. Production density remains bound to the real 50-node Public projection.
- Full-view comparison evidence: both source and implementation were opened at original detail in the same comparison pass. The implementation was also reopened in the in-app browser after every P0/P1/P2 correction.
- Focused region comparison: no separate crop was required. Typography, logo asset, graph labels, scene rail, directional traces, and camera controls were individually readable in the original-resolution evidence. The removed readout was also checked in the DOM: visible selector count 0 and non-visual live-status count 1.

## Findings

- [Resolved P1] Luke rejected the filled district volumes and persistent lower-right field note during Gate 3 review.
  - Location: Home · all four scenes, especially Link Trace.
  - Failure: pastel district surfaces read as camera-facing boards, while the field-note card covered the primary visual and duplicated evidence available in deeper workspaces.
  - Correction: all Home district fills and projected volume cages were removed. Node radius, core brightness, and halo reach now increase monotonically with `uniqueInboundDocuments`; light renders behind real routes. The visible Home readout was deleted, while a non-visual `aria-live` status preserves selection context.
  - Evidence: `home-link-trace-before-node-luminance.png`, `home-link-trace-after-node-luminance-r2.png`, and `comparison-link-trace-before-vs-node-luminance-r2.png` use the same 1440×920 Link Trace state. `home-link-trace-node-luminance-390x844-graph-r2.png` verifies the mobile graph region. Horizontal overflow is 0, the visible readout selector is absent, the accessible live region is present, and browser warning/error logs are `[]`.

- [Resolved P1] Home now has a data-bound spatial silhouette instead of a flat graph beside editorial copy.
  - Location: Home · Knowledge Field, 1440×920.
  - Evidence: the current implementation uses node-local gravity fields, foreground node relief, real district routes, and exact hub references. Position/hue/direct labels preserve district identity without filled territory.
- [Resolved P2] The selected-knowledge utility card and its replacement field annotation were removed from Home.
  - Location: former Home lower-right readout.
  - Evidence: the primary graph is unobstructed. Detailed evidence actions remain in Explore and Observe, while a screen-reader-only live status preserves selection feedback.
- [Resolved P2] The Home signature is now derived from Atlas semantics rather than generic glow treatment.
  - Location: Home substrate, node-local luminance, node relief, direction traces, and four scene states.
  - Evidence: district color, gravity size, freshness height, structure depth, real reference direction, and selection amber each have one stable meaning. The four scenes produce four distinct screenshots and state readouts.
- [P3] The approved concept uses denser illustrative material than the Public runtime.
  - Location: Home Living Graph.
  - Evidence: the concept contains illustrative micro-nodes and stronger atmospheric material; the implementation exposes the actual Public 50-node graph, 42 hub edges, 12 district routes, and anonymous aggregate document marks only.
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

5. **Corrected, then superseded — Luke design review reopened**
   - Home default and Link Trace were already functionally distinct, but the comparison exposed an art-direction and tactility gap.
   - Interim fix: data-bound territory skins, greater foreground/background separation, node relief, authored route annotation, and an integrated editorial gradient were implemented and re-compared. Luke's later rotation review rejected the territory treatment and the annotation overlay.

6. **Rejected — volumetric district treatment**
   - Finding: the pastel district areas read as screen-facing boards rather than spatial territories and did not change shape with the camera.
   - Interim fix: screen-facing boards were replaced by bounded XYZ envelopes and depth-weighted rings.
   - Rejection: Luke correctly identified that the result still read as forced district material and competed with node meaning.
   - Durable correction: all filled/ringed Home district surfaces are now removed. Position, hue, and labels carry district identity; node gravity alone carries luminance.

7. **Candidate ready — product-wide and responsive review**
   - Explore, Observe, Flow, and Agency were recaptured in one 1440×920 contact sheet after the Home refinement. They retain the same graphite-aubergine field, amber focus, restrained borders, typographic hierarchy, and evidence semantics.
   - Home was recaptured at 390×844, 320×844, and 844×390. Both narrow widths and landscape have horizontal overflow 0; visible primary controls at 390 px are 44 px high.

8. **Candidate R2 ready — node-owned luminance and unobstructed field**
   - The same 1440×920 Link Trace state was captured before and after the correction and placed in one comparison image.
   - The persistent lower-right card is absent, node light is monotonic with verified inbound gravity, and real routes render above every halo.
   - The 390×844 graph region has horizontal overflow 0 and no overlay obstruction; browser warning/error logs are `[]`.

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
- Node-owned luminance revision build: 77 files, 2,280,687 bytes; JS 542,062 bytes; CSS 60,532 bytes; shape validation failures 0. The change reduced both JS and CSS while preserving the public snapshot digest.
- The current refinement pass reran `typecheck`, `lint`, build shape validation, Public and Owner contract suites, the four Home scene checks, one desktop workspace contact sheet, and the bounded responsive evidence above. No Playwright matrix or repeated performance sweep was run locally.
- Clean-commit publication audit is intentionally recorded as external release evidence after this document and source tree are frozen; that immutable evidence, not a self-referential source edit, is authoritative.
- Preview handoff uses one in-app browser tab and one local server. Cleanup proof is recorded when the Gate 3 handoff ends or production work begins.
- Public/Owner visual comparison completed; the temporary Owner preview was terminated with no remaining listener.

## Open questions

- Gate 3 visual approval remains the only product decision gate. GitHub push, PR, Pages, tag, and Release remain intentionally untouched until Luke approves the local candidate.

final result: candidate_ready_for_luke_gate3_review_r2
