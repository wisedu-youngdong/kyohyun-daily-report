# 교현학원 데일리 리포트 프로젝트

## 개요
- 학원 학부모 리포트 자동 생성 웹앱
- 배포: https://dailyreportsystem.co.kr (Vercel, 구 도메인 kyohyun-daily-report.vercel.app도 계속 유효)
- 스택: React + Vite + Firebase (Firestore/Storage) + Vercel Serverless Functions
- AI: Gemini 2.5 Pro (사진 채점 분석), Gemini 2.5 Flash (코멘트 다듬기) — 둘 다 GEMINI_API_KEY 하나로 동작, Anthropic API는 안 씀

## 파일 구조
- `App.jsx` (~3800줄): 메인 앱, 학생/강사 관리, 대시보드, 라우팅
- `DiagnosticReportInput.jsx` (~1900줄): 리포트 작성 화면 (사진 분석, 오답 카드, 코멘트)
- `PublicReport.jsx`: 학부모에게 공유되는 공개 리포트 (/report/:id)
- `GrowthStory.jsx`, `GrowthAward.jsx`: 성장 스토리/시상 페이지
- `api/analyze-photo.js`: Gemini Vision으로 채점 사진 분석 (정답/오답 판정)
- `api/extract-regions.js`: (실험적, 현재 미사용) 문항 좌표 추출
- `api/polish.js`: 선생님 메모를 학부모 톤으로 다듬기
- `api/narrative.js`, `api/og.js`, `api/report-og.js`: 기타 API
- `vite.config.js`: 번들 청크 분리 설정 (vendor-react/firebase/ui, heic2any lazy)
- `vercel.json`: 라우팅 rewrite, 카카오톡 인앱브라우저 예외 처리

## 현재 핵심 이슈 (진행 중)
1. **채점 AI 정확도**: Gemini가 문항 번호 옆 "짧은 빗금"을 가끔 놓쳐서 오답을 정답으로 오인식.
   - 완화책: 이미지 해상도 1800px, Few-shot 예시로 프롬프트 강화 (api/analyze-photo.js)
   - 근본 대응책: 정답/오답 토글 버튼으로 선생님이 직접 수정 가능 (DiagnosticReportInput.jsx)
2. **문항 정렬**: problemTypes/wrongItems 모두 number 기준 오름차순 정렬 필수
3. **인덱스 매칭 버그 패턴**: 정렬된 배열을 화면에 렌더링할 때, 수정 핸들러는 절대 배열 인덱스(idx)가 아니라 고유 키(item.number)로 매칭할 것. (과거 이 버그로 다른 카드가 반응하는 문제 있었음)

## 이미지 처리 파이프라인
- HEIC/HEIF → heic2any로 JPEG 변환 (lazy import, 초기 번들 제외)
- browser-image-compression: maxWidthOrHeight 1800px, quality 0.88, maxSizeMB 0.8
- 썸네일은 canvas로 별도 생성 (300px) — imageCompression 2회 호출 방지해 속도 개선
- 파일 선택 즉시 File→ArrayBuffer 병렬 변환 (모바일에서 File 객체 타임아웃 방지)
- MAX_PHOTOS = 5장

## 코멘트 생성 루트 (단일화됨)
사진 분석 → 오답 카드(태그+메모 입력) → [오답 분석 기반 코멘트 생성] 버튼
→ /api/polish 호출 → 선생님 메모(teacherNote)에 자동 이어붙이기
→ [AI로 학부모 톤으로 다듬기] → 발송
(이전에 있던 "AI 코멘트 초안 생성", "draftComment 표시+이어붙이기" 버튼들은 제거됨 — 루트 하나로 통일)

## 배포 방식
- GitHub Actions 없음. Vercel이 GitHub push 시 자동 배포.
- 레포: wisedu-youngdong/kyohyun-daily-report (public)
- 로컬에서 수정 → `npm run build`로 빌드 확인 → git push → Vercel 자동 배포 (2~3분 소요)

## 작업 시 주의사항
1. DiagnosticReportInput.jsx / App.jsx 수정 후 반드시 `npm run build` 확인
2. Gemini API 호출 시 `responseMimeType: 'application/json'` + 이미지 동시 사용하면 400 오류 발생 가능 (extract-regions.js에서 이 이슈로 제거함) — analyze-photo.js는 현재 정상 작동 중이므로 그대로 유지
3. Vercel 함수 body size 기본 4.5MB 제한 — api/analyze-photo.js에 `export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }` 설정되어 있음
4. 카카오톡 인앱브라우저 관련 vercel.json 수정 시, "Kakaotalk" user-agent를 봇 리다이렉트 목록에 넣지 말 것 (흰 화면 버그 원인이었음)
