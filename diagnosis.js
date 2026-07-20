// 진단 태그(계산 실수/개념 누락/응용 부족/시간 부족/개념 완벽) 단일 소스.
// 예전엔 화면마다 각자 정의해서 같은 태그인데 색이 조금씩 어긋나 있었음
// (예: '계산 실수' 색이 파일마다 #7A4F00/#8A5A00로 갈라져 있던 것).

export const DIAG_LABELS = {
  calc: '계산 실수',
  concept: '개념 누락',
  apply: '응용 부족',
  time: '시간 부족',
  perfect: '개념 완벽',
};

// 심각도 기반 — 단색 배경 + 흰 글씨 배지용(원장분석 카드, 대시보드 등).
// calc/concept/apply는 약점(빨강), time은 주의(호박), perfect는 완료(초록).
export const DIAG_BADGE = {
  calc:    { label: DIAG_LABELS.calc,    prefix: '⚠', bg: '#A32D2D' },
  concept: { label: DIAG_LABELS.concept, prefix: '⚠', bg: '#A32D2D' },
  apply:   { label: DIAG_LABELS.apply,   prefix: '⚠', bg: '#A32D2D' },
  time:    { label: DIAG_LABELS.time,    prefix: '△', bg: '#8A5A00' },
  perfect: { label: DIAG_LABELS.perfect, prefix: '✓', bg: '#0F6E56' },
};

// 카테고리별 고유색 — 연한 칩/막대 그래프용(기록 보관소, 종합 분석, 성장 스토리 등).
// perfect는 이 스킴을 쓰는 화면들이 "약점만" 집계하는 용도라 원래 없었지만, 소스 통합
// 겸 완전성을 위해 추가(필요 없는 화면은 그냥 안 씀).
export const DIAG_SOFT = {
  calc:    { label: DIAG_LABELS.calc,    color: '#7A4F00', bg: '#FFF8EC', border: '#C9A22740' },
  concept: { label: DIAG_LABELS.concept, color: '#0D2D6B', bg: '#EAF1FB', border: '#0D2D6B40' },
  apply:   { label: DIAG_LABELS.apply,   color: '#8A2020', bg: '#FDF0F0', border: '#8A202040' },
  time:    { label: DIAG_LABELS.time,    color: '#4A3080', bg: '#F3F0FA', border: '#4A308040' },
  perfect: { label: DIAG_LABELS.perfect, color: '#0F6E56', bg: '#F0FAF5', border: '#0F6E5640' },
};
