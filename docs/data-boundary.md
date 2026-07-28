# Atlas v7.8 Data Boundary

Homi Vault Atlas는 canonical Vault가 아니라, read-only release capture에서 생성한 버전 스냅샷입니다. 한 compiler가 `atlas-owner`와 `atlas-public`을 만들지만 두 profile의 source root와 output root는 물리적으로 분리됩니다.

## Capture invariant

- Vault source는 수정하지 않고 두 번 연속 읽습니다.
- file inventory, bytes, SHA와 graph semantics가 같을 때만 capture를 채택합니다.
- capture 뒤 source drift가 발견되면 해당 RC를 폐기하고 projection과 QA를 다시 수행합니다.
- Current State, Batch/cursor, Notion, `graph.json`, Daily, Rocket, Groot와 HIL은 Atlas가 쓰지 않습니다.

## Publication policy v2

Public은 안전 검사를 통과한 실제 이름을 기본으로 사용합니다.

- 포함 영역: MOC, Papers, Signals, Rocket, Groot, Intelligence Layer
- 조건부 포함: 위 영역과 실제 reference로 연결된 Strategy Insight
- 제외: Strategy Request, Console, raw Daily와 날짜 노트, archive, backup, template, control/governance, receipt, scaffolding
- 기본 라벨에서 제거: SI/SR와 의미 없는 numeric suffix

공개 node가 안전 검사를 통과하면 실제 제목을 유지하고, 실패하면 가명으로 바꾸지 않고 제외 사유 ledger에 기록합니다. Obsidian Graph View의 hidden 상태는 공개 허가가 아닙니다.

## Runtime contracts

### `atlas.graph.v2`

- compact string table과 index 기반 node·edge arrays
- stable node/edge ID
- actual directed reference와 occurrence
- domain, kind, unique inbound gravity, semantic zoom rank
- deterministic build-time x/y/z
- four fixed camera bookmarks
- semantic, layout와 projection digest

위치는 reference topology와 domain structure에서 계산합니다. 날짜, mtime, runtime force와 Homi provenance는 graph position이나 knowledge relation에 포함되지 않습니다.

### `atlas.inventory.v1`

각 Markdown은 profile별로 `named / aggregate / excluded` 중 정확히 하나입니다.

`physical = named + aggregate + excluded`와 `unclassified = 0`이 모두 성립해야 합니다.

### `atlas.meaning.v2`

모든 story와 강조선은 `atlas.graph.v2` stable edge ID에 결속됩니다. 합성·장식 edge는 허용하지 않습니다.

### `atlas.agency.v1`

Luke와 전문 역할의 책임·공개 결과·경계를 투영합니다. actor는 knowledge node, gravity, relation count와 matrix에 들어가지 않습니다.

### `atlas.publication.v2`

public snapshot digest, profile, blockers와 pack binding을 기록합니다. JSON이 권위 데이터이며 대응 JavaScript wrapper는 JSON의 정확한 bytes에서 생성됩니다.

## Allowed public information

- 승인된 여섯 영역과 연결된 Strategy Insight의 실제 안전 제목
- 실제 directed references와 occurrence
- unique inbound document 수와 domain/kind
- physical inventory 대비 named/aggregate/excluded coverage
- release capture 기준일과 snapshot caveat
- 공개 안전한 책임 역할명과 경계

## Forbidden public information

- 문서 본문과 frontmatter
- 원본 path, canonical filename와 Owner-only node bytes
- 개인정보, 이메일, 전화번호, IP, JWT, token, secret/private key
- Batch, cursor, work order, receipt, lease, source hash와 명령 이력
- 실시간 작업 목록, online state, thought trace와 운영 성과
- archive, raw Daily, control-plane 원문 event

## Release blockers

- torn capture 또는 source drift
- inventory 합계 불일치와 unexplained exclusion
- Owner/Public root 또는 byte crossover
- 합성·장식·Homi knowledge edge
- JSON/JS byte 불일치와 stale `dist-public`
- private body/path/PII/secret/운영 ID 노출
- budget 초과와 production byte readback 실패
