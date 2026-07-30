import { T, C, RADIUS2 } from '../tokens.jsx';

// 클릭만 되던 div 행(role="button")을 키보드로도 조작 가능하게 만드는 공용 onKeyDown 핸들러.
// Enter/Space를 클릭과 동일하게 취급 — 앱 전체에서 div-onClick 리스트 행에 일관되게 적용
export const onKeyActivate = (handler) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(e); }
};

// ── 캐릭터 아바타 목록 — DashboardView/StudentsView 공용
export const AVATARS = [
  { key: 'student',       label: '교복 남학생', url: '/avatars/student.png' },
  { key: 'student__1_',  label: '교복 여학생', url: '/avatars/student__1_.png' },
  { key: 'write',         label: '공부왕',       url: '/avatars/write.png' },
  { key: 'nerd',          label: '안경 남학생', url: '/avatars/nerd.png' },
  { key: 'student2',      label: '귀여운 남학생', url: '/avatars/student2.png' },
  { key: 'female-student',label: '여학생',       url: '/avatars/female-student.png' },
  { key: 'girl',          label: '금발 여학생', url: '/avatars/girl.png' },
  { key: 'student__3_',  label: '졸업 남학생', url: '/avatars/student__3_.png' },
  { key: 'student__2_',  label: '졸업 여학생', url: '/avatars/student__2_.png' },
  { key: 'graduate',      label: '졸업가운 남', url: '/avatars/graduate.png' },
  { key: 'graduated',     label: '안경 졸업생', url: '/avatars/graduated.png' },
  { key: 'graduate__1_', label: '졸업가운 여', url: '/avatars/graduate__1_.png' },
  { key: 'graduation',    label: '졸업식',       url: '/avatars/graduation.png' },
];

// ── 프리셋 스킨 — StudentsView(StudentEditModal)/SettingsView 공용. "리포트 스킨 우측 패널"
// 개선 핸드오프(2026-07-30)의 확정 7종과 이름·색·key를 맞춤 — DiagnosticReportInput.jsx의
// SKINS(리포트 작성 시 스킨 선택기)와 동일한 팔레트라 어느 화면에서 고르든 같은 색으로 보임.
// 여기는 main(주조색) 1개만 저장하는 기존 구조 그대로 유지 — accent는 학생별 커스텀 저장까지
// 확장할지는 이번 스코프 밖(리포트 작성 화면의 SKINS만 6색 전부를 씀)
export const PRESET_SKINS = [
  { key: 'navy',     name: '네이비+아이보리',   main: '#1B2A4A' },
  { key: 'deepNavy', name: '딥네이비+스카이',   main: '#10305C' },
  { key: 'purple',   name: '보라+화이트',       main: '#6D28D9' },
  { key: 'violet',   name: '보라+노랑',         main: '#7C3AED' },
  { key: 'indigo',   name: '인디고+피치',       main: '#312E81' },
  { key: 'graphite', name: '그래파이트+샌드',   main: '#2B2E33' },
  { key: 'teal',     name: '틸+아이보리',       main: '#134E4A' },
];

// ── 통계 카드 — DashboardView/AnalysisView 공용
// items 배열을 getStudentId로 학생을 찾고, 그 학생의 classId 기준으로 반 목록 순서대로 묶는다.
// 반이 없거나(classId 없음/삭제된 반) 매칭 안 되는 항목은 마지막 "미배정" 그룹에 모인다.
// DirectorView/DashboardView 공용 — 반이 하나도 없는 학원에서는 호출부 자체에서 안 쓰면 됨.
export function groupByClassId(items, getStudentId, students, classes) {
  const classIds = new Set(classes.map(c => c.id));
  const buckets = new Map(classes.map(c => [c.id, { classId: c.id, className: c.name, items: [] }]));
  const unassigned = { classId: null, className: '미배정', items: [] };
  items.forEach(item => {
    const st = students.find(s => s.id === getStudentId(item));
    const cid = st?.classId;
    if (cid && classIds.has(cid)) buckets.get(cid).items.push(item);
    else unassigned.items.push(item);
  });
  const groups = [...buckets.values()].filter(g => g.items.length > 0);
  if (unassigned.items.length > 0) groups.push(unassigned);
  return groups;
}

export function StatCard({ label, value, unit, color = C.midGray }) {
  return (
    <div style={{ background: T.bg, borderRadius: `${RADIUS2.card}px`, padding: '16px', border: `1px solid ${T.border}` }}>
      <p style={{ fontSize: '11px', color: T.textSub, fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '28px', fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: '12px', color: T.textMute, fontWeight: 500 }}>{unit}</span>
      </div>
    </div>
  );
}
