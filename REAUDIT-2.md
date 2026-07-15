# 2차 재감사 리포트 (2026-07-15, 커밋 564eb8d 기준)

UX-AUDIT.md 1~3단계가 "전체 완료"로 표시된 이후, 실제로 제대로 고쳐졌는지 + 그 사이 있었던 대규모 기능 변경(평가 1~5점 → 0~100% 슬라이더, tokens.jsx/hooks.js 공용화)이 회귀를 남기지 않았는지 4개 영역을 다시 병렬로 재감사한 결과.

> 결론: 치명적 백지화면급 이슈는 없음. 다만 실사용자(학부모)에게 잘못된 내용이 나갈 수 있는 데이터 버그가 3건, 신규생 화면이 그대로 깨지는 크래시가 1건 나옴 — 유료화 전 반드시 먼저 처리 권장.

> ✅ R1~R4 완료 — 커밋 72ceca0 (2026-07-15)
> ✅ R5~R9 완료 — 커밋 d230fe8 (2026-07-15). R10부터 이어서 진행.
> ✅ R10~R18 완료 — 커밋 7b2fcb6 (2026-07-15). R16(정사각 파비콘)은 이미지 파일 필요 — 파트너가 로고 정사각 크롭본 주시면 반영. R15(App.jsx 하드코딩 색상 140여곳)는 리스크 대비 낮은 우선순위로 보류. "낮음" 등급 중 마일스톤 계산 중복 로직 공통 유틸화는 미반영.

---

## 중간점검 (2026-07-15, 커밋 82a78b5) — 오늘 변경분 검증 결과

R1~R18 + 단원표 기능 도입 후 2방향 검증(diff 리뷰 + 데이터 흐름 추적)에서 발견된 버그 5건(M1~M5) 수정 완료:
M1 findUnitKey 오매칭, M2 자동저장 문서 중복 생성/사진 유실, M3 평가 null→0 누수, M4 커리큘럼 칩 UI 결함, M5 집계 정규화/평균 null 필터.

### 미해결 잔여 항목 (다음 사이클 후보)
- GrowthStory chapter1/chapter2 편집 UI 부재 — 마일스톤 서두/말미 문구는 AI 생성본만 노출, 강사 수정 불가 (teacherWord/nextChapter만 편집 가능). 편집 버튼 추가 여부는 기획 판단 필요
- App.jsx 구형 `rating ? :` 패턴 다수 — 정당한 0% 입력이 '-'로 표시되는 지점들 (L1356, L1184, L2520, L2693 등)
- App.jsx 단원별 집계(L3608 등 6곳)가 여전히 r.unit 원문 텍스트 기준 — unitKey 미적용 (GrowthStory만 적용됨)
- GrowthAward '개념 흡수' 마일스톤 조건이 homeworkRating >= 100 — 지표 이름과 조건 불일치 (기존 버그)
- RatingPicker 미입력 상태에서 0%를 선택하려면 슬라이더를 움직였다 되돌려야 함 (경미한 UX)
- 잘못된 unitKey가 이미 저장된 리포트가 있다면(중간점검 전 며칠 사이 생성분) 소급 재계산 스크립트 고려

---

## 최우선 (버그/회귀 — 유료화 전 필수)

### R1. [크래시] GrowthStory — 리포트 1~2건인 신규생 화면이 그대로 깨짐
- GrowthStory.jsx L159-167: 마일스톤 인덱스 계산에서 `Math.max(2, Math.floor(len*0.66))`가 리포트 개수(len)와 무관하게 최소 인덱스 2를 강제
- `len === 1` 또는 `2`일 때 `sorted[1]`/`sorted[2]`가 undefined → L269-309에서 `r.diagnosis` 접근 시 예외
- ErrorBoundary가 받아주긴 하지만 결과적으로 신규생(가장 먼저 확인하게 될 유형)의 성장 스토리 페이지가 오류 화면으로 대체됨
- 수정: `len < 3`일 때 `idx = Array.from({length: len}, (_, i) => i)`로 분기하거나 `Math.min(len-1, ...)`로 클램프

### R2. [데이터 유출 위험] api/polish.js 실패 메시지가 성공 응답과 동일 필드로 반환됨
- api/polish.js L73-76: 파싱 실패 시 `res.status(200).json({ result: '응답을 가져오지 못했습니다...' })` — 상태코드/필드명이 성공 시와 동일
- DiagnosticReportInput.jsx L452-454, L1237-1243: `data.result`가 truthy이기만 하면 무조건 정상 AI 결과로 취급 → 오류 문구가 그대로 강사 메모/학부모 발송 코멘트에 들어가고 "완료" 토스트까지 뜸
- 수정: polish.js 실패 시 `{ error: ... }` 필드 + 4xx/5xx로 통일 (analyze-photo.js는 이미 이 패턴 — 그걸 따르면 됨)

### R3. [데이터 유출 위험] 학생 전환 시 aiPolishedNote 미초기화 → 이전 학생 AI 코멘트가 다음 학생에게 넘어감
- DiagnosticReportInput.jsx L795-805 학생 전환 초기화 블록에 `setAiPolishedNote('')` 누락 (teacherNote/selectedTags 등은 초기화됨)
- handleSubmit/미리보기 모두 `aiPolishedNote || teacherNote` 우선 사용 → 강사가 학생A에서 AI로 다듬고 저장 안 한 채 학생B로 전환하면 화면상 빈 칸으로 보여도 A의 다듬은 문구가 B 리포트로 저장될 수 있음
- 참고: editingReport 로드 시엔 정확히 초기화됨(L328) — 신규 작성 플로우만 빠진 비대칭 버그
- 수정: L795-805에 `setAiPolishedNote('')` 한 줄 추가

### R4. 평가 0%가 "미입력"과 구분 안 됨 (여러 지점)
- DiagnosticReportInput.jsx L367(`isValid`), L583(저장 검증): `homeworkRating && conceptRating`가 0을 falsy로 취급 → 슬라이더로 정직하게 0% 선택해도 저장 막힘
- PublicReport.jsx L146,153: `r.homeworkRating ? homeworkPct : '-'` — 0%가 저장돼도 "미입력(-)"으로 표시
- 두 로직이 서로 다른 곳에서 암묵적으로 0을 금지값 취급 중이라 한쪽만 고치면 불일치 재발 가능
- 수정: 평가값 상태를 `null`(미입력) vs `0~100`(입력됨)으로 명확히 분리, 모든 참조를 `!= null` 체크로 통일

---

## 높음 (다음 우선순위)

### R5. App.jsx 스켈레톤 로딩이 탭마다 일관되지 않음
- 분석(583행)/설정(598행) 탭만 `dataReady` 삼항 없이 무조건 렌더 → Firestore 구독 완료 전 "데이터 없음" 화면이 잠깐 깜빡임
- 수정: 나머지 탭과 동일하게 `dataReady ? <View/> : <SkeletonBlock/>` 패턴 적용

### R6. GrowthStory saveEdit 실패 시 롤백 없음
- L58-68: Firestore 쓰기 실패해도 `narrative` state는 이미 새 값 유지 → alert만 뜨고 화면은 "저장된 것처럼" 계속 보여줌 (강사가 alert 놓치면 실제 발송 내용과 관리자 화면이 어긋남)
- 수정: catch에서 편집 전 값으로 롤백

### R7. 자동저장 타이머 의존성 배열 누락 (stale closure)
- DiagnosticReportInput.jsx L251: `attendance, arrivalTime, hasTest, testName, testScore, testRound, nextPlan, nextPlanDetail`이 의존성 배열에서 빠짐
- 이 필드들만 수정하면 effect가 재실행 안 돼 30초 후 자동저장이 구버전 값으로 나갈 수 있음
- 수정: 의존성 배열에 전체 payload 필드 추가, 또는 ref 패턴으로 전환

### R8. 사진 재분석 시 오답 카드 태그/메모 무확인 전체 삭제
- L553: 재분석 성공 시 `tags: [], memo: ''`로 무조건 초기화 — 강사가 이미 입력한 태그/메모가 확인 없이 날아감
- 수정: 재분석 전 확인 다이얼로그, 또는 기존 번호 매칭되는 항목은 태그/메모 유지

### R9. 학생 전환 시 단원(unit) 자동 불러오기가 죽어있음 + textbook/subject 초기화 누락
- L791-793에서 최근 리포트 unit을 불러오지만 바로 다음 L798에서 무조건 `setUnit('')` 재실행 → 배치 처리로 결국 항상 빈값
- 반대로 textbook/subject는 초기화 로직 자체가 없어 새 학생에게 이전 학생 값이 남아있을 수 있음
- 수정: 초기화 순서 조정 + textbook/subject도 명시적 초기화

---

## 중간 (UI 폴리싱/일관성)

- **R10.** GrowthAward.jsx가 tokens.jsx(R 팔레트/ReportCard)를 전혀 안 씀 — 색상 리터럴 중복, 브랜드 컬러 변경 시 이 파일만 누락 위험
- **R11.** GrowthAward 로딩이 텍스트뿐 (PublicReport만 카드형 스켈레톤 적용됨) — 3개 학부모 페이지 로딩 경험 불일치
- **R12.** 재시도 버튼 방식 불일치 — GrowthStory/Award는 `window.location.reload()`(풀 리로드), PublicReport는 `retryKey` 소프트 리트라이
- **R13.** GrowthAward 저대비 텍스트 다수 (흰색 alpha 0.2~0.35, 9~11px) — 40~50대 학부모 가독성 재확인 필요
- **R14.** tokens.jsx에 RADIUS/FONT export가 계획(3-12)과 달리 없음 — T/R만 존재, radius/폰트 스택은 여전히 각 파일에 중복
- **R15.** App.jsx에 하드코딩 hex 색상 107건 잔존 — tokens.jsx 도입이 부분 적용 상태
- **R16.** index.html 파비콘/apple-touch-icon이 정사각형이 아닌 기존 로고(371×172) 그대로 사용 — iOS 홈 화면 추가 시 눌리거나 잘림
- **R17.** vercel.json에 `/assets/*` (빌드 해시 파일) 캐시 헤더 없음 — `/avatars/`만 커버 중
- **R18.** GrowthStory 슬라이더 터치 타겟 22px (44px 권장 미달), aria-valuetext 없음

---

## 낮음 (죽은 코드/사소함)

- App.jsx: `appendDraftComment` 미사용 함수 + 577행 stray `;` 잔존
- App.jsx: `padding: 'calc(6px) 0 ...'` 의미없는 calc 래핑
- GrowthStory.jsx: `generateNarrative` 함수 미사용(실제론 인라인 fetch로 재구현됨), `chapterField` 죽은 변수(chapter1/2 편집 UI 자체가 없음)
- PublicReport.jsx: `DIAGNOSIS_LABELS` 죽은 코드 (DIAG_BADGES로 대체됨)
- GrowthStory.jsx: `fontFamily`에 로드되지 않는 'Noto Sans KR' 지정 (죽은 폴백)
- GrowthAward/GrowthStory: 동일 `.find()` 조건 중복 계산 (마일스톤 로직 3파일 중복 — 공통 유틸 추출 여지)
- recharts 2.x deprecated 경고 (기능엔 문제없음, 추후 v3 마이그레이션 고려)

---

## 추천 순서

| 순서 | 항목 | 이유 |
|---|---|---|
| 1 | R1 (크래시) | 신규생이 흔히 겪는 실사용 크래시 |
| 2 | R2, R3 (학부모 발송 데이터 오염) | 실제 잘못된 내용이 학부모에게 나갈 수 있음 |
| 3 | R4 (0% 처리) | 평가 데이터 정합성 |
| 4 | R5~R9 | 자동저장/재분석/폼 초기화 등 사용성·정합성 |
| 5 | R10~R18 | UI 일관성/접근성 |
| 6 | 낮음 항목 | 여유 있을 때 정리 |
