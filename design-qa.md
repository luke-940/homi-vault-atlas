# Homi Vault Atlas v7.5 Owner — Design QA

## Visual truth

- Selected Option 1 reference: local-only concept evidence, retained outside the public repository.
- Reference SHA-256: `ba32a3c07aa00c1a5ad05139e6a6862924ee490a5efe529a3e9d655166f4af3`
- Rejected r47 baseline: `outputs/.../visual-audit/home-selected-option-1-r47-1440x920.png`
- Final default candidate: `outputs/.../visual-audit/owner-semantic-focus/home-default-1440x920-depth-beacons-r3.png`
- Final candidate SHA-256: `43e49098e898b4bf3a8b2aa8f749cdbf864bf5dbcbc3e934dd50df36f64035b3`
- Comparison method: the reference and final implementation were opened at original detail in the same comparison pass at the same desktop state. Screenshots alone were not treated as approval.

## What was corrected

1. The flat district-card treatment and opaque inspector obstruction were removed from Home.
2. The graph now uses an asymmetric authored 3D stage, warm graphite depth, real represented-record density, and node-local illumination derived from `uniqueInboundDocuments`.
3. Default Home lines are produced only by `RenderEdgeCommand` records with `atlas.graph.v1` provenance. The four strongest district pairs yield eight factual directional lanes; membership and association lines are zero.
4. Strategy, Signals, MOC, and Papers were spatially separated so real directions radiate through depth rather than forming one horizontal ribbon.
5. Hover and keyboard preview are transient. Click, Enter, and tap commit `focusId` to the URL. The evidence rail reports the real title, district, inbound, occurrence, meaningful date, and in/out counts without covering the graph.
6. Explore, Observe, Flow, Agency, and Search inherit the Home material, focus, motion, and evidence system while retaining their own analytical grammar.
7. Owner mode exposes all 628 allowed titles through search, list, and progressive disclosure. The 241 policy-excluded records remain a reason ledger and never expose prohibited content.

## Truth-bound deviation from the concept

The concept image contains an illustrative dense mesh. The final Owner RC does not fabricate that mesh. It renders 628 real represented-record marks, 639 graph nodes available through disclosure, 3,642 real directed edges in the graph, and only the semantically permitted overview corridors. This produces less line density than the illustration, but preserves the selected composition, visual depth, warmth, focal hierarchy, and interaction without false relations.

## Interaction evidence

- Default Home evidence: `Semantic overview`, four-corridor maximum, 3,642 actual references.
- MOC hover keeps the URL unchanged and reports inbound 511, occurrence 16,490, date 2026-07-10, district in 730 and out 237.
- Click commits `focus=district:owner:09fd20032153dd2c79`.
- Moving to empty graph space restores the semantic overview; Escape clears the committed focus.
- Search preview for `SI-13 - Homi Agent Memory Substrate Map` does not mutate the URL; Enter commits navigation to the exact Owner node.

## Responsive and visual geometry

Checked serially at 1440×920, 1280×720, 1180×720, 1024×768, 768×1024, 390×844, 320×844, and 844×390.

- Page horizontal overflow: 0 at every viewport.
- Visible required text below 12 px: 0 at every viewport.
- Mobile uses its dedicated sibling: editorial copy, graph, scene rail, and 44 px bottom navigation.
- Desktop inspector remains outside the plot; compact desktop uses overlay; mobile uses a bottom sheet.
- Final PNG evidence has real PNG bytes.

## Mechanical verification

- `npm run lint`: PASS, 31 source contracts checked.
- `npm run typecheck`: PASS.
- `npm run test:public`: PASS, 101/101, worker 1.
- `node scripts/run-v7-5-owner-contract-qa.mjs`: PASS, 29/29, worker 1.
- Owner build: 639 nodes, 3,642 edges, 6 verified routes.
- JavaScript: 544,841 bytes, SHA-256 `83d73793f792c61146fd41ebaed3e82ce8af881bd2ef0d4cb1f6153aa4e5059a`.
- CSS: 61,365 bytes, SHA-256 `e3d20f011249a6a18c2df97705fcc8bc74b8e4321ef4f93c30b82f4c2a84c2e2`.
- CSS is 75 bytes below the 60 KiB hard gate. The 56 KiB stretch target remains unmet and is recorded as residual risk.
- Browser warning/error log check: 0 in the representative interaction pass.
- No repeated 24×5 local performance sweep was run.

## Release boundary

- Builder visual QA: PASS.
- Luke Gate 3 visual approval: PENDING.
- GitHub branch, PR, Pages, tag, and Release mutation: 0.
- Public Pages remains v7.3.0.
- The local preview server remains intentionally active on loopback for Gate 3 and will be terminated after the handoff is closed.

final result: `builder_visual_qa_pass_luke_gate3_pending_r3`
