# Homi Vault Atlas

Homi Vault Atlas는 Homi Vault의 실제 지식 구조를 사람이 발견하고 이해할 수 있는 공간으로 번역하는 인터랙티브 지도입니다. v7.8은 MOC, Papers, Signals, Rocket, Groot, Intelligence Layer와 연결된 전략 인사이트를 하나의 결정론적 3D 지형에서 보여줍니다.

이 저장소에는 공개 앱과 공개 안전 projection만 포함됩니다. 문서 본문, frontmatter, 내부 경로, 개인정보, 비밀, receipt, Batch/cursor, 명령 이력과 실시간 운영 상태는 포함하지 않습니다.

## Product experience

제품명과 navigation은 영어, 설명과 증거 해석은 한국어를 사용합니다.

- `Home`: 동일한 전체 지형을 `Whole Vault · Knowledge Core · Project Frontiers · Agent Stewardship` 네 렌즈로 읽습니다.
- `Explore`: 실제 안전 제목, 영역 필터, 검색, focus와 방향 관계를 같은 3D 공간에서 탐색합니다.
- `Observe`: 영역 간 directed relation matrix와 정확한 pair lens를 제공합니다.
- `Flow`: 실제 cross-domain reference만 검증된 경로로 표시합니다.
- `Time`: 파일 mtime이 아닌 release capture 사이의 검증된 구조 변화만 설명합니다.
- `Agency`: Luke와 전문 역할의 책임·경계·공개 결과를 지식 링크와 분리해 보여줍니다.
- `Search`: 안전한 지식 제목과 운영 역할을 찾고, 선택할 때만 workspace 이동을 확정합니다.

데스크톱과 태블릿의 Home·Explore는 직접 Three.js renderer를 지연 로드합니다. `820px` 이하와 WebGL 실패 환경은 같은 graph와 URL state를 사용하는 Canvas2D sibling으로 전환합니다.

## Data profiles

- `atlas-public`: GitHub Pages에 배포할 실제 안전 제목, 방향 관계, coverage 설명
- `atlas-owner`: Luke의 Mac에서만 생성하는 더 깊은 내부 지형

두 profile은 같은 compiler를 사용하지만 Owner bytes는 Git, Actions artifact, Pages, tag와 GitHub Release에 들어갈 수 없습니다. 각 Markdown은 `named / aggregate / excluded` 중 정확히 하나로 reconciliation되며 `unclassified > 0`이면 빌드가 중단됩니다.

Runtime packs:

- `atlas.graph.v2`: compact string/index arrays, actual directed references, deterministic 3D coordinates와 camera bookmarks
- `atlas.meaning.v2`: 실제 graph edge에 결속된 의미·story layer
- `atlas.inventory.v1`: physical/named/aggregate/excluded reconciliation
- `atlas.agency.v1`: knowledge count와 분리된 공개 안전 역할 경계
- `atlas.publication.v2`: snapshot digest와 publication blockers

JSON이 유일한 감사 데이터이며 `file://` 지원용 JavaScript wrapper는 해당 JSON의 정확한 bytes에서 생성됩니다.

## Local verification

```bash
npm ci
npm run verify
npm run qa:local
```

`npm run verify`는 source contract, typecheck, public tests, build와 publication audit를 실행합니다. `qa:local`은 이미 검증된 정적 bytes와 budget을 결속하며 시각 QA를 주장하지 않습니다. 실제 시각·interaction QA는 로컬 Browser와 PR의 단일 직렬 browser matrix에서 별도로 수행합니다.

## Release

PR CI는 전체 public contract와 browser matrix를 정확히 한 번 실행하고 그 `dist-public/` artifact를 보존합니다. Pages workflow는 squash merge tree가 테스트된 PR tree와 같은지 확인한 뒤 동일 artifact를 재사용하며 rebuild나 QA를 반복하지 않습니다. 배포 뒤에는 production JSON/JavaScript bytes와 snapshot digest를 release artifact와 대조합니다.

공개 경계는 [docs/data-boundary.md](docs/data-boundary.md), 제품 디자인은 [DESIGN.md](DESIGN.md), 제품 계약은 [docs/ATLAS-PRODUCT-CONTRACT.md](docs/ATLAS-PRODUCT-CONTRACT.md)를 참고하세요.

## Rights

이 저장소에는 별도 오픈소스 라이선스가 부여되지 않았습니다. Homi 브랜드 자산 경계는 [NOTICE](NOTICE), 실제 배포 dependency와 font 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)와 생성된 `licenses/`에 기록됩니다.
