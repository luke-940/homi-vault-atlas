# Homi Vault Atlas v7.5 Design QA

## Comparison target

- Source visual truth: `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/rel-atlas-v7-5-20260721-01/visual-audit/gate1-revision-true-3d-field.png`
- Browser-rendered implementation: `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/rel-atlas-v7-5-20260721-01/visual-audit/gate3-home-1440x920-current.png`
- Local implementation URL: `http://127.0.0.1:8796/?qa=gate3#home?scene=knowledge-field&guide=0&panel=none`
- Primary viewport/state: 1440×920, Public profile, Home · Knowledge Field, light metadata with graphite-aubergine product field
- Normalization: the 1570×1002 concept and 1440×920 implementation have near-identical aspect ratios. The comparison evaluates composition, hierarchy, data-channel meaning, density, and interaction affordance rather than false pixel parity. Production density remains bound to the real 50-node Public projection.
- Full-view comparison evidence: both source and implementation were opened at original detail in the same comparison pass. The implementation was also reopened in the in-app browser after every P0/P1/P2 correction.
- Focused region comparison: no separate crop was required. Typography, logo asset, graph labels, focus readout, scene rail, directional traces, and camera controls were individually readable in the original-resolution evidence; label geometry and minimum text size were independently measured in the rendered DOM.

## Findings

- No actionable P0, P1, or P2 visual findings remain.
- [P3] The approved concept uses denser illustrative volumes than the Public runtime.
  - Location: Home Living Graph.
  - Evidence: the concept contains illustrative micro-nodes and stronger volumetric material; the implementation exposes the actual Public 50-node graph, 42 hub edges, 12 district routes, and anonymous aggregate document marks only.
  - Classification: acceptable truth-bound deviation. Adding invented nodes, fake relations, decorative stars, or glossy material would violate the North Star. Owner mode preserves the deeper real graph locally.
- [P3] The 60 KiB CSS hard gate has 18 bytes of remaining headroom.
  - Location: built stylesheet `app.5845e6560d9fafb4.css`, 61,422 bytes.
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

5. **Passed — final comparison**
   - Home default and Link Trace show materially different scenes, nine desktop labels without collision, and visible directional evidence.
   - The visual target's hierarchy and spatial intent are preserved while false density and ornamental 3D material are intentionally excluded.

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
- `npm run test:public`: 98/98 passed.
- `npm run test:owner`: 26/26 passed.
- Public build: 77 files, 2,279,732 bytes; JS 540,217 bytes; CSS 61,422 bytes; shape validation failures 0.
- Public/Owner visual comparison completed; Owner server was terminated and port 8797 has no listener.

## Open questions

- None before Luke's visual judgment. GitHub push, PR, Pages, tag, and Release remain intentionally untouched until Gate 3 approval.

final result: passed
