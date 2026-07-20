# Homi Vault Atlas

Homi Vault Atlas는 Human–Agent 협업과 공개 가능한 지식 집계를 함께 보여주며, 누가 방향과 책임을 맡고 그 활동이 어떤 관계와 흐름을 거쳐 지식으로 축적되는지 탐색하는 인터랙티브 지도입니다.

이 저장소에는 **공개 앱과 공개 안전 집계 데이터만** 포함됩니다. 로컬 문서 본문, 원본 경로, 개인 식별자, 현재 운영 상태와 내부 검증 기록은 포함하지 않습니다. 저작권자와 브랜드 제작자 표기는 권리·출처 고지를 위해 `NOTICE`에만 명시합니다.

## Product surfaces

제품명과 navigation label은 영어로 고정합니다. 상단 제품명은 `Homi Vault Atlas`, 주요 navigation은 `Explore · Observe · Flow · Time · Agency · Search`입니다.

공개 제품은 다음 여섯 workspace로 구성됩니다.

- `Home`: 공개 스냅샷의 구조, 핵심 지표와 근거형 인사이트
- `Explore`: 공개 City 지도. 계보와 성운은 공개 메뉴와 번들에 포함하지 않음
- `Observe`: 전역 관계 행렬과 선택 관계의 방향·강도
- `Flow`: 공개 가능한 역할 경로와 교차 의미
- `Time`: 기록된 변화만 보여주는 Era 증거 층
- `Agency`: Luke와 여섯 전문 actor의 안정된 책임·소유 표면을 보여주는 release-capture 투영

이전 Explore 계보·성운 deep link는 빈 화면을 만들지 않고 City로 안전하게 이동하며 안내를 표시합니다. `Search`는 workspace가 아니라 여섯 workspace를 탐색하는 전역 명령 표면입니다.

## 로컬 실행

```bash
npm ci
npm run typecheck
npm test
npm run build
```

빌드 결과는 `dist-public/`에 생성됩니다. `index.html`은 정적 호스팅과 GitHub Pages에서 동작합니다.

## Release evidence

CI와 Pages workflow는 배포 후보 commit SHA를 `ATLAS_SOURCE_COMMIT`으로 결속해 정규화된 정적 `tar.gz`, `SHA256SUMS`, `release-artifact-manifest.json`을 생성하고 즉시 역검증합니다. PR evidence에는 정확한 `dist-public/`, publication audit, browser QA와 release manifest를 함께 보존합니다.

Pages 배포 뒤에는 별도 read-only job이 실제 URL의 모든 JSON·JavaScript 바이트, public snapshot digest와 `#agency?scene=system` 진입 shell을 같은 commit-bound 번들과 대조합니다. 이 gate는 tag·GitHub Release를 만들거나 실패 시 자동 revert하지 않으며, 이후 통제된 release 단계가 검증 receipt를 소비합니다.

## 데이터 경계

공개 데이터 계약과 제외 범위는 [docs/data-boundary.md](docs/data-boundary.md)를 참고하세요. `public-safe/data/publication.json`은 현재 공개 snapshot digest와 redaction count를 기록하며, `atlas.agency.v1`은 지식 문서가 아닌 공개 안전 책임 집계입니다.

JSON이 각 공개 pack의 유일한 권위 데이터입니다. file URL 지원용 JavaScript wrapper는 대응 JSON의 정확한 바이트에서 생성되며, build audit가 JSON/JS deep equality와 hash 결속을 모두 검사합니다.

## 권리와 브랜드

이 저장소에는 별도 오픈소스 라이선스가 부여되지 않았습니다. Homi AI 브랜드 자산의 출처와 사용 경계는 [NOTICE](NOTICE)에 명시되어 있습니다.
배포 번들에 실제로 포함된 오픈소스 패키지와 font asset의 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)와 생성된 `licenses/`에서 확인할 수 있습니다.
