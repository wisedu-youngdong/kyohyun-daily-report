import React, { useState, useEffect } from 'react';
import { db, auth, storage } from './firebase';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDoc, onSnapshot, setDoc, serverTimestamp, query, where, getDocs, writeBatch
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import DiagnosticReportInput from './DiagnosticReportInput';
import {
  LayoutDashboard, Users, FileText, History, BarChart2, LogOut
} from 'lucide-react';
import { kstDay } from './growth.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import { T } from './tokens.jsx';
import LoginScreen from './views/LoginScreen.jsx';
import DashboardView from './views/DashboardView.jsx';
import StudentsView from './views/StudentsView.jsx';
import HistoryView from './views/HistoryView.jsx';
import SettingsView from './views/SettingsView.jsx';
import GrowthDashboard from './views/GrowthDashboard.jsx';
import DirectorView from './views/DirectorView.jsx';
import AnalysisView from './views/AnalysisView.jsx';

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

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [userTeacherId, setUserTeacherId] = useState(null);
  const [academyId, setAcademyId] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSubTab, setActiveSubTab] = useState({ record: 'history', insight: 'director', manage: 'students' });
  const setSubTab = (group, key) => setActiveSubTab(prev => ({ ...prev, [group]: key }));
  const [editingReport, setEditingReport] = useState(null);

  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportViews, setReportViews] = useState([]);
  const [commentTemplates, setCommentTemplates] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [studentsReady, setStudentsReady] = useState(false);
  const [reportsReady, setReportsReady] = useState(false);
  const dataReady = studentsReady && reportsReady;
  const [appToast, setAppToast] = useState(null);
  const appToastTimerRef = React.useRef(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [academySkinColor, setAcademySkinColor] = useState(null);
  const [academyStatus, setAcademyStatus] = useState(null);

  // 학원 브랜딩(로고+기본 스킨색)+이용 상태 — 로그인 전(비인증) 화면에서도 로고가 보여야 해서 App 최상위에서 구독.
  // 로그인 후에는 그 계정의 academyId 학원 문서를 구독(분양학원 원장에게 교현 로고가 보이던 문제 해결),
  // 로그인 전에는 academyId를 알 수 없어 'kyohyun'으로 폴백 — URL/서브도메인 테넌트 구분은 추후 과제.
  // 권한 규칙상 읽기가 막혀 있어도(비로그인 상태) 조용히 실패하고 기본 "K" 배지로 대체
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'academies', academyId || 'kyohyun'),
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setLogoUrl(data.logoUrl || null);
        setAcademySkinColor(data.globalSkinColor || null);
        setAcademyStatus(data.status || 'active');
      },
      () => { setLogoUrl(null); setAcademySkinColor(null); setAcademyStatus(null); }
    );
    return () => unsub();
  }, [academyId]);

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
      setUnauthorized(false);
      if (u) {
        // users/{uid} 고정 경로에서 role·academyId 조회
        // (예전엔 addDoc으로 자동 ID 문서를 만들고 uid 필드로 쿼리해서 찾았는데,
        // 이러면 "내 문서인지"를 보안 규칙에서 안전하게 확인할 방법이 list 권한을
        // 전체 열어주는 것뿐이라 — 다른 학원 직원 이메일/역할까지 다 보이게 됨.
        // uid를 문서 ID로 고정하면 get()으로 본인 문서만 안전하게 조회 가능)
        //
        // users 문서가 없거나 role이 없으면 접근을 막는다 — 예전엔 "문서 없으면 교현학원
        // 원장으로 취급"하는 폴백이 있었는데, 학원이 여러 개가 되면 이 폴백이 다른 학원
        // 계정을 실수로 교현학원 직원으로 만들어버리는 위험한 구멍이 된다.
        try {
          const userSnap = await getDoc(doc(db, 'users', u.uid));
          if (userSnap.exists() && userSnap.data().role) {
            const userData = userSnap.data();
            setUserRole(userData.role);
            setUserTeacherId(userData.teacherId || null);
            // platform_admin은 특정 학원에 안 묶임 — academyId 없이도 정상
            setAcademyId(userData.academyId || null);
            // role과 별개인 추가 권한 — director를 유지한 채로도 플랫폼 관리 기능을 켤 수 있음
            setIsPlatformAdmin(userData.isPlatformAdmin === true);
          } else {
            setUserRole(null);
            setUserTeacherId(null);
            setAcademyId(null);
            setIsPlatformAdmin(false);
            setUnauthorized(true);
          }
        } catch (e) {
          setUserRole(null);
          setUserTeacherId(null);
          setAcademyId(null);
          setIsPlatformAdmin(false);
          setUnauthorized(true);
        }
      } else {
        setUserRole(null);
        setUserTeacherId(null);
        setAcademyId(null);
        setIsPlatformAdmin(false);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || !academyId) return;
    // 정지된 학원은 데이터 구독을 아예 안 붙임 — 규칙에서도 막히지만, 불필요한 permission-denied 에러 방지
    if (academyStatus === 'suspended' && !isPlatformAdmin) return;
    setStudentsReady(false);
    setReportsReady(false);
    const unsubStudents = onSnapshot(collection(db, 'academies', academyId, 'students'), (snap) => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setStudentsReady(true);
    }, (e) => { console.error('학생 목록 구독 실패:', e); showAppToast('학생 목록을 불러오지 못했습니다. 새로고침해주세요.', 'error'); });
    const unsubTeachers = onSnapshot(collection(db, 'academies', academyId, 'teachers'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length === 0) {
        addDoc(collection(db, 'academies', academyId, 'teachers'), { name: '김선생님', createdAt: serverTimestamp() });
      } else {
        setTeachers(list);
      }
    }, (e) => { console.error('강사 목록 구독 실패:', e); showAppToast('강사 목록을 불러오지 못했습니다.', 'error'); });
    const unsubReports = onSnapshot(collection(db, 'academies', academyId, 'reports'), (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setReportsReady(true);
    }, (e) => { console.error('리포트 목록 구독 실패:', e); showAppToast('리포트 목록을 불러오지 못했습니다. 새로고침해주세요.', 'error'); });

    // 열람 기록 실시간 구독
    const unsubViews = onSnapshot(collection(db, 'academies', academyId, 'reportViews'), (snap) => {
      setReportViews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => { console.error('열람 기록 구독 실패:', e); });

    // 코멘트 즐겨찾기 — 학원 공용(모든 강사가 함께 씀)
    const unsubTemplates = onSnapshot(collection(db, 'academies', academyId, 'commentTemplates'), (snap) => {
      setCommentTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
    }, (e) => { console.error('코멘트 즐겨찾기 구독 실패:', e); });

    // 복습 일정 — 약점 태그가 있는 리포트 저장 시 7/14/30일 후로 자동 생성됨
    const unsubReviews = onSnapshot(collection(db, 'academies', academyId, 'reviews'), (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => { console.error('복습 일정 구독 실패:', e); });

    return () => { unsubStudents(); unsubTeachers(); unsubReports(); unsubViews(); unsubTemplates(); unsubReviews(); };
  }, [user, academyId, academyStatus, isPlatformAdmin]);

  const handleCompleteReview = async (id) => {
    try {
      await updateDoc(doc(db, 'academies', academyId, 'reviews', id), { status: 'done', completedAt: serverTimestamp() });
    } catch (e) {
      console.error('복습 완료 처리 실패:', e);
      showAppToast('복습 완료 처리에 실패했습니다.', 'error');
    }
  };

  const handleSaveStudent = async (d) => {
  try {
    if (d.id) {
      const { id, ...data } = d;
      await updateDoc(doc(db, 'academies', academyId, 'students', id), data);
    } else {
      // 공개 성장스토리 페이지(studentIndex 조회)가 새 학생도 바로 찾을 수 있도록
      // 학생 문서 생성과 인덱스 문서 생성을 하나의 배치로 원자적 처리
      const studentRef = doc(collection(db, 'academies', academyId, 'students'));
      const batch = writeBatch(db);
      batch.set(studentRef, { ...d, createdAt: serverTimestamp() });
      batch.set(doc(db, 'studentIndex', studentRef.id), { academyId });
      await batch.commit();
    }
  } catch (e) {
    console.error('학생 저장 실패:', e);
    alert('저장 실패: ' + e.message);
  }
};
  // 소프트 삭제 — 학생 문서를 지우면 그 학생의 리포트가 studentId만 든 채 고아가 되고
  // (학부모에게 이미 나간 공개 링크도 그대로 열림), 복구도 불가능. archived 플래그로 숨김 처리.
  const handleDeleteStudent = async (id) => {
    try {
      await updateDoc(doc(db, 'academies', academyId, 'students', id), { archived: true, archivedAt: serverTimestamp() });
      showAppToast('학생을 목록에서 숨겼습니다. 리포트 기록은 그대로 보관됩니다.');
    } catch (e) {
      console.error('학생 삭제 실패:', e);
      showAppToast('학생 삭제에 실패했습니다.', 'error');
    }
  };
  const handleRestoreStudent = async (id) => {
    try {
      await updateDoc(doc(db, 'academies', academyId, 'students', id), { archived: false });
      showAppToast('학생을 목록에 다시 표시합니다.');
    } catch (e) {
      console.error('학생 복원 실패:', e);
      showAppToast('학생 복원에 실패했습니다.', 'error');
    }
  };

  const handleSaveTeacher = async (d) => {
    try {
      if (d.id) { const { id, ...data } = d; await updateDoc(doc(db, 'academies', academyId, 'teachers', id), data); }
      else await addDoc(collection(db, 'academies', academyId, 'teachers'), { ...d, createdAt: serverTimestamp() });
    } catch (e) {
      console.error('강사 저장 실패:', e);
      showAppToast('강사 정보 저장에 실패했습니다.', 'error');
    }
  };
  const handleSaveLogo = async (file) => {
    try {
      const path = `branding/logo_${Date.now()}.${file.name.split('.').pop() || 'png'}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await setDoc(doc(db, 'academies', academyId), { logoUrl: url }, { merge: true });
    } catch (e) {
      console.error('로고 저장 실패:', e);
      showAppToast('로고 저장에 실패했습니다.', 'error');
    }
  };
  const handleDeleteLogo = async () => {
    try {
      await setDoc(doc(db, 'academies', academyId), { logoUrl: null }, { merge: true });
    } catch (e) {
      console.error('로고 삭제 실패:', e);
      showAppToast('로고 삭제에 실패했습니다.', 'error');
    }
  };
  const handleSaveCommentTemplate = async (label, text) => {
    try {
      await addDoc(collection(db, 'academies', academyId, 'commentTemplates'), { label, text, createdAt: serverTimestamp() });
    } catch (e) {
      console.error('코멘트 즐겨찾기 저장 실패:', e);
      showAppToast('즐겨찾기 저장에 실패했습니다.', 'error');
    }
  };
  const handleDeleteCommentTemplate = async (id) => {
    try {
      await deleteDoc(doc(db, 'academies', academyId, 'commentTemplates', id));
    } catch (e) {
      console.error('코멘트 즐겨찾기 삭제 실패:', e);
      showAppToast('즐겨찾기 삭제에 실패했습니다.', 'error');
    }
  };
  const handleDeleteTeacher = async (id) => {
    try {
      await deleteDoc(doc(db, 'academies', academyId, 'teachers', id));
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
      await updateDoc(doc(db, 'academies', academyId, 'reports', id), { ...data, weakTypesSummary, updatedAt: serverTimestamp() });
      reportId = id;
    } else {
      // 공개 리포트 페이지(reportIndex 조회)가 새 리포트도 바로 찾을 수 있도록
      // 리포트 문서 생성과 인덱스 문서 생성을 하나의 배치로 원자적 처리
      const reportRef = doc(collection(db, 'academies', academyId, 'reports'));
      const batch = writeBatch(db);
      batch.set(reportRef, { ...d, weakTypesSummary, createdAt: serverTimestamp() });
      batch.set(doc(db, 'reportIndex', reportRef.id), { academyId });
      await batch.commit();
      reportId = reportRef.id;
    }

    // ── 약점 태그 감지 → 복습 일정 자동 생성 ──
    // 자동저장(isDraft)은 건너뜀 — draft 시점의 미완성 태그로 일정이 만들어지고,
    // 정작 최종 저장 때는 draft id가 있어서 생성이 안 되던 문제 방지.
    // 이미 이 리포트로 만든 일정이 있으면 중복 생성하지 않음(수정 저장 대응).
    const weakTags = (d.diagnosis || []).filter(t => ['calc','concept','apply','time'].includes(t.key));
    let alreadyHasReviews = false;
    if (weakTags.length > 0 && !d.isDraft) {
      try {
        const existing = await getDocs(query(collection(db, 'academies', academyId, 'reviews'), where('reportId', '==', reportId)));
        alreadyHasReviews = existing.docs.length > 0;
      } catch (e) { console.warn('복습 일정 조회 실패:', e); }
    }
    if (weakTags.length > 0 && !d.isDraft && !alreadyHasReviews) {
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
      await Promise.all(schedules.map(s => addDoc(collection(db, 'academies', academyId, 'reviews'), s)));
    }
    return reportId;
  };
  const handleDeleteReport = async (id) => {
    try {
      await deleteDoc(doc(db, 'academies', academyId, 'reports', id));
      await deleteDoc(doc(db, 'reportIndex', id)).catch(() => {}); // 인덱스 문서 정리, 없어도 무시
    } catch (e) {
      console.error('리포트 삭제 실패:', e);
      showAppToast('리포트 삭제에 실패했습니다.', 'error');
      return;
    }
    // 연결된 복습 일정 삭제 (reportId 기준)
    try {
      const q = query(collection(db, 'academies', academyId, 'reviews'), where('reportId', '==', id));
      const snap = await getDocs(q);
      if (snap.docs.length > 0) {
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'academies', academyId, 'reviews', d.id))));
      }
    } catch (e) {
      console.warn('복습 일정 삭제 중 오류 (무시 가능):', e);
    }
  };
  const handleBulkDeleteReports = async (ids) => {
    if (!ids || ids.length === 0) return;
    await Promise.all(ids.map(id => handleDeleteReport(id)));
    showAppToast(`방치된 초안 ${ids.length}건을 삭제했습니다.`);
  };

  if (authLoading) return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: T.brand, fontSize: '14px', fontWeight: 600 }}>
      연결 중...
    </div>
  );

  if (!user) return <LoginScreen />;

  if (unauthorized) return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", padding: '24px', textAlign: 'center' }}>
      <div style={{ color: T.text, fontSize: '15px', fontWeight: 700 }}>이 계정에 연결된 학원 정보가 없습니다.</div>
      <div style={{ color: T.textMute, fontSize: '13px' }}>관리자에게 계정 설정을 문의해주세요.</div>
      <button onClick={() => signOut(auth)} style={{ marginTop: '8px', padding: '10px 20px', background: T.brand, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>로그아웃</button>
    </div>
  );

  // 이용 정지된 학원 — 직원 화면만 차단. 학부모에게 이미 공유된 공개 리포트/성장스토리 링크는
  // 공개 read 규칙을 그대로 타므로 정지와 무관하게 계속 열림 (학부모는 잘못이 없으므로).
  if (academyStatus === 'suspended' && !isPlatformAdmin) return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", padding: '24px', textAlign: 'center' }}>
      <div style={{ color: T.text, fontSize: '15px', fontWeight: 700 }}>서비스 이용이 정지되었습니다.</div>
      <div style={{ color: T.textMute, fontSize: '13px', lineHeight: 1.7 }}>이용 재개가 필요하시면 서비스 관리자에게 문의해주세요.<br />이미 학부모님께 공유된 리포트 링크는 정상적으로 열립니다.</div>
      <button onClick={() => signOut(auth)} style={{ marginTop: '8px', padding: '10px 20px', background: T.brand, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>로그아웃</button>
    </div>
  );

  const isDirector = userRole === 'director';

  // 보관 처리(소프트 삭제)된 학생은 일반 화면에서 제외 — 학생관리에서만 별도로 조회 가능
  const activeStudents = students.filter(s => !s.archived);

  // 강사는 담당 학생만, 원장은 전체
  const visibleStudents = isDirector
    ? activeStudents
    : activeStudents.filter(s => s.assignedTeacherId === userTeacherId);

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
  // widths: 숫자면 항상 그 폭, {key: 폭} 객체면 현재 활성 서브탭에 맞는 폭을 사용
  // (서브탭마다 콘텐츠 컨테이너 폭이 다르면 탭 전환 시 탭 바도 같이 맞춰줘야 정렬이 유지됨)
  const renderSubTabBar = (group, items, widths) => {
    const maxWidth = typeof widths === 'object' ? widths[activeSubTab[group]] : widths;
    const wrapStyle = maxWidth
      ? { maxWidth: `${maxWidth}px`, margin: '16px auto 0', padding: '0 20px', boxSizing: 'border-box' }
      : { margin: '16px 20px 0' };
    // 탭이 1개뿐이면 선택 UI 자체가 무의미 — 섹션 제목으로만 표시
    if (items.length <= 1) {
      return (
        <p style={{ ...wrapStyle, fontSize: '13px', fontWeight: 700, color: '#374151' }}>{items[0]?.label}</p>
      );
    }
    return (
      <div style={wrapStyle}>
        <div style={{ display: 'inline-flex', background: '#F3F4F6', borderRadius: '10px', padding: '3px', gap: '2px' }}>
          {items.map(item => {
            const isActive = activeSubTab[group] === item.key;
            return (
              <button key={item.key} onClick={() => setSubTab(group, item.key)}
                style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: isActive ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s', background: isActive ? '#fff' : 'transparent', color: isActive ? '#0D2D6B' : '#8A8A8A', boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", whiteSpace: 'nowrap' }}>
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100dvh', background: T.bgSoft, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <header style={{ background: T.bg, borderBottom: `1px solid ${T.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ width: '28px', height: '28px', background: logoUrl ? 'transparent' : T.brand, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {logoUrl ? <img src={logoUrl} alt="로고" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>K</span>}
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
        {activeTab === 'dashboard' && (dataReady
          ? <DashboardView
              students={visibleStudents} reports={visibleReports} onTabChange={setActiveTab}
              reviews={isDirector ? reviews : reviews.filter(rv => visibleStudents.some(s => s.id === rv.studentId))}
              onCompleteReview={handleCompleteReview}
              onWriteFor={(student, done) => {
                // 완료된 학생이면 오늘 리포트를 수정 모드로, 대기면 새로 작성 — 랜딩에서 작업까지 한 번에
                if (done) {
                  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
                  const todayReport = visibleReports.find(r =>
                    r.studentId === student.id && r.createdAt?.seconds &&
                    new Date(r.createdAt.seconds * 1000 + 9 * 3600 * 1000).toISOString().split('T')[0] === todayKst
                  );
                  if (todayReport) setEditingReport(todayReport);
                }
                setActiveTab('write');
              }}
            />
          : <SkeletonBlock rows={3} cardHeight={90} />)}
        {activeTab === 'write' && (
          <>
            {/* 오늘 리포트 상태바 — 발송 여부와 무관하게 오늘 작성된 모든 리포트(초안 포함, 재개 가능하도록) */}
            {(() => {
              const todayKstNow = kstDay(Date.now() / 1000);
              const todayReports = visibleReports.filter(r => r.createdAt?.seconds && kstDay(r.createdAt.seconds) === todayKstNow);
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
              commentTemplates={commentTemplates}
              onSaveCommentTemplate={handleSaveCommentTemplate}
              onDeleteCommentTemplate={handleDeleteCommentTemplate}
              currentTeacherId={userTeacherId}
              isDirector={isDirector}
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
                ? <HistoryView reports={visibleReports} students={visibleStudents} reportViews={reportViews} onDelete={handleDeleteReport} onBulkDelete={handleBulkDeleteReports} onEdit={(report) => { setEditingReport(report); setActiveTab('write'); }} />
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
            ], { director: 960, analysis: 600 })}
            <div style={{ marginTop: '12px' }}>
              {activeSubTab.insight === 'director' && (dataReady
                ? <div><DirectorView reports={reports} students={students} reportViews={reportViews} onToast={showAppToast} academyId={academyId} /><GrowthDashboard reports={reports} students={students} onSwitchTab={setActiveTab} /></div>
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
            ], 600)}
            <div style={{ marginTop: '12px' }}>
              {activeSubTab.manage === 'students' && (dataReady
                ? <StudentsView students={students} reports={reports} onSave={handleSaveStudent} onDelete={handleDeleteStudent} onRestore={handleRestoreStudent} teachers={teachers} currentTeacherId={userTeacherId} isDirector={isDirector} onToast={showAppToast} />
                : <SkeletonBlock rows={5} cardHeight={56} />
              )}
              {activeSubTab.manage === 'settings' && (dataReady
                ? <SettingsView students={students} onSaveStudent={handleSaveStudent} teachers={teachers} onSaveTeacher={handleSaveTeacher} onDeleteTeacher={handleDeleteTeacher} logoUrl={logoUrl} onSaveLogo={handleSaveLogo} onDeleteLogo={handleDeleteLogo} academyId={academyId} academySkinColor={academySkinColor} isPlatformAdmin={isPlatformAdmin} />
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
