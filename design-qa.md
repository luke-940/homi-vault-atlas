# Homi Vault Atlas v7.7 — Visual and Interaction Regression Recovery

## Status

- The earlier `Pass 3 — passed` judgement is withdrawn.
- It fixed the wording and protagonist choice, but left a visual and interaction regression:
  glossy ringed nodes, a diagram-like grid, flatter composition, and a camera sample that was incorrectly called healthy.
- This document records the bounded recovery. It is not a release PASS and does not replace Luke's visual decision.

## Visual source of truth

- Praised v7.5 Home:
  `/Users/gangjaeseong/Documents/Codex/2026-07-15/homi-atlas-builder-1/outputs/rel-atlas-v7-5-20260721-01/visual-audit/final-fresh-capture/home-1440x920.png`
- Regressed v7.7 candidate:
  `feedback-round-3/01-regressed-current.png`
  - SHA-256 `01ef7b9fbbbe444b51d0143a8a6a8591d293a4badc5a2cda63946d59e0b8224e`
- Restored Home candidate:
  `feedback-round-3/14-final-v75-home-stage-restored.jpg`
  - SHA-256 `30b0bb43e9a452276ad93c1a031e4347792a30411f0b1d40d9933e4d66f321f0`
- Restored and connected Explore candidate:
  `feedback-round-3/15-final-v75-explore-stage-connected.jpg`
  - SHA-256 `255304885b78ec976920836d77aa8a1492adb8dc778cf86be710b18f18f2623a`
- Same-frame Home comparison:
  `feedback-round-3/12-v75-v77-restored-side-by-side.png`
  - SHA-256 `8239a3a4e833af11615b21db88efc8c9816da34ab039445c9efb55731fbca6a9`

The final two capture files use the `.jpg` extension because the in-app browser
returned JPEG/JFIF bytes. A screenshot filename is not treated as evidence unless
its actual file signature matches the extension.

## What was wrong

1. The first correction only repaired the first paragraph of Luke's feedback:
   generic domain wording replaced misleading example subtitles and `OpenAI`
   stopped being the hard-coded default protagonist.
2. The new active renderer still replaced the praised v7.5 spatial language with
   glossy rings, repeated circles, a Cartesian-looking perspective grid, and
   flatter clustering.
3. The reported `316 ms / 2 camera frames` drag was not a performance success.
   It implied roughly six visible updates per second and should have failed review.
4. Explore defaulted to zero semantic lines after the renderer swap, so it
   visually exposed nodes without their actual relationship field.

## Recovery

- Home, Explore, Explore Constellations, and Flow now use the existing
  v7.5 `LivingGraphCanvas` spatial renderer again.
- v7.7 meaning, title, Signals, protagonist, filtering, URL, and evidence logic
  stay in place; only the regressed visual/runtime renderer was removed from
  active product surfaces.
- Home again uses the warm graphite field, node-local light, restrained material,
  authored perspective depth, real Homi provenance mark, and v7.5 camera behavior.
- Persistent Home labels are limited to MOC, Papers, and Signals by default;
  `Strategy 구역` no longer appears as a fourth core-domain label.
- The focused evidence strip no longer collides with the Homi provenance beacon.
- Explore now renders exactly 24 real `atlas.graph.v1` reference commands by
  default. Selection is deterministic, gives every represented cluster an
  incident-edge opportunity, then fills by actual occurrence strength.
- Focus, preview, and directed path still replace the overview with exact factual
  relationships. No decorative, membership, association, or Homi knowledge edge
  was introduced.
- Unused Semantic Observatory CSS is no longer shipped.

## Targeted interaction evidence

- Home, 49-point camera drag: `46 ms` wall time.
- Explore, 49-point camera drag: `85 ms` wall time.
- Both kept the committed URL unchanged during drag.
- Home preview still returns to the committed state on pointer leave and does not
  move the camera or persistent labels.
- These are bounded interaction samples, not a 300-pointer performance claim and
  not a substitute for the later full visual matrix.

## Mechanical verification

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 32 source contracts checked.
- Targeted owner/runtime/QA tests: PASS, 68/68, worker 1.
- Owner graph: 660 nodes / 3,644 actual directed edges / 6 verified routes.
- Owner JavaScript: 553,634 bytes raw.
- Owner CSS: 59,983 bytes raw.
- The regressed intermediate bundle was 575,714 bytes JS and 61,256 bytes CSS.
- Recovery removed 22,080 bytes of active JS and 1,273 bytes of CSS.
- CSS is now below the 60 KiB hard gate of 61,440 bytes.
- No repeated local matrix, 24×5 run, GitHub workflow, or deployment was executed.

## Remaining boundary

- Full viewport/state visual QA has not been rerun.
- Explore relationship storytelling still needs Luke's visual judgement; the
  recovery proves factual connection presence and restores the spatial stage,
  but does not self-approve taste.
- Publication audit and production readiness are not claimed.
- GitHub branch, PR, Pages, tag, and Release mutation remain 0.

final result: targeted regression recovery passed; Gate 3 pending Luke

## Feedback round 4 — bounded visual polish

- Home hierarchy was tightened without changing the approved spatial composition:
  headline rendering is crisper, explanatory copy is more readable, and the
  evidence rail now sits on a restrained graphite fade instead of disappearing
  into the graph.
- Workspace camera framing now gives Explore more usable vertical space and
  reduces the empty lower half without changing any graph coordinate.
- Hover evidence uses a denser editorial tooltip and is clamped below the command
  rail, preventing the previous filter/tooltip collision.
- No node, edge, label, selection, or URL semantics changed.
- 49-point drag samples: Home 69 ms, Explore 85 ms.
- Console warning/error: 0 on the captured Home and Explore states.
- Targeted owner/runtime/QA tests: PASS, 68/68, worker 1.
- Owner JavaScript: 553,784 bytes raw.
- Owner CSS: 60,135 bytes raw, below the 61,440-byte hard gate.
- Evidence:
  - `feedback-round-4/01-home-polished.jpg`
  - `feedback-round-4/02-explore-polished.jpg`
  - `feedback-round-4/03-home-hover-polished.jpg`
  - `feedback-round-4/04-explore-hover-polished.jpg`

Round 4 is a desktop Home/Explore polish check. It does not claim the full
viewport matrix or release approval.
