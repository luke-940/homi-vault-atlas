# 동일한 결과물을 Release와 Pages에 배포하기

릴리스 workflow는 `main`의 검토된 커밋을 한 번 빌드하고, 그 `dist`를 압축파일과 Pages 업로드에 그대로 사용한다. 후속 job은 재빌드하지 않는다. 공개 데이터의 의미 검토와 실제 브라우저 품질 확인은 릴리스 전에 수행한다. CI는 공개 저장소에 있는 선별 데이터만 검증하며 비공개 사전이나 원본 증거를 읽지 않는다.

## 입력과 산출물

Actions에서 **Release and deploy the same Atlas artifact**를 선택하고 `main`을 대상으로 실행한다. `reviewed_commit`에는 검토한 40자리 커밋 SHA, `release_tag`에는 `package.json`과 일치하는 새 `v8.x.y` 태그를 입력한다. 실행 시점 `main` SHA와 검토 SHA가 다르거나 같은 태그/Release가 이미 있으면 중단한다.

빌드가 작성한 `dist/release.json`의 커밋·버전·공개 데이터 digest를 검증한다. `dist/artifact-manifest.json`은 자기 자신을 제외한 모든 파일의 경로·byte 수·SHA-256을 기록한다. 패키징 단계는 해당 manifest까지 포함한 전체 파일 집합의 digest를 별도로 계산한다.

Release 첨부파일은 다음 네 종류뿐이다.

| 파일 | 역할 |
|---|---|
| `homi-atlas-8.x.y-static.tar.gz` | `dist`의 정확한 파일 바이트. 정렬된 USTAR, 고정 mode/uid/gid/mtime, deterministic gzip |
| `artifact-manifest.json` | 사이트 파일의 byte 수와 SHA-256 |
| `release-binding.json` | 커밋·Git tree·버전·내용 snapshot·archive digest·전체 artifact digest 연결 |
| `SHA256SUMS` | 위 세 파일의 SHA-256 |

소스 snapshot, 조사 자료, 복구 원본, 브라우저 trace, 임의 로그를 릴리스 패키지에 넣지 않는다. 패키저는 기존 산출물 덮어쓰기를 거부한다. 다른 경로에 이전 패키지를 보존하고 빈 출력 디렉터리를 사용한다.

## 실행 순서와 권한

1. `build`: `contents: read`. 의존성 설치, 타입 검사, 공개 데이터 검증, 테스트, **build 1회**, 전체 파일 검증, 패키징과 다시 읽기. 검증된 패키지와 같은 `dist`의 Pages artifact를 업로드한다.
2. `stage-release`: `contents: write`, `actions: read`. 검토된 커밋에 새 태그를 만들고 draft Release에 정확히 네 파일을 올린다. Release에서 다시 다운로드한 파일도 검증한다. 기존 태그를 이동하거나 기존 Release를 덮어쓰지 않는다.
3. `deploy-pages`: `pages: write`, `id-token: write`. build job의 동일한 Pages artifact를 배포한다. 저장소 content 쓰기 권한은 없다.
4. `readback`: `contents: read`, `actions: read`. 압축파일의 모든 파일을 실제 Pages URL에서 받아 길이와 SHA-256을 비교한다. 결과 JSON만 보존한다.
5. `publish-release`: `contents: write`. 태그가 같은 커밋을 가리키는지와 draft Release ID를 확인하고 공개한다.

workflow 전체의 기본 권한은 비어 있다. checkout은 credential을 남기지 않는다. 동시 릴리스는 직렬 처리하며 실행 중 배포를 자동 취소하지 않는다. Actions cache는 npm 의존성에만 사용하고 `dist`나 공개 데이터 캐시는 만들지 않는다.

Pages 주소와 저장소 identity는 유지한다. Pages의 기존 workflow 배포 설정과 environment를 사용하며 새 인증·권한·호스팅 설정을 만들지 않는다.

## 로컬 패키지 검증

아래 명령은 이미 만들어진 `dist`를 패키징한다. 소스 변경을 검토·커밋한 깨끗한 현재 checkout에서만 실행한다. 법적 고지의 Markdown은 `licenses/` 안에서만 허용한다. `COMMIT_SHA`에는 해당 빌드의 실제 커밋을 넣는다.

```sh
node scripts/verify-artifact.mjs --dist dist --commit COMMIT_SHA --tag v8.1.0
node scripts/package-release.mjs --dist dist --out release-artifact --commit COMMIT_SHA --tag v8.1.0
node scripts/verify-artifact.mjs --package release-artifact --commit COMMIT_SHA --tag v8.1.0
```

배포 후에는 같은 패키지를 기준으로 HTTP 바이트를 확인한다.

```sh
node scripts/verify-artifact.mjs --package release-artifact --commit COMMIT_SHA --tag v8.1.0 --url https://luke-940.github.io/homi-vault-atlas/
```

검증은 추가 파일, 빠진 파일, 중복 경로, 경로 탈출, 심볼릭 링크, 지원하지 않는 archive entry, source map/편집 원본, commit/version/snapshot 불일치를 거부한다. URL readback은 등록된 HTTPS Pages 주소만 허용한다. 개인정보나 원문 내용을 오류 메시지에 출력하지 않는다.

## 실패와 복구

build·패키지 검증이 실패하면 외부 배포가 실행되지 않는다. draft Release 준비 후 실패하면 새 태그와 draft가 남을 수 있으므로 상태를 읽어 확인한다. Pages 배포 후 readback이 실패하면 현재 사이트가 새 artifact일 수 있지만 Release는 draft 상태로 남는다. 자동으로 이전 사이트를 재배포하지 않는다.

실패한 태그를 조용히 이동하거나 자산을 교체하지 않는다. 같은 실행에서 실패 job만 다시 실행해도 `stage-release`가 기존 태그를 발견하면 멈춘다. owner가 남은 draft/새 태그/Pages 상태를 확인한 뒤, 검증된 패키지의 명시적 복구 절차 또는 새 버전의 forward fix를 선택한다.

이전 세대의 자료는 비공개 복구 기준이다. 그 자료를 공개 Pages·Release로 자동 복원하지 않는다. 신규 버전의 배포 성공과 과거 Git 이력·Release·Actions 잔존 정리는 별도 결과로 기록한다. 일반 릴리스 workflow는 Git 이력을 재작성하거나 과거 참조를 일괄 삭제하지 않는다.

## 버전 변경 시

`package.json`과 `package-lock.json`의 버전을 함께 갱신한다. 빌드는 `package.json`의 버전을 읽어 release metadata에 기록한다. `release.json`의 `contentBasis`는 실제 공개 자료 기준일을 반영하는지 별도로 확인한다. 릴리스 workflow는 버전이나 기준일을 자동으로 고치지 않는다.
