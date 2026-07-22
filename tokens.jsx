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
  success: '#009652', successBg: '#E3F4EC', successDark: '#00714B',
  warning: '#D97706', warningBg: '#FCF0E1', warningText: '#8A4B04',
  error: '#E53E3E', errorBg: '#FDEAEA', errorDark: '#B92C2C',
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
export const R = {
  navy: '#0D2D6B', gold: '#C9A227', rule: '#E8E6E0',
  inkMute: '#6B7785', inkSub: '#5A6472', ink: '#1A1A1A', positive: '#1E6B4E',
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
