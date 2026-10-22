# frog

개인용 마크다운 노트 웹앱. 노트는 비공개 저장소 `frog-notes`에 `.md` 파일로 저장된다.

## 기능
- 노트 / 보관함 / 휴지통, 고정, 검색
- `#태그`, `#업무/홈쇼핑` 같은 중첩 태그 자동 트리
- Bear 방식 실시간 마크다운: 제목 1~6, **굵게**, _기울임_, ~밑줄~, ~~취소선~~, ==형광펜==, `코드`, [링크](주소), [[노트 링크]], 각주[^1], 목록·번호·할 일, 인용, 구분선, 코드 블록, 이미지 — 기호는 커서가 있는 줄에서만 보임
- 체크박스 클릭, 목록 자동 이어쓰기, 되돌리기
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
빌드 없이 폴더 그대로 올리는 정적 사이트. 저장소가 공개면 GitHub Pages(Settings → Pages → main / root), 비공개면 Cloudflare Pages(빌드 명령 없음, 출력 폴더 `/`).

외부 라이브러리 없음.
