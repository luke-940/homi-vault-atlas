# Atlas v7.4 Data Boundary

Homi Vault Atlas는 canonical Vault 자체가 아니라, release capture에서 만든 읽기 전용 지식 지형입니다. v7.4는 하나의 코드베이스에서 서로 섞일 수 없는 두 프로필을 생성합니다.

- `atlas-owner`: 오너의 Mac 안에서만 사용하는 전체 구조·실측 지표·운영 집계
- `atlas-public`: GitHub Pages에 배포할 공개 승인 이름·구조적 별칭·집계 관계·커버리지 설명

Owner 산출물은 `.generated/owner`, public 산출물은 `.generated/public` 아래에 생성합니다. Owner browser reader는 고정 경계의 `.generated/owner/data`만 읽어 `.generated/owner-site`에 만들며 두 경로 모두 local-only입니다. Owner bytes는 Git tracked source, `public-safe`, `dist-public`, Actions artifact, Pages, GitHub Release에 들어갈 수 없습니다.

## Release capture

프로필 생성 전 다음 입력을 읽기 전용으로 두 번 읽습니다.

- 백업과 도구 설정 폴더를 제외한 live Vault Markdown inventory
- Memory Engine database
- activity event/state ledger

두 번의 파일 목록·bytes·SHA-256·semantic structure가 다르면 torn read로 판정하고 RC를 폐기합니다. 생성 단계에서도 capture manifest의 각 SHA를 다시 확인하며, source drift가 있으면 재캡처 전까지 중지합니다.

## Public contracts

### `atlas.inventory.v1`

각 Markdown은 프로필마다 정확히 한 번 `named`, `aggregate`, `excluded` 중 하나로 분류됩니다.

제외 사유 우선순위는 다음으로 고정합니다.

1. `archive`
2. `scaffolding`
3. `control_internal`
4. `raw_daily`
5. `explicit_policy`
6. `public_name_not_approved`

`physicalMarkdownCount = namedCount + aggregateCount + excludedCount`가 아니거나 `unclassifiedCount > 0`이면 빌드를 차단합니다. 폴더별 coverage도 같은 합계와 일치해야 합니다.

### `atlas.structure.v2`

지원 node kind는 다음으로 제한합니다.

- `district`, `moc_hub`, `paper_gateway`
- `strategy_insight`, `strategy_request`
- `project`, `project_stage`
- `signal_domain`, `signal_storyline`
- `source_document`, `aggregate_boundary`

문서의 기본 부모는 하나뿐이며 다중 소속은 `associations` edge로 분리합니다. 유일하게 해석된 canonical wikilink가 허브 사이를 연결하면 방향과 occurrence weight를 가진 `references` association으로 집계합니다. Public은 allowlist를 통과한 허브끼리의 edge만 내보내며 원문 path는 내보내지 않습니다. 중요도는 `uniqueInboundDocuments`, 링크량은 `inboundLinkOccurrences`로 별도 표시하고 두 단위를 합산하지 않습니다. actor는 structure node나 relation count에 포함하지 않습니다.

### `atlas.activity.v1`

Owner 전용입니다. 검증된 event ledger를 역할·단위 유형·상태·날짜별 건수와 lifecycle로만 집계합니다. 작업 ID, event ID, receipt, 원문 경로, hash, Batch/cursor는 포함하지 않습니다. `activity.json` 또는 `activity.js`가 public data root에서 발견되면 audit가 실패합니다.

### Public title policy

`public-title-allowlist.v1`은 `safe_hybrid` 모드입니다. 승인된 제목만 실제 이름으로 사용할 수 있고, 그 밖의 항목은 구조적 별칭이나 집계로 내려갑니다. Obsidian graph hidden 상태는 공개 허가로 사용하지 않습니다.

## 정확한 지표 의미

- `uniqueInboundDocuments`: 해당 대상에 하나 이상 링크한 고유 source 문서 수
- `inboundLinkOccurrences`: 해당 대상으로 향한 모든 wikilink 출현 횟수
- `lastMeaningfulDate`: frontmatter의 의미 날짜 또는 날짜형 Daily/Weekly 경로
- 날짜 근거가 없으면 `null`; 0일 또는 비활성으로 추정하지 않음
- filesystem mtime은 최신성 계산과 공개 bytes에 사용하지 않음

## 공개 허용 범위

- 여섯 공개 knowledge entity와 기존 `atlas.agency.v1` 역할 경계
- 전체 physical inventory 대비 named·aggregate·excluded coverage
- 승인된 일반 구조명과 구조적 별칭
- 실제 실측값을 집계한 지형 중력·링크 출현·semantic freshness
- 문서 본문을 포함하지 않는 district/hub/project 집계

## 공개 금지 범위

- 문서 본문, frontmatter, private alias/tag, 승인되지 않은 원문 title
- 원본 path와 source document identifier
- macOS/Linux 절대경로, Windows path, UNC path, file URL
- 이메일, 전화번호, IP, JWT, token, secret/private key
- raw Daily, archive, backup, control-plane 원문 event
- 세션·task·thread·work order·lease·Batch·cursor·receipt·source hash
- 현재 작업 목록, online 상태, 명령 이력, thought trace
- Owner activity/source index 및 `.generated/owner`의 모든 bytes

## JSON authority와 wrapper

각 `data/<pack>.json`이 유일한 감사 대상입니다. file URL용 `data/<pack>.js`는 JSON의 정확한 bytes로부터 생성하며 marker에 JSON SHA-256을 결속합니다. Audit는 JSON/JS deep equality, exact embedded bytes, generated/public-safe/dist의 byte equality, stale output을 모두 검사합니다.

Public pack은 `agency`, `bootstrap`, `inventory`, `structure`, `relation`, `flow`, `temporal`, `entity`, `health`, `insight`, `publication`입니다. `activity`는 이 목록에 들어갈 수 없습니다.

Public `flow.routes`는 `references` association에서 만든 실제 허브 경로만 허용합니다. null station, 역할 단계, 구성원이 없는 경로는 허용하지 않으며 검증 가능한 edge가 없으면 빈 배열입니다. 실행 pulse는 항상 metadata `null`, `chains: []`인 공개 빈 상태입니다. Public `temporal`은 허용된 chronology가 없으므로 `eras: []`, `currentEra: null`이며 날짜가 없는 변화나 생성형 자리표시자를 만들지 않습니다.

## Release blockers

- torn capture 또는 capture 이후 source drift
- inventory 합계 불일치 또는 unclassified 문서
- Owner/Public root 교차 또는 owner bytes의 Git 추적
- 공개 이름 allowlist 우회
- mtime 기반 최신성
- actor와 knowledge count 혼합
- JSON/JS byte 불일치, stale `dist-public`, 개인정보 pattern 발견
- 공개 knowledge entity 수 또는 Agency truth contract 불일치
