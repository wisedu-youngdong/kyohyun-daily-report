import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, orderBy, query, where, getDocs
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
  const [userRole, setUserRole] = useState(null); // 'director' | 'teacher'
  const [userTeacherId, setUserTeacherId] = useState(null); // teachers 컬렉션 ID
  const [activeTab, setActiveTab] = useState('write');
  const [editingReport, setEditingReport] = useState(null);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // users 컬렉션에서 role 조회
        try {
          const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', u.uid)));
          if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            setUserRole(userData.role || 'director');
            setUserTeacherId(userData.teacherId || null);
          } else {
            // users 문서 없으면 director (기존 원장님 계정)
            setUserRole('director');
            setUserTeacherId(null);
          }
        } catch (e) {
          setUserRole('director');
        }
      } else {
        setUserRole(null);
        setUserTeacherId(null);
      }
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
    // ── photoAnalysis → weakTypesSummary 자동 추출 ──
    const extractWeakTypes = (photoAnalysis) => {
      if (!photoAnalysis?.sections) return [];
      const typeMap = {};
      photoAnalysis.sections.forEach(sec => {
        // concept 섹션: 문항별 유형
        (sec.problemTypes || []).forEach(pt => {
          if (pt.result === '약점') {
            const key = pt.type || '기타';
            if (!typeMap[key]) typeMap[key] = { type: key, count: 0, sectionType: 'concept' };
            typeMap[key].count += 1;
          }
        });
        // mock_exam 섹션: weakDetail 유형
        (sec.weakDetail || []).forEach(wd => {
          const key = wd.type || '기타';
          if (!typeMap[key]) typeMap[key] = { type: key, count: 0, sectionType: 'mock_exam' };
          typeMap[key].count += 1;
        });
        // calculation 섹션: wrong 횟수를 '연산 실수'로 집계
        if (sec.sectionType === 'calculation' && sec.summary?.wrong > 0) {
          const key = '연산 실수';
          if (!typeMap[key]) typeMap[key] = { type: key, count: 0, sectionType: 'calculation' };
          typeMap[key].count += sec.summary.wrong;
        }
      });
      return Object.values(typeMap).sort((a, b) => b.count - a.count);
    };

    const weakTypesSummary = d.photoAnalysis ? extractWeakTypes(d.photoAnalysis) : [];

    let reportId;
    if (d.id) {
      const { id, ...data } = d;
      await updateDoc(doc(db, 'reports', id), { ...data, weakTypesSummary, updatedAt: serverTimestamp() });
      reportId = id;
    } else {
      const ref = await addDoc(collection(db, 'reports'), { ...d, weakTypesSummary, createdAt: serverTimestamp() });
      reportId = ref.id;
    }

    // ── 약점 태그 감지 → 복습 일정 자동 생성 ──
    const weakTags = (d.diagnosis || []).filter(t => ['calc','concept','apply','time'].includes(t.key));
    if (weakTags.length > 0 && !d.id) { // 신규 저장 시만 생성
      const now = new Date();
      const schedules = [7, 14, 30].map(days => {
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + days);
        return {
          studentId: d.studentId,
          studentName: d.studentName,
          reportId,
          textbook: d.textbook || '',
          unit: d.unit || '',
          weakTypes: weakTags.map(t => ({
            key: t.key,
            label: { calc:'계산 실수', concept:'개념 누락', apply:'응용 부족', time:'시간 부족' }[t.key],
            detail: t.detail || '',
            unit: t.unit || '',
          })),
          round: [7,14,30].indexOf(days) + 1, // 1차/2차/3차
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending', // pending | done
          testScore: null,
          note: '',
          createdAt: serverTimestamp(),
        };
      });
      await Promise.all(schedules.map(s => addDoc(collection(db, 'reviews'), s)));
    }
  };
  const handleDeleteReport = async (id) => {
    await deleteDoc(doc(db, 'reports', id));
    // 연결된 복습 일정 삭제 (reportId 기준)
    try {
      const q = query(collection(db, 'reviews'), where('reportId', '==', id));
      const snap = await getDocs(q);
      if (snap.docs.length > 0) {
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'reviews', d.id))));
      }
    } catch (e) {
      console.warn('복습 일정 삭제 중 오류 (무시 가능):', e);
    }
  };

  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: T.brand, fontSize: '14px', fontWeight: 600 }}>
      교현학원 연결 중...
    </div>
  );

  if (!user) return <LoginScreen />;

  const isDirector = userRole === 'director';

  // 강사는 담당 학생만, 원장은 전체
  const visibleStudents = isDirector
    ? students
    : students.filter(s => s.assignedTeacherId === userTeacherId);

  // 강사는 본인 작성 리포트만, 원장은 전체
  const visibleReports = isDirector
    ? reports
    : reports.filter(r => r.teacherId === userTeacherId);

  const allTabs = [
    { key: 'dashboard', label: '대시보드',   icon: <LayoutDashboard size={20} />, roles: ['director', 'teacher'] },
    { key: 'students',  label: '학생 관리',   icon: <Users size={20} />,           roles: ['director'] },
    { key: 'write',     label: '리포트 작성', icon: <FileText size={20} />,        roles: ['director', 'teacher'] },
    { key: 'history',   label: '기록 보관소', icon: <History size={20} />,         roles: ['director', 'teacher'] },
    { key: 'review',    label: '복습 관리',   icon: <span style={{fontSize:'20px'}}>🔁</span>, roles: ['director', 'teacher'] },
    { key: 'director',  label: '원장 보고서', icon: <span style={{fontSize:'20px'}}>📋</span>, roles: ['director'] },
    { key: 'analysis',  label: '종합 분석',   icon: <BarChart2 size={20} />,       roles: ['director'] },
    { key: 'settings',  label: '설정',        icon: <span style={{fontSize:'20px'}}>⚙️</span>, roles: ['director'] },
  ];
  const tabs = allTabs.filter(t => t.roles.includes(userRole || 'director'));

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
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: isDirector ? '#EAF0F9' : '#E1F5EE', color: isDirector ? '#0D2D6B' : '#0F6E56' }}>
          {isDirector ? '원장' : (teachers.find(t => t.id === userTeacherId)?.name || '강사')}
        </span>
        <button onClick={() => signOut(auth)} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="로그아웃">
          <LogOut size={16} />
        </button>
      </header>

      <main>
        {activeTab === 'dashboard' && <DashboardView students={visibleStudents} reports={visibleReports} onTabChange={setActiveTab} />}
        {activeTab === 'students' && <StudentsView students={students} reports={reports} onSave={handleSaveStudent} onDelete={handleDeleteStudent} teachers={teachers} />}
        {activeTab === 'write' && (
          <DiagnosticReportInput
            students={visibleStudents} teachers={teachers}
            onSaveStudent={handleSaveStudent}
            onSaveTeacher={handleSaveTeacher}
            onDeleteTeacher={handleDeleteTeacher}
            onSave={handleSaveReport}
            editingReport={editingReport}
            onEditDone={() => setEditingReport(null)}
          />
        )}
        {activeTab === 'history' && <HistoryView reports={visibleReports} students={visibleStudents} onDelete={handleDeleteReport} onEdit={(report) => { setEditingReport(report); setActiveTab('write'); }} />}
        {activeTab === 'review' && <ReviewView students={visibleStudents} />}
        {activeTab === 'director' && (
          <div>
            <DirectorView reports={reports} students={students} />
            <GrowthDashboard reports={reports} students={students} onSwitchTab={setActiveTab} />
          </div>
        )}
        {activeTab === 'analysis' && <AnalysisView students={students} reports={reports} />}
        {activeTab === 'settings' && <SettingsView students={students} onSaveStudent={handleSaveStudent} teachers={teachers} onSaveTeacher={handleSaveTeacher} onDeleteTeacher={handleDeleteTeacher} />}
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

function StudentsView({ students, reports, onSave, onDelete, teachers = [] }) {
  const [editingStudent, setEditingStudent] = useState(null);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>학생 관리</h2>
      {students.length === 0
        ? <div style={{ background: '#fff', borderRadius: '16px', border: `1px solid #E5E7EB`, padding: '60px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>리포트 작성 화면에서 학생을 추가하세요</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {students.map(s => {
            const sReports = reports.filter(r => r.studentId === s.id);
            const assignedTeacher = teachers.find(t => t.id === s.assignedTeacherId);
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
                  {assignedTeacher && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#0F6E56', background: '#E1F5EE', padding: '3px 8px', borderRadius: '6px', flexShrink: 0 }}>
                      {assignedTeacher.name}
                    </span>
                  )}
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
          teachers={teachers}
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
function StudentEditModal({ student, onClose, onSubmit, teachers = [] }) {
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
  const [assignedTeacherId, setAssignedTeacherId] = useState(student.assignedTeacherId || '');
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
      assignedTeacherId: assignedTeacherId || '',
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

          {teachers.length > 0 && (
            <div>
              <label style={labelStyle}>담당 강사</label>
              <select value={assignedTeacherId} onChange={e => setAssignedTeacherId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">미배정 (원장님 직접 관리)</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

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

const RATING_LEVELS_MAP = { 1: '노력 필요', 2: '조금 부족', 3: '보통', 4: '잘함', 5: '아주 잘함' };

const DIAGNOSIS_TAGS_MAP = {
  calc:    { label: '⚠ 계산 실수', bg: '#A32D2D', color: '#fff' },
  concept: { label: '⚠ 개념 누락', bg: '#A32D2D', color: '#fff' },
  apply:   { label: '⚠ 응용 부족', bg: '#A32D2D', color: '#fff' },
  time:    { label: '△ 시간 부족', bg: '#8A5A00', color: '#fff' },
  perfect: { label: '✓ 개념 완벽', bg: '#0F6E56', color: '#fff' },
};

function HistoryView({ reports, students, onDelete, onEdit }) {
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
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>{date} · {r.teacherName}</p>                  </div>
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
          onEdit={onEdit}
        />
      )}
    </div>
  );
}

function ReportPreviewModal({ report: r, allReports, onClose, onDelete, onEdit }) {
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
            <button onClick={() => {
              const url = `${window.location.origin}/report/${r.id}`;
              navigator.clipboard.writeText(url).then(() => alert('링크가 복사됐습니다!\n카톡에 붙여넣기 하세요.'));
            }} style={{ background: '#1A5CB8', color: '#fff', border: 'none', borderRadius: '9px', padding: '7px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              링크 복사
            </button>
            <button onClick={handleDownload} disabled={downloading} style={{ background: '#0F6E56', color: '#fff', border: 'none', borderRadius: '9px', padding: '7px 14px', fontSize: '12px', fontWeight: 700, cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {downloading ? '저장 중...' : '📥 이미지 저장'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#6B7280', cursor: 'pointer' }}>×</button>
          </div>
        </div>

        {/* 이미지로 저장될 카드 영역 — v2 디자인 (PublicReport와 동일) */}
        <div ref={cardRef} style={{ background: '#F5F5F0', padding: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '4px', overflow: 'hidden' }}>

          {/* 헤더 */}
          <div style={{ background: '#0D2D6B', padding: '20px 22px 18px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '4px', height: '20px', background: '#C9A227', borderRadius: '1px', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.15em', fontFamily: 'Montserrat, sans-serif' }}>와이즈에듀 교현학원</span>
            </div>
            <div style={{ height: '1px', background: 'rgba(201,162,39,0.3)', marginBottom: '14px' }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.15em', margin: '0 0 4px', fontWeight: 600, fontFamily: 'Montserrat, sans-serif' }}>LEARNING REPORT</p>
                <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: '26px', fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{r.studentName}</p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', margin: 0 }}>{date} · {r.teacherName}{/선생님?$/.test(r.teacherName || '') ? '' : ' 선생님'}</p>
              </div>
              <div style={{ border: '1px solid rgba(201,162,39,0.5)', padding: '6px 12px', textAlign: 'center', borderRadius: '2px', flexShrink: 0 }}>
                <p style={{ fontSize: '9px', color: '#C9A227', margin: '0 0 2px', letterSpacing: '0.08em', fontWeight: 700 }}>성장 단계</p>
                <p style={{ fontSize: '13px', fontWeight: 800, color: '#fff', margin: 0 }}>{stageInfo.current.label} · {stageInfo.totalPoints}P</p>
              </div>
            </div>
          </div>

          {/* 바디 */}
          <div style={{ padding: '18px 20px' }}>

            {/* 핵심 지표 — 수치 그리드 바로 시작 (B안: SUMMARY 제거) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '18px' }}>
              <div style={{ borderRight: '1px solid #E8E6E0', paddingRight: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: 'Montserrat, sans-serif' }}>과제 수행</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: '#0D2D6B', margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.homeworkRating || '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: '#98A1AC' }}>/5</span>
                </p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#5A6472', margin: '3px 0 0' }}>{RATING_LEVELS_MAP[r.homeworkRating] || ''}</p>
              </div>
              <div style={{ borderRight: '1px solid #E8E6E0', padding: '0 14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: 'Montserrat, sans-serif' }}>개념 이해</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: '#0D2D6B', margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.conceptRating || '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: '#98A1AC' }}>/5</span>
                </p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#5A6472', margin: '3px 0 0' }}>{RATING_LEVELS_MAP[r.conceptRating] || ''}</p>
              </div>
              <div style={{ paddingLeft: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: 'Montserrat, sans-serif' }}>출결</p>
                <p style={{ fontSize: '16px', fontWeight: 800, color: r.attendance === '정시' ? '#1E6B4E' : '#0D2D6B', margin: '4px 0', lineHeight: 1 }}>{r.attendance}</p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#5A6472', margin: '3px 0 0' }}>{r.arrivalTime} 등원</p>
              </div>
            </div>

            <div style={{ height: '1px', background: '#E8E6E0', marginBottom: '18px' }} />

            {/* 학습 범위 */}
            {(r.textbook || r.unit || r.pages) && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: 'Montserrat, sans-serif' }}>학습 범위</p>
                  {r.textbook && <p style={{ fontSize: '12px', fontWeight: 700, color: '#0D2D6B', margin: '0 0 2px', wordBreak: 'keep-all' }}>{r.textbook}</p>}
                  {r.unit && <p style={{ fontSize: '11px', color: '#5A6472', margin: '0 0 1px' }}>{r.unit}</p>}
                  {r.pages && <p style={{ fontSize: '11px', color: '#98A1AC', margin: 0 }}>{r.pages}</p>}
                </div>
                <div style={{ height: '1px', background: '#E8E6E0', marginBottom: '18px' }} />
              </>
            )}

            {/* TEST RESULT + 진단 배지 (시험 있는 경우) */}
            {r.hasTest && r.testName && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: 'Montserrat, sans-serif' }}>TEST RESULT</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                      {r.testScore && <p style={{ fontSize: '28px', fontWeight: 800, color: '#0D2D6B', margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{r.testScore}<span style={{ fontSize: '13px', fontWeight: 600, color: '#98A1AC', marginLeft: '2px' }}>점</span></p>}
                      <p style={{ fontSize: '12px', color: '#5A6472', margin: 0 }}>{r.testName}</p>
                    </div>
                    {r.diagnosis?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {r.diagnosis.map((d, i) => {
                          const tag = DIAGNOSIS_TAGS_MAP[d.key] || {};
                          return (
                            <span key={i} style={{ display: 'inline-block', background: tag.bg || '#8A5A00', color: tag.color || '#fff', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px' }}>
                              {tag.label}{d.unit ? ` · ${d.unit}` : ''}{d.pages ? ` ${d.pages}` : ''}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ height: '1px', background: '#E8E6E0', marginBottom: '18px' }} />
              </>
            )}

            {/* 진단 배지 (시험 없는 경우 — 독립 섹션) */}
            {(!r.hasTest || !r.testName) && r.diagnosis?.length > 0 && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: 'Montserrat, sans-serif' }}>진단</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {r.diagnosis.map((d, i) => {
                      const tag = DIAGNOSIS_TAGS_MAP[d.key] || {};
                      return (
                        <span key={i} style={{ display: 'inline-block', background: tag.bg || '#8A5A00', color: tag.color || '#fff', fontSize: '13px', fontWeight: 700, padding: '5px 13px', borderRadius: '20px' }}>
                          {tag.label}{d.unit ? ` · ${d.unit}` : ''}{d.pages ? ` ${d.pages}` : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ height: '1px', background: '#E8E6E0', marginBottom: '18px' }} />
              </>
            )}

            {/* TEACHER'S NOTE */}
            {r.teacherNote && (
              <>
                <div style={{ borderLeft: '3px solid #C9A227', paddingLeft: '13px', marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#C9A227', letterSpacing: '0.12em', margin: '0 0 7px', fontFamily: 'Montserrat, sans-serif' }}>TEACHER'S NOTE</p>
                  {r.teacherNote.split('\n').filter(Boolean).map((para, i) => (
                    <p key={i} style={{ fontSize: '13px', color: '#1A1A1A', margin: i === 0 ? '0 0 10px' : '0', lineHeight: 1.9, fontWeight: 500 }}>{para}</p>
                  ))}
                </div>
                <div style={{ height: '1px', background: '#E8E6E0', marginBottom: '18px' }} />
              </>
            )}

            {/* 문제집 사진 */}
            {r.photoUrls?.length > 0 && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: 'Montserrat, sans-serif' }}>TODAY'S WORK</p>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(r.photoUrls.length, 2)}, 1fr)`, gap: '6px' }}>
                    {r.photoUrls.map((url, i) => (
                      <img key={i} src={url} alt={`문제집 ${i+1}`} crossOrigin="anonymous"
                        style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '4px', border: '1px solid #E8E6E0' }} />
                    ))}
                  </div>
                </div>
                <div style={{ height: '1px', background: '#E8E6E0', marginBottom: '18px' }} />
              </>
            )}

            {/* 다음 수업 */}
            {r.nextPlan && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: 'Montserrat, sans-serif' }}>NEXT CLASS</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B', margin: 0 }}>{r.nextPlan}</p>
                  {r.nextPlanDetail && <p style={{ fontSize: '11px', color: '#5A6472', margin: '2px 0 0' }}>{r.nextPlanDetail}</p>}
                </div>
                <div style={{ width: '28px', height: '28px', background: '#EAF0F9', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A5CB8', fontSize: '14px', flexShrink: 0 }}>→</div>
              </div>
            )}
          </div>

        </div>
        </div>

        {/* 수정/삭제 버튼 (이미지에 포함 안 됨) */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px' }}>
          {onEdit && (
            <button
              onClick={() => { onEdit(r); onClose(); }}
              style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: 700, borderRadius: '12px', border: '1px solid #185FA5', background: '#EAF0F9', color: '#185FA5', cursor: 'pointer', fontFamily: 'inherit' }}>
              수정하기
            </button>
          )}
          <button
            onClick={() => { if (confirm(`${r.studentName} 리포트를 삭제하시겠습니까?`)) onDelete(r.id); }}
            style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: 700, borderRadius: '12px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 설정 뷰
// ============================================================
function SettingsView({ students, onSaveStudent, teachers, onSaveTeacher, onDeleteTeacher }) {
  const [globalColor, setGlobalColor] = React.useState(() => {
    return localStorage.getItem('globalSkinColor') || DEFAULT_SKIN_COLOR;
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // 강사 이름 수정
  const [editingTeacherId, setEditingTeacherId] = React.useState(null);
  const [editingTeacherName, setEditingTeacherName] = React.useState('');

  // 강사 계정 생성
  const [newTeacherEmail, setNewTeacherEmail] = React.useState('');
  const [newTeacherPassword, setNewTeacherPassword] = React.useState('');
  const [newTeacherName, setNewTeacherName] = React.useState('');
  const [accountCreating, setAccountCreating] = React.useState(false);
  const [accountResult, setAccountResult] = React.useState('');

  const handleTeacherNameSave = async (teacher) => {
    if (!editingTeacherName.trim()) return;
    await onSaveTeacher({ ...teacher, name: editingTeacherName.trim() });
    setEditingTeacherId(null);
    setEditingTeacherName('');
  };

  const handleCreateTeacherAccount = async () => {
    if (!newTeacherEmail || !newTeacherPassword || !newTeacherName) {
      setAccountResult('이름, 이메일, 비밀번호를 모두 입력해주세요.');
      return;
    }
    setAccountCreating(true);
    setAccountResult('');
    try {
      // 1. Firebase Auth 계정 생성
      const cred = await createUserWithEmailAndPassword(auth, newTeacherEmail, newTeacherPassword);
      // 2. teachers 컬렉션에 강사 추가
      const teacherRef = await addDoc(collection(db, 'teachers'), { name: newTeacherName, createdAt: serverTimestamp() });
      // 3. users 컬렉션에 role 저장
      await addDoc(collection(db, 'users'), { uid: cred.user.uid, role: 'teacher', teacherId: teacherRef.id, email: newTeacherEmail, createdAt: serverTimestamp() });
      setAccountResult(`✅ ${newTeacherName} 강사 계정 생성 완료!`);
      setNewTeacherEmail(''); setNewTeacherPassword(''); setNewTeacherName('');
    } catch (e) {
      const msg = e.code === 'auth/email-already-in-use' ? '이미 사용 중인 이메일입니다.' : e.message;
      setAccountResult(`❌ 오류: ${msg}`);
    }
    setAccountCreating(false);
  };

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

      {/* 강사 관리 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>👩‍🏫 강사 관리</p>
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: '14px' }}>강사 이름 수정 및 로그인 계정을 생성합니다.</p>

        {/* 강사 목록 + 이름 수정 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {teachers.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F6E56' }}>{t.name?.[0]}</span>
              </div>
              {editingTeacherId === t.id ? (
                <>
                  <input
                    value={editingTeacherName}
                    onChange={e => setEditingTeacherName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleTeacherNameSave(t)}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '13px', border: '1px solid #185FA5', borderRadius: '8px', fontFamily: 'inherit', outline: 'none' }}
                    autoFocus
                  />
                  <button onClick={() => handleTeacherNameSave(t)} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>저장</button>
                  <button onClick={() => setEditingTeacherId(null)} style={{ background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>{t.name}</span>
                  <button onClick={() => { setEditingTeacherId(t.id); setEditingTeacherName(t.name); }} style={{ background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>수정</button>
                  <button onClick={() => { if (window.confirm(`${t.name}을 삭제할까요?`)) onDeleteTeacher(t.id); }} style={{ background: '#FEF2F2', color: '#DC2626', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* 강사 계정 생성 */}
        <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>새 강사 계정 생성</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} placeholder="강사 이름 (예: 영동 선생님)" style={{ padding: '9px 12px', fontSize: '13px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newTeacherEmail} onChange={e => setNewTeacherEmail(e.target.value)} placeholder="이메일" type="email" style={{ padding: '9px 12px', fontSize: '13px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newTeacherPassword} onChange={e => setNewTeacherPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" type="password" style={{ padding: '9px 12px', fontSize: '13px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={handleCreateTeacherAccount} disabled={accountCreating} style={{ background: accountCreating ? '#E5E7EB' : '#0F6E56', color: '#fff', border: 'none', borderRadius: '10px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: accountCreating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {accountCreating ? '생성 중...' : '강사 계정 생성'}
            </button>
            {accountResult && <p style={{ fontSize: '12px', margin: 0, padding: '8px 12px', borderRadius: '8px', background: accountResult.startsWith('✅') ? '#E1F5EE' : '#FEF2F2', color: accountResult.startsWith('✅') ? '#0F6E56' : '#DC2626', fontWeight: 600 }}>{accountResult}</p>}
          </div>
        </div>
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

  const fmtDate = (r) => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    : '-';
  const unitOf = (r) => [r.textbook, r.unit].filter(Boolean).join(' · ') || '학습 내용';

  // ── 포인트/단계는 동기부여용 소형 배지로만 사용 (증명 그래프 역할에서 제외) ──
  const fullSorted = [...(allReports || reports)].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const totalPoints = fullSorted.reduce((sum, r) => sum + (r.points ?? calculateReportPoints(r)), 0);
  const stageInfo = getStageInfo(totalPoints);

  // ── ② 기준선: 이전 기간(선택 기간 시작 전) 본인 평균 — "지난 기간의 나"와 비교 ──
  const periodStartTs = sorted[0]?.createdAt?.seconds || 0;
  const prevReports = fullSorted.filter(r => (r.createdAt?.seconds || 0) < periodStartTs);
  const prevConceptAvg = prevReports.length
    ? Math.round(prevReports.reduce((s, r) => s + (r.conceptRating || 0), 0) / prevReports.length * 10) / 10
    : null;
  const conceptDelta = prevConceptAvg !== null ? Math.round((conceptAvg - prevConceptAvg) * 10) / 10 : null;

  // ── 실측 추이 (개념이해도 + 시험점수) — 학부모에게 보이는 '증명' 그래프 ──
  const TAG_LABELS_LOCAL = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
  const tagCount = {};
  const tagFirstExample = {};
  sorted.forEach(r => (r.diagnosis || []).forEach(d => {
    tagCount[d.key] = (tagCount[d.key] || 0) + 1;
    if (!tagFirstExample[d.key]) tagFirstExample[d.key] = r;
  }));
  const tagEntries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  const topTag = tagEntries.find(([k]) => k !== 'perfect');
  const perfectTag = tagEntries.find(([k]) => k === 'perfect');

  const bestConceptReport = sorted.reduce((best, r) => ((r.conceptRating || 0) > (best?.conceptRating || 0) ? r : best), null);
  const unitsCovered = [...new Set(sorted.map(unitOf))];
  const allAttended = sorted.length > 0 && sorted.every(r => r.attendance === '정시');

  // ── ① 한 줄 평가 헤드라인: [진행 단원] · [추세] · [액션] 3어절 구조 ──
  const headlineParts = [];
  if (sorted.length > 0) {
    const lastUnit = sorted[sorted.length - 1]?.unit || sorted[sorted.length - 1]?.textbook || '';
    if (lastUnit) headlineParts.push(`${lastUnit} 진행 중`);
    if (conceptDelta !== null && Math.abs(conceptDelta) >= 0.3) {
      headlineParts.push(conceptDelta > 0 ? `개념이해 상승세 (+${conceptDelta})` : `개념이해 주춤 (${conceptDelta})`);
    } else if (conceptAvg >= 4.5) {
      headlineParts.push('개념이해 최상위 유지');
    } else if (conceptAvg >= 4) {
      headlineParts.push('개념이해 안정적');
    }
    if (topTag) headlineParts.push(`${TAG_LABELS_LOCAL[topTag[0]]} 보강 필요`);
    else if (perfectTag) headlineParts.push('약점 없음');
  }
  const headline = headlineParts.slice(0, 3).join(' · ');

  // 인용 가능한 선생님 코멘트 한 문장 발췌 (가장 최근 노트에서 첫 문장)
  const notesWithText = sorted.filter(r => r.teacherNote);
  const quoteSource = notesWithText[notesWithText.length - 1];
  const quoteSentence = quoteSource
    ? (quoteSource.teacherNote.split(/[.!?\n]/).map(s => s.trim()).find(s => s.length > 5) || quoteSource.teacherNote.slice(0, 40))
    : null;

  // ── 날짜 단축형 포맷 (6/26) ──
  const fmtShort = (r) => {
    if (!r?.createdAt?.seconds) return '';
    const d = new Date(r.createdAt.seconds * 1000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // ── 진단명 철학적 고도화 매핑 ──
  const DIAG_UPGRADED = {
    calc:    { title: '연산 처리 자동화 미완성', sub: '계산 실수', strategy: '풀이 과정을 손으로 쓰는 습관이 정착되지 않은 단계입니다. 속도보다 정확성을 먼저 확보하는 훈련이 필요합니다.' },
    concept: { title: '개념 구조 내면화 부족', sub: '개념 누락', strategy: '공식을 암기하는 수준을 넘어, 개념이 왜 성립하는지 근거를 설명할 수 있는 이해가 필요합니다.' },
    apply:   { title: '판단 기준 부재형 응용 오류', sub: '응용 부족', strategy: '문제 상황은 인식하지만, 풀이 방향을 스스로 결정하는 단계에서 반복적으로 멈추는 패턴이 관찰됩니다. \'왜 이 방법을 선택하는가\'에 대한 판단 훈련이 집중적으로 필요한 시점입니다.' },
    time:    { title: '풀이 우선순위 판단 훈련 필요', sub: '시간 부족', strategy: '문제를 푸는 능력보다 어떤 문제를 먼저 풀어야 하는지 판단하는 전략이 아직 형성되지 않은 단계입니다.' },
  };

  // ── 강점 stat 구조 ──
  const strengthStats = [];
  if (bestConceptReport) {
    strengthStats.push({ label: '최고 개념이해', value: `${bestConceptReport.conceptRating}점`, date: fmtShort(bestConceptReport) });
  }
  if (allAttended && sorted.length >= 2) {
    strengthStats.push({ label: '출석', value: `${sorted.length}회 전 정시`, date: '개근' });
  }
  if (homeworkAvg >= 4.5) {
    strengthStats.push({ label: '과제 수행 평균', value: `${homeworkAvg}점`, date: homeworkAvg >= 5 ? '아주 잘함' : '잘함' });
  }
  if (perfectTag) {
    strengthStats.push({ label: '개념 완벽 진단', value: `${perfectTag[1]}회 달성`, date: fmtShort(tagFirstExample[perfectTag[0]]) });
  }

  // ── 보완 포인트 고도화 ──
  const weaknessItems = [];
  if (topTag) {
    const [key, count] = topTag;
    const upgraded = DIAG_UPGRADED[key];
    weaknessItems.push({
      title: upgraded?.title || TAG_LABELS_LOCAL[key],
      sub: `이 기간 ${count}회 반복 관찰`,
      strategy: upgraded?.strategy || '',
      count, maxCount: topTag[1],
    });
  }
  if (conceptAvg < 3.5 && conceptAvg > 0) {
    const worst = sorted.reduce((w, r) => ((r.conceptRating ?? 5) < (w?.conceptRating ?? 5) ? r : w), null);
    if (worst) weaknessItems.push({
      title: '개념 이해도 집중 보강 필요',
      sub: `최저 ${worst.conceptRating}점 기록 (${fmtShort(worst)})`,
      strategy: '이해가 충분하지 않은 상태에서 문제 풀이로 넘어가는 패턴이 반복될 수 있습니다. 개념 재정립 후 적용 단계로 진행하는 순서가 중요합니다.',
      count: null,
    });
  }

  // ── 교재명 메타 (한 번만 표시용) ──
  const metaTextbook = unitsCovered.length > 0 ? unitsCovered[0] : '';
  const metaPeriod = sorted.length > 0
    ? `${fmtShort(sorted[0])} – ${fmtShort(sorted[sorted.length - 1])} · ${sorted.length}회 수업`
    : '';

  // ── 유형별 약점 TOP3 (photoAnalysis 누적 집계) ──
  // ── 누적 취약 유형 집계 (weakTypesSummary 우선, fallback → photoAnalysis.sections) ──
  const weakTypeMap = {};
  sorted.forEach(r => {
    // 신규: weakTypesSummary 필드 우선 사용
    if (r.weakTypesSummary?.length > 0) {
      r.weakTypesSummary.forEach(wt => {
        const key = wt.type || '기타';
        if (!weakTypeMap[key]) weakTypeMap[key] = { count: 0, dates: [] };
        weakTypeMap[key].count += wt.count || 1;
        if (r.createdAt?.seconds) weakTypeMap[key].dates.push(r.createdAt.seconds);
      });
      return;
    }
    // fallback: 구버전 photoAnalysis.sections 직접 파싱
    if (!r.photoAnalysis?.sections) return;
    r.photoAnalysis.sections.forEach(sec => {
      (sec.problemTypes || []).forEach(pt => {
        if (pt.result === '약점') {
          const key = pt.type || '기타';
          if (!weakTypeMap[key]) weakTypeMap[key] = { count: 0, dates: [] };
          weakTypeMap[key].count += 1;
        }
      });
      (sec.weakDetail || []).forEach(wd => {
        const key = wd.type || '기타';
        if (!weakTypeMap[key]) weakTypeMap[key] = { count: 0, dates: [] };
        weakTypeMap[key].count += 1;
      });
      if (sec.sectionType === 'calculation' && sec.summary?.wrong > 0) {
        const key = '연산 실수';
        if (!weakTypeMap[key]) weakTypeMap[key] = { count: 0, dates: [] };
        weakTypeMap[key].count += sec.summary.wrong;
      }
    });
  });
  const weakTop5 = Object.entries(weakTypeMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  const weakTop3 = weakTop5.slice(0, 3);
  const maxWeakCount = weakTop5[0]?.[1]?.count || 1;

  const strongTypeMap = {};
  sorted.forEach(r => {
    if (!r.photoAnalysis?.sections) return;
    r.photoAnalysis.sections.forEach(sec => {
      (sec.problemTypes || []).forEach(pt => {
        if (pt.result === '잘함') {
          const key = pt.type || '기타';
          if (!strongTypeMap[key]) strongTypeMap[key] = 0;
          strongTypeMap[key] += 1;
        }
      });
    });
  });
  const strongTop3 = Object.entries(strongTypeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const hasPhotoData = weakTop3.length > 0 || strongTop3.length > 0;

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

  // ── 디자인 시스템 v1 토큰 ──
  const DS = {
    navy900: '#0D2D6B', navy700: '#1A5CB8', navy100: '#EAF0F9',
    gold: '#C9A227',
    positive: '#1E6B4E', caution: '#8A5A00', negative: '#8C2B2B',
    ink: '#1A1A1A', inkSub: '#5A6472', inkMute: '#98A1AC',
    rule: '#D8DDE4', paper: '#FFFFFF', paperWarm: '#FAF9F6',
    serif: "'Noto Serif KR', serif",
    body: "'Pretendard Variable', Pretendard, sans-serif",
  };

  // 섹션 제목 컴포넌트 스타일 (Serif + 골드 헤어라인)
  const SectionTitle = ({ children }) => (
    <div style={{ marginBottom: '14px' }}>
      <p style={{ fontFamily: DS.serif, fontSize: '15px', fontWeight: 700, color: DS.ink, margin: '0 0 6px', letterSpacing: '-0.01em' }}>{children}</p>
      <div style={{ width: '32px', height: '2px', background: DS.gold }} />
    </div>
  );

  // 발행일
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: DS.paper, borderRadius: '6px', width: '100%', maxWidth: '640px', maxHeight: '88vh', overflow: 'auto', fontFamily: DS.body, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* 조작 바 (캡처 영역 밖) */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${DS.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: DS.paper, zIndex: 10 }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: DS.ink }}>{student?.name} 종합 리포트</p>
            <p style={{ fontSize: '11px', color: DS.inkMute, margin: '2px 0 0', letterSpacing: '0.03em' }}>{periodLabel} · {sorted.length}회 수업</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleDownload} disabled={downloading} style={{
              background: DS.navy900, color: '#fff', border: 'none', borderRadius: '4px',
              padding: '7px 16px', fontSize: '12px', fontWeight: 700,
              cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: DS.body, letterSpacing: '0.03em'
            }}>
              {downloading ? '저장 중...' : '이미지 저장'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: DS.inkMute, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* ─── 캡처 대상 문서 영역 ─── */}
        <div ref={cardRef} style={{ background: DS.paper }}>

          {/* 표지 헤더 B안: 흰 영역(컬러 로고) → 골드 헤어라인 → 네이비(학생 정보) */}

          {/* 1. 흰 영역 — 컬러 로고 + 발행 정보 */}
          <div style={{ background: DS.paper, padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${DS.rule}` }}>
            <img
              src="/kyohyun-logo.png"
              alt="와이즈에듀 교현학원"
              crossOrigin="anonymous"
              style={{ height: '44px', width: 'auto', display: 'block' }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <div style={{ display: 'none' }}>
              <p style={{ fontSize: '9px', color: '#8B1A1A', fontWeight: 700, margin: 0, letterSpacing: '0.15em' }}>와이즈에듀</p>
              <p style={{ fontSize: '13px', color: DS.navy900, fontWeight: 700, margin: 0 }}>교현학원</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '10px', color: DS.inkMute, margin: 0, letterSpacing: '0.05em' }}>종합 리포트</p>
              <p style={{ fontSize: '11px', color: DS.inkSub, fontWeight: 600, margin: '2px 0 0' }}>{periodLabel}</p>
            </div>
          </div>

          {/* 2. 골드 헤어라인 (시그니처 연결선) */}
          <div style={{ height: '2px', background: `linear-gradient(90deg, ${DS.gold} 0%, ${DS.gold} 60%, rgba(201,162,39,0.1) 100%)` }} />

          {/* 3. 네이비 영역 — 학생 정보 */}
          <div style={{ background: DS.navy900, padding: '20px 28px', position: 'relative', marginBottom: '28px' }}>
            <p style={{ fontFamily: DS.serif, fontSize: '26px', fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              {student?.name}
            </p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>{student?.school} · {periodLabel}</p>
            <div style={{ width: '100%', height: '1px', background: `rgba(201,162,39,0.35)`, marginTop: '16px' }} />
            {/* 성장 단계 배지 */}
            <div style={{
              position: 'absolute', top: '20px', right: '28px',
              border: `1px solid rgba(201,162,39,0.5)`, borderRadius: '2px',
              padding: '5px 12px', textAlign: 'center'
            }}>
              <p style={{ fontSize: '9px', color: DS.gold, margin: '0 0 1px', letterSpacing: '0.1em', fontWeight: 700 }}>성장 단계</p>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff', margin: 0 }}>{stageInfo.current.label} · {stageInfo.totalPoints}P</p>
            </div>
          </div>

          <div style={{ padding: '0 28px' }}>
          {headline && (
            <div style={{ borderLeft: `3px solid ${DS.gold}`, paddingLeft: '14px', marginBottom: '28px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: DS.gold, margin: '0 0 4px', letterSpacing: '0.1em' }}>이번 기간 핵심</p>
              <p style={{ fontFamily: DS.serif, fontSize: '14px', fontWeight: 700, color: DS.ink, margin: 0, lineHeight: 1.5 }}>{headline}</p>
            </div>
          )}

          {/* 핵심 지표 — 흰 배경 + 상단 룰, 이모지 없음 */}
          <div style={{ marginBottom: '28px' }}>
            <SectionTitle>수업 성과 요약</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: testAvg !== null ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '0' }}>
              {[
                { label: '총  수  업', value: `${sorted.length}회` },
                { label: '과제 평균', value: `${homeworkAvg}점` },
                { label: '개념 평균', value: `${conceptAvg}점` },
                ...(testAvg !== null ? [{ label: '시험 평균', value: `${testAvg}점` }] : []),
              ].map((item, i, arr) => (
                <div key={i} style={{
                  padding: '14px 12px',
                  borderTop: `1px solid ${DS.rule}`,
                  borderBottom: `1px solid ${DS.rule}`,
                  borderRight: i < arr.length - 1 ? `1px solid ${DS.rule}` : 'none',
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: DS.inkMute, margin: '0 0 6px', letterSpacing: '0.06em' }}>{item.label}</p>
                  <p style={{ fontSize: '22px', fontWeight: 800, color: DS.navy900, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ② 실력 성장 추이 — 메인 증명 그래프 */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <p style={{ fontFamily: DS.serif, fontSize: '15px', fontWeight: 700, color: DS.ink, margin: '0 0 6px' }}>실력 성장 추이</p>
                <div style={{ width: '32px', height: '2px', background: DS.gold }} />
              </div>
              {conceptDelta !== null && (
                <div style={{
                  textAlign: 'right',
                  borderLeft: `2px solid ${conceptDelta >= 0 ? DS.positive : DS.negative}`,
                  paddingLeft: '10px',
                }}>
                  <p style={{ fontSize: '9px', color: DS.inkMute, margin: '0 0 2px', letterSpacing: '0.05em' }}>지난 기간 대비</p>
                  <p style={{ fontSize: '16px', fontWeight: 800, color: conceptDelta >= 0 ? DS.positive : DS.negative, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {conceptDelta > 0 ? '+' : ''}{conceptDelta}점
                  </p>
                </div>
              )}
            </div>
            <p style={{ fontSize: '10px', color: DS.inkMute, margin: '0 0 14px', lineHeight: 1.6 }}>
              매 수업 측정한 개념이해도(5점 만점) 실제 점수.{prevConceptAvg !== null
                ? ` 회색 점선은 지난 기간 본인 평균(${prevConceptAvg}점) — 이 선 위가 성장 구간입니다.`
                : ' 오르내림이 자연스러우며 전체 흐름과 최근 방향이 중요합니다.'}
            </p>
            <div style={{ position: 'relative', borderBottom: `1px solid ${DS.rule}`, paddingBottom: '4px' }}>
              {prevConceptAvg !== null && (
                <div style={{
                  position: 'absolute', left: 0, right: 0,
                  bottom: `${4 + (prevConceptAvg / 5) * 70}px`,
                  borderTop: `1.5px dashed ${DS.inkMute}`, zIndex: 1,
                }}>
                  <span style={{
                    position: 'absolute', right: 0, top: '-15px',
                    fontSize: '9px', fontWeight: 700, color: DS.inkMute,
                    background: DS.paper, padding: '0 4px',
                  }}>이전 평균 {prevConceptAvg}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '86px' }}>
                {sorted.map((r, i) => {
                  const aboveBase = prevConceptAvg === null || (r.conceptRating || 0) >= prevConceptAvg;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: aboveBase ? DS.navy700 : DS.inkMute, marginBottom: '2px', fontVariantNumeric: 'tabular-nums' }}>{r.conceptRating || 0}</span>
                      <div style={{
                        width: '100%', maxWidth: '20px',
                        height: `${((r.conceptRating || 0) / 5) * 70}px`,
                        background: aboveBase ? DS.navy700 : DS.navy100,
                        borderRadius: '2px 2px 0 0',
                        borderTop: aboveBase ? `2px solid ${DS.navy900}` : `2px solid ${DS.inkMute}`,
                      }} />
                      <span style={{ fontSize: '8px', color: DS.inkMute, marginTop: '5px' }}>{fmtDate(r)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {prevConceptAvg !== null && (
              <p style={{ fontSize: '9px', color: DS.inkMute, margin: '6px 0 0' }}>진한 막대 = 이전 평균 이상(성장 구간) · 연한 막대 = 이전 평균 미만</p>
            )}
            {testReports.length >= 1 && (
              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${DS.rule}` }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: DS.inkSub, margin: '0 0 10px', letterSpacing: '0.05em' }}>시험 점수 추이</p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {testReports.map((r, i) => (
                    <div key={i} style={{ borderLeft: `2px solid ${DS.positive}`, paddingLeft: '10px' }}>
                      <p style={{ fontSize: '18px', fontWeight: 800, color: DS.positive, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{r.testScore}점</p>
                      <p style={{ fontSize: '9px', color: DS.inkMute, margin: '2px 0 0' }}>{fmtDate(r)} · {r.testName || '테스트'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 수업 이력 표 */}
          <div style={{ marginBottom: '28px' }}>
            <SectionTitle>수업 이력</SectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr style={{ background: DS.navy100 }}>
                  {['날짜', '출결', '과제', '개념', ...(testReports.length > 0 ? ['시험'] : []), '학습 단원'].map(h => (
                    <th key={h} style={{ padding: '7px 6px', textAlign: 'left', fontWeight: 700, color: DS.navy900, fontSize: '10px', letterSpacing: '0.05em', borderBottom: `1.5px solid ${DS.navy700}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${DS.rule}` }}>
                    <td style={{ padding: '7px 6px', color: DS.inkSub }}>{fmtDate(r)}</td>
                    <td style={{ padding: '7px 6px' }}>{r.attendance || '-'}</td>
                    <td style={{ padding: '7px 6px', fontWeight: 600 }}>{r.homeworkRating || 0}점</td>
                    <td style={{ padding: '7px 6px', fontWeight: 700, color: (r.conceptRating >= 4) ? DS.positive : (r.conceptRating <= 2 && r.conceptRating > 0) ? '#A32D2D' : DS.ink }}>{r.conceptRating || 0}점</td>
                    {testReports.length > 0 && <td style={{ padding: '7px 6px', fontWeight: 600 }}>{r.hasTest && r.testScore ? `${r.testScore}점` : '-'}</td>}
                    <td style={{ padding: '7px 6px', color: DS.inkSub }}>{unitOf(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 강점 / 보완 — 프리미엄 stat 구조 */}
          {(strengthStats.length > 0 || weaknessItems.length > 0) && (
            <div style={{ marginBottom: '28px' }}>
              <SectionTitle>학습 분석</SectionTitle>

              {/* 교재명 + 기간 메타라인 — 1회만 */}
              {(metaTextbook || metaPeriod) && (
                <div style={{ fontSize: '10px', color: DS.inkMute, fontWeight: 500, padding: '6px 10px', background: '#F7F5F1', border: '1px solid #D8D5CF', borderRadius: '3px', marginBottom: '14px', letterSpacing: '0.02em' }}>
                  {metaTextbook}{metaTextbook && metaPeriod ? ' \u00a0|\u00a0 ' : ''}{metaPeriod}
                </div>
              )}

              {/* 강점 */}
              {strengthStats.length > 0 && (
                <div style={{ borderLeft: '2px solid #0F6E56', paddingLeft: '14px', marginBottom: '14px', background: '#F4FAF7', borderRadius: '0 3px 3px 0', padding: '13px 15px', borderLeft: '2px solid #0F6E56' }}>
                  <span style={{ display: 'inline-block', background: '#0F6E56', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '3px 9px', borderRadius: '2px', letterSpacing: '0.14em', marginBottom: '12px' }}>✓ STRENGTH</span>
                  {strengthStats.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', padding: '7px 0', borderBottom: i < strengthStats.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                      <span style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, letterSpacing: '0.06em', width: '90px', flexShrink: 0 }}>{s.label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#2C2C2C', flex: 1 }}>{s.value}</span>
                      <span style={{ fontSize: '10px', color: '#8A8A8A', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{s.date}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 보완 포인트 */}
              {weaknessItems.map((w, i) => (
                <div key={i} style={{ borderLeft: '2px solid #8B2020', background: '#FAF4F4', borderRadius: '0 3px 3px 0', padding: '13px 15px', marginBottom: i < weaknessItems.length - 1 ? '10px' : 0 }}>
                  <span style={{ display: 'inline-block', background: '#8B2020', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '3px 9px', borderRadius: '2px', letterSpacing: '0.14em', marginBottom: '10px' }}>⚠ FOCUS POINT</span>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#2C2C2C', margin: '0 0 3px' }}>{w.title}</p>
                  <p style={{ fontSize: '11px', color: '#8B2020', fontWeight: 600, margin: '0 0 8px', lineHeight: 1.6 }}>{w.sub}</p>
                  {w.count !== null && (
                    <div style={{ height: '3px', background: 'rgba(0,0,0,0.08)', borderRadius: '3px', marginBottom: '12px' }}>
                      <div style={{ height: '100%', width: '100%', background: '#8B2020', borderRadius: '3px' }} />
                    </div>
                  )}
                  {w.strategy && (
                    <div style={{ fontSize: '12px', color: '#4A4A4A', lineHeight: 2.0, padding: '13px 14px', background: '#fff', border: '1px solid rgba(139,32,32,0.15)', borderRadius: '3px', wordBreak: 'keep-all', letterSpacing: '0.01em' }}>
                      {w.strategy.split('\'왜').length > 1 ? (
                        <>
                          {w.strategy.split('\'왜')[0]}
                          <span style={{ display: 'block', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(139,32,32,0.15)', fontSize: '11px', color: '#8A8A8A', lineHeight: 1.9 }}>
                            <strong style={{ color: '#8B2020' }}>→ </strong>{'\'왜' + w.strategy.split('\'왜')[1]}
                          </span>
                        </>
                      ) : w.strategy}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ★ 유형별 학습 분석 — 누적 취약 유형 바차트 */}
          {hasPhotoData && (
            <div style={{ marginBottom: '28px' }}>
              <SectionTitle>유형별 학습 분석</SectionTitle>
              <p style={{ fontSize: '10px', color: DS.inkMute, margin: '0 0 16px', lineHeight: 1.6 }}>
                교재·시험지 사진 분석을 누적 집계한 결과입니다. 반복 등장하는 유형일수록 집중 보완이 필요합니다.
              </p>

              {weakTop5.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <span style={{ background: '#A32D2D', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>⚠ 보완 필요 유형 TOP{weakTop5.length}</span>
                    <span style={{ fontSize: '10px', color: DS.inkMute }}>누적 오답 기준</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {weakTop5.map(([type, data], i) => {
                      const barWidth = Math.max(4, Math.round((data.count / maxWeakCount) * 100));
                      const colors = ['#A32D2D', '#B84A2A', '#8A5A00', '#6B4E00', '#5A4400'];
                      const bgColors = ['#F5E5E5', '#FBF0EA', '#FAEEDA', '#FBF5E5', '#F8F5E0'];
                      return (
                        <div key={i} style={{ background: bgColors[i] || '#F9F9F9', borderRadius: '10px', padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ background: colors[i] || '#8A5A00', color: '#fff', fontSize: '10px', fontWeight: 800, width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                              <p style={{ fontSize: '13px', fontWeight: 700, color: DS.ink, margin: 0 }}>{type}</p>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: colors[i] || '#8A5A00' }}>{data.count}회</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(0,0,0,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barWidth}%`, background: colors[i] || '#8A5A00', borderRadius: '6px', transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {strongTop3.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <span style={{ background: '#0F6E56', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>✓ 강점 유형 TOP{strongTop3.length}</span>
                    <span style={{ fontSize: '10px', color: DS.inkMute }}>정답 기준</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {strongTop3.map(([type, count], i) => (
                      <div key={i} style={{ background: '#F0FAF5', borderRadius: '10px', padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ background: '#0F6E56', color: '#fff', fontSize: '10px', fontWeight: 800, width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                            <p style={{ fontSize: '13px', fontWeight: 700, color: DS.ink, margin: 0 }}>{type}</p>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F6E56' }}>{count}회</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(0,0,0,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.round((count / strongTop3[0][1]) * 100)}%`, background: '#0F6E56', borderRadius: '6px' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 종합 피드백 */}
          <div style={{ borderTop: `1px solid ${DS.rule}`, paddingTop: '20px', marginBottom: '4px' }}>
            <SectionTitle>종합 피드백</SectionTitle>
            <p style={{ fontSize: '12px', color: DS.ink, margin: 0, lineHeight: 1.8 }}>
              {periodLabel} 동안 {unitsCovered.slice(0, 3).join(', ')}{unitsCovered.length > 3 ? ' 등' : ''}을 학습했습니다.
              {bestConceptReport && ` 특히 ${fmtDate(bestConceptReport)} 수업(${unitOf(bestConceptReport)})에서 가장 높은 이해도를 보였습니다.`}
              {topTag && ` 다만 '${TAG_LABELS_LOCAL[topTag[0]]}' 패턴이 반복 관찰되어 ${unitOf(tagFirstExample[topTag[0]])} 관련 복습이 필요합니다.`}
            </p>
            {/* 선생님 코멘트 발췌 — 골드 룰 인용구 */}
            {quoteSentence && (
              <div style={{ borderLeft: `2px solid ${DS.gold}`, paddingLeft: '14px', marginTop: '16px' }}>
                <p style={{ fontFamily: DS.serif, fontSize: '12px', color: DS.inkSub, margin: 0, lineHeight: 1.7, fontStyle: 'italic' }}>
                  "{quoteSentence}"
                </p>
                <p style={{ fontSize: '10px', color: DS.inkMute, margin: '4px 0 0' }}>{fmtDate(quoteSource)} 담당 선생님</p>
              </div>
            )}
          </div>

          {/* 푸터 */}
          <div style={{ marginTop: '24px', paddingTop: '14px', borderTop: `1px solid ${DS.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '10px', color: DS.inkMute, margin: 0, letterSpacing: '0.04em' }}>와이즈에듀 교현학원 · 031-707-0591</p>
            <p style={{ fontSize: '10px', color: DS.inkMute, margin: 0 }}>발행일 {today}</p>
          </div>
          </div>{/* 내부 패딩 div 닫힘 */}
        </div>{/* cardRef 닫힘 */}
      </div>
    </div>
  );
}

// ============================================================
// 성장 대시보드 — 전체 학생 개념이해도 추이
// ============================================================
function GrowthDashboard({ reports, students, onSwitchTab }) {
  const [period, setPeriod] = React.useState('week');
  const [sortMode, setSortMode] = React.useState('decline');
  const [selId, setSelId] = React.useState(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [tooltip, setTooltip] = React.useState(null);
  const svgRef = React.useRef(null);

  const DIAG_MAP = {
    calc:    { label: '계산 실수', bg: '#A32D2D', prefix: '⚠' },
    concept: { label: '개념 누락', bg: '#A32D2D', prefix: '⚠' },
    apply:   { label: '응용 부족', bg: '#A32D2D', prefix: '⚠' },
    time:    { label: '시간 부족', bg: '#8A5A00', prefix: '△' },
    perfect: { label: '개념 완벽', bg: '#0F6E56', prefix: '✓' },
  };

  const PERIODS = { week: 7, '2week': 14, month: 30, '3month': 90 };

  const getStudentReports = React.useCallback((studentId) => {
    const cutoff = Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000;
    return reports
      .filter(r => r.studentId === studentId && r.createdAt?.seconds * 1000 >= cutoff && r.conceptRating > 0)
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }, [reports, period]);

  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;

  const getDecline = React.useCallback((sid) => {
    const rs = getStudentReports(sid);
    if (rs.length < 2) return null;
    return Math.round((rs[rs.length - 1].conceptRating - rs[0].conceptRating) * 10) / 10;
  }, [getStudentReports]);

  const getTrend = React.useCallback((sid) => {
    const rs = getStudentReports(sid);
    if (rs.length < 2) return null;
    return Math.round((rs[rs.length - 1].conceptRating - rs[rs.length - 2].conceptRating) * 10) / 10;
  }, [getStudentReports]);

  const getAvg = React.useCallback((sid) => avg(getStudentReports(sid).map(r => r.conceptRating)), [getStudentReports]);

  const getStatus = React.useCallback((sid) => {
    const rs = getStudentReports(sid);
    if (!rs.length) return { label: '데이터없음', color: '#98A1AC', bg: '#F3F4F6', border: '#E5E7EB' };
    const a = avg(rs.map(r => r.conceptRating));
    const trend3 = rs.length >= 3 ? rs[rs.length - 1].conceptRating - rs[rs.length - 3].conceptRating
      : rs.length >= 2 ? rs[rs.length - 1].conceptRating - rs[rs.length - 2].conceptRating : 0;
    if (a >= 4 && trend3 >= 0) return { label: '안정', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' };
    if (trend3 <= -1 || a < 2.5) return { label: '경고', color: '#A32D2D', bg: '#FCEBEB', border: '#A32D2D' };
    if (trend3 < 0 || a < 3.5) return { label: '주의', color: '#8A5A00', bg: '#FAEEDA', border: '#EF9F27' };
    return { label: '안정', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' };
  }, [getStudentReports]);

  // 탭 전환 시 완전 초기화
  const handlePeriod = (p) => { setPeriod(p); setSelId(null); setDrawerOpen(false); };

  // 정렬 — 화면 표시(getTrend)와 정렬 기준 통일 + null → 맨 뒤
  const sortedStudents = React.useMemo(() => {
    const list = [...students];
    if (sortMode === 'decline') {
      return list.sort((a, b) => {
        const da = getTrend(a.id), db = getTrend(b.id);
        if (da === null && db === null) return 0;
        if (da === null) return 1;   // 데이터 없음 → 맨 뒤
        if (db === null) return -1;
        return da - db; // 하락 폭 큰 순 (음수가 클수록 위)
      });
    }
    if (sortMode === 'score') return list.sort((a, b) => getAvg(b.id) - getAvg(a.id));
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [students, period, sortMode, getTrend, getAvg]);

  // 전체 평균 데이터 포인트 생성
  const globalPoints = React.useMemo(() => {
    const allRs = reports.filter(r => {
      const cutoff = Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000;
      return r.createdAt?.seconds * 1000 >= cutoff && r.conceptRating > 0;
    }).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    if (!allRs.length) return [];
    // 날짜별 그룹
    const byDay = {};
    allRs.forEach(r => {
      const d = new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR');
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(r.conceptRating);
    });
    return Object.entries(byDay).map(([date, vals]) => ({ date, avg: avg(vals) }));
  }, [reports, period]);

  // 기간 날짜 계산
  const periodLabel = React.useMemo(() => {
    const end = new Date();
    const start = new Date(Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000);
    const fmt = (d) => `${d.getMonth()+1}/${d.getDate()}`;
    return `${fmt(start)} ~ ${fmt(end)}`;
  }, [period]);
  const W = 540, H = 110, PL = 26, PR = 14, PT = 8, PB = 20;
  const cW = W - PL - PR, cH = H - PT - PB;

  const toXY = (i, v, len) => [
    PL + (i / Math.max(len - 1, 1)) * cW,
    PT + cH - ((v - 1) / 4) * cH
  ];

  const selStudentRs = selId ? getStudentReports(selId) : [];
  const selStatus = selId ? getStatus(selId) : null;

  const atRisk = students.filter(s => getStatus(s.id).label === '경고').length;
  const caution = students.filter(s => getStatus(s.id).label === '주의').length;
  const overallAvg = avg(students.map(s => getAvg(s.id)).filter(v => v > 0));
  const bestStudent = students.length ? students.reduce((b, s) => getAvg(s.id) > getAvg(b.id) ? s : b) : null;

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* TOP 위젯 + 기간 필터 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', flex: 1, minWidth: '280px' }}>
          {[
            { label: '🚨 관심 필요', value: `${atRisk}명`, sub: `주의 ${caution}명 포함`, c: '#A32D2D', bg: '#FCEBEB', bd: '#A32D2D' },
            { label: '전체 평균', value: `${overallAvg}점`, sub: periodLabel, c: '#0D2D6B', bg: '#fff', bd: '#E8E6E0' },
            { label: '총 학생', value: `${students.length}명`, sub: '등록', c: '#1A1A1A', bg: '#fff', bd: '#E8E6E0' },
            { label: '최고 성취', value: bestStudent?.name || '-', sub: `${bestStudent ? getAvg(bestStudent.id) : 0}점`, c: bestStudent ? getStatus(bestStudent.id).color : '#98A1AC', bg: '#fff', bd: '#E8E6E0' },
          ].map((w, i) => (
            <div key={i} style={{ background: w.bg, border: `1px solid ${w.bd}`, borderRadius: '10px', padding: '10px 12px' }}>
              <p style={{ fontSize: '10px', color: w.c, margin: '0 0 3px', fontWeight: 700 }}>{w.label}</p>
              <p style={{ fontSize: '18px', fontWeight: 800, color: w.c, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{w.value}</p>
              <p style={{ fontSize: '10px', color: '#98A1AC', margin: '3px 0 0' }}>{w.sub}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
          {[['week','1주'],['2week','2주'],['month','1개월'],['3month','3개월']].map(([k, l]) => (
            <button key={k} onClick={() => handlePeriod(k)} style={{
              padding: '5px 11px', fontSize: '11px', borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${period === k ? '#0D2D6B' : '#E8E6E0'}`,
              background: period === k ? '#0D2D6B' : '#fff',
              color: period === k ? '#fff' : '#6B7280',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* 메인 그래프 — 전체 평균 단일선 */}
      <div style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>학급 평균 추이</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '18px', height: '2.5px', background: '#0D2D6B', borderRadius: '2px' }} />
            <span style={{ fontSize: '10px', color: '#98A1AC' }}>전체 평균</span>
          </div>
          {selId && selStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={selStatus.color} strokeWidth="2" strokeDasharray="4,2" /></svg>
              <span style={{ fontSize: '10px', color: '#98A1AC' }}>{students.find(s => s.id === selId)?.name}</span>
            </div>
          )}
          {!selId && <p style={{ fontSize: '10px', color: '#98A1AC', margin: 0 }}>학생 클릭 시 비교선 추가</p>}
        </div>
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
            {[1,2,3,4,5].map(v => {
              const y = PT + cH - ((v-1)/4) * cH;
              return (
                <g key={v}>
                  <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#E8E6E0" strokeWidth="0.5" strokeDasharray="3,4" />
                  <text x={PL-4} y={y+4} fontSize="9" fill="#98A1AC" textAnchor="end">{v}</text>
                </g>
              );
            })}
            {/* 전체 평균선 */}
            {globalPoints.length >= 2 && (
              <>
                <polyline
                  points={globalPoints.map((p, i) => toXY(i, p.avg, globalPoints.length).join(',')).join(' ')}
                  fill="none" stroke="#0D2D6B" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                />
                {globalPoints.map((p, i) => {
                  const [x, y] = toXY(i, p.avg, globalPoints.length);
                  return (
                    <circle key={i} cx={x} cy={y} r={i === globalPoints.length - 1 ? 4.5 : 8}
                      fill={i === globalPoints.length - 1 ? '#0D2D6B' : 'transparent'}
                      stroke="none"
                      onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: `${p.date} · 평균 ${p.avg}점` })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'crosshair' }}
                    />
                  );
                })}
                {(() => {
                  const last = globalPoints[globalPoints.length - 1];
                  const [lx, ly] = toXY(globalPoints.length - 1, last.avg, globalPoints.length);
                  return <text x={lx+7} y={ly+4} fontSize="10" fontWeight="700" fill="#0D2D6B">{last.avg}</text>;
                })()}
              </>
            )}
            {/* 선택 학생 비교선 */}
            {selId && selStudentRs.length >= 2 && selStatus && (() => {
              const pts = selStudentRs.map((r, i) => toXY(i, r.conceptRating, selStudentRs.length));
              const last = pts[pts.length - 1];
              return (
                <>
                  <polyline points={pts.map(p => p.join(',')).join(' ')}
                    fill="none" stroke={selStatus.color} strokeWidth="2" strokeDasharray="6,3"
                    strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={last[0]} cy={last[1]} r="4" fill={selStatus.color} />
                  <text x={last[0]+7} y={last[1]+4} fontSize="10" fontWeight="700" fill={selStatus.color}>
                    {selStudentRs[selStudentRs.length-1].conceptRating}
                  </text>
                </>
              );
            })()}
          </svg>
          {globalPoints.length === 0 && (
            <p style={{ textAlign: 'center', color: '#98A1AC', fontSize: '12px', padding: '20px 0' }}>이 기간에 기록된 수업이 없습니다</p>
          )}
        </div>
      </div>

      {/* 정렬 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <p style={{ fontSize: '11px', color: '#98A1AC', margin: 0 }}>정렬:</p>
        {[['decline','하락 폭 큰 순'],['score','점수 높은 순'],['name','이름순']].map(([m, l]) => (
          <button key={m} onClick={() => setSortMode(m)} style={{
            padding: '4px 10px', fontSize: '11px', borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
            border: `1.5px solid ${sortMode === m ? '#0D2D6B' : '#E8E6E0'}`,
            background: sortMode === m ? '#0D2D6B' : '#fff',
            color: sortMode === m ? '#fff' : '#6B7280',
          }}>{l}</button>
        ))}
      </div>

      {/* 학생 리스트 */}
      <div style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 65px 80px 70px 55px', padding: '8px 14px', borderBottom: '0.5px solid #E8E6E0', background: '#FAFAFA' }}>
          {['학생', '현재', '변화량', '추이', '상태'].map((h, i) => (
            <p key={i} style={{ fontSize: '10px', color: '#98A1AC', margin: 0, textAlign: i === 0 ? 'left' : 'center', letterSpacing: '0.06em' }}>{h}</p>
          ))}
        </div>
        {sortedStudents.map(s => {
          const rs = getStudentReports(s.id);
          const a = getAvg(s.id);
          const trend = getTrend(s.id);
          const decline = getDecline(s.id);
          const status = getStatus(s.id);
          const isSel = selId === s.id;

          const trendStr = trend === null ? '―' : trend > 0 ? `▲${Math.abs(trend)}` : trend < 0 ? `▼${Math.abs(trend)}` : '―';
          const trendColor = trend === null ? '#98A1AC' : trend > 0 ? '#0F6E56' : trend < 0 ? '#A32D2D' : '#98A1AC';

          // 스파크라인 — 상태 컬러 사용
          const sparkW = 56, sparkH = 22;
          const sparkPts = rs.map((r, i) => [
            4 + (i / Math.max(rs.length - 1, 1)) * (sparkW - 8),
            sparkH - 2 - ((r.conceptRating - 1) / 4) * (sparkH - 6)
          ]);
          const sparkPath = sparkPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');

          // 주요 약점 태그
          const diagCount = {};
          rs.forEach(r => (r.diagnosis || []).forEach(d => {
            if (d.key !== 'perfect') diagCount[d.key] = (diagCount[d.key] || 0) + 1;
          }));
          const topWeak = Object.entries(diagCount).sort((a, b) => b[1] - a[1])[0];

          return (
            <div key={s.id}
              onClick={() => { setSelId(isSel ? null : s.id); setDrawerOpen(!isSel); }}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 65px 80px 70px 55px',
                padding: '10px 14px', borderBottom: '0.5px solid #F3F4F6', cursor: 'pointer',
                background: isSel ? '#EAF0F9' : '#fff', transition: 'background 0.12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status.border, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: isSel ? 700 : 400, color: '#1A1A1A' }}>{s.name}</span>
                {topWeak && (
                  <span style={{ fontSize: '10px', color: '#A32D2D', background: '#FCEBEB', padding: '1px 6px', borderRadius: '10px' }}>⚠</span>
                )}
              </div>
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: status.color, fontVariantNumeric: 'tabular-nums' }}>{a || '-'}</span>
              </div>
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: trendColor }}>{trendStr}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {rs.length >= 2 ? (
                  <svg viewBox={`0 0 ${sparkW} ${sparkH}`} width={sparkW} height={sparkH} style={{ overflow: 'visible' }}>
                    <path d={sparkPath} fill="none" stroke={status.color} strokeWidth="1.8"
                      strokeLinejoin="round" strokeLinecap="round" />
                    {sparkPts.length > 0 && (
                      <circle cx={sparkPts[sparkPts.length-1][0]} cy={sparkPts[sparkPts.length-1][1]}
                        r="2.5" fill={status.color} />
                    )}
                  </svg>
                ) : (
                  <span style={{ fontSize: '10px', color: '#98A1AC' }}>데이터 없음</span>
                )}
              </div>
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: status.color, background: status.bg, padding: '3px 8px', borderRadius: '20px', border: `1px solid ${status.border}` }}>
                  {status.label}
                </span>
              </div>
            </div>
          );
        })}
        {sortedStudents.length === 0 && (
          <p style={{ textAlign: 'center', color: '#98A1AC', fontSize: '12px', padding: '32px 0' }}>등록된 학생이 없습니다</p>
        )}
      </div>

      {/* 사이드 드로어 */}
      {drawerOpen && selId && (() => {
        const s = students.find(x => x.id === selId);
        const rsAll = getStudentReports(selId);
        const rs = rsAll.slice(-10); // 최대 10개
        const status = getStatus(selId);
        const a = getAvg(selId);
        const trend = getTrend(selId);
        const trendStr = trend === null ? '―' : trend > 0 ? `▲${Math.abs(trend)}` : trend < 0 ? `▼${Math.abs(trend)}` : '―';
        const trendColor = trend === null ? '#98A1AC' : trend > 0 ? '#0F6E56' : trend < 0 ? '#A32D2D' : '#98A1AC';
        const latestReport = rsAll[rsAll.length - 1];

        const diagCount = {};
        rs.forEach(r => (r.diagnosis || []).forEach(d => {
          if (d.key !== 'perfect') diagCount[d.key] = (diagCount[d.key] || 0) + 1;
        }));
        const topWeak = Object.entries(diagCount).sort((a, b) => b[1] - a[1])[0];

        const handleAction = (type) => {
          if (type === 'link') {
            if (latestReport?.id) {
              const url = `${window.location.origin}/report/${latestReport.id}`;
              navigator.clipboard.writeText(url).then(() => alert('링크 복사 완료!'));
            } else { alert('최근 리포트가 없습니다.'); }
          } else if (type === 'review') {
            setDrawerOpen(false); setSelId(null);
            if (onSwitchTab) onSwitchTab('review');
          } else if (type === 'profile') {
            setDrawerOpen(false); setSelId(null);
            if (onSwitchTab) onSwitchTab('analysis');
          }
        };

        return (
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '290px',
            background: '#fff', borderLeft: '0.5px solid #E8E6E0',
            padding: '18px', overflowY: 'auto', zIndex: 200,
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{s?.name}</p>
              <button onClick={() => { setDrawerOpen(false); setSelId(null); }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#98A1AC' }}>×</button>
            </div>

            {/* 상태 배지 */}
            <div style={{ background: status.bg, border: `1px solid ${status.border}`, borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: status.color }}>● {status.label}</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: status.color, fontVariantNumeric: 'tabular-nums' }}>
                {a}점 <span style={{ fontSize: '12px', color: trendColor }}>{trendStr}</span>
              </span>
            </div>

            {/* 미니 바차트 + 진단 태그 연결 */}
            <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 6px', letterSpacing: '0.08em' }}>개념 이해도 추이 · 진단</p>
            <div style={{ marginBottom: '14px' }}>
              {/* 바차트 */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px', borderBottom: '1px solid #E8E6E0', paddingBottom: '2px' }}>
                {rs.map((r, i) => {
                  const hasWeak = (r.diagnosis || []).some(d => d.key !== 'perfect');
                  const barColor = hasWeak ? '#A32D2D' : status.color;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: barColor, marginBottom: '2px' }}>{r.conceptRating}</span>
                      <div style={{ width: '100%', height: `${(r.conceptRating / 5) * 44}px`, background: barColor, borderRadius: '2px 2px 0 0', opacity: 0.85 }} />
                    </div>
                  );
                })}
              </div>
              {/* 날짜 */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '3px', marginBottom: '8px' }}>
                {rs.map((r, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                    <span style={{ fontSize: '8px', color: '#98A1AC' }}>
                      {r.createdAt?.seconds ? `${new Date(r.createdAt.seconds*1000).getMonth()+1}/${new Date(r.createdAt.seconds*1000).getDate()}` : ''}
                    </span>
                  </div>
                ))}
              </div>
              {/* 수업일별 진단 태그 + 상세 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {rs.filter(r => (r.diagnosis || []).some(d => d.key !== 'perfect')).slice(-3).reverse().map((r, i) => {
                  const dateStr = r.createdAt?.seconds
                    ? `${new Date(r.createdAt.seconds*1000).getMonth()+1}/${new Date(r.createdAt.seconds*1000).getDate()}`
                    : '';
                  const weakDiags = (r.diagnosis || []).filter(d => d.key !== 'perfect');
                  return (
                    <div key={i} style={{ background: '#FAFAFA', border: '0.5px solid #E8E6E0', borderRadius: '8px', padding: '8px 10px' }}>
                      <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 5px', fontWeight: 600 }}>{dateStr} · 개념 {r.conceptRating}/5</p>
                      {weakDiags.map((d, j) => (
                        <div key={j} style={{ marginBottom: j < weakDiags.length - 1 ? '4px' : 0 }}>
                          <span style={{ background: '#FCEBEB', border: '1px solid #A32D2D', color: '#791F1F', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
                            ⚠ {DIAG_MAP[d.key]?.label || d.key}
                            {d.unit ? ` · ${d.unit}단원` : ''}
                            {d.pages ? ` ${d.pages}` : ''}
                          </span>
                          {d.detail && (
                            <p style={{ fontSize: '11px', color: '#5A6472', margin: '3px 0 0 4px', lineHeight: 1.5 }}>
                              └ {d.detail}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {rs.every(r => !(r.diagnosis || []).some(d => d.key !== 'perfect')) && (
                  <p style={{ fontSize: '11px', color: '#98A1AC', margin: 0, textAlign: 'center', padding: '4px 0' }}>이 기간 진단된 약점 없음</p>
                )}
              </div>
            </div>

            {/* 액션 버튼 — 실제 동작 */}
            <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 8px', letterSpacing: '0.08em' }}>액션</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button onClick={() => handleAction('link')} style={{
                padding: '9px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '8px',
                border: '0.5px solid #1A5CB8', background: '#EAF0F9', color: '#0D2D6B',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>🔗 링크 복사 — 학부모 전송</button>
              <button onClick={() => handleAction('review')} style={{
                padding: '9px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '8px',
                border: '0.5px solid #E8E6E0', background: '#fff', color: '#1A1A1A',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>🔁 복습 관리 탭으로 이동</button>
              <button onClick={() => handleAction('profile')} style={{
                padding: '9px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '8px',
                border: '0.5px solid #E8E6E0', background: '#fff', color: '#1A1A1A',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>📊 종합 분석 탭으로 이동</button>
            </div>
          </div>
        );
      })()}

      {/* 툴팁 */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 32,
          background: '#1A1A1A', color: '#fff', fontSize: '11px', padding: '5px 9px',
          borderRadius: '6px', pointerEvents: 'none', zIndex: 300, fontFamily: 'inherit',
        }}>{tooltip.text}</div>
      )}
    </div>
  );
}

// ============================================================
// 복습 관리 뷰 — 망각곡선 기반 약점 복습 일정
// ============================================================
// ============================================================
// 원장 보고서 뷰
// ============================================================
// ============================================================
// 학생 종합 프로필 모달 — 상담용
// ============================================================
function StudentProfileModal({ student, reports, onClose, DIAG_MAP }) {
  const sorted = [...reports].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const recent = sorted.slice(-10); // 최근 10회

  const avgConcept = sorted.length ? Math.round(sorted.reduce((s, r) => s + (r.conceptRating || 0), 0) / sorted.length * 10) / 10 : 0;
  const avgHomework = sorted.length ? Math.round(sorted.reduce((s, r) => s + (r.homeworkRating || 0), 0) / sorted.length * 10) / 10 : 0;
  const attendanceRate = sorted.length ? Math.round(sorted.filter(r => r.attendance === '정시').length / sorted.length * 100) : 0;

  // 약점 집계
  const diagCount = {};
  sorted.forEach(r => (r.diagnosis || []).forEach(d => {
    if (d.key !== 'perfect') diagCount[d.key] = (diagCount[d.key] || 0) + 1;
  }));
  const weakTop3 = Object.entries(diagCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 최근 학습 단원 목록
  const unitHistory = [...new Set(sorted.map(r => [r.textbook, r.unit].filter(Boolean).join(' · ')).filter(Boolean))].slice(-5).reverse();

  const fmtDate = (r) => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    : '';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '620px', maxHeight: '88vh', overflow: 'auto', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}
        onClick={e => e.stopPropagation()}>

        {/* 모달 헤더 */}
        <div style={{ background: '#0D2D6B', padding: '18px 22px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '4px', height: '18px', background: '#C9A227', borderRadius: '0', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em' }}>와이즈에듀 교현학원 · 학생 종합 프로필</span>
          </div>
          <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: '22px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{student.name}</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', margin: 0 }}>총 {sorted.length}회 수업 누적</p>
          <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '18px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 22px' }}>

          {/* 핵심 지표 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: '개념 이해 평균', value: `${avgConcept}점`, color: avgConcept >= 4 ? '#0F6E56' : avgConcept >= 3 ? '#8A5A00' : '#A32D2D' },
              { label: '과제 수행 평균', value: `${avgHomework}점`, color: avgHomework >= 4 ? '#0F6E56' : '#8A5A00' },
              { label: '정시 출석률', value: `${attendanceRate}%`, color: attendanceRate >= 90 ? '#0F6E56' : attendanceRate >= 70 ? '#8A5A00' : '#A32D2D' },
            ].map((item, i) => (
              <div key={i} style={{ border: '0.5px solid #E8E6E0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 4px', letterSpacing: '0.06em' }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 800, color: item.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* 개념 이해도 추이 */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>개념 이해도 추이</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '80px', borderBottom: '1px solid #E8E6E0', paddingBottom: '4px' }}>
              {recent.map((r, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: (r.conceptRating >= 4) ? '#0F6E56' : (r.conceptRating <= 2 && r.conceptRating > 0) ? '#A32D2D' : '#1A5CB8', marginBottom: '2px' }}>{r.conceptRating || 0}</span>
                  <div style={{ width: '100%', maxWidth: '20px', height: `${((r.conceptRating || 0) / 5) * 64}px`, background: (r.conceptRating >= 4) ? '#0F6E56' : (r.conceptRating <= 2 && r.conceptRating > 0) ? '#A32D2D' : '#1A5CB8', borderRadius: '2px 2px 0 0' }} />
                  <span style={{ fontSize: '8px', color: '#98A1AC', marginTop: '4px' }}>{fmtDate(r)}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '10px', color: '#98A1AC', margin: '5px 0 0' }}>최근 {recent.length}회 수업 기준</p>
          </div>

          {/* 반복 약점 TOP3 */}
          {weakTop3.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>반복 약점 패턴</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {weakTop3.map(([key, count], i) => {
                  const tag = DIAG_MAP[key];
                  if (!tag) return null;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: tag.bg, color: '#fff', fontSize: '11px', fontWeight: 800, width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ background: tag.bg, color: '#fff', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{tag.prefix} {tag.label}</span>
                      <div style={{ flex: 1, height: '5px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${(count / (weakTop3[0][1])) * 100}%`, height: '100%', background: tag.bg, borderRadius: '4px' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: tag.bg, flexShrink: 0 }}>{count}회</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 최근 학습 단원 */}
          {unitHistory.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>최근 학습 단원</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {unitHistory.map((unit, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === 0 ? '#0D2D6B' : '#D8DDE4', flexShrink: 0 }} />
                    <p style={{ fontSize: '12px', color: i === 0 ? '#0D2D6B' : '#5A6472', fontWeight: i === 0 ? 700 : 400, margin: 0 }}>{unit}</p>
                    {i === 0 && <span style={{ fontSize: '10px', background: '#EAF0F9', color: '#1A5CB8', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>최근</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 최근 선생님 코멘트 */}
          {sorted.filter(r => r.teacherNote).length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>최근 선생님 코멘트</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sorted.filter(r => r.teacherNote).slice(-3).reverse().map((r, i) => (
                  <div key={i} style={{ borderLeft: '2px solid #C9A227', paddingLeft: '12px' }}>
                    <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 3px' }}>{fmtDate(r)}</p>
                    <p style={{ fontSize: '12px', color: '#5A6472', margin: 0, lineHeight: 1.7, fontStyle: 'italic' }}>"{r.teacherNote}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 원장님 상담 메모 */}
          <div>
            <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>원장님 상담 메모</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sorted.filter(r => r.directorMemo).slice(-3).reverse().map((r, i) => (
                <div key={i} style={{ background: '#FFFDF0', border: '0.5px solid #F5D76E', borderRadius: '8px', padding: '10px 12px' }}>
                  <p style={{ fontSize: '10px', color: '#8A5A00', margin: '0 0 3px' }}>{fmtDate(r)}</p>
                  <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0, lineHeight: 1.6 }}>{r.directorMemo}</p>
                </div>
              ))}
              {sorted.filter(r => r.directorMemo).length === 0 && (
                <p style={{ fontSize: '12px', color: '#98A1AC', margin: 0 }}>저장된 상담 메모가 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DirectorView({ reports, students }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedId, setExpandedId] = useState(null);
  const [memos, setMemos] = useState({});
  const [savingMemo, setSavingMemo] = useState(null);
  const [profileStudent, setProfileStudent] = useState(null); // 종합 프로필 모달

  const DIAG_MAP = {
    calc:    { label: '계산 실수', bg: '#A32D2D', prefix: '⚠' },
    concept: { label: '개념 누락', bg: '#A32D2D', prefix: '⚠' },
    apply:   { label: '응용 부족', bg: '#A32D2D', prefix: '⚠' },
    time:    { label: '시간 부족', bg: '#8A5A00', prefix: '△' },
    perfect: { label: '개념 완벽', bg: '#0F6E56', prefix: '✓' },
  };

  // 선택 날짜 리포트 필터 (KST 기준)
  const todayReports = reports.filter(r => {
    if (!r.createdAt?.seconds) return false;
    const kst = new Date(r.createdAt.seconds * 1000 + 9 * 60 * 60 * 1000);
    const d = kst.toISOString().split('T')[0];
    return d === selectedDate;
  });

  // 오늘 수업한 학생 ID 목록
  const reportedIds = new Set(todayReports.map(r => r.studentId));

  // 진단 집계
  const diagCount = {};
  todayReports.forEach(r => (r.diagnosis || []).forEach(d => {
    diagCount[d.key] = (diagCount[d.key] || 0) + 1;
  }));
  const diagEntries = Object.entries(diagCount).sort((a, b) => b[1] - a[1]);
  const maxDiag = diagEntries[0]?.[1] || 1;

  const totalOnTime = todayReports.filter(r => r.attendance === '정시').length;
  const totalAbsent = todayReports.filter(r => r.attendance === '결석').length;

  const handleMemoSave = async (reportId, memo) => {
    setSavingMemo(reportId);
    await updateDoc(doc(db, 'reports', reportId), { directorMemo: memo });
    setSavingMemo(null);
  };

  const fmtDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  };

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* 학생 종합 프로필 모달 */}
      {profileStudent && (
        <StudentProfileModal
          student={profileStudent}
          reports={reports.filter(r => r.studentId === profileStudent.id)}
          onClose={() => setProfileStudent(null)}
          DIAG_MAP={DIAG_MAP}
        />
      )}

      {/* 헤더 */}
      <div style={{ background: '#0D2D6B', borderRadius: '4px', padding: '16px 20px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em', margin: '0 0 3px' }}>와이즈에듀 교현학원</p>
          <p style={{ fontSize: '17px', fontWeight: 700, color: '#fff', margin: 0, fontFamily: "'Noto Serif KR', serif" }}>원장님 데일리 보고서</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid rgba(201,162,39,0.5)', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: '#C9A227', fontFamily: 'inherit', cursor: 'pointer' }}
          />
        </div>
      </div>

      <p style={{ fontSize: '13px', fontWeight: 600, color: '#5A6472', margin: '0 0 12px' }}>{fmtDate(selectedDate)}</p>

      {/* 핵심 지표 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '14px' }}>
        {[
          { label: '총 수업', value: `${todayReports.length}회`, color: '#0D2D6B' },
          { label: '정시 출석', value: `${totalOnTime}명`, color: '#0F6E56' },
          { label: '결석', value: `${totalAbsent}명`, color: totalAbsent > 0 ? '#A32D2D' : '#98A1AC' },
          { label: '리포트 미작성', value: `${Math.max(0, students.length - todayReports.length)}건`, color: students.length - todayReports.length > 0 ? '#8A5A00' : '#98A1AC' },
        ].map((item, i) => (
          <div key={i} style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 3px', letterSpacing: '0.06em' }}>{item.label}</p>
            <p style={{ fontSize: '22px', fontWeight: 800, color: item.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* 학생 카드 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
        {todayReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF', background: '#fff', borderRadius: '10px', border: '0.5px solid #E8E6E0' }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>📋</p>
            <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>이 날짜의 리포트가 없습니다</p>
            <p style={{ fontSize: '12px', margin: 0 }}>다른 날짜를 선택해보세요</p>
          </div>
        ) : todayReports.map(r => {
          const isOpen = expandedId === r.id;
          const weakDiag = (r.diagnosis || []).filter(d => d.key !== 'perfect');
          const goodDiag = (r.diagnosis || []).filter(d => d.key === 'perfect');
          const mainDiag = r.diagnosis?.[0];
          const borderColor = weakDiag.length > 0 ? '#A32D2D' : goodDiag.length > 0 ? '#0F6E56' : '#E8E6E0';
          // KST 기준 날짜 문자열
          const dateStr = r.createdAt?.seconds
            ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
            : '';

          return (
            <div key={r.id} style={{ background: '#fff', border: `0.5px solid ${borderColor}`, borderRadius: '10px', overflow: 'hidden' }}>

              {/* 요약 행 */}
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>

                {/* 학생명 + 강사 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EAF0F9', color: '#0D2D6B', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {r.studentName?.[0]}
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{r.studentName}</p>
                    <p style={{ fontSize: '10px', color: '#98A1AC', margin: 0 }}>{r.teacherName}{/선생님?$/.test(r.teacherName || '') ? '' : ' 선생님'}</p>
                  </div>
                </div>

                {/* 학습 단원 */}
                <div style={{ flex: 1, textAlign: 'left' }}>
                  {r.textbook && <p style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A', margin: '0 0 1px', wordBreak: 'keep-all' }}>{r.textbook}{r.unit ? ` · ${r.unit}` : ''}</p>}
                  {r.pages && <p style={{ fontSize: '11px', color: '#98A1AC', margin: 0 }}>{r.pages}</p>}
                </div>

                {/* 점수 */}
                <p style={{ fontSize: '11px', color: '#5A6472', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  과제 {r.homeworkRating}/5 · 개념 {r.conceptRating}/5
                  {r.hasTest && r.testScore ? ` · 시험 ${r.testScore}점` : ''}
                </p>

                {/* 진단 태그 */}
                {mainDiag && DIAG_MAP[mainDiag.key] && (
                  <span style={{ background: DIAG_MAP[mainDiag.key].bg, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {DIAG_MAP[mainDiag.key].prefix} {DIAG_MAP[mainDiag.key].label}
                  </span>
                )}

                {/* 종합 프로필 버튼 — 이벤트 버블링 차단 */}
                <button
                  onClick={(e) => { e.stopPropagation(); setProfileStudent({ id: r.studentId, name: r.studentName }); }}
                  style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, background: '#EAF0F9', color: '#1A5CB8', border: '1px solid #1A5CB8', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  종합 프로필
                </button>
              </div>

              {/* 펼쳐진 상세 */}
              {isOpen && (
                <div style={{ borderTop: '0.5px solid #F3F4F6', background: '#FAFAFA', padding: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>

                    {/* 약점 상세 */}
                    {r.diagnosis?.length > 0 && (
                      <div>
                        <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 6px', letterSpacing: '0.08em' }}>약점 상세</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {r.diagnosis.map((d, i) => {
                            const tag = DIAG_MAP[d.key];
                            if (!tag) return null;
                            return (
                              <div key={i}>
                                <span style={{ background: tag.bg, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
                                  {tag.prefix} {tag.label}
                                </span>
                                {(d.unit || d.detail) && (
                                  <p style={{ fontSize: '12px', color: '#5A6472', margin: '3px 0 0 2px', lineHeight: 1.5 }}>
                                    {d.unit && `${d.unit}단원`}{d.unit && d.detail ? ' — ' : ''}{d.detail}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 선생님 코멘트 */}
                    {r.teacherNote && (
                      <div>
                        <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 6px', letterSpacing: '0.08em' }}>선생님 코멘트</p>
                        <div style={{ borderLeft: '2px solid #C9A227', paddingLeft: '10px' }}>
                          <p style={{ fontSize: '12px', color: '#5A6472', margin: 0, lineHeight: 1.7, fontStyle: 'italic' }}>"{r.teacherNote}"</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 다음 수업 계획 */}
                  {r.nextPlan && (
                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#EAF0F9', borderRadius: '8px' }}>
                      <p style={{ fontSize: '10px', color: '#1A5CB8', margin: '0 0 3px', letterSpacing: '0.08em' }}>다음 수업 계획</p>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#0D2D6B', margin: 0 }}>{r.nextPlan}{r.nextPlanDetail ? ` · ${r.nextPlanDetail}` : ''}</p>
                    </div>
                  )}

                  {/* 원장님 메모 */}
                  <div>
                    <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 5px', letterSpacing: '0.08em' }}>원장님 메모</p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <textarea
                        value={memos[r.id] ?? (r.directorMemo || '')}
                        onChange={e => setMemos(prev => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="상담 포인트, 학부모 통화 내용, 학생 컨디션 등 원장님만 보는 메모"
                        rows={2}
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12px', border: '0.5px solid #E8E6E0', borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }}
                      />
                      <button
                        onClick={() => handleMemoSave(r.id, memos[r.id] ?? r.directorMemo ?? '')}
                        disabled={savingMemo === r.id}
                        style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, background: '#0D2D6B', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                        {savingMemo === r.id ? '저장 중' : '저장'}
                      </button>
                    </div>
                  </div>

                  {/* 링크 복사 — 미리보기 카드 */}
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid #E8E6E0' }}>
                    <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 7px', letterSpacing: '0.08em' }}>학부모 전송 미리보기</p>
                    {/* 미리보기 카드 */}
                    <div style={{ background: '#F5F8FF', border: '1px solid #C5D5F0', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
                      <p style={{ fontSize: '11px', color: '#1A5CB8', fontWeight: 700, margin: '0 0 6px' }}>📋 교현학원 수업 리포트</p>
                      <p style={{ fontSize: '13px', fontWeight: 800, color: '#0D2D6B', margin: '0 0 4px' }}>{r.studentName} 학생 · {dateStr}</p>
                      <div style={{ display: 'flex', gap: '10px', margin: '0 0 6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#5A6472' }}>과제 {r.homeworkRating}/5</span>
                        <span style={{ fontSize: '11px', color: '#5A6472' }}>개념 {r.conceptRating}/5</span>
                        <span style={{ fontSize: '11px', color: r.attendance === '정시' ? '#0F6E56' : '#A32D2D' }}>{r.attendance}</span>
                        {r.hasTest && r.testScore && <span style={{ fontSize: '11px', color: '#5A6472' }}>시험 {r.testScore}점</span>}
                      </div>
                      {(r.diagnosis || []).length > 0 && (
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          {r.diagnosis.slice(0, 2).map((d, i) => {
                            const tag = DIAG_MAP[d.key];
                            return tag ? (
                              <span key={i} style={{ background: tag.bg, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px' }}>
                                {tag.prefix} {tag.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                      <p style={{ fontSize: '10px', color: '#98A1AC', margin: 0 }}>👉 자세한 리포트 보기 →</p>
                    </div>
                    {/* 복사 버튼 */}
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/report/${r.id}`;
                        const RATING_LABEL = { 1: '노력 필요', 2: '조금 부족', 3: '보통', 4: '잘함', 5: '아주 잘함' };
                        const diagText = (r.diagnosis || []).map(d => DIAG_MAP[d.key] ? `${DIAG_MAP[d.key].prefix} ${DIAG_MAP[d.key].label}${d.detail ? ` (${d.detail})` : ''}` : '').filter(Boolean).join(', ');
                        const copyText = [
                          `📋 교현학원 수업 리포트`,
                          ``,
                          `안녕하세요, ${r.studentName} 학생 ${dateStr} 수업 리포트입니다.`,
                          ``,
                          `▸ 과제 수행: ${r.homeworkRating}/5 (${RATING_LABEL[r.homeworkRating] || ''})`,
                          `▸ 개념 이해: ${r.conceptRating}/5 (${RATING_LABEL[r.conceptRating] || ''})`,
                          `▸ 출결: ${r.attendance}`,
                          r.hasTest && r.testScore ? `▸ 시험: ${r.testName || ''} ${r.testScore}점` : '',
                          diagText ? `▸ 진단: ${diagText}` : '',
                          ``,
                          `👉 자세한 리포트 보기`,
                          url,
                        ].filter(line => line !== '').join('\n');
                        navigator.clipboard.writeText(copyText).then(() =>
                          alert(`복사 완료! 카톡에 그대로 붙여넣기 하세요. ✅`)
                        );
                      }}
                      style={{
                        width: '100%', padding: '10px 14px', fontSize: '12px', fontWeight: 700,
                        background: '#0D2D6B', border: 'none', color: '#fff',
                        borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      🔗 위 내용 카톡으로 복사하기
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 진단 집계 */}
      {diagEntries.length > 0 && (
        <div style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '10px', padding: '14px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 10px' }}>오늘 진단 집계</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {diagEntries.map(([key, count]) => {
              const tag = DIAG_MAP[key];
              if (!tag) return null;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ background: tag.bg, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', minWidth: '90px', textAlign: 'center' }}>
                    {tag.prefix} {tag.label}
                  </span>
                  <div style={{ flex: 1, height: '5px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(count / maxDiag) * 100}%`, height: '100%', background: tag.bg, borderRadius: '4px' }} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: tag.bg, minWidth: '24px' }}>{count}건</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewView({ students }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today');
  const [expandedStudent, setExpandedStudent] = useState(null); // 펼쳐진 학생 ID
  const [editingId, setEditingId] = useState(null);
  const [scoreInput, setScoreInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'reviews'), orderBy('dueDate', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const today = new Date().toISOString().split('T')[0];

  const filtered = reviews.filter(r => {
    if (filter === 'today') return r.status === 'pending' && r.dueDate <= today;
    if (filter === 'upcoming') return r.status === 'pending' && r.dueDate > today;
    if (filter === 'done') return r.status === 'done';
    return true;
  });

  const todayCount = reviews.filter(r => r.status === 'pending' && r.dueDate <= today).length;

  // 학생별 그룹핑
  const grouped = filtered.reduce((acc, r) => {
    const key = r.studentId || r.studentName;
    if (!acc[key]) acc[key] = { studentName: r.studentName, studentId: r.studentId, items: [] };
    acc[key].items.push(r);
    return acc;
  }, {});
  const groupedList = Object.values(grouped);

  const handleDone = async (r) => {
    await updateDoc(doc(db, 'reviews', r.id), {
      status: 'done',
      testScore: scoreInput ? Number(scoreInput) : null,
      note: noteInput,
      doneAt: new Date().toISOString(),
    });
    setEditingId(null);
    setScoreInput('');
    setNoteInput('');
  };

  const handleDelete = async (id) => {
    if (confirm('이 복습 일정을 삭제하시겠습니까?')) {
      await deleteDoc(doc(db, 'reviews', id));
    }
  };

  const daysUntil = (dateStr) => {
    const diff = Math.ceil((new Date(dateStr) - new Date(today)) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)}일 지남`;
    if (diff === 0) return '오늘';
    return `D-${diff}`;
  };

  const roundLabel = (round) => [`1차`, `2차`, `3차 최종`][round - 1] || `${round}차`;
  const roundColor = (round) => ['#1A5CB8', '#8A5A00', '#0F6E56'][round - 1] || '#6B7280';

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 2px', color: '#1A1A1A' }}>복습 관리</h2>
          <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>망각곡선 7일 · 14일 · 30일 자동 생성</p>
        </div>
        {todayCount > 0 && (
          <div style={{ background: '#F5A623', color: '#fff', borderRadius: '20px', padding: '5px 14px', fontSize: '12px', fontWeight: 700 }}>
            오늘 {todayCount}건
          </div>
        )}
      </div>

      {/* 필터 탭 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {[
          { key: 'today', label: `오늘 (${todayCount})` },
          { key: 'upcoming', label: '예정' },
          { key: 'done', label: '완료' },
          { key: 'all', label: '전체' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setExpandedStudent(null); }} style={{
            padding: '6px 14px', fontSize: '12px', fontWeight: filter === f.key ? 700 : 500,
            borderRadius: '20px', border: `1.5px solid ${filter === f.key ? '#0D2D6B' : '#E5E7EB'}`,
            background: filter === f.key ? '#0D2D6B' : '#fff',
            color: filter === f.key ? '#fff' : '#6B7280',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{f.label}</button>
        ))}
      </div>

      {/* 학생별 그룹 */}
      {loading ? (
        <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '40px 0' }}>불러오는 중...</p>
      ) : groupedList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
          <p style={{ fontSize: '28px', marginBottom: '8px' }}>✅</p>
          <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>
            {filter === 'today' ? '오늘 복습할 항목이 없습니다' : '해당 항목이 없습니다'}
          </p>
          <p style={{ fontSize: '12px', margin: 0 }}>리포트 작성 시 약점 태그를 선택하면 자동 생성됩니다</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {groupedList.map(group => {
            const isOpen = expandedStudent === group.studentId;
            const urgentCount = group.items.filter(r => r.dueDate <= today && r.status === 'pending').length;

            return (
              <div key={group.studentId} style={{ background: '#fff', border: `1.5px solid ${urgentCount > 0 ? '#F5A623' : '#E5E7EB'}`, borderRadius: '14px', overflow: 'hidden' }}>

                {/* 학생 헤더 — 클릭으로 펼치기/접기 */}
                <button
                  onClick={() => setExpandedStudent(isOpen ? null : group.studentId)}
                  style={{ width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  {/* 학생 이니셜 */}
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EAF0F9', color: '#0D2D6B', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {group.studentName?.[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 2px' }}>{group.studentName}</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {urgentCount > 0 && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#F5A623' }}>오늘 {urgentCount}건</span>
                      )}
                      <span style={{ fontSize: '11px', color: '#9CA3AF' }}>총 {group.items.length}건</span>
                      {/* 차수 미니 배지들 */}
                      {group.items.map((item, i) => (
                        <span key={i} style={{ fontSize: '10px', fontWeight: 700, color: '#fff', background: roundColor(item.round), padding: '1px 7px', borderRadius: '10px' }}>
                          {roundLabel(item.round)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span style={{ fontSize: '18px', color: '#9CA3AF', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
                </button>

                {/* 펼쳐진 복습 항목들 */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #F3F4F6' }}>
                    {group.items.map((r, idx) => (
                      <div key={r.id} style={{
                        padding: '12px 16px',
                        borderBottom: idx < group.items.length - 1 ? '1px solid #F9FAFB' : 'none',
                        background: r.status === 'done' ? '#FAFAFA' : r.dueDate <= today ? '#FFFDF0' : '#fff',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          {/* 차수 배지 */}
                          <span style={{ background: roundColor(r.round), color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', flexShrink: 0, marginTop: '1px' }}>
                            {roundLabel(r.round)}
                          </span>
                          <div style={{ flex: 1 }}>
                            {/* 단원 + D-day */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <div>
                                {r.unit && <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 1px' }}>{r.unit}</p>}
                                {r.textbook && <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>{r.textbook}</p>}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '12px', fontWeight: 700, color: r.status === 'done' ? '#9CA3AF' : r.dueDate <= today ? '#F5A623' : '#6B7280', margin: 0 }}>
                                  {r.status === 'done' ? '완료' : daysUntil(r.dueDate)}
                                </p>
                                <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '1px 0 0' }}>{r.dueDate}</p>
                              </div>
                            </div>

                            {/* 약점 태그 */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                              {(r.weakTypes || []).map((t, i) => (
                                <span key={i} style={{ background: '#FCEBEB', border: '1px solid #A32D2D', color: '#791F1F', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px' }}>
                                  ⚠ {t.label}{t.unit ? ` · ${t.unit}단원` : ''}{t.detail ? ` — ${t.detail}` : ''}
                                </span>
                              ))}
                            </div>

                            {/* 완료 결과 */}
                            {r.status === 'done' && (
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {r.testScore !== null && (
                                  <span style={{ fontSize: '16px', fontWeight: 800, color: r.testScore >= 80 ? '#0F6E56' : r.testScore >= 60 ? '#8A5A00' : '#A32D2D' }}>
                                    {r.testScore}점
                                  </span>
                                )}
                                {r.note && <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>{r.note}</p>}
                              </div>
                            )}

                            {/* 결과 입력 폼 (오늘 이하 pending) */}
                            {r.status === 'pending' && r.dueDate <= today && (
                              editingId === r.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input type="number" placeholder="점수" value={scoreInput}
                                      onChange={e => setScoreInput(e.target.value)}
                                      style={{ width: '90px', padding: '7px 10px', fontSize: '13px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }}
                                    />
                                    <input placeholder="메모 (선택)" value={noteInput}
                                      onChange={e => setNoteInput(e.target.value)}
                                      style={{ flex: 1, padding: '7px 10px', fontSize: '13px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => handleDone(r)} style={{ flex: 1, padding: '7px', fontSize: '12px', fontWeight: 700, background: '#0D2D6B', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                      완료 저장
                                    </button>
                                    <button onClick={() => setEditingId(null)} style={{ padding: '7px 12px', fontSize: '12px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', color: '#6B7280' }}>
                                      취소
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button onClick={() => { setEditingId(r.id); setScoreInput(''); setNoteInput(''); }} style={{ flex: 1, padding: '7px', fontSize: '12px', fontWeight: 700, background: '#0D2D6B', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    테스트 결과 입력
                                  </button>
                                  <button onClick={() => handleDelete(r.id)} style={{ padding: '7px 10px', fontSize: '12px', background: '#fff', border: '1px solid #FCA5A5', borderRadius: '8px', cursor: 'pointer', color: '#DC2626', fontFamily: 'inherit' }}>
                                    삭제
                                  </button>
                                </div>
                              )
                            )}

                            {/* 예정 항목 삭제 */}
                            {r.status === 'pending' && r.dueDate > today && (
                              <button onClick={() => handleDelete(r.id)} style={{ padding: '4px 10px', fontSize: '11px', background: 'none', border: '1px solid #E5E7EB', borderRadius: '6px', cursor: 'pointer', color: '#9CA3AF', fontFamily: 'inherit' }}>
                                일정 삭제
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
