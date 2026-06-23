import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import DiagnosticReportInput from './DiagnosticReportInput';
import {
  LayoutDashboard, Users, FileText, History, BarChart2
} from 'lucide-react';

// ============================================================
// 디자인 토큰
// ============================================================
const T = {
  brand: '#185FA5',
  brandLight: '#E6F1FB',
  text: '#1A1A1A',
  textSub: '#6B7280',
  textMute: '#9CA3AF',
  border: '#E5E7EB',
  bg: '#FFFFFF',
  bgSoft: '#F9FAFB',
};

// ============================================================
// 메인 앱
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('write');
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Firebase 익명 로그인
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Firestore 실시간 동기화
  useEffect(() => {
    if (!user) return;

    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snap) => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubTeachers = onSnapshot(
      collection(db, 'teachers'),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // 강사 없으면 기본 강사 추가
        if (list.length === 0) {
          addDoc(collection(db, 'teachers'), { name: '김선생님', createdAt: serverTimestamp() });
        } else {
          setTeachers(list);
        }
      }
    );

    const unsubReports = onSnapshot(
      collection(db, 'reports'),
      (snap) => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setReports(list);
      }
    );

    return () => { unsubStudents(); unsubTeachers(); unsubReports(); };
  }, [user]);

  // CRUD 핸들러
  const handleSaveStudent = async (studentData) => {
    if (studentData.id) {
      const { id, ...data } = studentData;
      await updateDoc(doc(db, 'students', id), data);
    } else {
      await addDoc(collection(db, 'students'), { ...studentData, createdAt: serverTimestamp() });
    }
  };

  const handleDeleteStudent = async (id) => {
    await deleteDoc(doc(db, 'students', id));
  };

  const handleSaveTeacher = async (teacherData) => {
    if (teacherData.id) {
      const { id, ...data } = teacherData;
      await updateDoc(doc(db, 'teachers', id), data);
    } else {
      await addDoc(collection(db, 'teachers'), { ...teacherData, createdAt: serverTimestamp() });
    }
  };

  const handleDeleteTeacher = async (id) => {
    await deleteDoc(doc(db, 'teachers', id));
  };

  const handleSaveReport = async (reportData) => {
    if (reportData.id) {
      const { id, ...data } = reportData;
      await updateDoc(doc(db, 'reports', id), { ...data, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, 'reports'), { ...reportData, createdAt: serverTimestamp() });
    }
  };

  const handleDeleteReport = async (id) => {
    await deleteDoc(doc(db, 'reports', id));
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        color: T.brand, fontSize: '14px', fontWeight: 600,
      }}>
        교현학원 데이터 연결 중...
      </div>
    );
  }

  const tabs = [
    { key: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={20} /> },
    { key: 'students',  label: '학생 관리', icon: <Users size={20} /> },
    { key: 'write',     label: '리포트 작성', icon: <FileText size={20} /> },
    { key: 'history',   label: '기록 보관소', icon: <History size={20} /> },
    { key: 'analysis',  label: '종합 분석', icon: <BarChart2 size={20} /> },
  ];

  return (
    <div style={{ minHeight: '100vh', background: T.bgSoft, paddingBottom: '80px' }}>
      {/* 상단 헤더 */}
      <header style={{
        background: T.bg,
        borderBottom: `1px solid ${T.border}`,
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{
          width: '28px', height: '28px', background: T.brand,
          borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>K</span>
        </div>
        <h1 style={{ fontSize: '16px', fontWeight: 700, color: T.text, letterSpacing: '-0.02em' }}>
          교현학원 데일리 리포트
        </h1>
        <span style={{
          marginLeft: 'auto', fontSize: '10px', color: T.textMute,
          fontWeight: 500, background: T.bgSoft,
          padding: '3px 8px', borderRadius: '6px', border: `1px solid ${T.border}`,
        }}>
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
        </span>
      </header>

      {/* 메인 콘텐츠 */}
      <main>
        {activeTab === 'dashboard' && (
          <DashboardView students={students} reports={reports} onTabChange={setActiveTab} />
        )}
        {activeTab === 'students' && (
          <StudentsView
            students={students}
            reports={reports}
            onSave={handleSaveStudent}
            onDelete={handleDeleteStudent}
          />
        )}
        {activeTab === 'write' && (
          <DiagnosticReportInput
            students={students}
            teachers={teachers}
            onSaveStudent={handleSaveStudent}
            onSaveTeacher={handleSaveTeacher}
            onDeleteTeacher={handleDeleteTeacher}
            onSave={handleSaveReport}
          />
        )}
        {activeTab === 'history' && (
          <HistoryView reports={reports} onDelete={handleDeleteReport} />
        )}
        {activeTab === 'analysis' && (
          <AnalysisView students={students} reports={reports} />
        )}
      </main>

      {/* 하단 탭바 */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: T.bg, borderTop: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center',
        padding: '8px 0', zIndex: 100,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
      }}>
        {tabs.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '3px',
                padding: '6px 4px', border: 'none', background: 'none',
                color: active ? T.brand : T.textMute,
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              }}
            >
              {tab.icon}
              <span style={{ fontSize: '10px', fontWeight: active ? 700 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ============================================================
// 대시보드
// ============================================================
function DashboardView({ students, reports, onTabChange }) {
  const today = new Date().toLocaleDateString('ko-KR');
  const todayReports = reports.filter(r => {
    if (!r.createdAt?.seconds) return false;
    const d = new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR');
    return d === today;
  });

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>
        오늘의 현황
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="관리 학생" value={students.length} unit="명" />
        <StatCard label="오늘 리포트" value={todayReports.length} unit="건" />
      </div>

      <div style={{ background: '#fff', borderRadius: '16px', border: `1px solid #E5E7EB`, overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid #F3F4F6`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700 }}>오늘 학생 현황</h3>
          <button
            onClick={() => onTabChange('write')}
            style={{
              background: '#185FA5', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '6px 14px',
              fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            리포트 작성
          </button>
        </div>
        {students.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
            등록된 학생이 없습니다
          </div>
        ) : (
          students.map(s => {
            const done = todayReports.some(r => r.studentId === s.id);
            return (
              <div key={s.id} style={{
                padding: '14px 18px', display: 'flex', alignItems: 'center',
                gap: '12px', borderBottom: `1px solid #F9FAFB`,
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: done ? '#185FA5' : '#F3F4F6',
                  color: done ? '#fff' : '#9CA3AF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 700,
                }}>
                  {s.name?.[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{s.name}</p>
                  <p style={{ fontSize: '11px', color: '#6B7280', margin: 0, fontWeight: 500 }}>{s.school}</p>
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 700,
                  color: done ? '#185FA5' : '#D1D5DB',
                }}>
                  {done ? '완료 ✓' : '대기'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '14px', padding: '16px',
      border: `1px solid #E5E7EB`,
    }}>
      <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '28px', fontWeight: 700, color: '#185FA5', letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>{unit}</span>
      </div>
    </div>
  );
}

// ============================================================
// 학생 관리 (심플 버전 — 상세는 DiagnosticReportInput 모달 활용)
// ============================================================
function StudentsView({ students, reports, onSave, onDelete }) {
  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>
        학생 관리
      </h2>
      {students.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: '16px', border: `1px solid #E5E7EB`,
          padding: '60px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px',
        }}>
          리포트 작성 화면에서 학생을 추가하세요
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {students.map(s => {
            const sReports = reports.filter(r => r.studentId === s.id);
            return (
              <div key={s.id} style={{
                background: '#fff', borderRadius: '16px', padding: '16px 18px',
                border: `1px solid #E5E7EB`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: '#185FA5', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', fontWeight: 700,
                  }}>
                    {s.name?.[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{s.name}</p>
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>
                      {s.school} · 리포트 {sReports.length}건
                    </p>
                  </div>
                  <button
                    onClick={() => { if (confirm(`${s.name} 학생을 삭제하시겠습니까?`)) onDelete(s.id); }}
                    style={{
                      background: 'none', border: 'none', color: '#D1D5DB',
                      fontSize: '18px', cursor: 'pointer', padding: '4px',
                    }}
                  >
                    ×
                  </button>
                </div>
                {s.textbooks?.length > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {s.textbooks.map((t, i) => (
                      <span key={i} style={{
                        background: '#E6F1FB', color: '#185FA5',
                        fontSize: '11px', fontWeight: 600,
                        padding: '3px 8px', borderRadius: '6px',
                      }}>
                        {t.name}
                      </span>
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

// ============================================================
// 기록 보관소
// ============================================================
const RATING_EMOJI = { 5: '🌟', 4: '😊', 3: '🙂', 2: '😐', 1: '😟' };

function HistoryView({ reports, onDelete }) {
  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>기록 보관소</h2>
        <span style={{
          fontSize: '11px', color: '#6B7280', fontWeight: 600,
          background: '#fff', padding: '4px 10px', borderRadius: '8px', border: `1px solid #E5E7EB`,
        }}>
          총 {reports.length}건
        </span>
      </div>

      {reports.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: '16px', border: `1px solid #E5E7EB`,
          padding: '60px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px',
        }}>
          작성된 리포트가 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reports.map(r => {
            const date = r.createdAt?.seconds
              ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
              : '날짜 없음';
            return (
              <div key={r.id} style={{
                background: '#fff', borderRadius: '16px', padding: '16px 18px',
                border: `1px solid #E5E7EB`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{r.studentName}</p>
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>{date} · {r.teacherName}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '20px' }}>{RATING_EMOJI[r.homeworkRating] || ''}</span>
                    <button
                      onClick={() => { if (confirm('삭제하시겠습니까?')) onDelete(r.id); }}
                      style={{ background: 'none', border: 'none', color: '#D1D5DB', fontSize: '18px', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {r.textbook && (
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 4px', fontWeight: 500 }}>
                    {r.textbook} · {r.unit}
                  </p>
                )}
                {r.teacherNote && (
                  <p style={{
                    fontSize: '12px', color: '#1A1A1A', margin: 0,
                    lineHeight: 1.6, fontWeight: 500,
                    background: '#F9FAFB', padding: '8px 10px', borderRadius: '8px',
                  }}>
                    {r.teacherNote.length > 80 ? r.teacherNote.slice(0, 80) + '...' : r.teacherNote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 종합 분석 (기본 버전)
// ============================================================
function AnalysisView({ students, reports }) {
  const [selectedId, setSelectedId] = useState('');

  const studentReports = reports.filter(r => r.studentId === selectedId);
  const avgHomework = studentReports.length
    ? Math.round(studentReports.reduce((a, r) => a + (r.homeworkRating || 0), 0) / studentReports.length * 10) / 10
    : 0;
  const avgConcept = studentReports.length
    ? Math.round(studentReports.reduce((a, r) => a + (r.conceptRating || 0), 0) / studentReports.length * 10) / 10
    : 0;

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>
        종합 분석
      </h2>

      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: `1px solid #E5E7EB`, marginBottom: '16px' }}>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', fontSize: '14px', fontWeight: 500,
            border: `1px solid #E5E7EB`, borderRadius: '10px',
            background: '#F9FAFB', outline: 'none', fontFamily: 'inherit',
          }}
        >
          <option value="">학생을 선택하세요</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.school}</option>)}
        </select>
      </div>

      {selectedId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <StatCard label="총 리포트" value={studentReports.length} unit="건" />
            <StatCard label="과제 평균" value={avgHomework} unit="점" />
            <StatCard label="개념 평균" value={avgConcept} unit="점" />
          </div>

          <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: `1px solid #E5E7EB` }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>진단 태그 분포</h3>
            {(() => {
              const tagCount = {};
              studentReports.forEach(r => {
                (r.diagnosis || []).forEach(d => {
                  tagCount[d.key] = (tagCount[d.key] || 0) + 1;
                });
              });
              const tagLabels = {
                calc: '계산 실수', concept: '개념 누락',
                apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽',
              };
              const entries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
              return entries.length === 0
                ? <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center' }}>진단 데이터 없음</p>
                : entries.map(([key, count]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, width: '80px', flexShrink: 0 }}>{tagLabels[key]}</span>
                    <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', background: '#185FA5', borderRadius: '4px',
                        width: `${Math.min(100, count * 20)}%`,
                      }} />
                    </div>
                    <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, width: '20px', textAlign: 'right' }}>{count}</span>
                  </div>
                ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
