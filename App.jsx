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
import { calculateTotalPoints, getStageInfo, calculateReportPoints, STAGES, toPct, ratingLabel } from './growth.js';
import { useMediaQuery } from './hooks.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import { T } from './tokens.jsx';
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
      minHeight: '100dvh', background: T.bgSoft,
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
                width: '100%', padding: '11px 14px', fontSize: '16px',
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
                width: '100%', padding: '11px 14px', fontSize: '16px',
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
  const [userRole, setUserRole] = useState(null);
  const [userTeacherId, setUserTeacherId] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSubTab, setActiveSubTab] = useState({ record: 'history', insight: 'director', manage: 'students' });
  const setSubTab = (group, key) => setActiveSubTab(prev => ({ ...prev, [group]: key }));
  const [editingReport, setEditingReport] = useState(null);

  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportViews, setReportViews] = useState([]);
  const [studentsReady, setStudentsReady] = useState(false);
  const [reportsReady, setReportsReady] = useState(false);
  const dataReady = studentsReady && reportsReady;
  const [appToast, setAppToast] = useState(null);
  const appToastTimerRef = React.useRef(null);

  const showAppToast = (msg, type = 'success') => {
    if (appToastTimerRef.current) clearTimeout(appToastTimerRef.current);
    setAppToast({ msg, type });
    appToastTimerRef.current = setTimeout(() => setAppToast(null), 2500);
  };

  // 앱 이탈 방지 — 브라우저 밖으로 나갈 때 경고
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '교현학원 리포트 앱을 나가시겠습니까?';
    };
    // 모바일 뒤로가기로 앱 밖 이탈 방지
    const handlePopState = () => {
      history.pushState(null, '', window.location.href);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    // 초기 진입 시 history 스택 확보
    history.pushState(null, '', window.location.href);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

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
    setStudentsReady(false);
    setReportsReady(false);
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setStudentsReady(true);
    }, (e) => { console.error('학생 목록 구독 실패:', e); showAppToast('학생 목록을 불러오지 못했습니다. 새로고침해주세요.', 'error'); });
    const unsubTeachers = onSnapshot(collection(db, 'teachers'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length === 0) {
        addDoc(collection(db, 'teachers'), { name: '김선생님', createdAt: serverTimestamp() });
      } else {
        setTeachers(list);
      }
    }, (e) => { console.error('강사 목록 구독 실패:', e); showAppToast('강사 목록을 불러오지 못했습니다.', 'error'); });
    const unsubReports = onSnapshot(collection(db, 'reports'), (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setReportsReady(true);
    }, (e) => { console.error('리포트 목록 구독 실패:', e); showAppToast('리포트 목록을 불러오지 못했습니다. 새로고침해주세요.', 'error'); });

    // 열람 기록 실시간 구독
    const unsubViews = onSnapshot(collection(db, 'reportViews'), (snap) => {
      setReportViews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => { console.error('열람 기록 구독 실패:', e); });

    return () => { unsubStudents(); unsubTeachers(); unsubReports(); unsubViews(); };
  }, [user]);

  const handleSaveStudent = async (d) => {
  try {
    if (d.id) {
      const { id, ...data } = d;
      await updateDoc(doc(db, 'students', id), data);
    } else {
      await addDoc(collection(db, 'students'), { ...d, createdAt: serverTimestamp() });
    }
  } catch (e) {
    console.error('학생 저장 실패:', e);
    alert('저장 실패: ' + e.message);
  }
};
  const handleDeleteStudent = async (id) => {
    try {
      await deleteDoc(doc(db, 'students', id));
    } catch (e) {
      console.error('학생 삭제 실패:', e);
      showAppToast('학생 삭제에 실패했습니다.', 'error');
    }
  };

  const handleSaveTeacher = async (d) => {
    try {
      if (d.id) { const { id, ...data } = d; await updateDoc(doc(db, 'teachers', id), data); }
      else await addDoc(collection(db, 'teachers'), { ...d, createdAt: serverTimestamp() });
    } catch (e) {
      console.error('강사 저장 실패:', e);
      showAppToast('강사 정보 저장에 실패했습니다.', 'error');
    }
  };
  const handleDeleteTeacher = async (id) => {
    try {
      await deleteDoc(doc(db, 'teachers', id));
    } catch (e) {
      console.error('강사 삭제 실패:', e);
      showAppToast('강사 삭제에 실패했습니다.', 'error');
    }
  };

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
    return reportId;
  };
  const handleDeleteReport = async (id) => {
    try {
      await deleteDoc(doc(db, 'reports', id));
    } catch (e) {
      console.error('리포트 삭제 실패:', e);
      showAppToast('리포트 삭제에 실패했습니다.', 'error');
      return;
    }
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
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: T.brand, fontSize: '14px', fontWeight: 600 }}>
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

  const mainTabs = [
    { key: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={20} />, roles: ['director', 'teacher'] },
    { key: 'write',     label: '리포트',   icon: <FileText size={20} />,        roles: ['director', 'teacher'] },
    { key: 'record',    label: '학습기록',  icon: <History size={20} />,         roles: ['director', 'teacher'] },
    { key: 'insight',   label: '원장분석',  icon: <BarChart2 size={20} />,       roles: ['director'] },
    { key: 'manage',    label: '관리',      icon: <Users size={20} />,           roles: ['director'] },
  ];
  const tabs = mainTabs.filter(t => t.roles.includes(userRole || 'director'));
  const renderSubTabBar = (group, items) => (
    <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: '10px', padding: '3px', margin: '16px 20px 0', gap: '2px' }}>
      {items.map(item => {
        const isActive = activeSubTab[group] === item.key;
        return (
          <button key={item.key} onClick={() => setSubTab(group, item.key)}
            style={{ flex: 1, padding: '8px 4px', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: isActive ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s', background: isActive ? '#fff' : 'transparent', color: isActive ? '#0D2D6B' : '#8A8A8A', boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', background: T.bgSoft, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <header style={{ background: T.bg, borderBottom: `1px solid ${T.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ width: '28px', height: '28px', background: T.brand, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>K</span>
        </div>
        <h1 style={{ fontSize: '16px', fontWeight: 700, color: T.text, letterSpacing: '-0.02em', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>교현학원 데일리 리포트</h1>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: T.textMute, fontWeight: 500, background: T.bgSoft, padding: '3px 8px', borderRadius: '6px', border: `1px solid ${T.border}`, flexShrink: 0 }}>
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
        </span>



        <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: isDirector ? '#EAF0F9' : '#E1F5EE', color: isDirector ? '#0D2D6B' : '#0F6E56', flexShrink: 0 }}>
          {isDirector ? '원장' : (teachers.find(t => t.id === userTeacherId)?.name || '강사')}
        </span>
        <button onClick={() => signOut(auth)} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }} title="로그아웃">
          <LogOut size={16} />
        </button>
      </header>

      {/* 앱 레벨 토스트 */}
      {appToast && (
        <div style={{
          position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
          background: appToast.type === 'success' ? '#0F6E56' : '#0D2D6B',
          color: '#fff', padding: '10px 20px', borderRadius: '20px',
          fontSize: '13px', fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: 'calc(100vw - 40px)', whiteSpace: 'normal', textAlign: 'center',
        }}>{appToast.msg}</div>
      )}

      <main>
      <ErrorBoundary key={activeTab} minHeight="400px">
        {activeTab === 'dashboard' && (dataReady ? <DashboardView students={visibleStudents} reports={visibleReports} onTabChange={setActiveTab} /> : <SkeletonBlock rows={3} cardHeight={90} />)}
        {activeTab === 'write' && (
          <>
            {/* 오늘 리포트 상태바 */}
            {(() => {
              const today = new Date().toLocaleDateString('ko-KR');
              const todayReports = visibleReports.filter(r => {
                const rDate = new Date((r.createdAt?.seconds||0)*1000).toLocaleDateString('ko-KR');
                return rDate === today;
              });
              if (todayReports.length === 0) return null;

              const allLinks = todayReports
                .map(r => `${r.studentName} 학생 리포트\n${window.location.origin}/report/${r.id}`)
                .join('\n\n');

              return (
                <div style={{ background: '#F8F9FC', borderBottom: '1px solid #E5E7EB', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, flexShrink: 0 }}>오늘</span>
                  {visibleStudents
                    .filter(s => todayReports.some(r => r.studentId === s.id))
                    .map(s => {
                      const r = todayReports.find(r => r.studentId === s.id);
                      const done = r?.teacherNote && r.teacherNote.trim().length > 0;
                      return (
                        <button key={s.id}
                          onClick={() => { setEditingReport(r); setActiveTab('write'); }}
                          style={{
                            padding: '3px 10px', borderRadius: '12px', border: 'none',
                            background: done ? '#F0FAF5' : '#FFF8EC',
                            color: done ? '#0F6E56' : '#7A4F00',
                            fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          {s.name} {done ? '✓' : '✍️'}
                        </button>
                      );
                    })
                  }
                  <button
                    onClick={() => navigator.clipboard.writeText(allLinks).then(() => showAppToast(`오늘 리포트 ${todayReports.length}건 링크 복사됐어요!`))}
                    style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: '12px', border: '1px solid #0D2D6B', background: '#fff', color: '#0D2D6B', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    전체 링크 복사 ({todayReports.length}건)
                  </button>
                </div>
              );
            })()}
            <DiagnosticReportInput
              students={visibleStudents} teachers={teachers}
              reports={visibleReports}
              onSaveStudent={handleSaveStudent}
              onSaveTeacher={handleSaveTeacher}
              onDeleteTeacher={handleDeleteTeacher}
              onSave={handleSaveReport}
              editingReport={editingReport}
              onEditDone={() => setEditingReport(null)}

            />
          </>
        )}
        {activeTab === 'record' && (
          <div>
            {renderSubTabBar('record', [
              { key: 'history', label: '기록 보관소' },
            ])}
            <div style={{ marginTop: '12px' }}>
              {activeSubTab.record === 'history' && (dataReady
                ? <HistoryView reports={visibleReports} students={visibleStudents} reportViews={reportViews} onDelete={handleDeleteReport} onEdit={(report) => { setEditingReport(report); setActiveTab('write'); }} />
                : <SkeletonBlock rows={5} cardHeight={56} />
              )}
            </div>
          </div>
        )}
        {activeTab === 'insight' && (
          <div>
            {renderSubTabBar('insight', [
              { key: 'director', label: '원장 보고서' },
              { key: 'analysis', label: '종합 분석' },
            ])}
            <div style={{ marginTop: '12px' }}>
              {activeSubTab.insight === 'director' && (dataReady
                ? <div><DirectorView reports={reports} students={students} reportViews={reportViews} /><GrowthDashboard reports={reports} students={students} onSwitchTab={setActiveTab} /></div>
                : <SkeletonBlock rows={4} cardHeight={70} />
              )}
              {activeSubTab.insight === 'analysis' && (dataReady
                ? <AnalysisView students={students} reports={reports} />
                : <SkeletonBlock rows={4} cardHeight={70} />
              )}
            </div>
          </div>
        )}
        {activeTab === 'manage' && (
          <div>
            {renderSubTabBar('manage', [
              { key: 'students', label: '학생 관리' },
              { key: 'settings', label: '설정' },
            ])}
            <div style={{ marginTop: '12px' }}>
              {activeSubTab.manage === 'students' && (dataReady
                ? <StudentsView students={students} reports={reports} onSave={handleSaveStudent} onDelete={handleDeleteStudent} teachers={teachers} />
                : <SkeletonBlock rows={5} cardHeight={56} />
              )}
              {activeSubTab.manage === 'settings' && (dataReady
                ? <SettingsView students={students} onSaveStudent={handleSaveStudent} teachers={teachers} onSaveTeacher={handleSaveTeacher} onDeleteTeacher={handleDeleteTeacher} />
                : <SkeletonBlock rows={4} cardHeight={70} />
              )}
            </div>
          </div>
        )}
      </ErrorBoundary>
      </main>

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: T.bg, borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '6px 0 calc(8px + env(safe-area-inset-bottom))', zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.04)' }}>
        {tabs.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px 2px', border: 'none', background: 'none', cursor: 'pointer', color: active ? T.brand : T.textMute, fontFamily: "'Pretendard Variable', Pretendard, sans-serif", position: 'relative' }}>
              {active && <span style={{ position: 'absolute', top: '-6px', left: '50%', transform: 'translateX(-50%)', width: '24px', height: '2px', background: T.brand, borderRadius: '0 0 2px 2px' }} />}
              {tab.icon}
              <span style={{ fontSize: '10px', fontWeight: active ? 700 : 400 }}>{tab.label}</span>
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
          <button onClick={() => onTabChange('write')} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>리포트 작성</button>
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

function SkeletonBlock({ rows = 4, cardHeight = 64 }) {
  return (
    <div style={{ padding: '20px' }}>
      <style>{`@keyframes skeletonPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.9; } }`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height: `${cardHeight}px`, background: '#EDEBE7', borderRadius: '12px',
          marginBottom: '10px', animation: 'skeletonPulse 1.4s ease-in-out infinite',
        }} />
      ))}
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
  const [profileStudent, setProfileStudent] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // studentId

  const DIAG_MAP = {
    calc:    { label: '계산 실수', bg: '#A32D2D', prefix: '⚠' },
    concept: { label: '개념 누락', bg: '#A32D2D', prefix: '⚠' },
    apply:   { label: '응용 부족', bg: '#A32D2D', prefix: '⚠' },
    time:    { label: '시간 부족', bg: '#8A5A00', prefix: '△' },
    perfect: { label: '개념 완벽', bg: '#0F6E56', prefix: '✓' },
  };

  // 검색 + 정렬
  const filtered = students
    .filter(s => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return s.name?.toLowerCase().includes(q) || s.school?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'reports') {
        return reports.filter(r => r.studentId === b.id).length - reports.filter(r => r.studentId === a.id).length;
      }
      if (sortBy === 'recent') {
        const aLast = reports.filter(r => r.studentId === a.id).sort((x,y) => (y.createdAt?.seconds||0)-(x.createdAt?.seconds||0))[0]?.createdAt?.seconds || 0;
        const bLast = reports.filter(r => r.studentId === b.id).sort((x,y) => (y.createdAt?.seconds||0)-(x.createdAt?.seconds||0))[0]?.createdAt?.seconds || 0;
        return bLast - aLast;
      }
      return 0;
    });

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>

      {/* 학생 프로필 모달 */}
      {profileStudent && (
        <StudentProfileModal
          student={profileStudent}
          reports={reports.filter(r => r.studentId === profileStudent.id)}
          onClose={() => setProfileStudent(null)}
          DIAG_MAP={DIAG_MAP}
        />
      )}

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px', letterSpacing: '-0.02em' }}>학생 관리</h2>

      {/* 검색 + 정렬 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="#9CA3AF" strokeWidth="1.5"/>
            <path d="M9.5 9.5L12 12" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="이름 또는 학교 검색"
            style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '16px', fontFamily: 'inherit', outline: 'none', background: '#fff' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '16px', lineHeight: 1, width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
          )}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '16px', fontFamily: 'inherit', background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none' }}>
          <option value="name">이름순</option>
          <option value="recent">최근 수업순</option>
          <option value="reports">리포트 많은순</option>
        </select>
      </div>

      {/* 검색 결과 없음 */}
      {search && filtered.length === 0 && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E5E7EB', padding: '40px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
          "{search}"에 해당하는 학생이 없습니다
        </div>
      )}

      {students.length === 0
        ? <div style={{ background: '#fff', borderRadius: '16px', border: `1px solid #E5E7EB`, padding: '60px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>리포트 작성 화면에서 학생을 추가하세요</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(s => {
            const sReports = reports.filter(r => r.studentId === s.id);
            const assignedTeacher = teachers.find(t => t.id === s.assignedTeacherId);
            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: '16px', padding: '16px 18px', border: `1px solid #E5E7EB`, cursor: 'pointer' }}
                onClick={() => setProfileStudent(s)}>
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
                    onClick={(e) => { e.stopPropagation(); setEditingStudent(s); }}
                    style={{ background: '#E6F1FB', border: 'none', color: '#185FA5', fontSize: '12px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', marginRight: '6px' }}>
                    ✏️ 수정
                  </button>
                  {deleteConfirm === s.id ? (
                    <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { onDelete(s.id); setDeleteConfirm(null); }}
                        style={{ background: '#DC2626', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '5px 10px', borderRadius: '6px', cursor: 'pointer' }}>
                        삭제 확인
                      </button>
                      <button onClick={() => setDeleteConfirm(null)}
                        style={{ background: '#F3F4F6', border: 'none', color: '#6B7280', fontSize: '11px', fontWeight: 600, padding: '5px 10px', borderRadius: '6px', cursor: 'pointer' }}>
                        취소
                      </button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(s.id); setTimeout(() => setDeleteConfirm(null), 3000); }}
                      style={{ background: 'none', border: 'none', color: '#D1D5DB', fontSize: '18px', cursor: 'pointer', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>×</button>
                  )}
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
  const [studentType, setStudentType] = useState(student.studentType || 'returning');
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
      studentType,
    });
    setSaving(false);
  };

  const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' };
  const modalStyle = { background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" };
  const inputStyle = { width: '100%', padding: '9px 11px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '9px', background: '#F9FAFB', outline: 'none', fontFamily: 'inherit', fontWeight: 500, color: '#1A1A1A', boxSizing: 'border-box' };
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#6B7280', cursor: 'pointer', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
        </div>

        {/* 입력 */}
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* 학생 구분 토글 */}
          <div>
            <label style={labelStyle}>학생 구분</label>
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
              {[
                { key: 'new', label: '🌱 신규생' },
                { key: 'returning', label: '📚 재학생' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setStudentType(key)}
                  style={{
                    flex: 1, padding: '9px', border: 'none', cursor: 'pointer',
                    background: studentType === key ? '#0D2D6B' : '#fff',
                    color: studentType === key ? '#fff' : '#6B7280',
                    fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                    borderRight: key === 'new' ? '1px solid #E5E7EB' : 'none',
                    transition: 'all 0.15s',
                  }}>{label}</button>
              ))}
            </div>
          </div>

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
                    <button onClick={() => removeTextbook(t.id)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '16px', flexShrink: 0, width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
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
                        <span style={{ fontSize: '10px', fontWeight: 700, color: skinColor === sk.main ? '#185FA5' : '#6B7280' }}>{sk.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* 커스텀 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F9FAFB', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ position: 'relative', width: '36px', height: '36px', borderRadius: '10px', background: skinColor || '#185FA5', border: '2px solid rgba(0,0,0,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                    <input type="color" value={skinColor || '#185FA5'} onChange={(e) => setSkinColor(e.target.value)}
                      style={{ position: 'absolute', inset: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', border: 'none', cursor: 'pointer', opacity: 0 }} />
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

const DIAGNOSIS_TAGS_MAP = {
  calc:    { label: '⚠ 계산 실수', bg: '#A32D2D', color: '#fff' },
  concept: { label: '⚠ 개념 누락', bg: '#A32D2D', color: '#fff' },
  apply:   { label: '⚠ 응용 부족', bg: '#A32D2D', color: '#fff' },
  time:    { label: '△ 시간 부족', bg: '#8A5A00', color: '#fff' },
  perfect: { label: '✓ 개념 완벽', bg: '#0F6E56', color: '#fff' },
};

function HistoryView({ reports, students, reportViews = [], onDelete, onEdit }) {
  const [selectedId, setSelectedId] = useState(null);
  const [deleteConfirmReport, setDeleteConfirmReport] = useState(null);
  const [studentFilter, setStudentFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [trendTooltip, setTrendTooltip] = useState(null); // { x, y, text }

  // 삭제된 리포트가 selectedId면 자동 초기화
  React.useEffect(() => {
    if (selectedId && !reports.find(r => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [reports, selectedId]);

  const DIAG_LABELS = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
  const DIAG_COLORS = { calc: { bg: '#FFF8EC', color: '#8A5A00', border: '#C9A22740' }, concept: { bg: '#EAF1FB', color: '#0D2D6B', border: '#0D2D6B40' }, apply: { bg: '#FDF0F0', color: '#8A2020', border: '#8A202040' }, time: { bg: '#F3F0FA', color: '#4A3080', border: '#4A308040' }, perfect: { bg: '#F0FAF5', color: '#0F6E56', border: '#0F6E5640' } };

  const now = Date.now() / 1000;
  const filtered = reports
    .filter(r => {
      if (studentFilter && r.studentId !== studentFilter) return false;
      if (periodFilter !== 'all') {
        const ts = r.createdAt?.seconds || 0;
        const cutoff = periodFilter === 'week' ? 7 * 86400 : 30 * 86400;
        if (now - ts > cutoff) return false;
      }
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const hay = `${r.studentName||''} ${r.textbook||''} ${r.unit||''} ${r.teacherNote||''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

  const selected = filtered.find(r => r.id === selectedId) || filtered[0];

  const fmtDate = (r) => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '날짜 없음';

  const statusBadge = (r) => {
    const isViewed = reportViews.some(v => v.reportId === r.id);
    if (isViewed) return { label: '열람 완료', bg: '#F0FAF5', color: '#0F6E56' };
    return { label: '작성 완료', bg: '#EAF1FB', color: '#0D2D6B' };
  };

  const handleCopyLink = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/report/${id}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // PC: 스플릿 뷰 / 모바일: 카드 리스트
  const isMobile = !useMediaQuery('(min-width: 768px)');

  if (isMobile) {
    return (
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="학생명·교재·코멘트 검색"
            style={{ flex: 1, padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', outline: 'none', fontFamily: 'inherit' }} />
          <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)}
            style={{ padding: '9px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', background: '#fff' }}>
            <option value="">전체</option>
            {(students||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              {searchText.trim() || studentFilter ? '검색 결과가 없습니다' : '작성된 리포트가 없습니다'}
            </div>
          )}
          {filtered.map(r => {
            const badge = statusBadge(r);
            return (
              <div key={r.id} onClick={() => setSelectedId(r.id)}
                style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>{r.studentName}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, background: badge.bg, color: badge.color, padding: '1px 7px', borderRadius: '8px' }}>{badge.label}</span>
                </div>
                <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>{fmtDate(r)} · {r.textbook}</p>
                {r.teacherNote && <p style={{ fontSize: '12px', color: '#374151', margin: '6px 0 0', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.teacherNote}</p>}
              </div>
            );
          })}
        </div>

        {/* 모바일 바텀시트 */}
        {selectedId && selected && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999 }} onClick={() => setSelectedId(null)}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '85vh', overflowY: 'auto', padding: '20px' }} onClick={e => e.stopPropagation()}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <p style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{selected.studentName}</p>
                    <span style={{ fontSize: '10px', fontWeight: 600, background: statusBadge(selected).bg, color: statusBadge(selected).color, padding: '1px 7px', borderRadius: '8px' }}>{statusBadge(selected).label}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>{fmtDate(selected)} · {selected.teacherName}</p>
                </div>
                <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
              </div>

              {(selected.textbook || selected.unit) && (
                <p style={{ fontSize: '13px', color: '#374151', marginBottom: '10px', fontWeight: 500 }}>
                  {[selected.textbook, selected.unit, selected.pages && `${selected.pages}쪽`].filter(Boolean).join(' · ')}
                </p>
              )}

              {(selected.homeworkRating > 0 || selected.conceptRating > 0 || selected.testScore) && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {selected.homeworkRating > 0 && <span style={{ fontSize: '12px', background: '#EAF1FB', color: '#0D2D6B', padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>과제 {toPct(selected.homeworkRating)}%</span>}
                  {selected.conceptRating > 0 && <span style={{ fontSize: '12px', background: '#EAF1FB', color: '#0D2D6B', padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>개념 {toPct(selected.conceptRating)}%</span>}
                  {selected.hasTest && selected.testScore && <span style={{ fontSize: '12px', background: '#FFF8EC', color: '#7A4F00', padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>시험 {selected.testScore}점</span>}
                </div>
              )}

              {selected.diagnosis?.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {selected.diagnosis.map((d, i) => {
                    const DIAG = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
                    return <span key={i} style={{ fontSize: '11px', background: d.key === 'perfect' ? '#F0FAF5' : '#FDF0F0', color: d.key === 'perfect' ? '#0F6E56' : '#8A2020', padding: '3px 9px', borderRadius: '8px', fontWeight: 600 }}>{DIAG[d.key] || d.key}</span>;
                  })}
                </div>
              )}

              {selected.teacherNote ? (
                <div style={{ background: '#F9FAFB', borderRadius: '8px', padding: '12px', marginBottom: '12px', borderLeft: '3px solid #0D2D6B' }}>
                  <p style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: 1.8, margin: 0 }}>{selected.teacherNote}</p>
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '12px', fontStyle: 'italic' }}>아직 작성된 코멘트가 없습니다</p>
              )}

              {selected.photoUrls?.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
                  {selected.photoUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`사진 ${i+1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '6px' }} />
                    </a>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button onClick={() => { onEdit(selected); setSelectedId(null); }}
                  style={{ padding: '11px', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
                  ✏️ 수정
                </button>
                <button onClick={() => setDeleteConfirmReport(selected.id)}
                  style={{ padding: '11px', border: '1px solid #FECACA', borderRadius: '8px', background: '#FFF5F5', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#DC2626' }}>
                  🗑️ 삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 모달 */}
        {deleteConfirmReport && selected && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px' }}>
              <div style={{ width: '44px', height: '44px', background: '#FEE2E2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <span style={{ fontSize: '22px' }}>🗑️</span>
              </div>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px', textAlign: 'center' }}>리포트를 삭제할까요?</p>
              <div style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px', margin: '0 0 16px' }}>
                <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 4px', textAlign: 'center' }}><strong>{fmtDate(selected)}</strong></p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#DC2626', margin: 0, textAlign: 'center' }}>{selected.studentName} 학생 리포트</p>
              </div>
              <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center', margin: '0 0 20px' }}>삭제 후 복구가 불가능합니다.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setDeleteConfirmReport(null)}
                  style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>취소</button>
                <button onClick={() => { setDeleteConfirmReport(null); setSelectedId(null); onDelete(selected.id); }}
                  style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: '#DC2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PC: 스플릿 뷰
  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: 'calc(100dvh - 120px)', overflow: 'hidden' }}>

      {/* 좌측 목록 */}
      <div style={{ borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 필터 */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="검색..."
            style={{ width: '100%', padding: '7px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '8px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#FAFAFA' }} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '7px', fontFamily: 'inherit', background: '#fff', color: '#374151' }}>
              <option value="">전체 학생</option>
              {(students||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '7px', fontFamily: 'inherit', background: '#fff', color: '#374151' }}>
              <option value="all">전체 기간</option>
              <option value="week">이번 주</option>
              <option value="month">이번 달</option>
            </select>
          </div>
          <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>{filtered.length}건</p>
        </div>

        {/* 리스트 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '13px', padding: '40px 20px' }}>리포트가 없습니다</p>
          ) : filtered.map(r => {
            const isSelected = (selected?.id === r.id);
            const badge = statusBadge(r);
            return (
              <div key={r.id} onClick={() => setSelectedId(r.id)}
                style={{
                  padding: '11px 14px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', transition: 'background 0.1s',
                  background: isSelected ? '#EAF1FB' : 'transparent',
                  borderLeft: isSelected ? '2px solid #0D2D6B' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F9FAFB'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isSelected ? '#0D2D6B' : '#E5E7EB', color: isSelected ? '#fff' : '#374151', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {r.studentName?.[0]}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>{r.studentName}</span>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 600, background: badge.bg, color: badge.color, padding: '1px 6px', borderRadius: '8px', flexShrink: 0 }}>{badge.label}</span>
                </div>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 2px', paddingLeft: '28px' }}>{fmtDate(r)}</p>
                <p style={{ fontSize: '11px', color: '#6B7280', margin: 0, paddingLeft: '28px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[r.textbook, r.subject].filter(Boolean).join(' · ')}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 우측 상세 — 본문(폭 제한) + 학생 맥락 사이드 패널 */}
      {selected ? (
        <div style={{ overflowY: 'auto', padding: '24px 28px', background: '#FAFAFA' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 460px', maxWidth: '720px', minWidth: 0 }}>

          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #E5E7EB' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{selected.studentName}</h3>
                <span style={{ fontSize: '11px', fontWeight: 600, background: statusBadge(selected).bg, color: statusBadge(selected).color, padding: '2px 9px', borderRadius: '10px' }}>{statusBadge(selected).label}</span>
                {selected.photoUrls?.length > 0 && <span style={{ fontSize: '11px', color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: '8px' }}>사진 {selected.photoUrls.length}장</span>}
              </div>
              <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>{fmtDate(selected)} · {selected.teacherName} · {[selected.textbook, selected.subject].filter(Boolean).join(' · ')}</p>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button onClick={() => onEdit(selected)}
                style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>
                수정
              </button>
              <button onClick={() => handleCopyLink(selected.id)}
                style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid #0D2D6B', borderRadius: '8px', background: copied ? '#0D2D6B' : '#fff', cursor: 'pointer', color: copied ? '#fff' : '#0D2D6B', fontFamily: 'inherit' }}>
                {copied ? '✓ 복사됨' : '링크 복사'}
              </button>
              {deleteConfirmReport === selected.id ? null : (
                <button onClick={() => setDeleteConfirmReport(selected.id)}
                  style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid #FECACA', borderRadius: '8px', background: '#FFF5F5', cursor: 'pointer', color: '#DC2626', fontFamily: 'inherit' }}>
                  삭제
                </button>
              )}
            </div>
          </div>

          {/* 평가 지표 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: '과제 평가', value: selected.homeworkRating ? `${toPct(selected.homeworkRating)}%` : '—', color: '#0D2D6B' },
              { label: '개념 평가', value: selected.conceptRating ? `${toPct(selected.conceptRating)}%` : '—', color: '#0D2D6B' },
              { label: '단원평가', value: selected.hasTest && selected.testScore ? `${selected.testScore}점` : '—', color: '#1A1A1A' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '14px 16px' }}>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 6px', fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* 진단 태그 */}
          {selected.diagnosis?.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>진단 태그</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {selected.diagnosis.map(d => {
                  const c = DIAG_COLORS[d.key] || { bg: '#F3F4F6', color: '#374151', border: '#E5E7EB' };
                  return <span key={d.key} style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '10px', background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontWeight: 600 }}>{DIAG_LABELS[d.key] || d.key}</span>;
                })}
              </div>
            </div>
          )}

          {/* 선생님 코멘트 — 퀵 태그 파싱 */}
          {(() => {
            const raw = selected.teacherNote || '';
            // [태그] 패턴 추출
            const tagPattern = /\[([^\]]+)\]/g;
            const tags = [];
            let match;
            while ((match = tagPattern.exec(raw)) !== null) {
              tags.push(match[1]);
            }
            // 본문에서 태그 제거
            const cleanNote = raw.replace(/\[([^\]]+)\]\s*/g, '').trim();

            const TAG_COLORS = {
              '연산 실수 주의': { bg: '#FFF8EC', color: '#8A5A00' },
              '응용 연습 필요': { bg: '#FDF0F0', color: '#8A2020' },
              '개념 완성':      { bg: '#F0FAF5', color: '#0F6E56' },
              '집중력 우수':    { bg: '#EAF1FB', color: '#0D2D6B' },
              '과제 완성도 높음':{ bg: '#F0FAF5', color: '#0F6E56' },
              '복습 권장':      { bg: '#F3F0FA', color: '#4A3080' },
            };

            return (
              <div style={{ marginBottom: '18px' }}>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>선생님 코멘트</p>

                {/* 퀵 태그 칩 */}
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {tags.map((tag, i) => {
                      const c = TAG_COLORS[tag] || { bg: '#F3F4F6', color: '#374151' };
                      return (
                        <span key={i} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '10px', background: c.bg, color: c.color }}>
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* 본문 */}
                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '14px 16px', borderLeft: '3px solid #0D2D6B' }}>
                  {cleanNote ? (
                    <p style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: 1.9, margin: 0 }}>{cleanNote}</p>
                  ) : raw ? (
                    <p style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: 1.9, margin: 0 }}>{raw}</p>
                  ) : (
                    <p style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: 1.9, margin: 0, fontStyle: 'italic' }}>아직 작성된 코멘트가 없습니다</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 학습 범위 */}
          {(selected.textbook || selected.unit || selected.pages) && (
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>학습 범위</p>
              <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>
                {[selected.textbook, selected.unit, selected.pages && `${selected.pages}쪽`].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}

          {/* 다음 계획 */}
          {selected.nextPlan && (
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>다음 수업 계획</p>
              <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>{selected.nextPlan}</p>
            </div>
          )}

          {/* 수업 사진 */}
          {selected.photoUrls?.length > 0 && (
            <div>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>수업 사진 ({selected.photoUrls.length}장)</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                {selected.photoUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`수업 사진 ${i + 1}`}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E5E7EB', cursor: 'pointer', display: 'block' }} />
                  </a>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* 학생 맥락 사이드 패널 — 넓은 화면의 우측 여백 활용 */}
          {(() => {
            const hist = reports
              .filter(r => r.studentId === selected.studentId)
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            const others = hist.filter(r => r.id !== selected.id).slice(0, 5);
            const recentAsc = [...hist].slice(0, 6).reverse();
            const diagCountMap = {};
            hist.forEach(r => (r.diagnosis || []).forEach(d => {
              if (d.key !== 'perfect') diagCountMap[d.key] = (diagCountMap[d.key] || 0) + 1;
            }));
            const topDiag = Object.entries(diagCountMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
            const cardStyle = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '14px 16px' };
            const cardTitle = { fontSize: '11px', color: '#9CA3AF', margin: '0 0 10px', fontWeight: 600, letterSpacing: '0.06em' };
            const chartW = 260, chartH = 40, padX = 8;
            const xOf = (i) => padX + (i / Math.max(1, recentAsc.length - 1)) * (chartW - padX * 2);
            const yOf = (v) => chartH - 4 - (v / 100) * (chartH - 10);
            return (
              <aside style={{ flex: '0 1 340px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 최근 평가 추이 */}
                {recentAsc.length >= 2 && (
                  <div style={cardStyle}>
                    <p style={cardTitle}>최근 평가 추이 (최근 {recentAsc.length}회)</p>
                    {[['과제', 'homeworkRating', '#0D2D6B'], ['개념', 'conceptRating', '#0F6E56']].map(([label, key, color]) => {
                      const pts = recentAsc.map((r, i) => ({ r, i, v: r[key] != null ? toPct(r[key]) : null }));
                      const withVal = pts.filter(p => p.v != null);
                      const linePath = withVal.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.i)},${yOf(p.v)}`).join(' ');
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '10px', color: '#6B7280', width: '26px', flexShrink: 0, fontWeight: 600 }}>{label}</span>
                          <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH} style={{ overflow: 'visible', flex: 1 }}>
                            <line x1={padX} y1={chartH - 4} x2={chartW - padX} y2={chartH - 4} stroke="#F0F0F0" strokeWidth="1" />
                            {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
                            {pts.map((p, idx) => {
                              const isCurrent = p.r.id === selected.id;
                              const cy = p.v != null ? yOf(p.v) : chartH - 4;
                              const content = [p.r.unit, p.r.textbook].filter(Boolean)[0] || '내용 없음';
                              const colW = (chartW - padX * 2) / Math.max(1, pts.length - 1 || 1);
                              const onHover = (e) => setTrendTooltip({
                                x: e.clientX, y: e.clientY,
                                text: `${fmtDate(p.r)} · ${label} ${p.v != null ? `${p.v}%` : '미입력'} · ${content}`,
                              });
                              return (
                                <g key={idx}>
                                  <circle cx={xOf(p.i)} cy={cy}
                                    r={isCurrent ? 4.5 : p.v != null ? 3 : 2}
                                    fill={isCurrent ? '#C9A227' : p.v != null ? color : '#E5E7EB'}
                                    stroke="#fff" strokeWidth={isCurrent ? 1.5 : 1}
                                    style={{ pointerEvents: 'none' }}
                                  />
                                  {/* 넓은 히트 영역 — 실제 점은 작지만 마우스 인식 범위는 열 전체로 */}
                                  <rect x={xOf(p.i) - colW / 2} y={0} width={colW} height={chartH}
                                    fill="transparent" style={{ cursor: 'pointer' }}
                                    onMouseEnter={onHover}
                                    onMouseMove={onHover}
                                    onMouseLeave={() => setTrendTooltip(null)}
                                  />
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      );
                    })}
                    <p style={{ fontSize: '9px', color: '#B0B0B0', margin: 0 }}>금색 = 현재 보는 리포트 · 점에 마우스를 올리면 상세가 보여요</p>
                  </div>
                )}

                {/* 이전 리포트 바로가기 */}
                {others.length > 0 && (
                  <div style={cardStyle}>
                    <p style={cardTitle}>이 학생의 다른 리포트</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {others.map(r => (
                        <button key={r.id} onClick={() => setSelectedId(r.id)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '8px', background: '#F9FAFB', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
                          <span style={{ fontSize: '11px', color: '#374151', fontWeight: 600 }}>{fmtDate(r)}</span>
                          <span style={{ fontSize: '10px', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.unit || r.textbook || ''}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 반복 진단 */}
                {topDiag.length > 0 && (
                  <div style={cardStyle}>
                    <p style={cardTitle}>반복 진단 TOP {topDiag.length}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {topDiag.map(([key, count]) => (
                        <span key={key} style={{ fontSize: '11px', fontWeight: 600, background: DIAG_COLORS[key]?.bg || '#F3F4F6', color: DIAG_COLORS[key]?.color || '#374151', border: `1px solid ${DIAG_COLORS[key]?.border || '#E5E7EB'}`, padding: '4px 10px', borderRadius: '12px' }}>
                          {DIAG_LABELS[key] || key} ×{count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            );
          })()}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '13px', background: '#FAFAFA' }}>
          좌측에서 리포트를 선택하세요
        </div>
      )}

    </div>

      {/* PC 삭제 확인 모달 */}
      {deleteConfirmReport && selected && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ width: '44px', height: '44px', background: '#FEE2E2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ fontSize: '22px' }}>🗑️</span>
            </div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px', textAlign: 'center' }}>리포트를 삭제할까요?</p>
            <div style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px', margin: '0 0 16px' }}>
              <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 4px', textAlign: 'center' }}><strong>{fmtDate(selected)}</strong></p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#DC2626', margin: 0, textAlign: 'center' }}>{selected.studentName} 학생 리포트</p>
            </div>
            <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center', margin: '0 0 20px' }}>삭제 후 복구가 불가능합니다.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteConfirmReport(null)}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>취소</button>
              <button onClick={() => { setDeleteConfirmReport(null); setSelectedId(null); onDelete(selected.id); }}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: '#DC2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {trendTooltip && (
        <div style={{
          position: 'fixed', left: trendTooltip.x + 14, top: trendTooltip.y - 12,
          background: '#1A1A1A', color: '#fff', fontSize: '11px', padding: '6px 10px',
          borderRadius: '7px', pointerEvents: 'none', zIndex: 10001, fontFamily: 'inherit',
          whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>{trendTooltip.text}</div>
      )}
    </>
  );
}
function ReportPreviewModal({ report: r, allReports, onClose, onDelete, onEdit }) {
  useEffect(() => {
    history.pushState(null, '', window.location.href);
    history.pushState({ modal: 'report' }, '', window.location.href);
    const handlePop = () => {
      history.pushState(null, '', window.location.href);
      onClose();
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);
  const date = r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '날짜 없음';
  const cardRef = React.useRef(null);
  const [downloading, setDownloading] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

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
              navigator.clipboard.writeText(url).then(() => showAppToast('링크 복사됐어요! 카톡에 붙여넣기 하세요.'));
            }} style={{ background: '#1A5CB8', color: '#fff', border: 'none', borderRadius: '9px', padding: '7px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              링크 복사
            </button>
            <button onClick={handleDownload} disabled={downloading} style={{ background: downloading ? '#E5E7EB' : '#0F6E56', color: downloading ? '#9CA3AF' : '#fff', border: 'none', borderRadius: '9px', padding: '7px 14px', fontSize: '12px', fontWeight: 700, cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {downloading ? '저장 중...' : '📥 이미지 저장'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#6B7280', cursor: 'pointer', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
          </div>
        </div>

        {/* 이미지로 저장될 카드 영역 — v2 디자인 (PublicReport와 동일) */}
        <div ref={cardRef} style={{ background: '#F5F5F0', padding: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '4px', overflow: 'hidden' }}>

          {/* 헤더 */}
          <div style={{ background: '#0D2D6B', padding: '20px 22px 18px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '4px', height: '20px', background: '#C9A227', borderRadius: '1px', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.15em', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>와이즈에듀 교현학원</span>
            </div>
            <div style={{ height: '1px', background: 'rgba(201,162,39,0.3)', marginBottom: '14px' }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.15em', margin: '0 0 4px', fontWeight: 600, fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>LEARNING REPORT</p>
                <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: '26px', fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{r.studentName}</p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', margin: 0 }}>{date} · {r.teacherName}{/선생님?$/.test(r.teacherName || '') ? '' : ' 선생님'}</p>
              </div>

            </div>
          </div>

          {/* 바디 */}
          <div style={{ padding: '18px 20px' }}>

            {/* 핵심 지표 — 수치 그리드 바로 시작 (B안: SUMMARY 제거) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '18px' }}>
              <div style={{ borderRight: '1px solid #E8E6E0', paddingRight: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>과제 수행</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: '#0D2D6B', margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.homeworkRating ? toPct(r.homeworkRating) : '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: '#98A1AC' }}>%</span>
                </p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#5A6472', margin: '3px 0 0' }}>{r.homeworkRating != null ? ratingLabel(toPct(r.homeworkRating)) : ''}</p>
              </div>
              <div style={{ borderRight: '1px solid #E8E6E0', padding: '0 14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>개념 이해</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: '#0D2D6B', margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.conceptRating ? toPct(r.conceptRating) : '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: '#98A1AC' }}>%</span>
                </p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#5A6472', margin: '3px 0 0' }}>{r.conceptRating != null ? ratingLabel(toPct(r.conceptRating)) : ''}</p>
              </div>
              <div style={{ paddingLeft: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>출결</p>
                <p style={{ fontSize: '16px', fontWeight: 800, color: r.attendance === '정시' ? '#1E6B4E' : '#0D2D6B', margin: '4px 0', lineHeight: 1 }}>{r.attendance}</p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#5A6472', margin: '3px 0 0' }}>{r.arrivalTime} 등원</p>
              </div>
            </div>

            <div style={{ height: '1px', background: '#E8E6E0', marginBottom: '18px' }} />

            {/* 학습 범위 */}
            {(r.textbook || r.unit || r.pages) && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>학습 범위</p>
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
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>TEST RESULT</p>
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
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>진단</p>
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
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#C9A227', letterSpacing: '0.12em', margin: '0 0 7px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>TEACHER'S NOTE</p>
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
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>TODAY'S WORK</p>
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
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#98A1AC', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>NEXT CLASS</p>
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
            onClick={() => {
              if (confirmingDelete) { onDelete(r.id); onClose(); }
              else { setConfirmingDelete(true); setTimeout(() => setConfirmingDelete(false), 3000); }
            }}
            style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: 700, borderRadius: '12px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
            {confirmingDelete ? '한번 더 클릭 시 삭제' : '🗑 리포트 삭제'}
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
  const colorInputRef = React.useRef(null);

  // 강사 이름 수정
  const [editingTeacherId, setEditingTeacherId] = React.useState(null);
  const [editingTeacherName, setEditingTeacherName] = React.useState('');
  const [confirmingTeacherDelete, setConfirmingTeacherDelete] = React.useState(null);

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
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>🏫 학원 기본 스킨</p>
        <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 14px', lineHeight: 1.6 }}>
          리포트 작성 화면의 미리보기 카드 기본 색상입니다. 리포트 작성 시 "학원 기본" 스킨으로 표시되며,
          학생별 개별 색상이 설정된 학생에게는 개별 색상이 우선 적용됩니다.
        </p>

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
                <span style={{ fontSize: '10px', fontWeight: 700, color: globalColor === sk.main ? '#185FA5' : '#6B7280' }}>{sk.name}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 커스텀 컬러피커 */}
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, marginBottom: '8px' }}>🎨 직접 선택</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F9FAFB', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
          <div style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '12px', background: globalColor, flexShrink: 0, border: '2px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <input ref={colorInputRef} type="color" value={globalColor} onChange={(e) => setGlobalColor(e.target.value)}
              style={{ position: 'absolute', inset: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', border: 'none', padding: 0, cursor: 'pointer', opacity: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 2px' }}>메인 컬러</p>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9B80C0', margin: 0, fontFamily: 'monospace' }}>{globalColor}</p>
          </div>
          <button
            onClick={() => colorInputRef.current?.click()}
            style={{ background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            변경
          </button>
        </div>

        {/* 파생 색상 미리보기 */}
        <div style={{ background: '#F8F6FC', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
          <p style={{ fontSize: '9px', fontWeight: 700, color: '#B0A0C8', letterSpacing: '0.1em', marginBottom: '8px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>자동 파생 색상</p>
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
                    style={{ flex: 1, padding: '6px 10px', fontSize: '16px', border: '1px solid #185FA5', borderRadius: '8px', fontFamily: 'inherit', outline: 'none' }}
                    autoFocus
                  />
                  <button onClick={() => handleTeacherNameSave(t)} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>저장</button>
                  <button onClick={() => setEditingTeacherId(null)} style={{ background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>{t.name}</span>
                  <button onClick={() => { setEditingTeacherId(t.id); setEditingTeacherName(t.name); }} style={{ background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>수정</button>
                  <button onClick={() => {
                    if (confirmingTeacherDelete === t.id) {
                      onDeleteTeacher(t.id); setConfirmingTeacherDelete(null);
                    } else {
                      setConfirmingTeacherDelete(t.id);
                      setTimeout(() => setConfirmingTeacherDelete(prev => prev === t.id ? null : prev), 3000);
                    }
                  }} style={{ background: confirmingTeacherDelete === t.id ? '#DC2626' : '#FEF2F2', color: confirmingTeacherDelete === t.id ? '#fff' : '#DC2626', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {confirmingTeacherDelete === t.id ? '확인 (재클릭)' : '삭제'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* 강사 계정 생성 */}
        <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>새 강사 계정 생성</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} placeholder="강사 이름 (예: 영동 선생님)" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newTeacherEmail} onChange={e => setNewTeacherEmail(e.target.value)} placeholder="이메일" type="email" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newTeacherPassword} onChange={e => setNewTeacherPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" type="password" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
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



// ── 과제/시험 성취 추이 차트 ──
function HomeworkTestChart({ reports }) {
  const data = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({
      date: r.createdAt?.seconds
        ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
        : '',
      과제: toPct(r.homeworkRating),
      개념: toPct(r.conceptRating),
      시험: r.hasTest && r.testScore ? Number(r.testScore) : null, // 과제/개념도 100점 척도로 통일되어 별도 환산 불필요
    }));

  if (data.length === 0) return null;

  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>과제 · 개념 · 시험 추이</h3>
      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 10px' }}>막대가 높을수록 그날 점수가 좋았다는 뜻입니다 (100점 만점 기준).</p>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
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
    </div>
  );
}

// ── 데이터 기반 인사이트 문장 생성 (AI 호출 없이 계산만으로, 즉시·무료) ──
const TAG_LABELS = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };

function buildInsights(reports) {
  if (!reports || reports.length === 0) return null;
  const sorted = [...reports].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const avgOf = (arr, key) => arr.length ? arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length : 0;
  // 미입력(null)은 분모에서 제외
  const avgPctOf = (arr, key) => {
    const rated = arr.filter(r => r[key] != null);
    return rated.length ? rated.reduce((s, r) => s + toPct(r[key]), 0) / rated.length : 0;
  };
  const overallHw = avgPctOf(sorted, 'homeworkRating');
  const overallCc = avgPctOf(sorted, 'conceptRating');

  // 최근 절반 vs 이전 절반 비교로 추세 판단 (최소 4건부터 의미있는 비교)
  let trendText = null;
  if (sorted.length >= 4) {
    const mid = Math.floor(sorted.length / 2);
    const prevHalf = sorted.slice(0, mid);
    const recentHalf = sorted.slice(mid);
    const hwDelta = avgPctOf(recentHalf, 'homeworkRating') - avgPctOf(prevHalf, 'homeworkRating');
    const ccDelta = avgPctOf(recentHalf, 'conceptRating') - avgPctOf(prevHalf, 'conceptRating');
    const parts = [];
    if (Math.abs(hwDelta) >= 10) parts.push(`과제 수행이 최근 ${hwDelta > 0 ? '상승' : '하락'}세(${hwDelta > 0 ? '+' : ''}${Math.round(hwDelta)}%p)`);
    if (Math.abs(ccDelta) >= 10) parts.push(`개념 이해가 최근 ${ccDelta > 0 ? '상승' : '하락'}세(${ccDelta > 0 ? '+' : ''}${Math.round(ccDelta)}%p)`);
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
  if (overallHw >= 80) strengths.push(`과제 수행 평균 ${Math.round(overallHw)}% — 꾸준히 성실하게 임하고 있습니다.`);
  if (overallCc >= 80) strengths.push(`개념 이해 평균 ${Math.round(overallCc)}% — 새 단원 적응력이 좋습니다.`);
  if (tagEntries.find(([k]) => k === 'perfect')) strengths.push(`'개념 완벽' 진단이 ${tagCount.perfect}회 기록됐습니다.`);
  if (testTrend !== null && testTrend > 0) strengths.push(`시험 점수가 최근 ${testTrend > 0 ? '+' : ''}${testTrend}점 상승했습니다.`);

  if (topTag && topTag[0] !== 'perfect') weaknesses.push(`'${TAG_LABELS[topTag[0]]}' 패턴이 ${topTag[1]}회로 가장 빈번합니다 — 이 부분 집중 보강을 권장합니다.`);
  if (overallHw < 70 && overallHw > 0) weaknesses.push(`과제 수행 평균이 ${Math.round(overallHw)}%로 다소 낮습니다.`);
  if (overallCc < 70 && overallCc > 0) weaknesses.push(`개념 이해 평균이 ${Math.round(overallCc)}%로 보강이 필요합니다.`);

  // 한 줄 종합 요약
  let summary = `최근 ${sorted.length}회 리포트 기준, 과제 평균 ${Math.round(overallHw)}% · 개념 평균 ${Math.round(overallCc)}%입니다.`;
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

// ============================================================
// 성장 대시보드 — 전체 학생 개념이해도 추이
// ============================================================
function GrowthDashboard({ reports, students, onSwitchTab }) {
  const isMobile = !useMediaQuery('(min-width: 768px)');
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

  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로,
  // 이 컴포넌트 내 모든 계산이 일관되도록 조회 시점에 0~100(%) 기준으로 정규화한다.
  const getStudentReports = React.useCallback((studentId) => {
    const cutoff = Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000;
    return reports
      .filter(r => r.studentId === studentId && r.createdAt?.seconds * 1000 >= cutoff && r.conceptRating > 0)
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
      .map(r => ({ ...r, conceptRating: toPct(r.conceptRating), homeworkRating: toPct(r.homeworkRating) }));
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
    if (a >= 80 && trend3 >= 0) return { label: '안정', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' };
    if (trend3 <= -20 || a < 50) return { label: '경고', color: '#A32D2D', bg: '#FCEBEB', border: '#A32D2D' };
    if (trend3 < 0 || a < 70) return { label: '주의', color: '#8A5A00', bg: '#FAEEDA', border: '#EF9F27' };
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
      byDay[d].push(toPct(r.conceptRating));
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
    PT + cH - (v / 100) * cH
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', flex: 1, minWidth: '280px' }}>
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
                      onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: `${p.date} · 평균 ${p.avg}%` })}
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 50px 60px 55px' : '1fr 65px 80px 70px 55px', padding: '8px 14px', borderBottom: '0.5px solid #E8E6E0', background: '#FAFAFA' }}>
          {(isMobile ? ['학생', '현재', '변화량', '상태'] : ['학생', '현재', '변화량', '추이', '상태']).map((h, i) => (
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
            sparkH - 2 - (r.conceptRating / 100) * (sparkH - 6)
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
                display: 'grid', gridTemplateColumns: isMobile ? '1fr 50px 60px 55px' : '1fr 65px 80px 70px 55px',
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
              {!isMobile && (
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
              )}
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
              navigator.clipboard.writeText(url).then(() => showAppToast('링크 복사됐어요!'));
            } else { showAppToast('최근 리포트가 없습니다.', 'info'); }
          } else if (type === 'profile') {
            window.open(`/story/${s?.id}`, '_blank');
          }
        };

        const closeDrawer = () => { setDrawerOpen(false); setSelId(null); };

        return (
          <>
            <div onClick={closeDrawer} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 199,
            }} />
            <div style={isMobile
              ? {
                  position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '85vh', width: '100%',
                  background: '#fff', borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
                  padding: '18px', paddingBottom: 'calc(18px + env(safe-area-inset-bottom))', overflowY: 'auto', zIndex: 200,
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
                }
              : {
                  position: 'fixed', top: 0, right: 0, bottom: 0, width: '290px',
                  background: '#fff', borderLeft: '0.5px solid #E8E6E0',
                  padding: '18px', overflowY: 'auto', zIndex: 200,
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                  boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
                }
            }>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{s?.name}</p>
              <button onClick={() => { setDrawerOpen(false); setSelId(null); }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#98A1AC', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
            </div>

            {/* 상태 배지 */}
            <div style={{ background: status.bg, border: `1px solid ${status.border}`, borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: status.color }}>● {status.label}</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: status.color, fontVariantNumeric: 'tabular-nums' }}>
                {a}% <span style={{ fontSize: '12px', color: trendColor }}>{trendStr}</span>
              </span>
            </div>

            {/* 미니 바차트 + 진단 태그 연결 */}
            {/* 날짜별 수업 카드 */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {rs.slice().reverse().slice(0, 4).map((r, i) => {
                  const diagLabels = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
                  const tags = (r.diagnosis || []).filter(d => d.key !== 'perfect');
                  const hasPerfect = (r.diagnosis || []).some(d => d.key === 'perfect');
                  const isWarning = r.conceptRating > 0 && r.conceptRating <= 40;
                  const dateStr = r.createdAt?.seconds
                    ? `${new Date(r.createdAt.seconds*1000).getMonth()+1}/${new Date(r.createdAt.seconds*1000).getDate()}`
                    : '';
                  const rawNote = r.teacherNote || '';
                  const cleanNote = rawNote.replace(/\[([^\]]+)\]\s*/g, '').trim();

                  return (
                    <div key={i} style={{
                      background: '#FAFAF8', border: '0.5px solid #E5E7EB', borderRadius: '8px', padding: '8px 10px',
                      borderLeft: isWarning ? '2px solid #DC2626' : hasPerfect ? '2px solid #0F6E56' : '2px solid transparent',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>{dateStr}</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {r.homeworkRating > 0 && <span style={{ fontSize: '10px', color: '#6B7280' }}>과제 <strong style={{ color: '#0D2D6B' }}>{r.homeworkRating}%</strong></span>}
                          {r.conceptRating > 0 && <span style={{ fontSize: '10px', color: '#6B7280' }}>개념 <strong style={{ color: '#0D2D6B' }}>{r.conceptRating}%</strong></span>}
                          {r.hasTest && r.testScore && <span style={{ fontSize: '10px', color: '#C9A227', fontWeight: 700 }}>시험 {r.testScore}점</span>}
                        </div>
                      </div>
                      {(r.textbook || r.unit) && (
                        <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 4px' }}>
                          {[r.textbook, r.unit].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {(tags.length > 0 || hasPerfect) && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: cleanNote ? '4px' : 0 }}>
                          {hasPerfect && <span style={{ fontSize: '10px', background: '#F0FAF5', color: '#0F6E56', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>개념 완벽</span>}
                          {tags.map((d, ti) => (
                            <span key={ti} style={{ fontSize: '10px', background: '#FDF0F0', color: '#8A2020', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
                              {diagLabels[d.key] || d.key}
                            </span>
                          ))}
                        </div>
                      )}
                      {cleanNote && (
                        <p style={{ fontSize: '10px', color: '#6B7280', margin: 0, fontStyle: 'italic' }}>
                          "{cleanNote.length > 40 ? cleanNote.slice(0, 40) + '...' : cleanNote}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 액션 버튼 — 핵심만 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button onClick={() => handleAction('link')} style={{
                padding: '10px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '8px',
                border: '0.5px solid #1A5CB8', background: '#EAF0F9', color: '#0D2D6B',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>🔗 최근 리포트 링크 복사</button>
              <button onClick={() => handleAction('profile')} style={{
                padding: '10px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '8px',
                border: '0.5px solid #E8E6E0', background: '#fff', color: '#1A1A1A',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>📈 성장 스토리 열기</button>
            </div>
          </div>
          </>
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
// 원장 보고서 뷰
// ============================================================
// ============================================================
// 학생 종합 프로필 모달 — 상담용
// ============================================================
function StudentProfileModal({ student, reports, onClose, DIAG_MAP }) {
  const [showWeekly, setShowWeekly] = useState(false);

  // 모바일 뒤로가기 지원 — SPA history 보호
  useEffect(() => {
    // 현재 페이지를 history에 한 번 더 쌓아서 뒤로가기가 앱 밖으로 안 나가게
    history.pushState(null, '', window.location.href);
    history.pushState({ modal: 'profile' }, '', window.location.href);
    const handlePop = (e) => {
      // 모달 닫고 앱 내 페이지로 복귀
      history.pushState(null, '', window.location.href);
      onClose();
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로 0~100(%) 기준으로 정규화
  // null(미입력)은 보존 — 평균 계산에서 제외해 미입력이 평균을 끌어내리지 않도록
  const sorted = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({ ...r, conceptRating: r.conceptRating == null ? null : toPct(r.conceptRating), homeworkRating: r.homeworkRating == null ? null : toPct(r.homeworkRating) }));
  const recent = sorted.slice(-10); // 최근 10회

  const conceptRated = sorted.filter(r => r.conceptRating != null);
  const homeworkRated = sorted.filter(r => r.homeworkRating != null);
  const avgConcept = conceptRated.length ? Math.round(conceptRated.reduce((s, r) => s + r.conceptRating, 0) / conceptRated.length) : 0;
  const avgHomework = homeworkRated.length ? Math.round(homeworkRated.reduce((s, r) => s + r.homeworkRating, 0) / homeworkRated.length) : 0;
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
          <p style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{student.name}</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', margin: 0 }}>총 {sorted.length}회 수업 누적</p>
          <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '18px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '22px', cursor: 'pointer', lineHeight: 1, width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
        </div>

        <div style={{ padding: '20px 22px' }}>

          {/* 핵심 지표 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: '개념 이해 평균', value: `${avgConcept}%`, color: avgConcept >= 80 ? '#0F6E56' : avgConcept >= 60 ? '#8A5A00' : '#A32D2D' },
              { label: '과제 수행 평균', value: `${avgHomework}%`, color: avgHomework >= 80 ? '#0F6E56' : '#8A5A00' },
              { label: '정시 출석률', value: `${attendanceRate}%`, color: attendanceRate >= 90 ? '#0F6E56' : attendanceRate >= 70 ? '#8A5A00' : '#A32D2D' },
            ].map((item, i) => (
              <div key={i} style={{ border: '0.5px solid #E8E6E0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 4px', letterSpacing: '0.06em' }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 800, color: item.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* 날짜별 수업 카드 리스트 */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>수업 기록</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {[...sorted].reverse().slice(0, 5).map((r, i) => {
                const diagLabels = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
                const diagColors = {
                  calc: { bg: '#FFF8EC', color: '#8A5A00' },
                  concept: { bg: '#FDF0F0', color: '#8A2020' },
                  apply: { bg: '#FDF0F0', color: '#8A2020' },
                  time: { bg: '#F3F0FA', color: '#4A3080' },
                  perfect: { bg: '#F0FAF5', color: '#0F6E56' },
                };
                const tags = (r.diagnosis || []).filter(d => d.key !== 'perfect');
                const hasPerfect = (r.diagnosis || []).some(d => d.key === 'perfect');
                const isWarning = r.conceptRating > 0 && r.conceptRating <= 40;
                const rawNote = r.teacherNote || '';
                const cleanNote = rawNote.replace(/\[([^\]]+)\]\s*/g, '').trim();

                return (
                  <div key={i} style={{
                    background: '#FAFAF8',
                    border: '0.5px solid #E5E7EB',
                    borderRadius: '8px',
                    padding: '9px 10px',
                    borderLeft: isWarning ? '2px solid #DC2626' : hasPerfect ? '2px solid #0F6E56' : '2px solid #E5E7EB',
                  }}>
                    {/* 날짜 + 평점 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>{fmtDate(r)}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {r.homeworkRating > 0 && (
                          <span style={{ fontSize: '10px', color: '#6B7280' }}>
                            과제 <strong style={{ color: '#0D2D6B' }}>{r.homeworkRating}%</strong>
                          </span>
                        )}
                        {r.conceptRating > 0 && (
                          <span style={{ fontSize: '10px', color: '#6B7280' }}>
                            개념 <strong style={{ color: '#0D2D6B' }}>{r.conceptRating}%</strong>
                          </span>
                        )}
                        {r.hasTest && r.testScore && (
                          <span style={{ fontSize: '10px', color: '#C9A227', fontWeight: 700 }}>
                            시험 {r.testScore}점
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 교재 + 단원 */}
                    {(r.textbook || r.unit) && (
                      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 5px' }}>
                        {[r.textbook, r.unit, r.pages && `${r.pages}쪽`].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {/* 진단 태그 */}
                    {(tags.length > 0 || hasPerfect) && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: cleanNote ? '5px' : 0 }}>
                        {hasPerfect && (
                          <span style={{ fontSize: '10px', background: '#F0FAF5', color: '#0F6E56', padding: '1px 7px', borderRadius: '8px', fontWeight: 600 }}>개념 완벽</span>
                        )}
                        {tags.map((d, ti) => {
                          const c = diagColors[d.key] || { bg: '#F3F4F6', color: '#374151' };
                          return (
                            <span key={ti} style={{ fontSize: '10px', background: c.bg, color: c.color, padding: '1px 7px', borderRadius: '8px', fontWeight: 600 }}>
                              {diagLabels[d.key] || d.key}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* 코멘트 미리보기 */}
                    {cleanNote && (
                      <p style={{ fontSize: '10px', color: '#6B7280', margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
                        "{cleanNote.length > 45 ? cleanNote.slice(0, 45) + '...' : cleanNote}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {sorted.length > 5 && (
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '8px 0 0', textAlign: 'center' }}>
                최근 5회 표시 · 전체 {sorted.length}회
              </p>
            )}
          </div>

          {/* 반복 약점 TOP3 */}
          {weakTop3.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>반복 약점 패턴</p>
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
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>최근 학습 단원</p>
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
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>최근 선생님 코멘트</p>
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
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>원장님 상담 메모</p>
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

          {/* 성장 스토리 공유 */}
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #EEECEA' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>성장 스토리 공유</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '14px' }} />

            {/* 링크 생성 */}
            {(() => {
              const baseUrl = `${window.location.origin}/story/${student.id}`;
              const kakaoUrl = `${baseUrl}?src=kakao`;
              const copyUrl = `${baseUrl}?src=copy`;

              const handleCopy = () => {
                navigator.clipboard.writeText(copyUrl).then(() => {
                  showAppToast('링크 복사됐어요! 카톡에 붙여넣기 하세요.');
                });
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                  {/* 카카오톡 공유 */}
                  <button onClick={handleCopy}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', background: '#FEE500', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M11 2C6.03 2 2 5.36 2 9.5c0 2.67 1.63 5.02 4.07 6.44l-.88 3.25 3.8-1.98A10.8 10.8 0 0011 17c4.97 0 9-3.36 9-7.5S15.97 2 11 2z" fill="#3A1D1D"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#3A1D1D', margin: '0 0 2px' }}>카카오톡으로 공유</p>
                      <p style={{ fontSize: '11px', color: '#5A3D3D', margin: 0 }}>링크 복사 → 카카오톡 붙여넣기</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M6 3l5 5-5 5" stroke="#3A1D1D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* 링크 복사 */}
                  <button onClick={() => navigator.clipboard.writeText(copyUrl).then(() => showAppToast('링크 복사됐어요! 카톡에 붙여넣기 하세요.'))}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', background: '#F7F5F1', border: '0.5px solid #E5E5E5', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M12 3h5v5M10 10L17 3" stroke="#4A4A4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#2C2C2C', margin: '0 0 2px' }}>링크 복사</p>
                      <p style={{ fontSize: '11px', color: '#8A8A8A', margin: 0 }}>/story/{student.id.slice(0, 8)}...</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <rect x="5" y="5" width="8" height="8" rx="1" stroke="#8A8A8A" strokeWidth="1.2"/>
                      <path d="M3 11V3h8" stroke="#8A8A8A" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>

                  {/* 퀵 링크 */}
                  <a href={`/story/${student.id}?src=direct`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: '8px', textDecoration: 'none', marginTop: '4px' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8h12M8 2v12" stroke="#0D2D6B" strokeWidth="1.5" strokeLinecap="round"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#0D2D6B" strokeWidth="1.2"/></svg>
                    <span style={{ fontSize: '12px', color: '#0D2D6B', fontWeight: 600 }}>성장 스토리 보기</span>
                  </a>

                  {/* 주간 요약 카드 */}
                  <button onClick={() => setShowWeekly(true)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#0D2D6B', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="2" width="12" height="10" rx="2" stroke="#fff" strokeWidth="1.2"/><path d="M4 5h6M4 7.5h4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>이번 주 요약 카드</span>
                  </button>

                  {/* 주간 요약 카드 모달 */}
                  {showWeekly && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '20px' }}
                      onClick={() => setShowWeekly(false)}>
                      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px' }}>
                        <WeeklySummaryCard student={student} reports={reports} />
                        <button onClick={() => setShowWeekly(false)}
                          style={{ width: '100%', marginTop: '8px', padding: '12px', background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                          닫기
                        </button>
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: '10px', color: '#B0B0B0', margin: '4px 0 0', textAlign: 'center' }}>
                    링크 열람 시 ?src 파라미터로 유입 경로 추적 가능
                  </p>
                </div>
              );
            })()}
          </div>

        </div>
      </div>
    </div>
  );
}

function DirectorView({ reports, students, reportViews = [] }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedId, setExpandedId] = useState(null);
  const [memos, setMemos] = useState({});
  const [savingMemo, setSavingMemo] = useState(null);
  const [profileStudent, setProfileStudent] = useState(null);

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
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* 학생 종합 프로필 모달 */}
      {profileStudent && (
        <StudentProfileModal
          student={profileStudent}
          reports={reports.filter(r => r.studentId === profileStudent.id)}
          onClose={() => setProfileStudent(null)}
          DIAG_MAP={DIAG_MAP}
        />
      )}

      {/* 이번 주 현황 위젯 */}
      {(() => {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + 1); // 월요일
        weekStart.setHours(0, 0, 0, 0);
        const weekNum = Math.ceil((now.getDate() - now.getDay() + 1) / 7);
        const weekLabel = `${now.getMonth() + 1}월 ${weekNum}주차`;

        const weekReports = reports.filter(r => {
          const ts = r.createdAt?.seconds * 1000 || 0;
          return ts >= weekStart.getTime();
        });

        const weekStudentIds = [...new Set(weekReports.map(r => r.studentId))];
        const attendRate = weekReports.length > 0
          ? Math.round(weekReports.filter(r => r.attendance === '정시').length / weekReports.length * 100)
          : 0;

        // 미제출 — 이번 주 리포트 없는 학생
        const noReportStudents = students.filter(s => !weekStudentIds.includes(s.id));

        return (
          <div style={{ background: 'linear-gradient(135deg, #0D2D6B, #1A4A8A)', borderRadius: '12px', padding: '16px 20px', marginBottom: '14px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em', margin: '0 0 2px' }}>이번 주 현황</p>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: 0 }}>{weekLabel}</p>
              </div>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                {weekStart.getMonth() + 1}/{weekStart.getDate()} 기준
              </span>
            </div>

            {/* 수치 3개 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: noReportStudents.length > 0 ? '12px' : 0 }}>
              {[
                { label: '리포트', value: `${weekReports.length}건` },
                { label: '출석률', value: `${attendRate}%` },
                { label: '미제출', value: `${noReportStudents.length}명`, warn: noReportStudents.length > 0 },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>{s.label}</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: s.warn ? '#F87171' : '#fff', margin: 0 }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* 미제출 학생 알림 */}
            {noReportStudents.length > 0 && (
              <div style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '8px', padding: '10px 14px' }}>
                <p style={{ fontSize: '10px', color: '#F87171', fontWeight: 700, margin: '0 0 6px', letterSpacing: '0.08em' }}>⚠ 이번 주 리포트 미작성</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {noReportStudents.map(s => (
                    <span key={s.id} style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '3px 10px', borderRadius: '10px', color: '#fff' }}>
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 헤더 */}
      <div style={{ background: '#0D2D6B', borderRadius: '4px', padding: '16px 20px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em', margin: '0 0 3px' }}>와이즈에듀 교현학원</p>
          <p style={{ fontSize: '17px', fontWeight: 700, color: '#fff', margin: 0 }}>원장님 데일리 보고서</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', background: '#fff', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
            <span style={{ fontSize: '14px', lineHeight: 1 }}>📅</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D2D6B' }}>날짜 선택</span>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              style={{ padding: 0, fontSize: '16px', border: 'none', background: 'transparent', color: '#0D2D6B', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600, width: '125px' }}
            />
          </label>
        </div>
      </div>

      <p style={{ fontSize: '13px', fontWeight: 600, color: '#5A6472', margin: '0 0 12px' }}>{fmtDate(selectedDate)}</p>

      {/* 핵심 지표 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '14px' }}>
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

      {/* 학생 카드 목록 — PC에선 2열 그리드, 펼친 카드는 전체 폭 사용 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '8px', marginBottom: '14px', alignItems: 'start' }}>
        {todayReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF', background: '#fff', borderRadius: '10px', border: '0.5px solid #E8E6E0', gridColumn: '1 / -1' }}>
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
          const dateStr = r.createdAt?.seconds
            ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
            : '';

          // 열람 여부 확인
          const views = reportViews.filter(v => v.reportId === r.id);
          const isViewed = views.length > 0;
          const lastView = isViewed ? views.sort((a, b) => (b.viewedAt?.seconds || 0) - (a.viewedAt?.seconds || 0))[0] : null;
          const lastViewTime = lastView?.viewedAt?.seconds
            ? new Date(lastView.viewedAt.seconds * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            : '';
          const viewSrc = lastView?.src === 'kakao' ? '카카오' : lastView?.src === 'copy' ? '링크복사' : '직접';

          return (
            <div key={r.id} style={{ background: '#fff', border: `0.5px solid ${borderColor}`, borderRadius: '10px', overflow: 'hidden', gridColumn: isOpen ? '1 / -1' : 'auto' }}>

              {/* 요약 행 */}
              <div style={{ padding: '12px 14px', cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>

                {/* 상단: 학생명 + 열람배지 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EAF0F9', color: '#0D2D6B', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {r.studentName?.[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{r.studentName}</p>
                      <p style={{ fontSize: '10px', color: '#98A1AC', margin: 0 }}>{r.teacherName}{/선생님?$/.test(r.teacherName || '') ? '' : ' 선생님'}</p>
                    </div>
                  </div>

                  {/* 열람 배지 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {isViewed ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#0F6E56', background: '#F0FAF5', padding: '2px 8px', borderRadius: '10px' }}>✓ 열람완료</span>
                        <span style={{ fontSize: '9px', color: '#98A1AC', marginTop: '2px' }}>{viewSrc} · {lastViewTime}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#8A5A00', background: '#FFF8EC', padding: '2px 8px', borderRadius: '10px' }}>미열람</span>
                    )}
                  </div>
                </div>

                {/* 하단: 교재+단원 / 점수 / 진단태그 / 버튼 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingLeft: '36px' }}>
                  {/* 학습 단원 */}
                  {r.textbook && (
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A', margin: 0, wordBreak: 'keep-all', flex: '1 1 auto', minWidth: 0 }}>
                      {r.textbook}{r.unit ? ` · ${r.unit}` : ''}{r.pages ? ` ${r.pages}` : ''}
                    </p>
                  )}

                  {/* 점수 */}
                  <p style={{ fontSize: '11px', color: '#5A6472', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    과제 {toPct(r.homeworkRating)}% · 개념 {toPct(r.conceptRating)}%
                    {r.hasTest && r.testScore ? ` · 시험 ${r.testScore}점` : ''}
                  </p>

                  {/* 진단 태그 */}
                  {mainDiag && DIAG_MAP[mainDiag.key] && (
                    <span style={{ background: DIAG_MAP[mainDiag.key].bg, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {DIAG_MAP[mainDiag.key].prefix} {DIAG_MAP[mainDiag.key].label}
                    </span>
                  )}

                  {/* 종합 프로필 버튼 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setProfileStudent({ id: r.studentId, name: r.studentName }); }}
                    style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, background: '#EAF0F9', color: '#1A5CB8', border: '1px solid #1A5CB8', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    종합 프로필
                  </button>
                </div>
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
                        style={{ flex: 1, padding: '8px 10px', fontSize: '16px', border: '0.5px solid #E8E6E0', borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }}
                      />
                      <button
                        onClick={() => handleMemoSave(r.id, memos[r.id] ?? r.directorMemo ?? '')}
                        disabled={savingMemo === r.id}
                        style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, background: savingMemo === r.id ? '#E5E7EB' : '#0D2D6B', color: savingMemo === r.id ? '#9CA3AF' : '#fff', border: 'none', borderRadius: '8px', cursor: savingMemo === r.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
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
                        <span style={{ fontSize: '11px', color: '#5A6472' }}>과제 {toPct(r.homeworkRating)}%</span>
                        <span style={{ fontSize: '11px', color: '#5A6472' }}>개념 {toPct(r.conceptRating)}%</span>
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
                        const diagText = (r.diagnosis || []).map(d => DIAG_MAP[d.key] ? `${DIAG_MAP[d.key].prefix} ${DIAG_MAP[d.key].label}${d.detail ? ` (${d.detail})` : ''}` : '').filter(Boolean).join(', ');
                        const copyText = [
                          `📋 교현학원 수업 리포트`,
                          ``,
                          `안녕하세요, ${r.studentName} 학생 ${dateStr} 수업 리포트입니다.`,
                          ``,
                          r.homeworkRating != null ? `▸ 과제 수행: ${toPct(r.homeworkRating)}% (${ratingLabel(toPct(r.homeworkRating))})` : `▸ 과제 수행: 미평가`,
                          r.conceptRating != null ? `▸ 개념 이해: ${toPct(r.conceptRating)}% (${ratingLabel(toPct(r.conceptRating))})` : `▸ 개념 이해: 미평가`,
                          `▸ 출결: ${r.attendance}`,
                          r.hasTest && r.testScore ? `▸ 시험: ${r.testName || ''} ${r.testScore}점` : '',
                          diagText ? `▸ 진단: ${diagText}` : '',
                          ``,
                          `👉 자세한 리포트 보기`,
                          url,
                        ].filter(line => line !== '').join('\n');
                        navigator.clipboard.writeText(copyText).then(() =>
                          showAppToast('링크 복사됐어요! 카톡에 붙여넣기 하세요.')
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


function AnalysisView({ students, reports }) {
  const [selectedId, setSelectedId] = useState('');
  const studentReports = reports.filter(r => r.studentId === selectedId);
  const avg = (key) => studentReports.length ? Math.round(studentReports.reduce((a, r) => a + (r[key] || 0), 0) / studentReports.length * 10) / 10 : 0;

  // ── 기간 설정 (월간 고정 버튼 + 커스텀 기간) ──
  const [periodMode, setPeriodMode] = useState('all'); // all | thisMonth | lastMonth | custom
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

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

  const periodAvg = (key) => {
    const rated = periodReports.filter(r => r[key] != null);
    return rated.length ? Math.round(rated.reduce((a, r) => a + toPct(r[key]), 0) / rated.length) : 0;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>종합 분석</h2>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: `1px solid #E5E7EB`, marginBottom: '16px' }}>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '16px', fontWeight: 500, border: `1px solid #E5E7EB`, borderRadius: '10px', background: '#F9FAFB', outline: 'none', fontFamily: 'inherit' }}>
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
                  style={{ flex: 1, padding: '8px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }} />
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>~</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }} />
              </div>
            )}
          </div>

          {periodReports.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '32px 16px', border: '1px solid #E5E7EB', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              {periodLabel}에 기록된 리포트가 없습니다
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <StatCard label={`리포트 (${periodLabel})`} value={periodReports.length} unit="건" />
                <StatCard label="과제 평균" value={periodAvg('homeworkRating')} unit="%" />
                <StatCard label="개념 평균" value={periodAvg('conceptRating')} unit="%" />
                <StatCard label="정시 출석" value={Math.round(periodReports.filter(r => r.attendance === '정시').length / periodReports.length * 100)} unit="%" />
              </div>
              <HomeworkTestChart reports={periodReports} />
              <InsightCard reports={periodReports} />
            </>
          )}

          {/* 단원별 오답 + 진단 태그 — 2단 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

            {/* 단원별 정답률 */}
            {(() => {
              const TARGET = 80;
              const unitMap = {};
              periodReports.forEach(r => {
                const key = [r.unit, r.textbook].filter(Boolean).join(' ');
                if (!key) return;
                if (!unitMap[key]) unitMap[key] = { name: key, correct: 0, total: 0 };
                if (r.hasTest && r.testScore) {
                  unitMap[key].correct += Number(r.testScore);
                  unitMap[key].total += 100;
                }
              });
              const units = Object.values(unitMap)
                .filter(u => u.total > 0)
                .map(u => ({ ...u, pct: Math.round(u.correct / u.total * 100) }))
                .sort((a, b) => a.pct - b.pct);
              if (units.length === 0) return null;
              return (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E5E7EB' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>단원별 정답률</p>
                    <span style={{ fontSize: '9px', color: '#9CA3AF' }}>목표 {TARGET}%</span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${TARGET}%`, width: '1px', background: '#0D2D6B', opacity: 0.12 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {units.map((u, i) => {
                        const isWorst = i === 0;
                        const barColor = isWorst ? '#8A2020' : '#0D2D6B';
                        return (
                          <div key={u.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '11px', color: '#1A1A1A', fontWeight: isWorst ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{u.name}</span>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: barColor, flexShrink: 0 }}>{u.pct}%{u.pct >= TARGET ? ' ✓' : ''}</span>
                            </div>
                            <div style={{ height: '6px', background: isWorst ? '#FDF0F0' : '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${u.pct}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
                            </div>
                            {isWorst && <span style={{ fontSize: '9px', color: '#8A2020', fontWeight: 700 }}>즉시 점검</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 오답 유형 */}
            {(() => {
              const DIAG_COLORS = {
                calc:    { label: '계산 실수', color: '#7A4F00' },
                concept: { label: '개념 누락', color: '#0D2D6B' },
                apply:   { label: '응용 부족', color: '#8A2020' },
                time:    { label: '시간 부족', color: '#4A3080' },
              };

              // 오답 유형별 집계 + 단원 매핑
              const diagMap = {};
              periodReports.forEach(r => {
                const unitName = [r.unit, r.textbook].filter(Boolean).join(' ') || '';
                (r.diagnosis || []).forEach(d => {
                  if (!diagMap[d.key]) diagMap[d.key] = { count: 0, units: {} };
                  diagMap[d.key].count++;
                  if (unitName) {
                    diagMap[d.key].units[unitName] = (diagMap[d.key].units[unitName] || 0) + 1;
                  }
                });
              });

              const diagList = Object.entries(diagMap)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 4);
              const maxCount = diagList[0]?.[1].count || 1;
              if (diagList.length === 0) return null;

              return (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 12px' }}>반복 오답 유형</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {diagList.map(([key, val], i) => {
                      const info = DIAG_COLORS[key] || { label: key, color: '#4A4A4A' };
                      // 단원별 TOP 2
                      const topUnits = Object.entries(val.units)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 2);
                      return (
                        <div key={key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: info.color, color: '#fff', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                              <span style={{ fontSize: '11px', color: '#1A1A1A', fontWeight: 600 }}>{info.label}</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{val.count}회</span>
                          </div>
                          <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                            <div style={{ width: `${Math.round(val.count / maxCount * 100)}%`, height: '100%', background: info.color, borderRadius: '3px' }} />
                          </div>
                          {/* 단원 서브 태그 */}
                          {topUnits.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {topUnits.map(([uName, uCnt]) => (
                                <span key={uName} style={{
                                  fontSize: '9px', padding: '2px 7px', borderRadius: '10px',
                                  background: `${info.color}12`,
                                  border: `0.5px solid ${info.color}40`,
                                  color: info.color, fontWeight: 600,
                                }}>{uName} {uCnt}회</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 성장 스토리 열기 버튼 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                const student = students.find(s => s.id === selectedId);
                if (student) window.open(`/story/${student.id}`, '_blank');
              }}
              disabled={!selectedId}
              style={{
                flex: 1, padding: '14px', fontSize: '14px', fontWeight: 700, borderRadius: '14px', border: 'none',
                background: !selectedId ? '#E5E7EB' : 'linear-gradient(135deg, #185FA5, #0C447C)',
                color: !selectedId ? '#9CA3AF' : '#fff',
                cursor: !selectedId ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
              📈 성장 스토리 열기
            </button>
            <button
              onClick={() => {
                const student = students.find(s => s.id === selectedId);
                if (student) {
                  const url = `${window.location.origin}/story/${student.id}?period=3m`;
                  navigator.clipboard.writeText(url).then(() => showAppToast('3개월 성장 스토리 링크 복사됐어요!'));
                }
              }}
              disabled={!selectedId}
              style={{
                padding: '14px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '14px',
                border: '1.5px solid #185FA5', background: '#fff',
                color: !selectedId ? '#9CA3AF' : '#185FA5',
                cursor: !selectedId ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
              📤 3개월 공유
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 단원별 오답 대시보드 ──
function UnitErrorDashboard({ reports }) {
  const [tab, setTab] = useState('week');

  const TARGET = 80;
  const DIAG_COLORS = {
    calc:    { label: '계산 실수', color: '#7A4F00' },
    concept: { label: '개념 누락', color: '#0D2D6B' },
    apply:   { label: '응용 부족', color: '#8A2020' },
    time:    { label: '시간 부족', color: '#4A3080' },
  };

  const now = Date.now();
  const cutoffs = { week: 7, month: 30, all: 99999 };

  const filtered = reports.filter(r => {
    const ts = r.createdAt?.seconds * 1000 || 0;
    return now - ts <= cutoffs[tab] * 24 * 60 * 60 * 1000;
  });

  // 단원별 집계
  const unitMap = {};
  filtered.forEach(r => {
    const key = [r.unit, r.textbook].filter(Boolean).join(' ');
    if (!key) return;
    if (!unitMap[key]) unitMap[key] = { name: key, correct: 0, total: 0, diags: {} };
    if (r.hasTest && r.testScore) {
      unitMap[key].correct += Number(r.testScore);
      unitMap[key].total += 100;
    }
    (r.diagnosis || []).forEach(d => {
      if (!unitMap[key].diags[d.key]) unitMap[key].diags[d.key] = 0;
      unitMap[key].diags[d.key]++;
    });
  });

  const units = Object.values(unitMap)
    .filter(u => u.total > 0)
    .map(u => ({ ...u, pct: Math.round(u.correct / u.total * 100) }))
    .sort((a, b) => a.pct - b.pct);

  // 오답 유형 집계
  const diagMap = {};
  filtered.forEach(r => {
    (r.diagnosis || []).forEach(d => {
      if (!diagMap[d.key]) diagMap[d.key] = { key: d.key, count: 0 };
      diagMap[d.key].count++;
    });
  });
  const diagList = Object.values(diagMap).sort((a, b) => b.count - a.count).slice(0, 3);
  const maxDiag = diagList[0]?.count || 1;

  // 요약
  const totalCount = filtered.length;
  const avgPct = units.length ? Math.round(units.reduce((s, u) => s + u.pct, 0) / units.length) : 0;
  const worstUnit = units[0];

  return (
    <div style={{ padding: '16px', maxWidth: '700px', margin: '0 auto' }}>
      <p style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 14px', letterSpacing: '-0.02em' }}>단원별 오답 분석</p>

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: '16px' }}>
        {[['week', '이번 주'], ['month', '이번 달'], ['all', '전체']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '13px', fontWeight: tab === key ? 700 : 500,
            color: tab === key ? '#0D2D6B' : '#9CA3AF',
            borderBottom: `2px solid ${tab === key ? '#0D2D6B' : 'transparent'}`,
            marginBottom: '-1px'
          }}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', fontSize: '13px' }}>
          해당 기간 리포트가 없습니다
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
            {[
              { label: '수업 횟수', value: `${totalCount}회`, color: '#1A1A1A' },
              { label: '평균 정답률', value: `${avgPct}%`, color: '#0D2D6B' },
              { label: '즉시 점검', value: worstUnit?.name?.slice(0, 8) || '—', color: '#8A2020' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 5px', fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: s.color, margin: 0, wordBreak: 'keep-all', lineHeight: 1.3 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* 단원별 정답률 */}
          {units.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px 18px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>단원별 정답률</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '1px', height: '10px', background: '#0D2D6B', opacity: 0.3 }} />
                  <span style={{ fontSize: '10px', color: '#9CA3AF' }}>목표 {TARGET}%</span>
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${TARGET}%`, width: '1px', background: '#0D2D6B', opacity: 0.12, pointerEvents: 'none' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {units.map((u, i) => {
                    const isWorst = i === 0;
                    const barColor = isWorst ? '#8A2020' : '#0D2D6B';
                    const trackBg = isWorst ? '#FDF0F0' : '#F3F4F6';
                    return (
                      <div key={u.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isWorst && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8A2020', flexShrink: 0 }} />}
                            <span style={{ fontSize: '12px', color: '#1A1A1A', fontWeight: isWorst ? 600 : 400 }}>{u.name}</span>
                            {isWorst && <span style={{ fontSize: '9px', background: '#8A202018', color: '#8A2020', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>즉시 점검</span>}
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: barColor }}>{u.pct}%{u.pct >= TARGET ? ' ✓' : ''}</span>
                        </div>
                        <div style={{ height: '8px', background: trackBg, borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${u.pct}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 오답 유형 */}
          {diagList.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px 18px', marginBottom: '12px' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 12px' }}>반복 오답 유형</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {diagList.map((d, i) => {
                  const info = DIAG_COLORS[d.key] || { label: d.key, color: '#4A4A4A' };
                  return (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: info.color, color: '#fff', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: '12px', color: '#1A1A1A', minWidth: '72px' }}>{info.label}</span>
                      <div style={{ flex: 1, height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(d.count / maxDiag * 100)}%`, height: '100%', background: info.color, borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '12px', color: '#9CA3AF', minWidth: '28px', textAlign: 'right' }}>{d.count}회</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── 주간 요약 카드 ──
function WeeklySummaryCard({ student, reports, teachers }) {
  const [copied, setCopied] = useState(false);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (d) => `${d.getMonth()+1}/${d.getDate()}`;
  const weekNum = Math.ceil((now.getDate() - now.getDay() + 1) / 7);
  const weekLabel = `${now.getMonth()+1}월 ${weekNum}주차`;

  const weekReports = reports
    .filter(r => r.studentId === student?.id && r.createdAt?.seconds * 1000 >= weekStart.getTime())
    .sort((a, b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));

  const avg = (key) => {
    const rated = weekReports.filter(r => r[key] != null);
    return rated.length
      ? Math.round(rated.reduce((s, r) => s + toPct(r[key]), 0) / rated.length)
      : '—';
  };

  const attendRate = weekReports.length
    ? Math.round(weekReports.filter(r => r.attendance === '정시').length / weekReports.length * 100)
    : 0;

  // 단원별 집계
  const unitMap = {};
  weekReports.forEach(r => {
    const key = [r.unit, r.textbook].filter(Boolean).join(' · ');
    if (!key) return;
    if (!unitMap[key]) unitMap[key] = { name: key, scores: [], teacher: r.teacherName };
    if (r.hasTest && r.testScore) unitMap[key].scores.push(Number(r.testScore));
  });
  const units = Object.values(unitMap);

  // 오답 유형 집계
  const diagMap = {};
  weekReports.forEach(r => (r.diagnosis||[]).forEach(d => {
    if (d.key === 'perfect') return;
    if (!diagMap[d.key]) diagMap[d.key] = { key: d.key, count: 0 };
    diagMap[d.key].count++;
  }));
  const DIAG = { calc: { label: '계산 실수', color: '#7A4F00', bg: '#FFF8EC' }, concept: { label: '개념 누락', color: '#0D2D6B', bg: '#EAF1FB' }, apply: { label: '응용 부족', color: '#8A2020', bg: '#FDF0F0' }, time: { label: '시간 부족', color: '#4A3080', bg: '#F3F0FA' } };
  const diagList = Object.values(diagMap).sort((a,b) => b.count - a.count).slice(0, 3);

  // 선생님 코멘트 — 가장 최근
  const lastNote = [...weekReports].reverse().find(r => r.teacherNote)?.teacherNote || '';
  const teacherName = weekReports[weekReports.length-1]?.teacherName || '';

  // 다음 주 계획
  const nextPlan = [...weekReports].reverse().find(r => r.nextPlan)?.nextPlan || '';

  const handleCopy = () => {
    const url = `${window.location.origin}/story/${student?.id}?src=weekly`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!student) return null;

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden', maxWidth: '420px', margin: '0 auto', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* 헤더 */}
      <div style={{ background: '#0D2D6B', padding: '20px 22px 18px' }}>
        <div style={{ width: '32px', height: '3px', background: '#C9A227', borderRadius: '2px', marginBottom: '12px' }} />
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', margin: '0 0 3px' }}>
          {weekLabel} · {fmt(weekStart)} ~ {fmt(weekEnd)}
        </p>
        <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>{student.name} 학생 주간 리포트</p>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', margin: '4px 0 0' }}>와이즈에듀 교현학원</p>
      </div>

      {weekReports.length === 0 ? (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
          이번 주 수업 기록이 없습니다
        </div>
      ) : (
        <>
          {/* 핵심 수치 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '0.5px solid #E5E7EB' }}>
            {[
              { label: '수업 횟수', value: `${weekReports.length}회`, color: '#0D2D6B' },
              { label: '과제 평균', value: `${avg('homeworkRating')}%`, color: '#0D2D6B' },
              { label: '출석률', value: `${attendRate}%`, color: attendRate === 100 ? '#0F6E56' : '#7A4F00' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '14px 12px', textAlign: 'center', borderRight: i < 2 ? '0.5px solid #E5E7EB' : 'none' }}>
                <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 4px', fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: '20px', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* 이번 주 학습 단원 */}
          {units.length > 0 && (
            <div style={{ padding: '16px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 10px' }}>이번 주 학습 단원</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {units.map((u, i) => {
                  const avgScore = u.scores.length ? Math.round(u.scores.reduce((a,b)=>a+b,0)/u.scores.length) : null;
                  const achieved = avgScore && avgScore >= 80;
                  const barColor = achieved ? '#0F6E56' : avgScore ? '#7A4F00' : '#0D2D6B';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '3px', height: '34px', background: barColor, borderRadius: '2px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A', margin: '0 0 1px' }}>{u.name}</p>
                        {avgScore && <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>{avgScore}점</p>}
                      </div>
                      {avgScore && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: achieved ? '#F0FAF5' : '#FFF8EC', color: achieved ? '#0F6E56' : '#7A4F00', flexShrink: 0 }}>
                          {achieved ? '✓ 목표달성' : '점검 필요'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 집중 포인트 */}
          {diagList.length > 0 && (
            <div style={{ padding: '14px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 8px' }}>이번 주 집중 포인트</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {diagList.map(d => {
                  const info = DIAG[d.key] || { label: d.key, color: '#4A4A4A', bg: '#F3F4F6' };
                  return (
                    <span key={d.key} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', background: info.bg, color: info.color }}>
                      {info.label} {d.count}회
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 선생님 한마디 */}
          {lastNote && (
            <div style={{ padding: '16px 22px', borderBottom: '0.5px solid #E5E7EB', background: '#FAFAF8' }}>
              <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 8px' }}>선생님 한마디</p>
              <p style={{ fontSize: '12px', color: '#1A1A1A', lineHeight: 1.8, margin: 0 }}>
                {lastNote}
              </p>
              {teacherName && <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '8px 0 0', textAlign: 'right' }}>— {teacherName}</p>}
            </div>
          )}

          {/* 다음 주 예고 */}
          {nextPlan && (
            <div style={{ padding: '12px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 4px' }}>다음 주 학습 예정</p>
              <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0 }}>{nextPlan}</p>
            </div>
          )}

          {/* 공유 버튼 */}
          <div style={{ padding: '14px 22px', display: 'flex', gap: '8px' }}>
            <button onClick={handleCopy}
              style={{ flex: 1, background: '#FEE500', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '12px', fontWeight: 700, color: '#3A1D1D', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1C3.96 1 1.5 3.13 1.5 5.75c0 1.64.91 3.09 2.33 4.01l-.52 1.94 2.3-1.2c.42.08.85.12 1.39.12 3.04 0 5.5-2.13 5.5-4.75S10.04 1 7 1z" fill="#3A1D1D"/></svg>
              {copied ? '복사 완료!' : '카카오톡 공유'}
            </button>
            <button onClick={handleCopy}
              style={{ flex: 1, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: '8px', padding: '11px', fontSize: '12px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              링크 복사
            </button>
          </div>
        </>
      )}
    </div>
  );
}
