# v7.7 True Semantic Space — Design QA

## Comparison target

- Source visual truth:
  - `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/REL-ATLAS-V7-7-20260727-01/gate-3-rework/feedback-round-3/14-final-v75-home-stage-restored.png`
  - `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/reference-audit/tradobi-domain-map-20260727/13-tradobi-3d-1280x720.jpg`
- Implementation:
  - `http://127.0.0.1:8800/?gate3=real3d-rc1#home?scene=domain-backbone`
  - `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/REL-ATLAS-V7-7-20260727-01/gate-real3d/home-default-1280x720.png`
- Viewport and density:
  - Source pixels: `1280 × 720` for both references.
  - Implementation CSS viewport: `1280 × 720`; browser DPR `2`; captured pixels normalized to `1280 × 720`.
  - Theme/state: warm graphite light-emitting stage, Home `Domain Backbone`, default authored camera, no committed selection.
- The target is intentionally hybrid: v7.5 owns composition, negative space, typography, and ambient field; Tradobi contributes real orbit, depth, and direct spatial manipulation. Atlas does not copy Tradobi's controls, force layout, colors, or data density.

## Comparison evidence

- Full-view combined comparison:
  - `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/REL-ATLAS-V7-7-20260727-01/gate-real3d/design-comparison-1280x720-board.png`
- Focused spatial-region comparison:
  - `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/REL-ATLAS-V7-7-20260727-01/gate-real3d/design-comparison-spatial-crop.png`
- Additional implementation evidence:
  - `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/REL-ATLAS-V7-7-20260727-01/gate-real3d/explore-default-1280x720.png`
  - `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/REL-ATLAS-V7-7-20260727-01/gate-real3d/home-mobile-390x844.png`

## Required fidelity surfaces

- Fonts and typography: Pretendard/Space Grotesk hierarchy, headline wrap, small evidence type, optical weights, and Korean `keep-all` behavior remain consistent with the approved v7.5 stage. Required labels stay at 12px or above.
- Spacing and layout rhythm: narrative left rail, semantic field, right scene rail, provenance mark, and bottom snapshot boundary retain the v7.5 full-viewport composition. Explore uses a fixed inspector column rather than covering the plot.
- Colors and tokens: warm graphite, Homi amber, and stable district colors are preserved. Node light is data-bound and local; there is no decorative bloom, glossy planet material, or ambient particle system.
- Image and asset fidelity: the real Homi brand asset is reused for provenance. No emoji, fake logo, handcrafted SVG illustration, 3D model placeholder, or CSS-art planet replaces a source asset.
- Copy and content: MOC, Papers, and Signals are explicitly named; every visible relation is backed by `atlas.graph.v1`; Homi is described as provenance rather than a knowledge node.
- Interaction and accessibility: orbit, bounded zoom, local hover preview, committed keyboard selection, Escape restoration, mobile Canvas2D sibling, and the complete accessible node list are present.

## Comparison history

1. **P0 — 3D geometry absent despite WebGL canvas**
   - Earlier evidence: the shader redefined Three.js instancing attributes, producing console shader errors and leaving only halo points visible.
   - Fix: removed duplicate `instanceMatrix`/`instanceColor` declarations and revalidated on a clean browser tab.
   - Post-fix evidence: implementation screenshot above; console warning/error count `0`; all semantic node geometries visible.

2. **P1 — mobile omitted one core-domain label**
   - Earlier evidence: the 390px sibling showed Papers and Signals but collision packing suppressed the MOC label.
   - Fix: persistent core labels now receive deterministic non-overlapping fallback placement.
   - Post-fix evidence: `home-mobile-390x844.png` shows `연구 논거 구역`, `중심 지식 구역`, and `신호 구역`; horizontal overflow `0`; WebGL element count `0`.

3. **P2 — Explore stage under-filled its available spatial frame**
   - Earlier evidence: the default graph occupied roughly the central half of the plot and left excessive dead space.
   - Fix: adjusted the authored workspace camera distance and target only; graph coordinates remain unchanged and deterministic.
   - Post-fix evidence: `explore-default-1280x720.png` fills the plot while retaining command-rail and inspector clearance.

4. **P2 — semantic nodes overexposed after shader repair**
   - Earlier evidence: repaired polyhedra clipped toward white and visually overpowered the v7.5 halo field.
   - Fix: lowered tone-mapping exposure and instance-color strengths while preserving active and neighbor emphasis.
   - Post-fix evidence: full-view and focused comparisons show matte colored forms, local halos, readable labels, and restrained edges.

## Final findings

- No actionable P0/P1/P2 visual mismatch remains.
- Accepted intentional difference: the public-safe graph has 58 nodes, while the v7.5 Owner reference shows a much denser private field. v7.7 does not invent particles or duplicate nodes to imitate that density; real orbit, semantic shapes, factual edges, and progressive disclosure supply depth.
- P3 follow-up: the public default can feel quieter than the private v7.5 reference in a still image. The authored orbit and focus interaction are the intended compensating behavior, and any future density change must come from public-safe data rather than decoration.
- Automated `file://` browser capture is unavailable because the in-app browser blocks direct local-file navigation. The content-hashed IIFE loader and relative asset binding are mechanically audited; local HTTP is the visual Gate 3 surface.

## Interaction and console evidence

- Actual drag changed camera coordinates without changing focus or rebuilding scene geometry.
- Renderer returned to idle after damping settled.
- Hover changed preview/material state only; camera, URL, and scene build count remained unchanged.
- Keyboard selection committed a semantic focus; Escape restored the authored camera and cleared committed focus.
- Responsive checks:
  - `1024 × 768`: Three.js renderer.
  - `768 × 1024`, `390 × 844`, `844 × 390`: Canvas2D sibling, WebGL count `0`.
- Clean-tab console warning/error count: `0`.

final result: passed
