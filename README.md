# Homi Vault Atlas

Homi Vault Atlas는 팀의 지식이 어디에 모이고, 어떤 관계와 흐름을 거쳐 판단으로 이어지는지 보여주는 공개용 인터랙티브 지도입니다.

이 저장소에는 **공개 앱과 정제된 팀용 데이터만** 포함됩니다. 로컬 문서 본문, 절대경로, 수집 원문, 내부 운영·검증 기록, 개인 식별자와 보관 데이터는 포함하지 않습니다. 단, 저작권자와 브랜드 제작자 표기는 권리·출처 고지를 위해 `NOTICE`에 명시합니다.

## 화면

- `대문`: 공개 스냅샷의 지식 구조와 근거형 인사이트 4개
- `탐색`: 도시 블록, 방사형 계보, 성운 지도
- `관측`: 전역 인접 행렬과 선택 관계군
- `흐름`: Vault Metro와 공개 가능한 역할 경로
- `시간`: Era 변화 층과 전환 기록

## 로컬 실행

```bash
npm ci
npm run typecheck
npm test
npm run build
```

빌드 결과는 `dist-public/`에 생성됩니다. `index.html`은 정적 호스팅과 GitHub Pages에서 동작합니다.

## 데이터 경계

공개 데이터 계약과 제외 범위는 [docs/data-boundary.md](docs/data-boundary.md)를 참고하세요. `public-safe/data/publication.json`에는 현재 공개 스냅샷 digest와 redaction count가 기록됩니다.

## 권리와 브랜드

이 저장소에는 별도 오픈소스 라이선스가 부여되지 않았습니다. Homi AI 브랜드 자산의 출처와 사용 경계는 [NOTICE](NOTICE)에 명시되어 있습니다.
번들된 오픈소스 패키지의 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)와 `licenses/`에서 확인할 수 있습니다.
