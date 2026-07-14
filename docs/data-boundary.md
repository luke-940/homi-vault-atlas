# Public Data Boundary

## 포함

- 구역·역할별 문서 수를 합친 집계 표면과 path-free 공개 ID
- 집계된 역할, 문서량, 공개 스냅샷 경계
- 공개 가능한 구역 간 wikilink 집계
- 내부 identity를 제거한 Pulse 단계와 Era 집계
- `atlas.insight.v1`, `atlas.publication.v1`

## 제외

- 로컬 절대경로와 사용자명
- 현재 운영 원문과 파생 상태면
- 소유권, 실행 범위, 검증 영수증
- raw Daily, 이메일, 소스 본문
- 외부 협업 도구 object ID
- archive와 backup
- 문서 본문, frontmatter, alias, tag

## 공개 ID

공개 ID는 원문 문서가 아니라 `구역 × 역할` 집계 단위를 가리킵니다. 원래 path를 포함하지 않는 SHA-256 기반 stable ID를 사용하며 공개 path도 원본 위치를 복원할 수 없는 별도 namespace입니다.

## Build Gate

`scripts/audit-public-bundle.mjs`가 공개 데이터와 정적 bundle을 검사합니다. 로컬 경로, 계정 문자열, raw Daily, control surface 또는 비어 있지 않은 private metadata가 발견되면 build가 실패합니다.
