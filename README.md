# Homi Atlas

함께 연구하고 만드는 일을 하나의 세계에서 살펴보는 프로젝트 아틀라스입니다. Rocket의 연구 관측소, Groot의 항구, 살아 있는 지식 기반, Atlas의 지도 제작소를 탐험하고 이야기와 선별된 근거를 읽을 수 있습니다.

[Homi Atlas 열기](https://luke-940.github.io/homi-vault-atlas/)

## 로컬 개발

Node.js 24와 npm을 사용합니다.

```sh
npm ci
npm run build
npm run dev
```

```sh
npm run typecheck
npm run validate
npm test
npm run build
```

`public/data`에는 공개용으로 선별한 프로젝트 자료만 둡니다. 사이트는 해당 자료를 이용하며, 원본 지식 저장소를 직접 읽지 않습니다. 탐색과 자료 읽기는 같은 데이터에서 만들어집니다.

## 배포

수동 릴리스 workflow가 검토된 `main` 커밋을 한 번 빌드합니다. 그 결과물의 파일 목록과 SHA-256을 확인한 뒤 동일한 파일을 GitHub Release와 Pages에 사용합니다. 배포 주소의 실제 바이트 확인을 통과하면 Release를 공개합니다.

이전 세대의 공개 자료로 자동 복귀하지 않습니다. 자세한 절차와 실패 시 처리 방식은 [릴리스 문서](docs/release-process.md)에 있습니다.

시각 품질은 실제 브라우저에서 확인합니다. 빌드나 데이터 검증의 성공만으로 화면의 완성도를 판단하지 않습니다.
