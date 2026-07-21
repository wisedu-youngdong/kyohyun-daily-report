# 교현학원 데일리 리포트 프로젝트

## 개요
- 학원 학부모 리포트 자동 생성 웹앱
- 배포: https://dailyreportsystem.co.kr (Vercel, 구 도메인 kyohyun-daily-report.vercel.app도 계속 유효)
- 스택: React + Vite + Firebase (Firestore/Storage) + Vercel Serverless Functions
- AI: Gemini 2.5 Pro (사진 채점 분석), Gemini 2.5 Flash (코멘트 다듬기) — 둘 다 GEMINI_API_KEY 하나로 동작, Anthropic API는 안 씀

## 아키텍처 — 멀티테넌시
- Firestore가 `academies/{academyId}/students`, `.../reports` 등으로 스코프됨. 기존 flat 컬렉션은 롤백 대비로 남아있고, 이관은 `scripts/migrate-to-academies.js`(idempotent, 기존 컬렉션 삭제 안 함)로 수행
- `users/{uid}` 문서에 `role`(director/teacher 등), `academyId`, `isPlatformAdmin`을 저장 — App.jsx가 로그인 시 이 문서 하나로 라우팅/권한을 결정. 문서가 없거나 role이 없으면 접근 차단(예전엔 "문서 없으면 교현학원 원장"으로 폴백했는데, 다학원 환경에서 이 폴백이 계정을 엉뚱한 학원에 잘못 연결시키는 구멍이라 제거됨)
- 로그인 전(비인증) 화면은 academyId를 모르므로 `'kyohyun'`으로 폴백 — URL/서브도메인 기반 테넌트 구분은 추후 과제
- 브랜드 마크(파비콘/앱 아이콘)는 특정 학원 로고를 쓸 수 없어 네이비+골드 체크마크의 중립 마크로 분리(`public/favicon.png`, `public/apple-touch-icon.png`). 앱 헤더는 학원별 `academies/{id}.logoUrl`을 동적으로 읽고, 없으면 `public/kyohyun-logo.png`(정사각형 아이콘)로 폴백
- `firebase.json`은 Firestore 규칙/인덱스만 관리(`firestore.rules`). **Storage 보안 규칙은 레포에 없고 Firebase 콘솔에서만 관리됨** — `branding/{fileName}` 쓰기 허용을 콘솔에서 수동 추가해둔 상태라 `firebase deploy`로 덮어써지지 않지만, 다른 경로 추가 시 콘솔에서 직접 규칙을 고쳐야 함

## 파일 구조
- `App.jsx` (~720줄): 최상위 셸 — 인증/역할(academyId, isPlatformAdmin) 상태 관리, 탭 라우팅, 화면(views/)에 데이터 전달
- `views/` — 화면별 컴포넌트 (구 App.jsx 4,111줄을 여기로 분리)
  - `LoginScreen.jsx`, `ResetPasswordScreen.jsx`: 로그인 / 비밀번호 재설정
  - `DashboardView.jsx`: 오늘의 현황 대시보드
  - `StudentsView.jsx`, `StudentModal.jsx`, `StudentProfileModal.jsx`: 학생 목록 / 등록·수정 모달 / 상세 프로필
  - `HistoryView.jsx`: 기록 보관소
  - `SettingsView.jsx`: 설정 (로고/스킨/강사/반/학년 일괄 진급 등)
  - `DirectorView.jsx`: 원장 데일리 보고서
  - `GrowthDashboard.jsx`: 성장 대시보드, `AnalysisView.jsx`: 종합 분석(recharts 사용 — React.lazy로 초기 번들 제외)
  - `shared.jsx`: AVATARS/PRESET_SKINS/StatCard 등 화면 간 공용
- `DiagnosticReportInput.jsx` (~2100줄): 리포트 작성 화면 (사진 분석, 오답 카드, 코멘트)
- `PublicReport.jsx`: 학부모에게 공유되는 공개 리포트 (/report/:id)
- `GrowthStory.jsx`, `GrowthAward.jsx`: 성장 스토리/시상 페이지
- `tokens.jsx`: 디자인 토큰 — `C`(컬러 규칙), `RADIUS2`, `TYPE`, `SHADOW` 공용 스케일 + `T`/`R` 화면별 팔레트
- `api/analyze-photo.js`: Gemini Vision으로 채점 사진 분석 (정답/오답 판정)
- `api/polish.js`: 선생님 메모를 학부모 톤으로 다듬기
- `api/notify-question.js`: 학부모 질문 등록 시 원장 이메일 알림 (firebase-admin)
- `api/report-questions.js`: 공개 리포트 페이지에서 특정 리포트의 질문/답변 조회 (firebase-admin — reportQuestions의 Firestore list는 직원 전용이라 공개 조회는 이 프록시를 거침)
- `api/review-history.js`: 공개 성장 스토리 페이지의 "복습 효과" 그래프용 완료된 복습 이력 조회 (firebase-admin — reviews도 같은 이유로 직원 전용이라 프록시를 거침)
- `api/send-reset-email.js`: 비밀번호 재설정 이메일 발송 (firebase-admin, 서비스 계정은 base64 인코딩 env로 전달)
- `api/og.js`, `api/report-og.js`, `api/story-og.js`, `api/award-og.js`: OG 미리보기 이미지 — `api/_lib/academyName.js` 공용 헬퍼로 학원명 표시(Admin SDK 없이 Firestore REST API 사용)
- `scripts/migrate-to-academies.js`: 멀티테넌시 마이그레이션 스크립트
- `scripts/seed-emulator.js`: Firebase 에뮬레이터용 테스트 데이터 시드 (프로덕션에 연결 안 됨)
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: Firestore 규칙/인덱스 + 에뮬레이터 설정
- `vite.config.js`: 번들 청크 분리 설정 (vendor-react/firebase/ui, heic2any/recharts lazy)
- `vercel.json`: 라우팅 rewrite, 카카오톡 인앱브라우저 예외 처리, 커스텀 도메인

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
1. DiagnosticReportInput.jsx / App.jsx / views/* 수정 후 반드시 `npm run build` 확인
2. Gemini API 호출 시 `responseMimeType: 'application/json'` + 이미지 동시 사용하면 400 오류 발생 가능 (실험적으로 만들었던 문항 좌표 추출 기능이 이 이슈로 제거됨) — analyze-photo.js는 현재 정상 작동 중이므로 그대로 유지
3. Vercel 함수 body size 기본 4.5MB 제한 — api/analyze-photo.js에 `export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }` 설정되어 있음
4. 카카오톡 인앱브라우저 관련 vercel.json 수정 시, "Kakaotalk" user-agent를 봇 리다이렉트 목록에 넣지 말 것 (흰 화면 버그 원인이었음)
5. Vercel Hobby 플랜은 서버리스 함수(api/*.js) 최대 12개 제한 — 새 api 파일 추가 전 개수 확인(`ls api/*.js | wc -l`), 넘으면 죽은 함수부터 정리. 현재 12개로 한도에 딱 닿아 있어서, 다음 api 파일을 추가하려면 먼저 기존 것 중 하나를 정리해야 함
