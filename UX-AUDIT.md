# UI/UX 상용화 감사 리포트 (2026-07-14, 커밋 a583c82 기준)

4개 영역(App.jsx / DiagnosticReportInput.jsx / 학부모 공개 페이지 3종 / 전역 설정)을 전수 분석한 결과.
작업량 작은 순서(1단계 → 3단계). 체크박스를 지워가며 진행.

> 라인 번호는 커밋 128f961~a583c82 기준. 수정하다 보면 밀리므로 코드 내용으로 확인할 것.
> 모든 수정 후 `npm run build` 확인 (CLAUDE.md 지침).

> ✅ 1단계(Quick Wins) 전체 완료 — 커밋 ff0001a (2026-07-14). 2단계(반응형 레이아웃)부터 이어서 진행.
> ✅ 2단계(반응형 레이아웃) 전체 완료 (2026-07-14). matchMedia 공용 훅(hooks.js) 도입, GrowthAward/드로어/테이블 모바일 대응, safe-area·100dvh 적용. 3단계(상용화 완성도)부터 이어서 진행.
> ✅ 3단계 중 3-1(에러 바운더리)·3-2(코드 스플리팅)·3-3(로딩 스켈레톤) 완료 (2026-07-14). 추가로 tokens.jsx(T/R 팔레트 + ReportCard 공용 컴포넌트) 도입해 App.jsx/PublicReport.jsx/GrowthStory.jsx 중복 제거. 3-4 이후(fetch 타임아웃, 에러/빈 상태 통일, 라이트박스 등) 남음.

---

## 1단계 — Quick Wins (몇 줄 수정, 즉시 반영)

### 1-1. [최우선·버그급] 입력 필드 font-size 16px 미만 → iOS 포커스 시 강제 줌
- DiagnosticReportInput.jsx: `inputStyle` L1889(13px), 오답 메모 L1140(11px), 진단 상세 L1222(12px)
- App.jsx: 로그인 L144·158(14px), 학생 검색 L686(13px), 기록 검색/필터 L1070–1077, PC 필터 L1203–1217, 강사 생성 L1866, date input L2975·3317, 원장 메모 L3141, 분석 select L3295
- 수정: 모든 input/textarea/select를 fontSize '16px'로. (index.html 58–60행 전역 16px 규칙이 있는데 인라인 스타일이 덮어쓰는 중 — 인라인 fontSize를 지우는 것도 방법)

### 1-2. [버그] "AI가 다듬는 중..." 문구가 발송 데이터로 저장될 수 있음
- DiagnosticReportInput.jsx L408: `setAiPolishedNote('✨ AI가 다듬는 중...')` → L594 `teacherNote: aiPolishedNote || teacherNote`
- 응답 지연 중 저장하면 로딩 문구가 학부모 리포트로 발송됨
- 수정: `polishing` state 분리, 로딩 중 textarea 대신 스피너 박스, handleSubmit에서 polishing 중 저장 차단, 버튼 disabled

### 1-3. [버그] wrongItems가 사진 삭제/학생 전환 시 초기화 안 됨
- DiagnosticReportInput.jsx L499–510(removeOnePhoto), L553–557(removeAllPhotos), L766–773(학생 전환)
- 이전 학생/삭제된 사진의 오답 목록이 새 리포트에 저장·발송될 수 있는 데이터 버그
- 수정: 세 지점에 `setWrongItems([])` 추가 (3줄)

### 1-4. [버그] 코멘트 생성 버튼 중복 제출 → 코멘트 중복 이어붙음
- DiagnosticReportInput.jsx L1147–1184: loading state 없음, 연타 시 /api/polish 다중 호출 + setTeacherNote 중복
- 수정: `generatingComment` state + disabled + '생성 중...' 라벨

### 1-5. [버그] GrowthStory 관리자 버튼이 학부모에게 노출
- GrowthStory.jsx L391–397(AI 서사 자동 생성), L586–591·618–623(편집 버튼)
- 학부모가 누르면 API 비용 발생 + 실패 시 `alert(JSON.stringify(data))`(L314) 원시 JSON 노출
- 수정: `?edit=1` 쿼리 파라미터 없으면 렌더링 안 함

### 1-6. [버그] calc 공백 누락으로 CSS 무효
- App.jsx L974: `'calc(100%+8px)'` → `'calc(100% + 8px)'` (L1772는 올바름 — 복붙 중 깨진 것)

### 1-7. [버그] document.querySelector('input[type=color]') — 엉뚱한 피커 열림
- App.jsx L1779: 컬러 input 2개 이상 렌더 시 첫 번째 클릭. useRef로 교체

### 1-8. index.html 전역 리셋 4줄 추가
- index.html 47–61행 style 블록에:
  ```css
  html { -webkit-tap-highlight-color: transparent; }
  body { overscroll-behavior-y: none; }  /* 웹뷰 pull-to-refresh로 폼 날아감 방지 */
  button { cursor: pointer; font: inherit; }
  img { max-width: 100%; }
  button:active { transform: scale(0.97); opacity: 0.85; }  /* 전역 탭 피드백 */
  ```

### 1-9. 학부모 페이지 9~10px 폰트 일괄 상향 (40~50대 학부모 가독성)
- PublicReport.jsx L129·142·149·156·168·181·216·243·256·271(9px 라벨), L146·153·158(10px), L131(11px 헤더 날짜 + 대비 부족 → 13px/opacity 0.75)
- GrowthStory.jsx L343(S.label 9px), L425·434·441·465·471(실데이터 카드 9~10px), L471 코멘트 미리보기 10px → 12px
- 기준: 영문 대문자 라벨 최소 10px, 한글 콘텐츠 최소 12px

### 1-10. 탭 타겟 44px 미만 확대
- DiagnosticReportInput.jsx: 정답/오답 토글 L1045–1050(높이 ~18px — 핵심 기능인데 가장 작음 → padding '8px 14px', fontSize 12px), 사진 삭제 X L957(22px), 진단 태그 X L1219, suggestionStyle L1913
- App.jsx: 로그아웃 L450, 학생 삭제 L749, 모달 닫기 L831·1109·1497·2401·2553, 검색 지우기 L689
- 수정: 아이콘 버튼 공통 minWidth/minHeight 44px(시각 크기 유지, 히트 영역만 확대)

### 1-11. 비활성 버튼 대비 실패 (흰 글자 on 연회색)
- DiagnosticReportInput.jsx L1921–1926, App.jsx L1494·L3148–3153, StudentModal L1521
- 수정: `color: valid ? '#fff' : '#9CA3AF'` + 비활성 사유 힌트 텍스트

### 1-12. showToast 타이머 경합
- DiagnosticReportInput.jsx L283–286: 이전 타이머 미취소로 나중 토스트가 조기 소멸. useRef + clearTimeout

### 1-13. 사진 분석/저장 버튼에 스피너 추가
- DiagnosticReportInput.jsx L990–992, L1322: 텍스트만 바뀌어 멈춘 것처럼 보임. @keyframes spin + 14px 스피너 span

### 1-14. 파비콘/애플 터치 아이콘 없음
- index.html: link rel=icon 없음, apple-touch-icon 없음 (public/에 favicon 파일 자체가 없음)
- public/favicon-192.png + apple-touch-icon.png(180px) 생성 후 link 2줄

### 1-15. 폰트 preconnect + as="style" 잔재 제거
- index.html 36–45행: cdn.jsdelivr.net / fonts.gstatic.com preconnect 추가, rel="stylesheet"의 무의미한 as="style" 제거

### 1-16. 기타 소소한 것들
- App.jsx L592: 대시보드 CTA에 cursor: pointer 누락
- App.jsx L462: 토스트 whiteSpace nowrap → maxWidth 'calc(100vw - 40px)' + normal
- App.jsx L965(8px)·L1761(9px)·L2283(10px): 극소 폰트 상향
- App.jsx L1666·L1840: 호버 전용 "2번 클릭 삭제" 힌트 + window 전역 플래그 → L737의 deleteConfirm state 패턴으로 통일
- GrowthStory.jsx L336·GrowthAward.jsx L46: 리포트 0건 시 " 선생님" 표시 → '담당 교사' 폴백
- GrowthStory.jsx L381–387: clipboard 실패 시 무피드백 → catch에 prompt 폴백 + 성공 시 토스트
- GrowthStory.jsx L73: console.log 제거
- PublicReport.jsx L86: 에러 텍스트 대비 부족 → #4B5563 / 15px
- PublicReport.jsx L190–197 vs 219–226: DIAG 맵 중복 정의 + 배지 스타일 불일치 → 상수 통합
- PublicReport.jsx L140–159: 지표 3열 padding 비대칭 → '0 8px' 통일, 출결 값 margin 0
- outline:'none' 남발(App L146·160·686 등) → onFocus/onBlur borderColor 패턴

---

## 2단계 — 반응형 레이아웃 (중간 작업량)

### 2-1. [핵심] window.innerWidth 렌더 1회 평가 → 회전/리사이즈 미대응
- App.jsx L1064(HistoryView isMobile), DiagnosticReportInput.jsx L702(gridTemplateColumns 1fr 360px)
- 수정: matchMedia + change 리스너 훅으로 교체 (공용 useIsWide 훅 하나 만들어 양쪽 사용)
  ```jsx
  const [isWide, setIsWide] = useState(() => window.matchMedia('(min-width: 901px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    const fn = e => setIsWide(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  ```

### 2-2. [높음] GrowthAward 320~375px 확정적 가로 오버플로
- GrowthAward.jsx L77(padding 40/32px), L99–123(타임라인 원 5개 최소 ~356px 필요), L126(수치 repeat(4,1fr))
- 수정: 패딩 clamp, 타임라인 flexWrap 또는 모바일 세로 전환, 수치 그리드 repeat(auto-fit, minmax(140px,1fr))

### 2-3. 4열 고정 그리드 모바일 짓눌림
- App.jsx L2164(GrowthDashboard 위젯), L2984(DirectorView 지표)
- 수정: repeat(auto-fit, minmax(140px, 1fr)) 또는 모바일 2×2

### 2-4. 하단 네비 safe-area 미대응
- App.jsx L562(nav padding), L458(토스트 bottom 80px), L435(본문 paddingBottom)
- index.html 5행 viewport에 viewport-fit=cover 추가 후 `env(safe-area-inset-bottom)` 반영

### 2-5. 리포트 미리보기 — PC sticky 잘림 + 모바일 위치 문제
- DiagnosticReportInput.jsx L1334: maxHeight 'calc(100vh - 40px)' + overflowY auto. 모바일에선 저장 버튼 위 접이식 또는 플로팅 미리보기 버튼

### 2-6. GrowthDashboard 드로어 — 백드롭 없음
- App.jsx L2391–2397: 오버레이(rgba(0,0,0,0.4), 클릭 닫기) + 모바일 바텀시트 전환

### 2-7. 사진 썸네일 그리드 PC 과대
- DiagnosticReportInput.jsx L947: repeat(3,1fr) → repeat(auto-fill, minmax(96px,1fr))

### 2-8. GrowthStory PC에서 카드 경계 안 보임
- GrowthStory.jsx L340: PublicReport L114–116과 같은 래퍼(배경 #F5F5F0 + boxShadow) 통일

### 2-9. 100vh → 100dvh (카톡 웹뷰 주소창)
- PublicReport.jsx L80·85, GrowthStory.jsx L325·331, GrowthAward.jsx L61·67, App.jsx L1196(calc(100vh-120px))

### 2-10. 기타 레이아웃
- App.jsx L436–453: 헤더 오버플로 (h1에 flex:1 + ellipsis)
- App.jsx L2281·2316: 학생 테이블 고정 270px 컬럼 → 모바일 축소/스파크라인 숨김
- DiagnosticReportInput.jsx L1102–1112: 오답 카드 긴 유형명 ellipsis
- DiagnosticReportInput.jsx L1221–1224: 진단 상세 input 2개 minWidth:0
- DiagnosticReportInput.jsx L680–697: 수정 모드 배너 flex 충돌
- DiagnosticReportInput.jsx L1896: select appearance:none인데 화살표 없음 → 배경 SVG chevron
- PublicReport.jsx L182–205: 진단 배지 wrap 시 어색 → 별도 줄 분리
- GrowthStory.jsx L506: 점수 100 초과 시 막대 오버플로 → Math.min(100,...), L516 고정폭 36px → 42px

---

## 3단계 — 상용화 완성도 (큰 작업량)

### 3-1. [최우선] React Error Boundary — 오류 1건이면 학부모/강사 흰 화면
- main.jsx 9–20행: ErrorBoundary 클래스 30줄 추가, BrowserRouter 감싸기
- App.jsx는 탭 뷰 단위로도 감싸면 한 탭 죽어도 나머지 동작
- App.jsx L211–228 beforeunload 과잉 방어와 결합 시 현재 최악의 실패 모드(백지+새로고침 방해) — 함께 수정

### 3-2. [최우선] 라우트 코드 스플리팅 — 학부모가 강사 앱 전체 다운로드 중
- main.jsx 4–7행: 4개 라우트 전부 정적 import → lazy() + Suspense
- vite.config.js 13행: vendor-ui에서 recharts 분리('vendor-charts')
- 적용 후 chunkSizeWarningLimit 1000 → 기본값 복원(회귀 감지)

### 3-3. Firestore 로딩 스켈레톤 — "로딩 중"과 "데이터 없음" 구분
- App.jsx L199–202·L258–282: 로딩 플래그 없어 onSnapshot 도착 전 "등록된 학생이 없습니다"가 정상 화면처럼 표시
- dataReady state + 스켈레톤 카드(pulse) — Dashboard/Students/GrowthDashboard/History 4곳
- PublicReport.jsx L79–83: 텍스트 한 줄 → 카드형 스켈레톤 (네이비 헤더 블록 + pulse 바)
- PublicReport.jsx L69–73: 화면에 안 쓰는 allStudentReports 쿼리를 로딩 완료 전 await 중 → 제거(즉시 체감 단축), 열람기록 addDoc도 fire-and-forget

### 3-4. fetch 타임아웃 + res.ok 확인 (3개 API 호출 공통)
- DiagnosticReportInput.jsx L520–529(analyze), L427–439(polish), L1158–1170(코멘트)
- AbortSignal.timeout(60000) + res.ok 확인 + data.result 검증. 타임아웃 시 "사진 수를 줄여 다시 시도" 안내
- 현재는 네트워크 지연 시 analyzingPhoto 영구 true(새로고침만이 답)

### 3-5. 사진 분석 대기 UX (15~40초 구간)
- DiagnosticReportInput.jsx L514–545·L989–993: 스켈레톤 카드 + 단계 문구 로테이션 + 분석 중 사진 삭제/추가 잠금(정합성)
- L996: 분석 성공 후에도 "다시 분석" 버튼 노출(현재는 결과 틀리면 사진 전부 재업로드 외 방법 없음 — 채점 정확도 이슈와 직결)
- L994: 실패 시 에러를 박스형 + 재시도 버튼으로 승격

### 3-6. 에러/빈 상태 통일
- App.jsx: onSnapshot 3개 에러 콜백 없음 + CRUD 핸들러 try/catch 없음(L297·299·305·378) → 토스트 error 타입 추가
- PublicReport.jsx L84–88: 브랜드 없는 회색 한 줄 → 학원명 + 재시도 버튼, notfound/network 상태 분리
- GrowthStory.jsx L74–78·GrowthAward.jsx L22–26: 네트워크 오류를 "학생 정보를 찾을 수 없습니다"로 오표시
- App.jsx L1079–1094: HistoryView 모바일 빈 결과 시 백지
- App.jsx L3300–3334: AnalysisView 0건 시 "0점" 카드 → 빈 상태 카드

### 3-7. 채점 사진 라이트박스 + 폴백
- PublicReport.jsx L258–260: objectFit cover로 채점 표시 잘릴 수 있음 + 확대 불가 + onError 없음
- loading="lazy" + onError 숨김 + 탭 시 전체화면 라이트박스(contain) — 학부모가 채점 결과 확인하는 핵심 기능

### 3-8. 저장 시 사진 업로드 진행률
- DiagnosticReportInput.jsx L570–579: 5장 업로드 10초+ 무피드백 → 최소 "사진 업로드 중 2/5..." 카운터, 정석은 uploadBytesResumable 진행 바

### 3-9. 자동저장 실패 무음
- DiagnosticReportInput.jsx L255–281: catch에서 console.error만 → autoSaveError state + 경고 표시

### 3-10. GrowthStory 편집이 저장 안 됨 (기능 버그)
- GrowthStory.jsx L52: saveEdit가 로컬 state만 갱신 — 강사가 다듬은 서사가 학부모에게 전달 안 됨
- students/{studentId}에 narrative 필드 setDoc(merge) + 로드 시 읽기. 1-5(버튼 숨김)와 세트

### 3-11. GrowthStory 마일스톤 문구 신뢰도
- GrowthStory.jsx L236–241·L641: 성적 하락 중이어도 "사고력 고도화" 무조건 표시 → 추세 따라 분기

### 3-12. 디자인 토큰 통합 (tokens.js)
- App.jsx L39–43(T)와 PublicReport.jsx L102–111(navy/gold) 중복 정의, 3개 학부모 페이지 radius(4/6/8px)·배지 radius(20/8/3px)·폰트 스택 제각각
- tokens.js 신설: 관리자 팔레트 T + 리포트 팔레트 R + FONT + RADIUS. 1단계는 정의만 이동(사용처 무변경)

### 3-13. 인프라 잔여
- vercel.json: avatars 등 정적 에셋 Cache-Control 헤더 + 봇 정규식에 kakaotalk-scrap 추가(현재 facebookexternalhit에 우연 의존 — 인앱브라우저 UA "KAKAOTALK"와는 다른 문자열이므로 안전)
- PublicReport.jsx L49–67: 클라이언트 OG setMeta는 크롤러에 무효(죽은 코드) → document.title만 남기고 정리. GrowthStory/Award는 OG 자체가 없음 → /api/og 재활용
- App.jsx L2839–2847: DirectorView reportViews 중복 로드 → App 구독 prop 전달로 교체
- main.jsx StrictMode: dev에서 PublicReport 열람기록 2중 기록 → dev 가드
- GrowthAward.jsx L133: backdropFilter blur → 저사양 웹뷰 프레임 드랍, rgba 배경으로 대체
- html2canvas import 방식 확인(정적이면 dynamic import로)
- theme-color #0D2D6B 단일값 — 관리자 화면과 불일치(선택)

---

## 추천 실행 순서

| 순서 | 묶음 | 예상 작업량 |
|---|---|---|
| 1 | 실데이터 버그 4건: 1-2, 1-3, 1-4, 1-5 | 1~2시간 |
| 2 | iOS 줌(1-1) + 전역 리셋(1-8) + 학부모 폰트(1-9) | 1~2시간 |
| 3 | ErrorBoundary + 코드 스플리팅(3-1, 3-2) | 1시간 |
| 4 | 나머지 1단계 (탭 타겟, 대비, 토스트, 파비콘 등) | 반나절 |
| 5 | 2단계 반응형 (matchMedia 훅부터) | 1일 |
| 6 | 3단계 스켈레톤/에러/타임아웃/라이트박스 | 2~3일 |
| 7 | tokens.js + 인프라 잔여 | 반나절 |
