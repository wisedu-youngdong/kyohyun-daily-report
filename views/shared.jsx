import React from 'react';
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
