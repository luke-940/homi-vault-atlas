# Contributing

이 프로젝트의 변경은 다음 경계를 지켜야 합니다.

1. `.generated/owner`의 bytes를 Git, `dist-public`, Actions artifact, Pages 또는 Release에 넣지 않습니다.
2. `public-safe/data`에 문서 본문, 로컬 경로, 계정 식별자 또는 내부 운영문서를 추가하지 않습니다.
3. 모든 Markdown은 `named / aggregate / excluded` 중 하나로만 분류하고 `unclassified = 0`을 유지합니다.
4. 인사이트 headline은 반드시 `evidenceRefs`와 재현 가능한 metric을 가집니다.
5. 가짜 관계·구성원 없는 경로·생성형 시간 placeholder를 제품 데이터로 만들지 않습니다.
6. 새 motion은 focus travel, relation trace, verified activity 또는 history compare 중 하나의 의미를 설명해야 합니다.
7. screenshot 존재나 hash만으로 시각 PASS를 주장하지 않습니다. 독립 geometry와 동일 viewport 비교를 함께 통과해야 합니다.
8. PR 전 `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`를 모두 통과합니다.

외부 기여를 받기 전 별도 라이선스와 contributor policy를 먼저 결정해야 합니다.
