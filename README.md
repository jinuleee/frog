# frog

개인용 마크다운 노트 웹앱. 노트는 비공개 저장소 `frog-notes`에 `.md` 파일로 저장된다.

## 기능
- 노트 / 보관함 / 휴지통, 고정, 검색
- `#태그`, `#업무/홈쇼핑` 같은 중첩 태그 자동 트리
- 마크다운 미리보기, 체크리스트 클릭으로 체크
- GitHub 동기화 (오프라인에서 작성 → 연결되면 자동 업로드, 같은 노트를 두 기기에서 고치면 나중 저장이 이김, 이전 버전은 frog-notes 커밋 기록에 남음)
- 테마 4종(Lily, Paper, Pond, Night) + 시스템 따라가기
- 폰 홈 화면에 앱으로 추가 가능, 노트 1개 `.md` 내보내기

## 로컬 실행
```bash
python3 -m http.server 8000   # 이 폴더에서 실행 후 http://localhost:8000 열기
npm test                      # 핵심 로직 테스트 (Node 18 이상)
```
빌드 과정 없음. 파일 그대로 배포한다.

## GitHub 연결 (기기마다 한 번)
1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
2. Repository access: **Only select repositories → frog-notes**
3. Permissions → Repository permissions → **Contents: Read and write**
4. 생성된 토큰을 frog의 설정 → GitHub 토큰에 붙여넣기

토큰은 그 기기 브라우저에만 저장된다. 기기를 잃어버리면 GitHub에서 토큰을 삭제하면 된다.

## 배포
Cloudflare Pages에 이 저장소를 연결 (빌드 명령 없음, 출력 폴더 `/`), 앞단에 Cloudflare Access로 본인 이메일만 허용.

## 포함된 라이브러리
- `vendor/showdown.min.js` — showdown v2.1.0 (MIT)
- `vendor/purify.es.mjs` — DOMPurify v3.4.17 (Apache-2.0 / MPL-2.0)
