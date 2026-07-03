import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import DiagnosticReportInput from './DiagnosticReportInput';
import {
  LayoutDashboard, Users, FileText, History, BarChart2, LogOut
} from 'lucide-react';
import { calculateTotalPoints, getStageInfo, calculateReportPoints, STAGES } from './growth.js';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList
} from 'recharts';

// ── 캐릭터 아바타 목록
const AVATARS = [
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

const T = {
  brand: '#185FA5', brandLight: '#E6F1FB', brandBg: '#F0F7FC',
  text: '#1A1A1A', textSub: '#6B7280', textMute: '#9CA3AF',
  border: '#E5E7EB', bg: '#FFFFFF', bgSoft: '#F9FAFB',
};

// ── 프리셋 스킨 ──
const PRESET_SKINS = [
  { key: 'navy',    name: '네이비+크림',   main: '#1A2540' },
  { key: 'purple',  name: '보라+화이트',   main: '#6B3FA0' },
  { key: 'violet',  name: '보라+노랑',     main: '#7B5EA7' },
  { key: 'blue',    name: '딥블루+민트',   main: '#0F3460' },
  { key: 'dark',    name: '다크+골드',     main: '#1A1714' },
  { key: 'green',   name: '그린+화이트',   main: '#2E7D32' },
  { key: 'red',     name: '레드+화이트',   main: '#C0392B' },
  { key: 'indigo',  name: '인디고+피치',   main: '#3949AB' },
];

// ── 메인 컬러 → 파생 색상 자동 계산 ──
function deriveColors(mainHex) {
  const r = parseInt(mainHex.slice(1,3),16);
  const g = parseInt(mainHex.slice(3,5),16);
  const b = parseInt(mainHex.slice(5,7),16);
  const toHex = (r,g,b) => '#' + [r,g,b].map(v =>
    Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')
  ).join('');
  const lum = 0.299*r + 0.587*g + 0.114*b;
  return {
    main:      mainHex,
    headerBg:  `linear-gradient(155deg, ${toHex(r-20,g-20,b-20)}, ${mainHex}, ${toHex(r+30,g+30,b+30)})`,
    cardDark:  mainHex,
    cardLight: toHex(r+140,g+140,b+140),
    textDark:  '#ffffff',
    textLight: lum > 128 ? '#1A1A1A' : toHex(r-60,g-60,b-60),
    subDark:   'rgba(255,255,255,0.55)',
    subLight:  toHex(r+60,g+60,b+60),
    nextBg:    mainHex,
    footerText: toHex(r+80,g+80,b+80),
    commentBorder: mainHex,
    commentBg: toHex(r+150,g+150,b+150),
    tagBg:     toHex(r+150,g+150,b+150),
    tagBorder: toHex(r+100,g+100,b+100),
    tagText:   lum > 128 ? '#1A1A1A' : toHex(r-40,g-40,b-40),
  };
}

// 기본 스킨 (네이비)
const DEFAULT_SKIN_COLOR = '#1A2540';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', background: T.bgSoft,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
      padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px',
        border: `1px solid ${T.border}`, padding: '40px 36px',
        width: '100%', maxWidth: '380px',
        boxShadow: '0 8px 32px rgba(24, 95, 165, 0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px', height: '48px', background: T.brand,
            borderRadius: '14px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <span style={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>K</span>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            교현학원
          </h1>
          <p style={{ fontSize: '13px', color: T.textSub, margin: 0, fontWeight: 500 }}>
            데일리 리포트 시스템
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '11px', color: T.textSub, fontWeight: 700, display: 'block', marginBottom: '6px' }}>이메일</label>
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 입력" required
              style={{
                width: '100%', padding: '11px 14px', fontSize: '14px',
                border: `1px solid ${T.border}`, borderRadius: '10px',
                background: T.bgSoft, outline: 'none',
                fontFamily: 'inherit', letterSpacing: '-0.02em', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: T.textSub, fontWeight: 700, display: 'block', marginBottom: '6px' }}>비밀번호</label>
            <input
              type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력" required
              style={{
                width: '100%', padding: '11px 14px', fontSize: '14px',
                border: `1px solid ${T.border}`, borderRadius: '10px',
                background: T.bgSoft, outline: 'none',
                fontFamily: 'inherit', letterSpacing: '-0.02em', boxSizing: 'border-box',
              }}
            />
          </div>
          {error && (
            <p style={{ fontSize: '12px', color: '#DC2626', margin: 0, background: '#FEF2F2', padding: '8px 12px', borderRadius: '8px', fontWeight: 500 }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '13px', fontSize: '14px', fontWeight: 700,
            border: 'none', borderRadius: '12px',
            background: loading ? T.border : T.brand,
            color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', letterSpacing: '-0.02em', marginTop: '4px',
            boxShadow: loading ? 'none' : '0 4px 16px rgba(24, 95, 165, 0.25)',
          }}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p style={{ fontSize: '11px', color: T.textMute, textAlign: 'center', margin: '20px 0 0', fontWeight: 500 }}>
          교현학원 관리자 전용 시스템입니다
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('write');
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) =>
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubTeachers = onSnapshot(collection(db, 'teachers'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length === 0) {
        addDoc(collection(db, 'teachers'), { name: '김선생님', createdAt: serverTimestamp() });
      } else {
        setTeachers(list);
      }
    });
    const unsubReports = onSnapshot(collection(db, 'reports'), (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => { unsubStudents(); unsubTeachers(); unsubReports(); };
  }, [user]);

  const handleSaveStudent = async (d) => {
  console.log('학생 저장 시작:', d);
  try {
    if (d.id) {
      const { id, ...data } = d;
      await updateDoc(doc(db, 'students', id), data);
      console.log('학생 수정 성공');
    } else {
      const result = await addDoc(collection(db, 'students'), { ...d, createdAt: serverTimestamp() });
      console.log('학생 저장 성공:', result.id);
    }
  } catch (e) {
    console.error('학생 저장 실패:', e);
    alert('저장 실패: ' + e.message);
  }
};
  const handleDeleteStudent = async (id) => await deleteDoc(doc(db, 'students', id));

  const handleSaveTeacher = async (d) => {
    if (d.id) { const { id, ...data } = d; await updateDoc(doc(db, 'teachers', id), data); }
    else await addDoc(collection(db, 'teachers'), { ...d, createdAt: serverTimestamp() });
  };
  const handleDeleteTeacher = async (id) => await deleteDoc(doc(db, 'teachers', id));

  const handleSaveReport = async (d) => {
    if (d.id) { const { id, ...data } = d; await updateDoc(doc(db, 'reports', id), { ...data, updatedAt: serverTimestamp() }); }
    else await addDoc(collection(db, 'reports'), { ...d, createdAt: serverTimestamp() });
  };
  const handleDeleteReport = async (id) => await deleteDoc(doc(db, 'reports', id));

  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: T.brand, fontSize: '14px', fontWeight: 600 }}>
      교현학원 연결 중...
    </div>
  );

  if (!user) return <LoginScreen />;

  const tabs = [
    { key: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={20} /> },
    { key: 'students',  label: '학생 관리', icon: <Users size={20} /> },
    { key: 'write',     label: '리포트 작성', icon: <FileText size={20} /> },
    { key: 'history',   label: '기록 보관소', icon: <History size={20} /> },
    { key: 'analysis',  label: '종합 분석', icon: <BarChart2 size={20} /> },
    { key: 'settings',  label: '설정', icon: <span style={{fontSize:'20px'}}>⚙️</span> },
  ];

  return (
    <div style={{ minHeight: '100vh', background: T.bgSoft, paddingBottom: '80px' }}>
      <header style={{ background: T.bg, borderBottom: `1px solid ${T.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ width: '28px', height: '28px', background: T.brand, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>K</span>
        </div>
        <h1 style={{ fontSize: '16px', fontWeight: 700, color: T.text, letterSpacing: '-0.02em' }}>교현학원 데일리 리포트</h1>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: T.textMute, fontWeight: 500, background: T.bgSoft, padding: '3px 8px', borderRadius: '6px', border: `1px solid ${T.border}` }}>
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
        </span>
        <button onClick={() => signOut(auth)} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="로그아웃">
          <LogOut size={16} />
        </button>
      </header>

      <main>
        {activeTab === 'dashboard' && <DashboardView students={students} reports={reports} onTabChange={setActiveTab} />}
        {activeTab === 'students' && <StudentsView students={students} reports={reports} onSave={handleSaveStudent} onDelete={handleDeleteStudent} />}
        {activeTab === 'write' && (
          <DiagnosticReportInput
            students={students} teachers={teachers}
            onSaveStudent={handleSaveStudent}
            onSaveTeacher={handleSaveTeacher}
            onDeleteTeacher={handleDeleteTeacher}
            onSave={handleSaveReport}
          />
        )}
        {activeTab === 'history' && <HistoryView reports={reports} students={students} onDelete={handleDeleteReport} />}
        {activeTab === 'analysis' && <AnalysisView students={students} reports={reports} />}
      </main>

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: T.bg, borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '8px 0', zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.04)' }}>
        {tabs.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px 4px', border: 'none', background: 'none', color: active ? T.brand : T.textMute, fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
              {tab.icon}
              <span style={{ fontSize: '10px', fontWeight: active ? 700 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function DashboardView({ students, reports, onTabChange }) {
  const today = new Date().toLocaleDateString('ko-KR');
  const todayReports = reports.filter(r => r.createdAt?.seconds && new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR') === today);
  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>오늘의 현황</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="관리 학생" value={students.length} unit="명" />
        <StatCard label="오늘 리포트" value={todayReports.length} unit="건" />
      </div>
      <div style={{ background: '#fff', borderRadius: '16px', border: `1px solid #E5E7EB`, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid #F3F4F6`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700 }}>오늘 학생 현황</h3>
          <button onClick={() => onTabChange('write')} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit' }}>리포트 작성</button>
        </div>
        {students.length === 0
          ? <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>등록된 학생이 없습니다</div>
          : students.map(s => {
            const done = todayReports.some(r => r.studentId === s.id);
            return (
              <div key={s.id} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid #F9FAFB` }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: done ? '#185FA5' : '#F3F4F6', color: done ? '#fff' : '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 }}>{s.name?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{s.name}</p>
                  <p style={{ fontSize: '11px', color: '#6B7280', margin: 0, fontWeight: 500 }}>{s.school}</p>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: done ? '#185FA5' : '#D1D5DB' }}>{done ? '완료 ✓' : '대기'}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }) {
  return (
    <div style={{ background: '#fff', borderRadius: '14px', padding: '16px', border: `1px solid #E5E7EB` }}>
      <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '28px', fontWeight: 700, color: '#185FA5', letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>{unit}</span>
      </div>
    </div>
  );
}

function StudentsView({ students, reports, onSave, onDelete }) {
  const [editingStudent, setEditingStudent] = useState(null);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>학생 관리</h2>
      {students.length === 0
        ? <div style={{ background: '#fff', borderRadius: '16px', border: `1px solid #E5E7EB`, padding: '60px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>리포트 작성 화면에서 학생을 추가하세요</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {students.map(s => {
            const sReports = reports.filter(r => r.studentId === s.id);
            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: '16px', padding: '16px 18px', border: `1px solid #E5E7EB` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#E6F1FB', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.avatar
                      ? <img src={AVATARS.find(a => a.key === s.avatar)?.url} alt="avatar" style={{ width: '44px', height: '44px', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '18px', fontWeight: 700, color: '#185FA5' }}>{s.name?.[0]}</span>
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{s.name}</p>
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>{s.school} · 리포트 {sReports.length}건</p>
                  </div>
                  <button
                    onClick={() => setEditingStudent(s)}
                    style={{ background: '#E6F1FB', border: 'none', color: '#185FA5', fontSize: '12px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', marginRight: '6px' }}>
                    ✏️ 수정
                  </button>
                  <button onClick={() => { if (confirm(`${s.name} 학생을 삭제하시겠습니까?`)) onDelete(s.id); }} style={{ background: 'none', border: 'none', color: '#D1D5DB', fontSize: '18px', cursor: 'pointer', padding: '4px' }}>×</button>
                </div>
                {s.textbooks?.length > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {s.textbooks.map((t, i) => <span key={i} style={{ background: '#E6F1FB', color: '#185FA5', fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px' }}>{t.name}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      }

      {/* 수정 모달 */}
      {editingStudent && (
        <StudentEditModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onSubmit={async (updated) => {
            await onSave({ id: editingStudent.id, ...updated });
            setEditingStudent(null);
          }}
        />
      )}
    </div>
  );
}
function StudentEditModal({ student, onClose, onSubmit }) {
  const [name, setName] = useState(student.name || '');
  const [school, setSchool] = useState(student.school || '');
  const [parentPhone, setParentPhone] = useState(student.parentPhone || '');
  const [memo, setMemo] = useState(student.memo || '');
  const [textbooks, setTextbooks] = useState(
    student.textbooks?.length > 0 ? student.textbooks : [{ id: Date.now(), name: '' }]
  );
  const [avatar, setAvatar] = useState(student.avatar || '');
  const [skinColor, setSkinColor] = useState(student.skinColor || '');
  const [useCustomSkin, setUseCustomSkin] = useState(!!student.skinColor);
  const [saving, setSaving] = useState(false);

  const isValid = name.trim() && school.trim();

  const addTextbook = () => setTextbooks(prev => [...prev, { id: Date.now(), name: '' }]);
  const updateTextbook = (id, value) => setTextbooks(prev => prev.map(t => t.id === id ? { ...t, name: value } : t));
  const removeTextbook = (id) => { if (textbooks.length > 1) setTextbooks(prev => prev.filter(t => t.id !== id)); };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      school: school.trim(),
      parentPhone: parentPhone.trim(),
      memo: memo.trim(),
      textbooks: textbooks.filter(t => t.name.trim()),
      avatar: avatar,
      skinColor: useCustomSkin ? skinColor : '',
    });
    setSaving(false);
  };

  const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' };
  const modalStyle = { background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" };
  const inputStyle = { width: '100%', padding: '9px 11px', fontSize: '13px', border: '1px solid #E5E7EB', borderRadius: '9px', background: '#F9FAFB', outline: 'none', fontFamily: 'inherit', fontWeight: 500, color: '#1A1A1A', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 5px', display: 'block' };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>학생 정보 수정</h2>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>{student.name} 학생</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#6B7280', cursor: 'pointer' }}>×</button>
        </div>

        {/* 입력 */}
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>이름 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>학교 / 학년 *</label>
              <input value={school} onChange={(e) => setSchool(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={labelStyle}>교재</label>
              <button onClick={addTextbook} style={{ background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '5px', padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>+ 추가</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {textbooks.map((t, idx) => (
                <div key={t.id} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <div style={{ background: '#E6F1FB', color: '#185FA5', width: '22px', height: '22px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{idx + 1}</div>
                  <input value={t.name} onChange={(e) => updateTextbook(t.id, e.target.value)} style={inputStyle} />
                  {textbooks.length > 1 && (
                    <button onClick={() => removeTextbook(t.id)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '16px', flexShrink: 0 }}>×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>학부모 연락처</label>
            <input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="010-0000-0000" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>관리 메모 (내부용)</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>

          {/* 캐릭터 선택 */}
          <div>
            <label style={labelStyle}>캐릭터 아바타</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {AVATARS.map(av => (
                <div
                  key={av.key}
                  onClick={() => setAvatar(av.key)}
                  style={{
                    border: avatar === av.key ? '2.5px solid #185FA5' : '2px solid #E5E7EB',
                    borderRadius: '12px', padding: '8px 6px',
                    cursor: 'pointer', textAlign: 'center',
                    background: avatar === av.key ? '#E6F1FB' : '#F9FAFB',
                    transition: 'all 0.15s',
                  }}
                >
                  <img src={av.url} alt={av.label} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '4px' }} />
                  <p style={{ fontSize: '10px', fontWeight: 600, color: avatar === av.key ? '#185FA5' : '#6B7280', margin: 0, lineHeight: 1.3 }}>{av.label}</p>
                  {avatar === av.key && (
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#185FA5', margin: '4px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: '10px', fontWeight: 900 }}>✓</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 스킨 설정 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={labelStyle}>리포트 스킨</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>개별 설정</span>
                <div
                  onClick={() => setUseCustomSkin(!useCustomSkin)}
                  style={{ width: '36px', height: '20px', borderRadius: '20px', background: useCustomSkin ? '#185FA5' : '#D1D5DB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: '2px', left: useCustomSkin ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}></div>
                </div>
              </div>
            </div>

            {!useCustomSkin && (
              <div style={{ background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px', fontSize: '11px', color: '#9CA3AF', fontWeight: 500 }}>
                학원 기본 스킨을 사용합니다
              </div>
            )}

            {useCustomSkin && (
              <div>
                {/* 프리셋 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                  {PRESET_SKINS.map(sk => (
                    <div key={sk.key} onClick={() => setSkinColor(sk.main)}
                      style={{ borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: skinColor === sk.main ? '2.5px solid #185FA5' : '2px solid #E5E7EB' }}>
                      <div style={{ height: '24px', background: sk.main }}></div>
                      <div style={{ padding: '3px', background: '#F9FAFB', textAlign: 'center' }}>
                        <span style={{ fontSize: '8px', fontWeight: 700, color: skinColor === sk.main ? '#185FA5' : '#6B7280' }}>{sk.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* 커스텀 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F9FAFB', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ position: 'relative', width: '36px', height: '36px', borderRadius: '10px', background: skinColor || '#185FA5', border: '2px solid rgba(0,0,0,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                    <input type="color" value={skinColor || '#185FA5'} onChange={(e) => setSkinColor(e.target.value)}
                      style={{ position: 'absolute', inset: '-4px', width: 'calc(100%+8px)', height: 'calc(100%+8px)', border: 'none', cursor: 'pointer', opacity: 0 }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>직접 색상 선택</p>
                    <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '1px 0 0', fontFamily: 'monospace' }}>{skinColor || '#185FA5'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 버튼 */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px', justifyContent: 'center', background: '#F9FAFB', borderRadius: '0 0 18px 18px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '9px', border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer' }}>취소</button>
          <button onClick={handleSubmit} disabled={!isValid || saving} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '9px', border: 'none', background: isValid ? '#185FA5' : '#E5E7EB', color: '#fff', cursor: isValid ? 'pointer' : 'not-allowed' }}>
            {saving ? '저장 중...' : '✓ 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
const RATING_EMOJI = { 5: '🌟', 4: '😊', 3: '🙂', 2: '😐', 1: '😟' };

const DIAGNOSIS_TAGS_MAP = {
  calc: { label: '계산 실수', color: '#854F0B', bg: '#FAEEDA', border: '#BA7517' },
  concept: { label: '개념 누락', color: '#854F0B', bg: '#FAEEDA', border: '#BA7517' },
  apply: { label: '응용 부족', color: '#791F1F', bg: '#FCEBEB', border: '#A32D2D' },
  time: { label: '시간 부족', color: '#791F1F', bg: '#FCEBEB', border: '#A32D2D' },
  perfect: { label: '개념 완벽', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' },
};

function HistoryView({ reports, students, onDelete }) {
  const [previewReport, setPreviewReport] = useState(null);
  const [studentFilter, setStudentFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all'); // all | week | month
  const [photoOnly, setPhotoOnly] = useState(false);

  const now = Date.now() / 1000;
  const filtered = reports.filter(r => {
    if (studentFilter && r.studentId !== studentFilter) return false;
    if (photoOnly && !(r.photoUrls?.length > 0)) return false;
    if (periodFilter !== 'all') {
      const ts = r.createdAt?.seconds || 0;
      const cutoff = periodFilter === 'week' ? 7 * 86400 : 30 * 86400;
      if (now - ts > cutoff) return false;
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      const haystack = `${r.studentName || ''} ${r.textbook || ''} ${r.unit || ''} ${r.teacherNote || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>기록 보관소</h2>
        <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, background: '#fff', padding: '4px 10px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
          {filtered.length}건 {filtered.length !== reports.length && `/ 전체 ${reports.length}건`}
        </span>
      </div>

      {/* 검색 */}
      <input
        value={searchText} onChange={(e) => setSearchText(e.target.value)}
        placeholder="🔍 학생명·교재명·코멘트 검색"
        style={{ width: '100%', padding: '10px 14px', fontSize: '13px', border: '1px solid #E5E7EB', borderRadius: '10px', background: '#fff', outline: 'none', fontFamily: 'inherit', marginBottom: '10px', boxSizing: 'border-box' }}
      />

      {/* 학생 필터 */}
      <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', fontSize: '13px', fontWeight: 500, border: '1px solid #E5E7EB', borderRadius: '10px', background: '#F9FAFB', outline: 'none', fontFamily: 'inherit', marginBottom: '10px' }}>
        <option value="">전체 학생</option>
        {(students || []).map(s => <option key={s.id} value={s.id}>{s.name} · {s.school}</option>)}
      </select>

      {/* 기간·사진 필터 칩 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[['all', '전체 기간'], ['week', '최근 1주'], ['month', '최근 1개월']].map(([key, label]) => (
          <button key={key} onClick={() => setPeriodFilter(key)}
            style={{
              padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
              border: periodFilter === key ? '1.5px solid #185FA5' : '1px solid #E5E7EB',
              background: periodFilter === key ? '#E6F1FB' : '#fff',
              color: periodFilter === key ? '#185FA5' : '#6B7280',
            }}>{label}</button>
        ))}
        <button onClick={() => setPhotoOnly(v => !v)}
          style={{
            padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
            border: photoOnly ? '1.5px solid #185FA5' : '1px solid #E5E7EB',
            background: photoOnly ? '#E6F1FB' : '#fff',
            color: photoOnly ? '#185FA5' : '#6B7280',
          }}>📷 사진 있는 것만</button>
      </div>

      {filtered.length === 0
        ? <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E5E7EB', padding: '60px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
            {reports.length === 0 ? '작성된 리포트가 없습니다' : '조건에 맞는 리포트가 없습니다'}
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(r => {
            const date = r.createdAt?.seconds
              ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
              : '날짜 없음';
            return (
              <div key={r.id} style={{ background: '#fff', borderRadius: '16px', padding: '16px 18px', border: '1px solid #E5E7EB', cursor: 'pointer' }}
                onClick={() => setPreviewReport(r)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{r.studentName}</p>
                      {r.photoUrls?.length > 0 && <span style={{ fontSize: '11px' }}>📷{r.photoUrls.length}</span>}
                    </div>
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>{date} · {r.teacherName}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '20px' }}>{RATING_EMOJI[r.homeworkRating] || ''}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm('삭제하시겠습니까?')) onDelete(r.id); }}
                      style={{ background: 'none', border: 'none', color: '#D1D5DB', fontSize: '18px', cursor: 'pointer' }}>×</button>
                  </div>
                </div>
                {r.textbook && <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 4px', fontWeight: 500 }}>{r.textbook} · {r.unit}</p>}
                {r.teacherNote && (
                  <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0, lineHeight: 1.6, fontWeight: 500, background: '#F9FAFB', padding: '8px 10px', borderRadius: '8px' }}>
                    {r.teacherNote.length > 80 ? r.teacherNote.slice(0, 80) + '...' : r.teacherNote}
                  </p>
                )}
                <p style={{ fontSize: '11px', color: '#185FA5', fontWeight: 600, margin: '8px 0 0' }}>👆 탭하여 전체 보기</p>
              </div>
            );
          })}
        </div>
      }

      {/* 리포트 미리보기 모달 */}
      {previewReport && (
        <ReportPreviewModal
          report={previewReport}
          allReports={reports}
          onClose={() => setPreviewReport(null)}
          onDelete={(id) => { onDelete(id); setPreviewReport(null); }}
        />
      )}
    </div>
  );
}

function ReportPreviewModal({ report: r, allReports, onClose, onDelete }) {
  const date = r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '날짜 없음';
  const cardRef = React.useRef(null);
  const [downloading, setDownloading] = React.useState(false);

  const studentReports = (allReports || []).filter(x => x.studentId === r.studentId);
  const stageInfo = getStageInfo(calculateTotalPoints(studentReports));

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${r.studentName}_리포트_${date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      alert('이미지 저장 실패: ' + e.message);
    }
    setDownloading(false);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '600px', maxHeight: '85vh', overflow: 'auto', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}
        onClick={(e) => e.stopPropagation()}>

        {/* 모달 헤더 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
          <div>
            <p style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{r.studentName} 리포트</p>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>{date} · {r.teacherName}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleDownload} disabled={downloading} style={{ background: '#0F6E56', color: '#fff', border: 'none', borderRadius: '9px', padding: '7px 14px', fontSize: '12px', fontWeight: 700, cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {downloading ? '저장 중...' : '📥 이미지 저장'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#6B7280', cursor: 'pointer' }}>×</button>
          </div>
        </div>

        {/* 이미지로 저장될 카드 영역 */}
        <div ref={cardRef} style={{ padding: '20px', background: '#fff' }}>

          {/* 카드 헤더 */}
          <div style={{ background: '#F0F7FC', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#185FA5', fontWeight: 700, margin: '0 0 4px' }}>교현학원 오늘의 학습 리포트</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 2px' }}>{r.studentName} 학생</p>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: 0, fontWeight: 700 }}>{date} · {r.teacherName}{/선생님?$/.test(r.teacherName || '') ? '' : ' 선생님'}</p>
          </div>

          {/* 성장 단계 */}
          <div style={{ background: 'linear-gradient(135deg, #F0E8FF, #F7F1FF)', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '30px' }}>{stageInfo.current.icon}</span>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#4A2E7A' }}>{stageInfo.current.label} 단계</p>
                <p style={{ fontSize: '10px', color: '#8A6BB5', fontWeight: 600, margin: '2px 0 0' }}>누적 {stageInfo.totalPoints}P{stageInfo.next ? ` · 다음 ${stageInfo.next.icon}${stageInfo.next.label}까지 ${stageInfo.next.min - stageInfo.totalPoints}P` : ' · 최고 단계 달성 🎉'}</p>
              </div>
            </div>
            <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: `conic-gradient(#6B3FA0 ${stageInfo.pct * 3.6}deg, #E5D6FA 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: '#6B3FA0' }}>{stageInfo.pct}%</div>
            </div>
          </div>

          {/* 오늘 찍은 문제집 사진 */}
          {r.photoUrls?.length > 0 && (
            <div style={{ background: '#F9FAFB', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', border: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 8px' }}>📷 오늘 푼 문제집</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(r.photoUrls.length, 3)}, 1fr)`, gap: '6px' }}>
                {r.photoUrls.map((url, i) => (
                  <img key={i} src={url} alt={`문제집 사진 ${i + 1}`} crossOrigin="anonymous"
                    style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                ))}
              </div>
            </div>
          )}

          {/* 출결 및 평가 */}
          <div style={{ background: '#F0F7FC', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
            <p style={{ fontSize: '11px', color: '#185FA5', fontWeight: 700, margin: '0 0 10px' }}>📋 출결 및 평가</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 600 }}>{r.attendance} · {r.arrivalTime}</span>
              <span style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 600 }}>과제 {RATING_EMOJI[r.homeworkRating]} {r.homeworkRating}점</span>
              <span style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 600 }}>개념 {RATING_EMOJI[r.conceptRating]} {r.conceptRating}점</span>
            </div>
          </div>

          {/* 테스트 */}
          {r.hasTest && r.testName && (
            <div style={{ background: '#FAEEDA', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: '#854F0B', fontWeight: 700, margin: '0 0 6px' }}>📝 테스트</p>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{r.testName}</p>
              {r.testScore && <p style={{ fontSize: '22px', fontWeight: 700, color: '#633806', margin: '4px 0 0' }}>{r.testScore}점</p>}
            </div>
          )}

          {/* 오늘 학습 */}
          {(r.textbook || r.unit) && (
            <div style={{ background: '#F9FAFB', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', border: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 6px' }}>📚 오늘 학습</p>
              {r.textbook && <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{r.textbook}</p>}
              {(r.unit || r.pages) && <p style={{ fontSize: '12px', color: '#6B7280', margin: '3px 0 0' }}>{r.unit}{r.unit && r.pages ? ' · ' : ''}{r.pages}</p>}
            </div>
          )}

          {/* 진단 태그 */}
          {r.diagnosis?.length > 0 && (
            <div style={{ background: '#FAEEDA', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: '#854F0B', fontWeight: 700, margin: '0 0 8px' }}>🎯 오늘의 진단</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {r.diagnosis.map((d, i) => {
                  const tag = DIAGNOSIS_TAGS_MAP[d.key] || {};
                  return (
                    <div key={i} style={{ background: '#fff', borderRadius: '10px', padding: '10px 12px' }}>
                      <span style={{ display: 'inline-block', background: tag.bg, border: `1px solid ${tag.border}`, color: tag.color, fontSize: '11px', padding: '2px 8px', borderRadius: '5px', fontWeight: 700, marginBottom: d.detail ? '5px' : 0 }}>
                        {tag.label}{d.unit ? ` · ${d.unit}` : ''}{d.pages ? ` ${d.pages}` : ''}
                      </span>
                      {d.detail && <p style={{ fontSize: '12px', color: '#633806', margin: 0, fontWeight: 500 }}>{d.detail}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 선생님 코멘트 */}
          {r.teacherNote && (
            <div style={{ background: '#F9FAFB', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', border: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 6px' }}>💬 선생님 한 마디</p>
              <p style={{ fontSize: '13px', color: '#1A1A1A', margin: 0, lineHeight: 1.7, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{r.teacherNote}</p>
            </div>
          )}

          {/* 다음 수업 계획 */}
          {r.nextPlan && (
            <div style={{ background: '#E1F5EE', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: '#0F6E56', fontWeight: 700, margin: '0 0 6px' }}>➡️ 다음 수업 계획</p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#085041', margin: 0 }}>{r.nextPlan}</p>
              {r.nextPlanDetail && <p style={{ fontSize: '12px', color: '#0F6E56', margin: '3px 0 0' }}>{r.nextPlanDetail}</p>}
            </div>
          )}

          {/* 하단 서명 */}
          <div style={{ textAlign: 'center', padding: '10px 0 0', borderTop: '1px solid #E5E7EB', marginTop: '4px' }}>
            <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>교현학원 · 031-707-0591</p>
          </div>
        </div>

        {/* 삭제 버튼 (이미지에 포함 안 됨) */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB' }}>
          <button
            onClick={() => { if (confirm(`${r.studentName} 리포트를 삭제하시겠습니까?`)) onDelete(r.id); }}
            style={{ width: '100%', padding: '12px', fontSize: '13px', fontWeight: 700, borderRadius: '12px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
            🗑 이 리포트 삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 설정 뷰
// ============================================================
function SettingsView({ students, onSaveStudent }) {
  const [globalColor, setGlobalColor] = React.useState(() => {
    return localStorage.getItem('globalSkinColor') || DEFAULT_SKIN_COLOR;
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const saveGlobalColor = () => {
    localStorage.setItem('globalSkinColor', globalColor);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const derived = deriveColors(globalColor);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.02em' }}>스킨 설정</h2>
      <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '20px', fontWeight: 500 }}>학원 기본 색상을 설정하세요. 학생별로 다르게 설정할 수 있습니다.</p>

      {/* 학원 기본 스킨 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px' }}>🏫 학원 기본 스킨</p>

        {/* 프리셋 */}
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, marginBottom: '8px' }}>프리셋 선택</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {PRESET_SKINS.map(sk => (
            <div
              key={sk.key}
              onClick={() => setGlobalColor(sk.main)}
              style={{
                borderRadius: '10px', overflow: 'hidden', cursor: 'pointer',
                border: globalColor === sk.main ? '2.5px solid #185FA5' : '2px solid #E5E7EB',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ height: '32px', background: sk.main }}></div>
              <div style={{ padding: '5px 4px', background: '#F9FAFB', textAlign: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: globalColor === sk.main ? '#185FA5' : '#6B7280' }}>{sk.name}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 커스텀 컬러피커 */}
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, marginBottom: '8px' }}>🎨 직접 선택</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F9FAFB', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
          <div style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '12px', background: globalColor, flexShrink: 0, border: '2px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <input type="color" value={globalColor} onChange={(e) => setGlobalColor(e.target.value)}
              style={{ position: 'absolute', inset: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', border: 'none', padding: 0, cursor: 'pointer', opacity: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 2px' }}>메인 컬러</p>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9B80C0', margin: 0, fontFamily: 'monospace' }}>{globalColor}</p>
          </div>
          <button
            onClick={() => document.querySelector('input[type=color]').click()}
            style={{ background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            변경
          </button>
        </div>

        {/* 파생 색상 미리보기 */}
        <div style={{ background: '#F8F6FC', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
          <p style={{ fontSize: '9px', fontWeight: 700, color: '#B0A0C8', letterSpacing: '0.1em', marginBottom: '8px', fontFamily: 'Montserrat, sans-serif' }}>자동 파생 색상</p>
          {[
            { label: '헤더 배경', color: globalColor },
            { label: '다크 카드', color: globalColor },
            { label: '라이트 카드', color: derived.cardLight },
            { label: '텍스트 자동 대비', color: derived.textDark, text: '자동 계산' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: i < 3 ? '7px' : 0 }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: item.color, border: '1.5px solid rgba(0,0,0,0.06)', flexShrink: 0 }}></div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', flex: 1 }}>{item.label}</span>
              {item.text
                ? <span style={{ fontSize: '9px', fontWeight: 700, color: '#6B3FA0', background: '#F0E8FF', padding: '2px 7px', borderRadius: '6px' }}>{item.text}</span>
                : <span style={{ fontSize: '10px', fontWeight: 600, color: '#B0A0C8', fontFamily: 'monospace' }}>{item.color}</span>
              }
            </div>
          ))}
        </div>

        <button
          onClick={saveGlobalColor}
          style={{ width: '100%', background: saved ? '#2E7D32' : '#185FA5', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}>
          {saved ? '✓ 저장됐습니다!' : '학원 기본 스킨 저장'}
        </button>
      </div>

      {/* 학생별 스킨 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>👨‍🎓 학생별 스킨 커스텀</p>
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: '14px' }}>학생 관리 탭 → 수정 버튼에서 개별 설정 가능</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {students.map(s => {
            const skinColor = s.skinColor || globalColor;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E6F1FB', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.avatar
                    ? <img src={`/avatars/${s.avatar}.png`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '14px', fontWeight: 700, color: '#185FA5' }}>{s.name?.[0]}</span>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{s.name}</p>
                  <p style={{ fontSize: '10px', color: '#6B7280', margin: '1px 0 0', fontWeight: 500 }}>{s.school}</p>
                </div>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: skinColor, border: '2px solid rgba(0,0,0,0.08)', flexShrink: 0 }}></div>
                <span style={{ fontSize: '10px', color: s.skinColor ? '#185FA5' : '#9CA3AF', fontWeight: 600 }}>
                  {s.skinColor ? '개별 설정' : '기본 사용'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 성장 단계 카드 ──
function GrowthStageCard({ reports }) {
  const { current, next, pct, totalPoints } = getStageInfo(calculateTotalPoints(reports));
  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '32px' }}>{current.icon}</span>
          <div>
            <p style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>{current.label}</p>
            <p style={{ fontSize: '11px', color: '#9B6FD4', fontWeight: 600, margin: '2px 0 0' }}>누적 {totalPoints}P</p>
          </div>
        </div>
        {next && (
          <span style={{ background: '#F0E8FF', color: '#6B3FA0', fontSize: '11px', fontWeight: 700, padding: '5px 12px', borderRadius: '20px', border: '1.5px solid rgba(107,63,160,0.2)' }}>
            다음: {next.icon} {next.label}
          </span>
        )}
      </div>
      <div style={{ height: '10px', background: '#F0E8FF', borderRadius: '20px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '20px', background: 'linear-gradient(90deg, #6B3FA0, #9B6FD4)' }} />
      </div>
      {next && <p style={{ fontSize: '10px', color: '#B0A0C8', marginTop: '6px', textAlign: 'right' }}>{next.min - totalPoints}P 남음</p>}
      {!next && <p style={{ fontSize: '10px', color: '#B0A0C8', marginTop: '6px', textAlign: 'right' }}>최고 단계 달성 🎉</p>}
    </div>
  );
}

// ── 과제/시험 성취 추이 차트 ──
function HomeworkTestChart({ reports }) {
  const data = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({
      date: r.createdAt?.seconds
        ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
        : '',
      과제: r.homeworkRating || 0,
      개념: r.conceptRating || 0,
      시험: r.hasTest && r.testScore ? Math.round(Number(r.testScore) / 20) : null, // 100점 만점 → 5점 척도로 환산해 같은 축에 표시
    }));

  if (data.length === 0) return null;

  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>과제 · 개념 · 시험 추이</h3>
      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 10px' }}>막대가 높을수록 그날 점수가 좋았다는 뜻입니다 (5점 만점 기준).</p>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="과제" fill="#185FA5" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="과제" position="top" style={{ fontSize: '10px', fill: '#185FA5', fontWeight: 700 }} />
            </Bar>
            <Bar dataKey="개념" fill="#9B6FD4" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="개념" position="top" style={{ fontSize: '10px', fill: '#9B6FD4', fontWeight: 700 }} />
            </Bar>
            <Bar dataKey="시험" fill="#0F6E56" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="시험" position="top" style={{ fontSize: '10px', fill: '#0F6E56', fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '6px' }}>* 시험 점수는 100점 만점을 5점 척도로 환산해 표시</p>
    </div>
  );
}

// ── 데이터 기반 인사이트 문장 생성 (AI 호출 없이 계산만으로, 즉시·무료) ──
const TAG_LABELS = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };

function buildInsights(reports) {
  if (!reports || reports.length === 0) return null;
  const sorted = [...reports].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const avgOf = (arr, key) => arr.length ? arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length : 0;
  const overallHw = avgOf(sorted, 'homeworkRating');
  const overallCc = avgOf(sorted, 'conceptRating');

  // 최근 절반 vs 이전 절반 비교로 추세 판단 (최소 4건부터 의미있는 비교)
  let trendText = null;
  if (sorted.length >= 4) {
    const mid = Math.floor(sorted.length / 2);
    const prevHalf = sorted.slice(0, mid);
    const recentHalf = sorted.slice(mid);
    const hwDelta = avgOf(recentHalf, 'homeworkRating') - avgOf(prevHalf, 'homeworkRating');
    const ccDelta = avgOf(recentHalf, 'conceptRating') - avgOf(prevHalf, 'conceptRating');
    const parts = [];
    if (Math.abs(hwDelta) >= 0.5) parts.push(`과제 수행이 최근 ${hwDelta > 0 ? '상승' : '하락'}세(${hwDelta > 0 ? '+' : ''}${hwDelta.toFixed(1)}점)`);
    if (Math.abs(ccDelta) >= 0.5) parts.push(`개념 이해가 최근 ${ccDelta > 0 ? '상승' : '하락'}세(${ccDelta > 0 ? '+' : ''}${ccDelta.toFixed(1)}점)`);
    if (parts.length > 0) trendText = parts.join(', ') + '입니다.';
  }

  // 진단 태그 최빈값
  const tagCount = {};
  sorted.forEach(r => (r.diagnosis || []).forEach(d => { tagCount[d.key] = (tagCount[d.key] || 0) + 1; }));
  const tagEntries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  const topTag = tagEntries[0];

  // 시험 평균/추세
  const testReports = sorted.filter(r => r.hasTest && r.testScore);
  const testAvg = testReports.length ? avgOf(testReports, 'testScore') : null;
  const testTrend = testReports.length >= 2
    ? Number(testReports[testReports.length - 1].testScore) - Number(testReports[0].testScore)
    : null;

  // 강점/보완 bullet
  const strengths = [];
  const weaknesses = [];
  if (overallHw >= 4) strengths.push(`과제 수행 평균 ${overallHw.toFixed(1)}점 — 꾸준히 성실하게 임하고 있습니다.`);
  if (overallCc >= 4) strengths.push(`개념 이해 평균 ${overallCc.toFixed(1)}점 — 새 단원 적응력이 좋습니다.`);
  if (tagEntries.find(([k]) => k === 'perfect')) strengths.push(`'개념 완벽' 진단이 ${tagCount.perfect}회 기록됐습니다.`);
  if (testTrend !== null && testTrend > 0) strengths.push(`시험 점수가 최근 ${testTrend > 0 ? '+' : ''}${testTrend}점 상승했습니다.`);

  if (topTag && topTag[0] !== 'perfect') weaknesses.push(`'${TAG_LABELS[topTag[0]]}' 패턴이 ${topTag[1]}회로 가장 빈번합니다 — 이 부분 집중 보강을 권장합니다.`);
  if (overallHw < 3.5 && overallHw > 0) weaknesses.push(`과제 수행 평균이 ${overallHw.toFixed(1)}점으로 다소 낮습니다.`);
  if (overallCc < 3.5 && overallCc > 0) weaknesses.push(`개념 이해 평균이 ${overallCc.toFixed(1)}점으로 보강이 필요합니다.`);

  // 한 줄 종합 요약
  let summary = `최근 ${sorted.length}회 리포트 기준, 과제 평균 ${overallHw.toFixed(1)}점 · 개념 평균 ${overallCc.toFixed(1)}점입니다.`;
  if (testAvg !== null) summary += ` 시험 평균은 ${Math.round(testAvg)}점입니다.`;
  if (trendText) summary += ` ${trendText}`;

  return { summary, strengths, weaknesses, testAvg, testTrend, sampleSize: sorted.length };
}

function InsightCard({ reports }) {
  const insight = buildInsights(reports);
  if (!insight) return null;
  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>📊 인사이트 요약</h3>
      <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#1A1A1A', margin: '0 0 12px', fontWeight: 500 }}>{insight.summary}</p>

      {insight.strengths.length > 0 && (
        <div style={{ background: '#E1F5EE', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F6E56', margin: '0 0 6px' }}>✅ 강점</p>
          {insight.strengths.map((s, i) => (
            <p key={i} style={{ fontSize: '12px', color: '#085041', margin: i > 0 ? '4px 0 0' : 0, lineHeight: 1.5 }}>{s}</p>
          ))}
        </div>
      )}
      {insight.weaknesses.length > 0 && (
        <div style={{ background: '#FAEEDA', borderRadius: '10px', padding: '10px 12px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#854F0B', margin: '0 0 6px' }}>🔧 보완 포인트</p>
          {insight.weaknesses.map((s, i) => (
            <p key={i} style={{ fontSize: '12px', color: '#633806', margin: i > 0 ? '4px 0 0' : 0, lineHeight: 1.5 }}>{s}</p>
          ))}
        </div>
      )}
      {insight.sampleSize < 4 && (
        <p style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '8px' }}>* 리포트가 더 쌓이면(4건 이상) 추세 분석이 추가됩니다.</p>
      )}
    </div>
  );
}

// ── 기간별 종합 리포트 (이미지 내보내기) ──
function MonthlyReportModal({ student, reports, allReports, periodLabel, onClose }) {
  const cardRef = React.useRef(null);
  const [downloading, setDownloading] = React.useState(false);

  const sorted = [...reports].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const avgOf = (key) => sorted.length ? Math.round(sorted.reduce((s, r) => s + (r[key] || 0), 0) / sorted.length * 10) / 10 : 0;
  const homeworkAvg = avgOf('homeworkRating');
  const conceptAvg = avgOf('conceptRating');
  const testReports = sorted.filter(r => r.hasTest && r.testScore);
  const testAvg = testReports.length ? Math.round(testReports.reduce((s, r) => s + Number(r.testScore || 0), 0) / testReports.length) : null;
  const insight = buildInsights(sorted);

  const fmtDate = (r) => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    : '-';

  // ── 누적 성장 곡선 (차별화 핵심 — 기간 상관없이 전체 히스토리 기준) ──
  const fullSorted = [...(allReports || reports)].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  let running = 0;
  const cumulativeSeries = fullSorted.map(r => {
    running += (r.points ?? calculateReportPoints(r));
    return { date: fmtDate(r), value: running, ts: r.createdAt?.seconds || 0 };
  });
  const stageInfo = getStageInfo(running);
  const periodStartPoints = (() => {
    if (sorted.length === 0) return running;
    const firstInPeriodTs = sorted[0].createdAt?.seconds || 0;
    let pts = 0;
    for (const r of fullSorted) {
      if ((r.createdAt?.seconds || 0) < firstInPeriodTs) pts += (r.points ?? calculateReportPoints(r));
      else break;
    }
    return pts;
  })();
  const periodGained = running - periodStartPoints;

  // 누적 곡선 SVG 좌표 계산 (recharts 미사용 — html2canvas 캡처 안정성)
  const chartW = 560, chartH = 130, pad = 24;
  const maxVal = Math.max(...cumulativeSeries.map(d => d.value), 10);
  const stepX = cumulativeSeries.length > 1 ? (chartW - pad * 2) / (cumulativeSeries.length - 1) : 0;
  const toXY = (d, i) => {
    const x = pad + i * stepX;
    const y = chartH - pad - (d.value / maxVal) * (chartH - pad * 1.5);
    return [x, y];
  };
  const points = cumulativeSeries.map(toXY);
  const polyline = points.map(([x, y]) => `${x},${y}`).join(' ');
  const periodStartIdx = cumulativeSeries.findIndex(d => d.ts >= (sorted[0]?.createdAt?.seconds || Infinity));

  // ── 통합 피드백 (원문 나열 대신, 진단 태그·추세를 한 문단으로 종합) ──
  const tagCount = {};
  sorted.forEach(r => (r.diagnosis || []).forEach(d => { tagCount[d.key] = (tagCount[d.key] || 0) + 1; }));
  const tagEntries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  const noteCount = sorted.filter(r => r.teacherNote).length;
  let combinedFeedback = `이번 ${periodLabel} 동안 총 ${sorted.length}회 수업이 진행됐고, 그중 ${noteCount}회에 걸쳐 담당 선생님의 개별 피드백이 누적됐습니다.`;
  if (tagEntries.length > 0) {
    const [topKey, topCount] = tagEntries[0];
    if (topKey === 'perfect') {
      combinedFeedback += ` 이 기간 가장 두드러진 특징은 '개념 완벽' 진단이 ${topCount}회로 가장 많았다는 점이며, 이는 꾸준한 이해도 유지를 의미합니다.`;
    } else {
      combinedFeedback += ` 선생님들이 공통적으로 짚은 지점은 '${TAG_LABELS[topKey]}'(${topCount}회)로, 이번 기간 학습에서 가장 반복적으로 관찰된 패턴입니다.`;
    }
  }
  if (periodGained > 0) {
    combinedFeedback += ` 이 기간 동안 성장 포인트가 ${periodGained}P 누적되며 꾸준한 진전을 보였습니다.`;
  }

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const link = document.createElement('a');
      link.download = `${student?.name}_종합리포트_${periodLabel}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      alert('이미지 저장 실패: ' + e.message);
    }
    setDownloading(false);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '640px', maxHeight: '85vh', overflow: 'auto', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}
        onClick={(e) => e.stopPropagation()}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
          <div>
            <p style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{student?.name} 종합 리포트</p>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>{periodLabel} · {sorted.length}건</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleDownload} disabled={downloading} style={{ background: '#0F6E56', color: '#fff', border: 'none', borderRadius: '9px', padding: '7px 14px', fontSize: '12px', fontWeight: 700, cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {downloading ? '저장 중...' : '📥 이미지 저장'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#6B7280', cursor: 'pointer' }}>×</button>
          </div>
        </div>

        <div ref={cardRef} style={{ padding: '24px', background: '#fff' }}>
          {/* 표지 헤더 */}
          <div style={{ background: 'linear-gradient(135deg, #185FA5, #0C447C)', borderRadius: '16px', padding: '20px', marginBottom: '16px', textAlign: 'center', color: '#fff' }}>
            <p style={{ fontSize: '10px', letterSpacing: '0.2em', margin: '0 0 6px', opacity: 0.8, fontWeight: 700 }}>교현학원 종합 리포트</p>
            <p style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 4px' }}>{student?.name} 학생</p>
            <p style={{ fontSize: '12px', margin: 0, opacity: 0.85 }}>{periodLabel} · {student?.school}</p>
          </div>

          {/* ★ 성장 평가 — 차별화 핵심 섹션, 최상단 배치 */}
          <div style={{ background: 'linear-gradient(135deg, #F0E8FF, #F7F1FF)', border: '1.5px solid rgba(107,63,160,0.15)', borderRadius: '16px', padding: '18px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '32px' }}>{stageInfo.current.icon}</span>
                <div>
                  <p style={{ fontSize: '11px', color: '#8A6BB5', fontWeight: 700, margin: 0 }}>현재 성장 단계</p>
                  <p style={{ fontSize: '18px', fontWeight: 800, margin: '2px 0 0', color: '#4A2E7A' }}>{stageInfo.current.label} · 누적 {stageInfo.totalPoints}P</p>
                </div>
              </div>
              {periodGained > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '10px', color: '#8A6BB5', fontWeight: 700, margin: 0 }}>{periodLabel} 획득</p>
                  <p style={{ fontSize: '20px', fontWeight: 800, margin: '2px 0 0', color: '#0F6E56' }}>+{periodGained}P</p>
                </div>
              )}
            </div>

            {/* 단계 진행바 */}
            <div style={{ height: '8px', background: '#E5D6FA', borderRadius: '20px', overflow: 'hidden', marginBottom: '4px' }}>
              <div style={{ height: '100%', width: `${stageInfo.pct}%`, borderRadius: '20px', background: 'linear-gradient(90deg, #6B3FA0, #9B6FD4)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '9px', color: '#B0A0C8' }}>{STAGES.map(s => s.icon).join(' → ')}</span>
              {stageInfo.next && <span style={{ fontSize: '9px', color: '#B0A0C8' }}>다음 {stageInfo.next.icon}{stageInfo.next.label}까지 {stageInfo.next.min - stageInfo.totalPoints}P</span>}
            </div>

            {/* 누적 성장 곡선 (전체 히스토리) */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '10px 12px 4px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#6B3FA0', margin: '0 0 4px' }}>누적 성장 곡선 (등원 시작일부터)</p>
              {cumulativeSeries.length >= 2 ? (
                <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH}>
                  {periodStartIdx > 0 && (
                    <rect x={points[periodStartIdx][0]} y={0} width={chartW - pad - points[periodStartIdx][0]} height={chartH} fill="#F0E8FF" />
                  )}
                  <polyline points={polyline} fill="none" stroke="#6B3FA0" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  {points.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 4 : 2} fill={i === points.length - 1 ? '#0F6E56' : '#9B6FD4'} />
                  ))}
                  <text x={points[points.length - 1][0] - 10} y={points[points.length - 1][1] - 8} fontSize="11" fontWeight="700" fill="#0F6E56" textAnchor="end">{running}P</text>
                </svg>
              ) : (
                <p style={{ fontSize: '11px', color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>누적 데이터가 더 쌓이면 곡선이 표시됩니다</p>
              )}
              <p style={{ fontSize: '9px', color: '#B0A0C8', margin: '4px 0 6px' }}>보라색 배경 = {periodLabel} 구간</p>
            </div>
          </div>

          {/* 핵심 지표 (이 기간 스냅샷) */}
          <div style={{ display: 'grid', gridTemplateColumns: testAvg !== null ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <div style={{ background: '#F0F7FC', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: '#185FA5', fontWeight: 700, margin: '0 0 4px' }}>총 수업</p>
              <p style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{sorted.length}회</p>
            </div>
            <div style={{ background: '#F0F7FC', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: '#185FA5', fontWeight: 700, margin: '0 0 4px' }}>과제 평균</p>
              <p style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{homeworkAvg}점</p>
            </div>
            <div style={{ background: '#F0F7FC', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: '#185FA5', fontWeight: 700, margin: '0 0 4px' }}>개념 평균</p>
              <p style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{conceptAvg}점</p>
            </div>
            {testAvg !== null && (
              <div style={{ background: '#F0F7FC', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: '#185FA5', fontWeight: 700, margin: '0 0 4px' }}>시험 평균</p>
                <p style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{testAvg}점</p>
              </div>
            )}
          </div>

          {/* 개념이해도 추이 (이 기간) */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 12px' }}>개념 이해도 추이 ({periodLabel})</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '90px' }}>
              {sorted.map((r, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#9B6FD4', marginBottom: '2px' }}>{r.conceptRating || 0}</span>
                  <div style={{ width: '100%', maxWidth: '18px', height: `${((r.conceptRating || 0) / 5) * 70}px`, background: '#9B6FD4', borderRadius: '3px 3px 0 0' }} />
                  <span style={{ fontSize: '8px', color: '#9CA3AF', marginTop: '4px' }}>{fmtDate(r)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 수업이력 테이블 */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 8px' }}>수업 이력</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {['날짜', '출결', '과제', '개념', '시험', '학습 단원'].map(h => (
                    <th key={h} style={{ padding: '6px 4px', textAlign: 'left', fontWeight: 700, color: '#6B7280', borderBottom: '1.5px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '6px 4px' }}>{fmtDate(r)}</td>
                    <td style={{ padding: '6px 4px' }}>{r.attendance || '-'}</td>
                    <td style={{ padding: '6px 4px' }}>{r.homeworkRating || 0}점</td>
                    <td style={{ padding: '6px 4px' }}>{r.conceptRating || 0}점</td>
                    <td style={{ padding: '6px 4px' }}>{r.hasTest && r.testScore ? `${r.testScore}점` : '-'}</td>
                    <td style={{ padding: '6px 4px' }}>{[r.textbook, r.unit].filter(Boolean).join(' · ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 강점/보완 */}
          {insight && (insight.strengths.length > 0 || insight.weaknesses.length > 0) && (
            <div style={{ marginBottom: '16px' }}>
              {insight.strengths.length > 0 && (
                <div style={{ background: '#E1F5EE', borderRadius: '12px', padding: '12px 14px', marginBottom: '8px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F6E56', margin: '0 0 6px' }}>✅ 강점</p>
                  {insight.strengths.map((s, i) => <p key={i} style={{ fontSize: '11px', color: '#085041', margin: i > 0 ? '3px 0 0' : 0, lineHeight: 1.5 }}>{s}</p>)}
                </div>
              )}
              {insight.weaknesses.length > 0 && (
                <div style={{ background: '#FAEEDA', borderRadius: '12px', padding: '12px 14px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#854F0B', margin: '0 0 6px' }}>🔧 보완 포인트</p>
                  {insight.weaknesses.map((s, i) => <p key={i} style={{ fontSize: '11px', color: '#633806', margin: i > 0 ? '3px 0 0' : 0, lineHeight: 1.5 }}>{s}</p>)}
                </div>
              )}
            </div>
          )}

          {/* 통합 피드백 (원문 나열 대신 종합) */}
          <div style={{ background: '#F0F7FC', borderRadius: '14px', padding: '16px', marginBottom: '4px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#185FA5', margin: '0 0 8px' }}>✦ 종합 피드백</p>
            <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0, lineHeight: 1.7 }}>{combinedFeedback}</p>
          </div>

          <div style={{ textAlign: 'center', padding: '12px 0 0', borderTop: '1px solid #E5E7EB', marginTop: '12px' }}>
            <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>교현학원 · 031-707-0591</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisView({ students, reports }) {
  const [selectedId, setSelectedId] = useState('');
  const studentReports = reports.filter(r => r.studentId === selectedId);
  const avg = (key) => studentReports.length ? Math.round(studentReports.reduce((a, r) => a + (r[key] || 0), 0) / studentReports.length * 10) / 10 : 0;

  // ── 기간 설정 (월간 고정 버튼 + 커스텀 기간) ──
  const [periodMode, setPeriodMode] = useState('all'); // all | thisMonth | lastMonth | custom
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);

  const getPeriodRange = () => {
    const now = new Date();
    if (periodMode === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { start, end, label: `${now.getFullYear()}년 ${now.getMonth() + 1}월` };
    }
    if (periodMode === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end, label: `${start.getFullYear()}년 ${start.getMonth() + 1}월` };
    }
    if (periodMode === 'custom' && customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd + 'T23:59:59');
      return { start, end, label: `${customStart} ~ ${customEnd}` };
    }
    return { start: null, end: null, label: '전체 기간' };
  };
  const { start: periodStart, end: periodEnd, label: periodLabel } = getPeriodRange();

  const periodReports = (periodStart && periodEnd)
    ? studentReports.filter(r => {
        const ts = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : 0;
        return ts >= periodStart.getTime() && ts <= periodEnd.getTime();
      })
    : studentReports;

  const periodAvg = (key) => periodReports.length ? Math.round(periodReports.reduce((a, r) => a + (r[key] || 0), 0) / periodReports.length * 10) / 10 : 0;

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>종합 분석</h2>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: `1px solid #E5E7EB`, marginBottom: '16px' }}>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '14px', fontWeight: 500, border: `1px solid #E5E7EB`, borderRadius: '10px', background: '#F9FAFB', outline: 'none', fontFamily: 'inherit' }}>
          <option value="">학생을 선택하세요</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.school}</option>)}
        </select>
      </div>
      {selectedId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 기간 선택 */}
          <div style={{ background: '#fff', borderRadius: '16px', padding: '14px 16px', border: `1px solid #E5E7EB` }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: periodMode === 'custom' ? '10px' : 0 }}>
              {[['all', '전체'], ['thisMonth', '이번달'], ['lastMonth', '지난달'], ['custom', '기간 지정']].map(([key, label]) => (
                <button key={key} onClick={() => setPeriodMode(key)}
                  style={{
                    padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
                    border: periodMode === key ? '1.5px solid #185FA5' : '1px solid #E5E7EB',
                    background: periodMode === key ? '#E6F1FB' : '#fff',
                    color: periodMode === key ? '#185FA5' : '#6B7280',
                  }}>{label}</button>
              ))}
            </div>
            {periodMode === 'custom' && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '12px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }} />
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>~</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '12px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }} />
              </div>
            )}
          </div>

          <GrowthStageCard reports={studentReports} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <StatCard label={`리포트 (${periodLabel})`} value={periodReports.length} unit="건" />
            <StatCard label="과제 평균" value={periodAvg('homeworkRating')} unit="점" />
            <StatCard label="개념 평균" value={periodAvg('conceptRating')} unit="점" />
          </div>
          <HomeworkTestChart reports={periodReports} />
          <InsightCard reports={periodReports} />
          <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: `1px solid #E5E7EB` }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>진단 태그 분포 ({periodLabel})</h3>
            {(() => {
              const tagCount = {};
              periodReports.forEach(r => (r.diagnosis || []).forEach(d => { tagCount[d.key] = (tagCount[d.key] || 0) + 1; }));
              const tagLabels = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
              const entries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
              return entries.length === 0
                ? <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center' }}>진단 데이터 없음</p>
                : entries.map(([key, count]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, width: '80px', flexShrink: 0 }}>{tagLabels[key]}</span>
                    <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#185FA5', borderRadius: '4px', width: `${Math.min(100, count * 20)}%` }} />
                    </div>
                    <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, width: '20px', textAlign: 'right' }}>{count}</span>
                  </div>
                ));
            })()}
          </div>

          <button onClick={() => setShowMonthlyReport(true)} disabled={periodReports.length === 0}
            style={{
              width: '100%', padding: '14px', fontSize: '14px', fontWeight: 700, borderRadius: '14px', border: 'none',
              background: periodReports.length === 0 ? '#E5E7EB' : 'linear-gradient(135deg, #185FA5, #0C447C)',
              color: periodReports.length === 0 ? '#9CA3AF' : '#fff',
              cursor: periodReports.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit'
            }}>
            📄 {periodLabel} 종합 리포트 만들기
          </button>
        </div>
      )}

      {showMonthlyReport && (
        <MonthlyReportModal
          student={students.find(s => s.id === selectedId)}
          reports={periodReports}
          allReports={studentReports}
          periodLabel={periodLabel}
          onClose={() => setShowMonthlyReport(false)}
        />
      )}
    </div>
  );
}
