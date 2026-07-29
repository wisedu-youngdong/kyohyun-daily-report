# 디자인 기준 (교현학원 데일리 리포트)

이 문서는 화면을 새로 만들거나 수정할 때 항상 먼저 참고하는 기준입니다. 색·폰트는 추측하지 말고 아래 값을 그대로 씁니다. 실제 소스는 `tokens.jsx` — 이 문서는 그 값을 사람이 읽기 좋게 정리한 것이고, 값이 바뀌면 `tokens.jsx`가 항상 최종 기준입니다.

## 팔레트는 화면 성격에 따라 셋 중 하나

이 앱은 화면이 두 부류로 나뉘고, 부류마다 다른 팔레트를 씁니다 — 섞어 쓰지 않습니다.

### `R` — 학부모가 보는 화면 (PublicReport, GrowthStory, GrowthAward, PartnerLanding, SignupRequestScreen)
따뜻하고 신뢰감 있는 톤. 학원의 "정성"이 느껴져야 하는 화면.

| 역할 | 값 |
|---|---|
| navy (주조색, 헤딩·주요 버튼) | `#0D2D6B` |
| gold (포인트·장식·테두리 — 작은 텍스트로는 쓰지 않음) | `#C9A227` |
| goldText (gold를 텍스트로 써야 할 때) | `#8A6500` |
| ink (본문 진한 텍스트) | `#1A1A1A` |
| inkSub / inkMute (보조 텍스트) | `#5A6472` / `#6B7785` |
| rule (구분선) | `#E8E6E0` |
| positive / negative (증가·감소, 정답·오답 추세) | `#1E6B4E` / `#B92C2C` |
| 제목 폰트 | `'Noto Serif KR', serif` |
| 본문 폰트 | `'Pretendard Variable', Pretendard, sans-serif` |

> gold(#C9A227)는 흰 배경 위 작은 글씨로 쓰면 대비 2.4:1로 WCAG 기준(4.5:1) 낙제 — 텍스트엔 반드시 goldText를 쓴다.

### `T` — 원장·강사가 보는 관리 화면 (App.jsx, SettingsView, DiagnosticReportInput, UsageMonitoring 등)
실무용. 정보 밀도가 높고 장식은 최소화.

| 역할 | 값 |
|---|---|
| brand (주조색) | `#185FA5` |
| brandLight / brandBg (연한 배경) | `#E6F1FB` / `#F0F7FC` |
| text / textSub / textMute | `#1A1A1A` / `#6B7280` / `#6C7586` |
| border | `#E5E7EB` |
| bg / bgSoft | `#FFFFFF` / `#F9FAFB` |
| 폰트 | `'Pretendard Variable', Pretendard, sans-serif` (세리프 안 씀 — 관리 화면은 실무 톤) |

### `C` — 화면 성격과 무관하게 쓰는 의미색 (상태 표시 전용)
어느 팔레트를 쓰는 화면이든 상태 표시는 이 색으로 통일한다.

| 의미 | 배경 / 진한 텍스트용 |
|---|---|
| 성공·완료 (출석, 발송 완료) | `successBg #E3F4EC` / `successDark #0F6E56` |
| 주의 (미작성, 크레딧 부족) | `warningBg #FFF8EC` / `warningText #8A5A00` |
| 오류·결석 | `errorBg #FDEAEA` / `errorDark #B92C2C` |
| 파괴적 액션 버튼 전용 (삭제·거절 — error와 의미 분리) | `dangerBg #FEF2F2` / `danger #DC2626` |
| "지금 활성화됨" 표시 (선택된 탭/토글, primary와 분리) | `infoBg #E9F1FF` / `infoDark #0050C8` |

## 타이포·spacing·radius·shadow 스케일

색만큼 중요한 건 **스케일을 벗어난 임의의 값을 안 쓰는 것**이다. 새 값이 필요하면 아래에서 가장 가까운 걸 쓰고, 정말 없으면 스케일 자체를 늘린다 (그 자리에서 12px, 18px처럼 즉흥적으로 끼워넣지 않는다).

- **spacing (4 기준 배수)**: `4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 56, 64`
- **radius (역할별)**: badge 4 · chip 6 · input 8 · iconBg 10 · thumbnail 12 · card 14 · panel 16 · pill 20 · avatar 50%
- **shadow (4단계, 그 이상 안 씀)**: `none` → `0 1px 3px rgba(0,0,0,.08)` → `0 4px 12px rgba(0,0,0,.14)` → `0 20px 50px rgba(0,0,0,.2)`
- **타입 스케일**: display 36/700 · h2 28/700 · h3 24/700 · bodyLarge 16/500 · body 14/500 · small 12/600 (숫자는 px/font-weight)

## 절대 쓰지 않는 것 (AI 티가 나는 기본값)

1. **Inter, Roboto, 시스템 기본 폰트** — 위 두 폰트(`Noto Serif KR`+`Pretendard`) 외엔 안 씀
2. **보라·파랑 계열 그라데이션 배경** — 이 앱엔 그라데이션 배경 자체가 없다. 톤 전환은 배경색 블록(`R`/`T`의 연한 배경)으로만
3. **카드 안에 카드** — 여백과 `rule`/`border` 선으로 구획을 나눈다. 중첩 카드 대신 flat한 리스트/그리드
4. **색 있는 배경 위 회색 텍스트** — 배경이 `R.navy`처럼 진하면 텍스트는 `#fff`, 옅은 배경(`brandLight`, `successBg` 등)이면 그 팔레트의 `*Dark`/`*Text` 짝을 쓴다. 임의의 회색을 얹지 않는다
5. **튕기는 바운스 이징** — 트랜지션은 `ease`/`ease-in-out`, 0.15~0.5s 내외로 짧고 자연스럽게 멈춘다 (`plFadeUp` 같은 기존 keyframe 참고)
6. **레인보우 카테고리 컬러** — 유형별 색 구분이 필요하면 고정된 순서로 소수의 톤만 쓰고(예: navy/gold 두 톤), 절대 자동 생성된 무지개 팔레트를 쓰지 않는다

## 참고

- 실제 값의 단일 소스: `tokens.jsx` (C/T/R/RADIUS/RADIUS2/SPACING/TYPE/SHADOW)
- 접근성 대비 계산이 필요하면 `tokens.jsx`의 `textSafeColor()` 재사용 (직접 만들지 않는다)
- 학부모 화면 공용 카드 래퍼는 `tokens.jsx`의 `ReportCard` 컴포넌트 재사용
- 차트/데이터 시각화를 만들 땐 이 문서 대신 `dataviz` 스킬을 먼저 읽는다 (색 배정 공식, 검증 스크립트 포함)
