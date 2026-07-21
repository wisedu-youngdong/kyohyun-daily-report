import { C, RADIUS2 } from '../tokens.jsx';

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

// ── 프리셋 스킨 — StudentsView(StudentEditModal)/SettingsView 공용
export const PRESET_SKINS = [
  { key: 'navy',    name: '네이비+크림',   main: '#1A2540' },
  { key: 'purple',  name: '보라+화이트',   main: '#6B3FA0' },
  { key: 'violet',  name: '보라+노랑',     main: '#7B5EA7' },
  { key: 'blue',    name: '딥블루+민트',   main: '#0F3460' },
  { key: 'dark',    name: '다크+골드',     main: '#1A1714' },
  { key: 'green',   name: '그린+화이트',   main: '#2E7D32' },
  { key: 'red',     name: '레드+화이트',   main: '#C0392B' },
  { key: 'indigo',  name: '인디고+피치',   main: '#3949AB' },
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
    <div style={{ background: '#fff', borderRadius: `${RADIUS2.card}px`, padding: '16px', border: `1px solid #E5E7EB` }}>
      <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '28px', fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>{unit}</span>
      </div>
    </div>
  );
}
