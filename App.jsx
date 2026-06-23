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

const T = {
  brand: '#185FA5', brandLight: '#E6F1FB', brandBg: '#F0F7FC',
  text: '#1A1A1A', textSub: '#6B7280', textMute: '#9CA3AF',
  border: '#E5E7EB', bg: '#FFFFFF', bgSoft: '#F9FAFB',
};

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
        {activeTab === 'history' && <HistoryView reports={reports} onDelete={handleDeleteReport} />}
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
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#185FA5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700 }}>{s.name?.[0]}</div>
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

function HistoryView({ reports, onDelete }) {
  const [previewReport, setPreviewReport] = useState(null);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>기록 보관소</h2>
        <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, background: '#fff', padding: '4px 10px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>총 {reports.length}건</span>
      </div>

      {reports.length === 0
        ? <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E5E7EB', padding: '60px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>작성된 리포트가 없습니다</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reports.map(r => {
            const date = r.createdAt?.seconds
              ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
              : '날짜 없음';
            return (
              <div key={r.id} style={{ background: '#fff', borderRadius: '16px', padding: '16px 18px', border: '1px solid #E5E7EB', cursor: 'pointer' }}
                onClick={() => setPreviewReport(r)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{r.studentName}</p>
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
          onClose={() => setPreviewReport(null)}
          onDelete={(id) => { onDelete(id); setPreviewReport(null); }}
        />
      )}
    </div>
  );
}

function ReportPreviewModal({ report: r, onClose, onDelete }) {
  const date = r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '날짜 없음';
  const cardRef = React.useRef(null);
  const [downloading, setDownloading] = React.useState(false);

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
            <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>{date} · {r.teacherName} 선생님</p>
          </div>

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

function AnalysisView({ students, reports }) {
  const [selectedId, setSelectedId] = useState('');
  const studentReports = reports.filter(r => r.studentId === selectedId);
  const avg = (key) => studentReports.length ? Math.round(studentReports.reduce((a, r) => a + (r[key] || 0), 0) / studentReports.length * 10) / 10 : 0;

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <StatCard label="총 리포트" value={studentReports.length} unit="건" />
            <StatCard label="과제 평균" value={avg('homeworkRating')} unit="점" />
            <StatCard label="개념 평균" value={avg('conceptRating')} unit="점" />
          </div>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: `1px solid #E5E7EB` }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>진단 태그 분포</h3>
            {(() => {
              const tagCount = {};
              studentReports.forEach(r => (r.diagnosis || []).forEach(d => { tagCount[d.key] = (tagCount[d.key] || 0) + 1; }));
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
        </div>
      )}
    </div>
  );
}
