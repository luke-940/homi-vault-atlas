---
version: "1.0"
name: Homi Vault Knowledge Map
description: Editorial cosmic graph and evidence workbench for reading the Homi Vault as a useful public knowledge map.
colors:
  primary: "#F2ECE4"
  secondary: "#C9C0B8"
  tertiary: "#8E8681"
  neutral: "#0B090D"
  surface-deep: "#110E13"
  surface-raised: "#1C171F"
  line-context: "rgba(238, 222, 203, 0.13)"
  line-evidence: "rgba(238, 222, 203, 0.25)"
  selected: "#F0B15B"
  moc: "#E59A70"
  papers: "#91BDD9"
  signals: "#E3BE73"
  rocket: "#EE9B94"
  groot: "#A9DEB7"
  intelligence-layer: "#C8B0EF"
  strategy: "#C1AA7D"
typography:
  display:
    fontFamily: Pretendard Variable
    fontSize: 4.5rem
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: -0.055em
  title:
    fontFamily: Pretendard Variable
    fontSize: 2rem
    fontWeight: 620
    lineHeight: 1.15
    letterSpacing: -0.035em
  body:
    fontFamily: Pretendard Variable
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: -0.012em
  label:
    fontFamily: Space Grotesk
    fontSize: 0.75rem
    fontWeight: 580
    lineHeight: 1.2
    letterSpacing: 0.09em
rounded:
  none: 0px
  subtle: 6px
  control: 10px
  sheet: 18px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
components:
  focus-control:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: 10px
  dossier-dock:
    backgroundColor: "{colors.surface-deep}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    padding: 16px
---

## Overview

Homi Vault Atlas is an editorial knowledge instrument, not a landing page. It
should feel like a human-authored map of a living institution: spatial,
atmospheric, useful, and evidence-bound, while every visible mark and sentence
retains a factual job.

The signature is not a generic dark theme. It is the combination of a warm
graphite field, domain-owned color, node-local evidence light, legible negative
space, a dense but quiet reference fabric, direct Korean interpretation, and
restrained English product chrome.

## Colors

- Neutral graphite establishes depth without becoming blue sci-fi wallpaper.
- Domain hues identify MOC, Papers, Signals, Rocket, Groot, Intelligence Layer,
  and linked Strategy Insights.
- Homi amber belongs only to active selection, focus, and the provenance beacon.
- Edge opacity separates contextual structure from exact focused evidence.
- Color never carries domain, selection, or direction alone; shape, label, and
  line treatment reinforce it.

## Typography

- Korean editorial copy uses Pretendard Variable with `word-break: keep-all`.
- Product chrome and compact evidence labels use Space Grotesk.
- Every workspace uses a compact tool bar with only its name and active mode.
  Explanatory sentences may not return as oversized page headlines.
- Internal identifiers such as SI, SR, or numeric suffixes are metadata, not
  default labels.
- Essential UI and graph labels never render below 12px.

## Layout

- Home and Explore share one full-viewport graph, not separate visual worlds.
- The reading order is: whole field, domain anchors, local relation, evidence.
- Graph controls stay thin and peripheral. Fixed opaque cards may not cover the
  central evidence.
- Desktop uses an integrated typographic rail; compact desktop uses an overlay
  rail; mobile uses a bottom sheet and keeps the visualization first.
- Responsive modes are `<=820`, `821-1179`, `1180-1279`, and `>=1280`.

## Elevation & Depth

- Depth comes from actual 3D position, occlusion, parallax, relative luminance,
  and sparse local haze derived from node density.
- Drop shadows, glass cards, decorative nebulae, bokeh, star wallpaper, glossy
  planets, chrome, bloom, and unrelated particles are forbidden.
- Background atmosphere must improve spatial orientation or label safety.

## Shapes

- Node shape encodes kind, size encodes unique inbound documents, color encodes
  domain, and local halo encodes the same gravity monotonically.
- A committed selection keeps the authored geometry, but its base surface
  itself switches to an emissive interaction tone; the outer aura is secondary,
  never the selection carrier. The focal node is warm white, actual
  incoming neighbors are cool white, outgoing neighbors are amber white, and
  bidirectional neighbors are violet white. Domain color remains in the local
  halo, while unrelated nodes stay dark; transient hover never ignites the
  committed selection layer.
- Default Home has no committed node and persistently labels only one central
  anchor per published domain. Relation labels appear only during preview or
  committed focus. Graph labels contain the node title only; domain and
  incoming/outgoing metadata belong in the evidence rail or dossier.
- Every dossier state, including an unreviewed Gate 1 node, keeps a visible
  `선택 해제` action beside its title. Escape provides the keyboard equivalent.
- Homi is a small provenance mark, not a graph node.
- Far zoom may simplify geometry but may not change semantic identity.

## Components

- `SpatialStage`: one scene owner, transparent WebGL above the graphite field.
- `LensRail`: Homi Vault, Knowledge Core, Project Frontiers, Agent Stewardship.
- `EditorialRailToggle`: collapses explanatory copy into a narrow lens control rail without covering or resetting the spatial scene.
- `MapConsole`: snapshot, scale, Search, lenses, one-line interaction help, and
  coverage without a marketing hero or CTA.
- `MapIndex`: Home rail의 기본 지식 탐색기. Domain·kind facet은 노드 좌표와
  카메라를 바꾸지 않고 해당 집합의 광량만 강조하며, 제목 검색과 전체
  노드 목록은 기존 focus·dossier·실제 관계 선택으로 이어진다.
- `DossierDock`: summary, insights, Homi relevance, relationship reasons,
  caveats, evidence, and Safe Source entry without covering the plot.
- `SafeSourceReader`: semantic public-safe source sections with exact Atlas
  links and return-state restoration.
- `InsightWorkbench`: matrix, node dossier, directed relation contexts, and
  exact evidence modes.
- `SearchCommand`: previews in the existing stage and commits only on selection.
- `VaultStructure`: curated Obsidian-style folder hierarchy; location and classification only, never relationship strength.
- `MobileEvidenceSheet`: tap/focus replacement for hover-only detail.

## Do's and Don'ts

- Do show the admitted Vault as a rich whole before asking the reader to filter.
- Do use actual directed references and disclose evidence gaps.
- Do preserve the same coordinate field across every lens.
- Do make hover stable: no camera, layout, URL, or label repack.
- Do let the Home index orient the whole map before a committed dossier replaces
  it; Search text filters the list, while domain and kind facets also illuminate
  the same fixed graph.
- Don't substitute mood for data.
- Don't invent cross-project links to improve composition.
- Don't mask a safe public title; admit it unchanged or exclude it with a reason.
- Don't add version-specific class names, CSS overrides, or duplicate renderers.
