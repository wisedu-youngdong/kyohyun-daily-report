// ============================================================
// 디자인 토큰 v2 (2026-07, 원티드 벤치마킹 스펙 이식)
// 확정 사항: 브랜드 네이비 = #0D2D6B (신규 토큰), 헤딩 폰트 = Noto Serif KR 유지
//
// 컬러 사용 규칙 (스펙 섹션 2):
// - primary  : 헤더, 메인 액션 버튼(전송/저장)에만
// - accent   : 강조 텍스트, active 언더라인 — 절제해서
// - info     : 선택된 토글/탭처럼 "지금 활성화됨" 표시 전용 (primary와 분리)
// - success/warning/error : 상태 표시 (출석·완료 / 미작성·주의 / 결석·오류)
// - midGray  : 구분선, 보조 텍스트, 비활성 요소
// *Dark 변형은 연한 배경(*Bg) 위 작은 텍스트용 — 명도 대비 확보
// ============================================================
export const C = {
  primary: '#0D2D6B', primaryDark: '#081D47', primaryLight: '#E7EBF4',
  accent: '#C9A227',
  // successDark/warningText/warningBg 값은 실제 화면 전반에서 이미 쓰이고 있던 값(예: 성공
  // 메시지의 짙은 초록 #0F6E56)에 맞춰 조정 — 화면들이 이 토큰을 안 쓰고 직접 하드코딩한 값이
  // 사실상 표준이 됐던 상태라, 토큰 쪽을 실제 표준에 맞춰 통일(반대로 하면 다수 화면 색이 바뀜)
  success: '#009652', successBg: '#E3F4EC', successDark: '#0F6E56',
  warning: '#D97706', warningBg: '#FFF8EC', warningText: '#8A5A00',
  error: '#E53E3E', errorBg: '#FDEAEA', errorDark: '#B92C2C',
  // danger — 삭제/거절 같은 "파괴적 액션" 버튼 전용 색. error(상태 배지: 결석/실패 메시지)와
  // 의미가 달라 분리 — 실제로 앱 전체에서 파괴적 버튼에만 일관되게 쓰이던 값을 토큰화
  danger: '#DC2626', dangerBg: '#FEF2F2', dangerBorder: '#FECACA',
  info: '#0066FF', infoBg: '#E9F1FF', infoDark: '#0050C8',
  midGray: '#707B7C',
};

// 관리자 화면(App.jsx) 팔레트
export const T = {
  brand: '#185FA5', brandLight: '#E6F1FB', brandBg: '#F0F7FC',
  text: '#1A1A1A', textSub: '#6B7280', textMute: '#6C7586',
  border: '#E5E7EB', bg: '#FFFFFF', bgSoft: '#F9FAFB',
};

// 학부모 리포트 화면(PublicReport/GrowthStory) 팔레트
// goldText — gold(#C9A227)를 흰 배경 위 작은 글씨 색으로 쓰면 대비 2.4:1로 낙제라서
// (WCAG 4.5:1 기준) 텍스트 전용으로 어둡게 낮춘 값. gold 자체는 테두리/배경/장식용으로 유지.
export const R = {
  navy: '#0D2D6B', gold: '#C9A227', goldText: '#8A6500', rule: '#E8E6E0',
  inkMute: '#6B7785', inkSub: '#5A6472', ink: '#1A1A1A', positive: '#1E6B4E',
  // negative — C.errorDark와 동일 값. 학부모 화면 쪽에서 부정적 추세/결석 등을 나타낼 때
  // #DC2626/#A32D2D/#8A2020 세 가지가 파일마다 따로 하드코딩돼 있던 걸 이 값 하나로 통일
  negative: '#B92C2C',
  serif: "'Noto Serif KR', serif",
  body: "'Pretendard Variable', Pretendard, sans-serif",
};

export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 20 };

// 컴포넌트 역할별 radius 스케일 (스펙 섹션 4) — badge/chip/input처럼 역할이 명확한 곳에 적용
export const RADIUS2 = {
  badge: 4, chip: 6, input: 8, iconBg: 10, thumbnail: 12,
  card: 14, panel: 16, pill: 20, avatar: '50%',
};

// spacing 스케일 (스펙 섹션 5, base-4)
export const SPACING = [4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 56, 64];

// 타이포그래피 스케일 (스펙 섹션 6). Display/H2/H3는 학부모 리포트(PublicReport/
// GrowthStory)처럼 "리포트 타이틀"급 헤딩이 실제로 있는 화면 기준 — 관리자
// 화면(App.jsx/DiagnosticReportInput.jsx)의 조밀한 폼 라벨엔 강제 적용하지 않음.
export const TYPE = {
  display: { fontSize: 36, fontWeight: 700, lineHeight: 1.33 },
  h2: { fontSize: 28, fontWeight: 700, lineHeight: 1.43 },
  h3: { fontSize: 24, fontWeight: 700, lineHeight: 1.2 },
  bodyLarge: { fontSize: 16, fontWeight: 500, lineHeight: 1.5 },
  body: { fontSize: 14, fontWeight: 500, lineHeight: 1.5 },
  small: { fontSize: 12, fontWeight: 600, lineHeight: 1.4 },
};

// Shadow/Elevation 4단계 (스펙 섹션 7)
export const SHADOW = {
  0: 'none',
  1: '0 1px 3px rgba(0,0,0,0.08)',
  2: '0 4px 12px rgba(0,0,0,0.14)',
  3: '0 20px 50px rgba(0,0,0,0.2)',
};

export const FONT = {
  body: "'Pretendard Variable', Pretendard, sans-serif",
  serif: R.serif,
};

// 학생이 직접 고른 스킨의 accent 색(skin.accent)은 배경/테두리용 옅은 톤도 섞여있어
// (예: '#EDEBE6', '#F0E8FF') 그대로 텍스트 색으로 쓰면 흰 배경 위에서 거의 안 보일 수 있다.
// WCAG 4.5:1을 만족할 때까지 채널을 어둡게 낮춰서 "그 스킨의 포인트색 느낌은 유지하되
// 읽을 수는 있는" 텍스트 색을 돌려준다. R.gold처럼 고정값은 R.goldText로 미리 계산해뒀지만,
// 학생별 커스텀 accent처럼 런타임에만 알 수 있는 색은 이 함수로 즉석 계산해야 한다.
function relLuminance(hex) {
  const n = hex.replace('#', '');
  const chan = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * chan(parseInt(n.slice(0, 2), 16)) + 0.7152 * chan(parseInt(n.slice(2, 4), 16)) + 0.0722 * chan(parseInt(n.slice(4, 6), 16));
}
function contrastRatio(hexA, hexB) {
  const [l1, l2] = [relLuminance(hexA), relLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
export function textSafeColor(hex, bg = '#ffffff', target = 4.5) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (contrastRatio(hex, bg) >= target) return hex;
  let [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => parseInt(h, 16));
  for (let i = 0; i < 20; i++) {
    r = Math.max(0, r - 12); g = Math.max(0, g - 12); b = Math.max(0, b - 12);
    const candidate = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    if (contrastRatio(candidate, bg) >= target) return candidate;
  }
  return '#000000';
}

// RGB 선형 보간 — 스킨 파생색 계산에서 "흰색/검정색을 N% 섞기" 용도로 씀
function mixHex(hexA, hexB, t) {
  const pa = [1, 3, 5].map(i => parseInt(hexA.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(hexB.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// 리포트 스킨 파생색 — 저장돼 있는 건 주조색(primary)·포인트색(accent) 2개뿐인 리포트(학생별
// 커스텀 색, 예전 리포트의 skin.main/accent)를 6값 스킨(second/tint/track/bannerLabel까지)으로
// 확장한다. "리포트 스킨 우측 패널" 개선 핸드오프(2026-07-30)의 자동 생성 규칙을 그대로 옮김 —
// 사전 정의된 7종 프리셋 스킨은 이 함수를 안 거치고 손으로 고른 값을 그대로 쓴다(디자인 확정본).
export function deriveSkinColors(primaryIn, accentIn) {
  // primary/second/bannerLabel은 흰 글자가 위에 얹히므로 textSafeColor를 "배경 자신이
  // 대비 기준을 넘을 때까지 어둡게"용으로 재사용(대비 계산은 순서 무관이라 그대로 맞음)
  const primary = textSafeColor(primaryIn, '#ffffff', 4.5);
  return {
    primary,
    second: textSafeColor(mixHex(primary, '#ffffff', 0.2), '#ffffff', 4.5),
    accent: accentIn,
    tint: mixHex(accentIn, '#ffffff', 0.86),
    track: mixHex(primary, '#ffffff', 0.88),
    bannerLabel: textSafeColor(mixHex(accentIn, '#000000', 0.45), '#ffffff', 4.5),
  };
}

// 학부모 리포트 공용 카드 래퍼 — 연한 배경 위 중앙 정렬된 흰 카드
export function ReportCard({ children, maxWidth = '390px', fontFamily = R.body }) {
  return (
    <div style={{ background: '#F5F5F0', minHeight: '100dvh', padding: '24px 16px', display: 'flex', justifyContent: 'center', fontFamily }}>
      <div style={{ width: '100%', maxWidth }}>
        <div style={{ background: '#fff', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.10)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
