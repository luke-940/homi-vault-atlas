# Public Data Boundary

Homi Vault Atlas의 공개판은 Luke Vault의 canonical truth가 아닙니다. 공개 가능한 집계와 검증된 release-capture 투영만 제공하는 읽기 전용 제품 표면입니다.

## 포함

- 원본 path를 노출하지 않는 여섯 `구역 × 역할` 집계 entity
- 집계된 문서 수, 구역 수, 공개 가능한 구역 간 wikilink 관계
- 내부 identity를 제거한 Flow 단계와 기록 근거가 있는 Time 상태
- `atlas.insight.v1`, `atlas.publication.v1` 및 기존 `atlas.*.v1` 공개 계약
- `atlas.agency.v1`: Luke, 두 역할 그룹, 여섯 actor, 여섯 소유 표면과 검증된 방향·결과·증거 반환 관계의 공개 안전 집계

## Agency 경계

`atlas.agency.v1`은 `snapshot.live: false`인 release-capture 투영입니다. 현재 실행 현황이나 지휘 계통을 중계하지 않습니다.

- Luke는 여섯 actor 모두에게 방향을 설정하고, 각 actor는 자신의 표면을 소유하며 결과를 Luke에게 반환합니다.
- Daily Runner, Atlas Builder와 세 독립 프로젝트 actor는 검증 evidence를 Control Plane에 반환합니다.
- Control Plane의 boundary coordination은 Daily Runner에만 적용되며 형제 actor에 대한 지휘·승인 권한을 뜻하지 않습니다.
- Agency ID namespace는 공개 지식 entity ID와 분리되며 문서 본문이나 문서 단위 관계를 포함하지 않습니다.

## 제외 및 금지 필드

- 문서 본문, frontmatter, alias, tag, 원본 title과 원본 문서 ID
- macOS/Linux 절대경로, Windows drive path, UNC path와 file URL
- 개인·회사 이메일, 전화번호, IPv4/IPv6 주소
- JWT, bearer token, API key, secret key, private key와 기타 credential
- raw Daily, 수집 source 본문, archive와 backup
- Notion 등 외부 협업 도구 object ID
- 세션·task·thread ID, owner lease, current work/status, Batch/cursor와 live executor 상태
- 내부 소유 기록, canonical 경로, 운영 영수증과 검증 로그

## 공개 ID와 entity hash

공개 ID는 원문 문서가 아니라 `구역 × 역할` 집계 단위를 가리킵니다. 원래 path를 포함하지 않는 SHA-256 기반 stable ID와 별도 공개 namespace를 사용합니다.

각 공개 entity의 `sha256`은 비공개 원문 hash가 아닙니다. `sha256` 필드 자체를 제외한 공개 집계 entity의 정규화 JSON을 hash한 값입니다. Audit는 정확히 여섯 entity, 각 self-hash, 실제 entity 수, redaction count와 `publicSnapshotDigest`를 다시 계산해 receipt와 대조합니다.

## JSON 권위와 JavaScript wrapper

각 `data/<pack>.json`이 유일한 감사 대상 데이터입니다. file URL 지원용 `data/<pack>.js`는 해당 JSON의 **정확한 바이트**를 입력으로 build 시 생성합니다.

Audit는 다음을 모두 요구합니다.

- JSON byte SHA-256과 JavaScript wrapper marker의 일치
- wrapper에서 복원한 값과 JSON의 deep equality
- `public-safe/data`와 `dist-public/data`의 JSON·JavaScript byte equality
- 누락되거나 오래된 `dist-public`에 대한 즉시 실패

## Product boundary

공개 workspace는 `Home · Explore · Observe · Flow · Time · Agency` 여섯 개입니다. Explore는 City만 공개하며, 내부 제작소에 보존된 계보·성운 데이터와 UI는 공개 메뉴와 배포 번들에서 제외합니다. 이전 deep link는 City로 안전하게 이동하고 경계 안내를 제공합니다.

## Build gate

`scripts/audit-public-bundle.mjs`가 공개 데이터, 정적 bundle, content-hashed asset, 공개 repository source와 publication receipt를 검사합니다. 개인정보 패턴, 금지 운영 필드, 문서 단위 데이터, JSON/JS 불일치, 잘못된 Agency 권한 관계, hash·count 불일치, stale output 또는 공개 asset 예산 위반이 하나라도 발견되면 배포를 차단합니다.
