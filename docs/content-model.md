# Atlas v8.1 content and space model

The browser reads the reviewed `public/data/content.json`, `evidence.json`, `islands.json`, and `map.json`. The narrative dataset contains 38 content nodes, 23 readable evidence records and 51 exact excerpts. Space and map records link to these same identities. Private research inventories, source snapshots, source locations, and exclusion dictionaries do not belong in this repository or the built site.

Groot's seven nodes comprise its introduction and six philosophy and judgment research stories: the roots of judgment, thinking through play, context, appropriate reliance, transfer and updating judgment. Game, character and implementation-progress exhibitions are outside the current publication scope.

## Space and map contracts

`IslandSpec` binds each island to its own scene, entry camera, allowed camera range, paths, physical places, collision file and orthographic map. `KnowledgeObject` binds an actual named object surface to reviewed content and explicit actions. Sub-interactions can point to an existing paragraph or a guide action without inventing another story node.

`AtlasMapEntry` records a safe display name and selected real containment. The map contains 51 reviewed locations and 50 containment edges. Editorial topic links and the designed island layout remain separate. Atlas itself runs outside the Vault and has no fabricated Vault folder.

The world, island, map, search and Reader share story/evidence IDs. Current story addresses remain valid. Retired story addresses show a safe notice with links to the world and static Reader; retired content is not republished. Island and map routes store their own selection and camera state; closing the Reader restores the saved island and view. The static Reader remains available when WebGL fails.

Spatial checks live in `scripts/validate-islands.mjs`. `scripts/validate-assets.mjs` checks embedded images, allowed metadata, physical interaction identities, collision solids and compressed container declarations. These checks do not claim actual ray hits, decoded compression equivalence, frame rate or visual quality; those require separate runtime evidence.

## Runtime API

`src/content.ts` directly imports the two JSON files and exports:

- `AtlasNode`, `EvidenceRecord`, and `ProjectId` types.
- `content`, `nodes`, `nodeById`, and `evidenceRecords`.
- `projects`: the four entry nodes, in order: Rocket, Groot, common knowledge, Atlas. Common knowledge uses the existing `knowledge-library` foundation node. There are three independent projects.
- `projectFor(id)`: explicit routing for project, desk, horizon, knowledge, concept, and research-practice identities. It also accepts the `common` group identity. Unknown routes throw a `RangeError`; look up an incoming node ID before using it.
- `searchNodes(query, project?)`: public node text only. Search normalizes compatibility forms, case, and whitespace; it accepts Korean initial consonants and project-name aliases. All terms must match, project filtering applies before ranking, and equal scores retain the reviewed content order.
- `evidenceFor(nodeId)`: a fresh array of connected evidence records. Unknown nodes return an empty array.
- `artworkFor(nodeId)`: only the explicit reviewed asset mappings. Paths are relative to the site's base URL. The view must retain goal-art labels; assigning an image does not make it a runtime screenshot.

## Evidence in the reader

Each record includes an opaque identity, a publication title explicitly marked as edited, a basis date with its meaning, connected node IDs, a bounded claim, and limitations. `excerptParagraphs` holds exact source excerpts with a selection form and omission note. An optional `editorialExplanation` is explicitly a rewrite or translation, never a quotation.

The reader should present those two forms differently and make evidence accessible from its connected content nodes. The published excerpt itself is the readable evidence. It must not fetch a private original, reveal a local source path, or treat an inaccessible original as a hidden browser payload.

Basis dates describe the reviewed source state. They do not prove when an event happened or that a product is complete. Research scenarios, design intentions, goal images, reported partial validation, and actual delivered UI remain distinct.

## Validation

Run the portable structural checks and focused tests with Node 24 or a Node version that supports TypeScript type stripping and JSON import attributes:

```sh
node scripts/validate-content.mjs
node --test tests/content.test.mjs
```

The validator checks the approved first-party node allowlist, release counts, duplicate and dangling references, evidence coverage for every node, allowed object fields, excerpt/editorial separation, dates, generic URL/path/embedded-payload restrictions, and relationship vocabulary. Unknown fields are rejected at every schema level. It scans all public prose, including captions, basis notes, limitations, and explanations.

Release-time private checks are optional inputs to the same local command:

```sh
node scripts/validate-content.mjs \
  --private-patterns "$ATLAS_PRIVATE_PATTERNS" \
  --private-evidence-map "$ATLAS_PRIVATE_EVIDENCE_MAP"
```

The variables name local input files prepared outside the public repository. The CLI also reads these environment variables when the flags are omitted. A pattern file has a `patterns` array whose entries contain `pattern` and optional `flags` (`iu` by default). Policy names and matched content are never printed; findings use ordinal policy identifiers. Do not copy the dictionary into source, tests, fixtures, or public assets.

The private evidence mapping binds each public quote to frozen source byte length, SHA-256, Unicode code-point positions, line positions, and excerpt hash. Verification reads those inputs locally and outputs only the status and issue locations. It does not write or copy private bytes. Code-point offsets intentionally differ from JavaScript UTF-16 offsets when supplementary Unicode characters precede an excerpt.

Without those inputs, the CLI reports `privateDictionary: not_provided` and `exactSourceProof: not_run`. Structural validity alone is not a semantic publication review, an exact-source proof, or actual browser QA. Any source or scope change needs a renewed editorial review; passing counts must not substitute for it.

## Change ownership

The approved content and evidence are selected inputs, not folder exports. A new node, outside reference, source quotation, asset, or claim of completion requires an explicit content review before updating the first-party allowlist. Review the actual meaning of the changed text, then validate the data and its evidence. Keep source discovery and private provenance outside the browser build.
