# Homi Vault Atlas

Homi Vault Atlas는 Luke와 전문 에이전트가 함께 가꾸는 Vault를 **살아 있는 지식 지형**으로 읽는 인터랙티브 지도입니다. v7.4는 공개 기록의 커버리지, 실제 허브의 중력, 검증된 관계와 책임 경계를 서로 다른 시각 문법으로 보여줍니다.

이 저장소에는 **공개 앱과 공개 안전 집계 데이터만** 포함됩니다. 로컬 문서 본문, 원본 경로, 개인 식별자, 현재 운영 상태와 내부 검증 기록은 포함하지 않습니다. 저작권자와 브랜드 제작자 표기는 권리·출처 고지를 위해 `NOTICE`에만 명시합니다.

## Product surfaces

제품명과 navigation label은 영어로 고정합니다. 상단 제품명은 `Homi Vault Atlas`, 주요 navigation은 `Explore · Observe · Flow · Time · Agency · Search`입니다.

공개 제품은 다음 여섯 workspace로 구성됩니다.

- `Home`: 구역과 공개 허브가 만드는 Living Terrain, 지식 중력, 검증 활동, 커버리지 경계
- `Explore`: `구역 → 허브 → 공개 안전 원천`의 단계형 탐색
- `Observe`: 전역 구역 관계와 선택 허브의 관계를 분리한 관측면
- `Flow`: 실제 구성원이 확인된 지식 경로만 표시하며, 근거가 없으면 정직한 빈 상태를 제공
- `Time`: 의미 있는 날짜와 lifecycle 근거가 확인된 기록만 표시하며, 부재를 0으로 추정하지 않음
- `Agency`: Luke와 여섯 전문 actor의 안정된 책임·소유 표면을 보여주는 release-capture 투영

이전 URL은 빈 화면을 만들지 않고 대응하는 v7.4 scene으로 안전하게 복구합니다. `Search`는 workspace가 아니라 여섯 workspace를 탐색하는 전역 명령 표면입니다.

## Dual-profile boundary

- `atlas-owner`: Luke의 Mac에서만 생성되는 내부 지형입니다. 전체 구조와 Owner 전용 집계를 담으며 Git, Actions, Pages, tag, Release에 들어가지 않습니다.
- `atlas-public`: 승인된 이름·안전 별칭·집계 관계·커버리지 설명만 담는 GitHub Pages 프로필입니다.

모든 Markdown은 프로필별로 `named / aggregate / excluded` 중 정확히 하나로 분류됩니다. `atlas.inventory.v1`의 합계가 일치하지 않거나 `unclassified`가 하나라도 생기면 공개 빌드는 중단됩니다.

## 로컬 실행

```bash
npm ci
npm run typecheck
npm test
npm run build
```

빌드 결과는 `dist-public/`에 생성됩니다. `index.html`은 정적 호스팅과 GitHub Pages에서 동작합니다.

## Release evidence

PR CI는 직렬 browser/geometry/visual/publication QA를 한 번 수행하고, 그 실행이 검증한 정확한 `dist-public/` artifact를 보존합니다. Pages workflow는 squash merge tree가 검증된 PR tree와 동일함을 확인한 뒤 같은 artifact를 재사용하므로 전체 QA를 다시 실행하지 않습니다.

Pages 배포 뒤에는 별도 read-only job이 실제 URL의 JSON·JavaScript bytes, public snapshot digest, Home·Agency 진입 shell을 배포 artifact와 대조합니다. 이 readback이 통과한 production commit에만 tag와 GitHub Release를 만듭니다.

## 데이터 경계

공개 데이터 계약과 제외 범위는 [docs/data-boundary.md](docs/data-boundary.md)를 참고하세요. `atlas.inventory.v1`은 전체 커버리지와 reconciliation을, `atlas.structure.v2`는 구역·허브·원천의 단일 부모 구조와 별도 association을, `atlas.agency.v1`은 지식 문서가 아닌 공개 안전 책임 집계를 기록합니다.

JSON이 각 공개 pack의 유일한 권위 데이터입니다. file URL 지원용 JavaScript wrapper는 대응 JSON의 정확한 바이트에서 생성되며, build audit가 JSON/JS deep equality와 hash 결속을 모두 검사합니다.

## 권리와 브랜드

이 저장소에는 별도 오픈소스 라이선스가 부여되지 않았습니다. Homi AI 브랜드 자산의 출처와 사용 경계는 [NOTICE](NOTICE)에 명시되어 있습니다.
배포 번들에 실제로 포함된 오픈소스 패키지와 font asset의 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)와 생성된 `licenses/`에서 확인할 수 있습니다.
