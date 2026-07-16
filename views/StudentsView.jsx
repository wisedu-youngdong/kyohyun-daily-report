import React, { useState } from 'react';
import { Pencil, AlertTriangle } from 'lucide-react';
import { isNewStudent } from '../growth.js';
import { formatPhone, isValidPhone } from '../phone.js';
import { T, C } from '../tokens.jsx';
import { StudentModal } from '../DiagnosticReportInput';
import { AVATARS, PRESET_SKINS } from './shared.jsx';
import { StudentProfileModal } from './StudentProfileModal.jsx';

export default function StudentsView({ students, reports, onSave, onDelete, onRestore, teachers = [], currentTeacherId = null, isDirector = false, onToast }) {
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [profileStudent, setProfileStudent] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [teacherFilter, setTeacherFilter] = useState('all'); // 'all' | 'unassigned' | teacherId
  const [deleteConfirm, setDeleteConfirm] = useState(null); // studentId
  const deleteTimerRef = React.useRef(null);
  // A의 ×를 누른 뒤 3초 안에 B의 ×를 누르면 A의 타이머가 B의 확인 상태를 꺼버리던 문제
  const askDeleteConfirm = (id) => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    setDeleteConfirm(id);
    deleteTimerRef.current = setTimeout(() => setDeleteConfirm(null), 3000);
  };

  const DIAG_MAP = {
    calc:    { label: '계산 실수', bg: '#A32D2D', prefix: '⚠' },
    concept: { label: '개념 누락', bg: '#A32D2D', prefix: '⚠' },
    apply:   { label: '응용 부족', bg: '#A32D2D', prefix: '⚠' },
    time:    { label: '시간 부족', bg: '#8A5A00', prefix: '△' },
    perfect: { label: '개념 완벽', bg: '#0F6E56', prefix: '✓' },
  };

  const archivedCount = students.filter(s => s.archived).length;

  // 마지막 리포트 기준 경과일 — "2주째 리포트 없음" 신호에 사용
  const daysSinceLastReport = (sid) => {
    const last = reports.filter(r => r.studentId === sid).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
    if (!last?.createdAt?.seconds) return null;
    return Math.floor((Date.now() - last.createdAt.seconds * 1000) / 86400000);
  };

  // 검색 + 정렬 — 보관된 학생은 "보관함 보기"를 켰을 때만
  const filtered = students
    .filter(s => showArchived ? s.archived : !s.archived)
    .filter(s => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return s.name?.toLowerCase().includes(q) || s.school?.toLowerCase().includes(q);
    })
    .filter(s => {
      if (teacherFilter === 'all') return true;
      if (teacherFilter === 'unassigned') return !s.assignedTeacherId;
      return s.assignedTeacherId === teacherFilter;
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
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', boxSizing: 'border-box' }}>

      {/* 학생 프로필 모달 */}
      {profileStudent && (
        <StudentProfileModal
          student={profileStudent}
          reports={reports.filter(r => r.studentId === profileStudent.id)}
          onClose={() => setProfileStudent(null)}
          DIAG_MAP={DIAG_MAP}
          onToast={onToast}
        />
      )}

      {/* 학생 등록 모달 — 리포트 작성 화면과 동일한 컴포넌트 재사용 */}
      {showAddStudent && (
        <StudentModal
          teachers={teachers}
          isDirector={isDirector}
          onClose={() => setShowAddStudent(false)}
          onSubmit={async (newStudent) => {
            const assignedTeacherId = newStudent.assignedTeacherId || (isDirector ? '' : currentTeacherId || '');
            await onSave({ ...newStudent, assignedTeacherId });
            setShowAddStudent(false);
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '8px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          {showArchived ? '보관된 학생' : '학생 관리'}
        </h2>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {archivedCount > 0 && (
            <button onClick={() => { setShowArchived(v => !v); setSearch(''); }}
              style={{ background: showArchived ? C.infoBg : '#fff', color: showArchived ? C.infoDark : T.textSub, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {showArchived ? '← 현재 학생' : `보관함 ${archivedCount}`}
            </button>
          )}
          {!showArchived && (
            <button onClick={() => setShowAddStudent(true)}
              style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: '9px', padding: '8px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              + 학생 추가
            </button>
          )}
        </div>
      </div>

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

      {/* 강사별 필터 — 원장만, 강사 등록돼 있을 때만 */}
      {isDirector && teachers.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[{ id: 'all', name: '전체' }, { id: 'unassigned', name: '미배정' }, ...teachers].map(t => (
            <button key={t.id} onClick={() => setTeacherFilter(t.id)}
              style={{
                flexShrink: 0, padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
                border: teacherFilter === t.id ? `1.5px solid ${C.info}` : '1px solid #E5E7EB',
                background: teacherFilter === t.id ? C.infoBg : '#fff',
                color: teacherFilter === t.id ? C.infoDark : '#6B7280',
              }}>{t.name}</button>
          ))}
        </div>
      )}

      {/* 검색 결과 없음 — 검색어가 있을 때만. 학생 0명 상태의 빈 화면과 겹치지 않도록 */}
      {search && filtered.length === 0 && (
        <div style={{ background: '#fff', borderRadius: '16px', border: `1px solid ${T.border}`, padding: '40px 20px', textAlign: 'center', color: T.textSub, fontSize: '13px' }}>
          "{search}"에 해당하는 학생이 없습니다
        </div>
      )}

      {!search && filtered.length === 0
        ? (
          <div style={{ background: '#fff', borderRadius: '16px', border: `1px solid ${T.border}`, padding: '60px 20px', textAlign: 'center' }}>
            <p style={{ color: T.textSub, fontSize: '13px', margin: '0 0 12px' }}>
              {showArchived ? '보관된 학생이 없습니다' : '등록된 학생이 없습니다'}
            </p>
            {!showArchived && (
              <button onClick={() => setShowAddStudent(true)}
                style={{ background: C.primaryLight, color: C.primary, border: 'none', borderRadius: '9px', padding: '9px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                + 첫 학생 등록하기
              </button>
            )}
          </div>
        )
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(s => {
            const sReports = reports.filter(r => r.studentId === s.id);
            const assignedTeacher = teachers.find(t => t.id === s.assignedTeacherId);
            const daysSince = daysSinceLastReport(s.id);
            const isStale = !s.archived && (daysSince === null ? false : daysSince >= 14);
            const isNew = isNewStudent(s, sReports.length);
            return (
              <div key={s.id} style={{ background: s.archived ? T.bgSoft : '#fff', borderRadius: '16px', padding: '16px 18px', border: isStale ? '1px solid #EF9F27' : `1px solid ${T.border}`, cursor: 'pointer', opacity: s.archived ? 0.85 : 1 }}
                onClick={() => setProfileStudent(s)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: C.primaryLight, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.avatar
                      ? <img src={AVATARS.find(a => a.key === s.avatar)?.url} alt="avatar" style={{ width: '44px', height: '44px', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '18px', fontWeight: 700, color: C.primary }}>{s.name?.[0]}</span>
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{s.name}</p>
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>{s.school} · 리포트 {sReports.length}건</p>
                  </div>
                  {assignedTeacher ? (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#0F6E56', background: '#E1F5EE', padding: '3px 8px', borderRadius: '6px', flexShrink: 0 }}>
                      {assignedTeacher.name}
                    </span>
                  ) : !s.archived && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#8A5A00', background: '#FFF8EC', padding: '3px 8px', borderRadius: '6px', flexShrink: 0 }}>
                      미배정
                    </span>
                  )}
                  {s.archived ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRestore?.(s.id); }}
                      style={{ background: C.primaryLight, border: 'none', color: C.primary, fontSize: '12px', fontWeight: 700, padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      ↩ 복원
                    </button>
                  ) : (<>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingStudent(s); }}
                    style={{ background: C.primaryLight, border: 'none', color: C.primary, fontSize: '12px', fontWeight: 700, padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', marginRight: '6px', fontFamily: 'inherit', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Pencil size={11} /> 수정
                  </button>
                  {deleteConfirm === s.id ? (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { onDelete(s.id); setDeleteConfirm(null); }}
                        style={{ background: '#8A5A00', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '10px 12px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        보관 확인
                      </button>
                      <button onClick={() => setDeleteConfirm(null)}
                        style={{ background: '#F3F4F6', border: 'none', color: '#6B7280', fontSize: '11px', fontWeight: 600, padding: '10px 12px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        취소
                      </button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); askDeleteConfirm(s.id); }}
                      title="목록에서 숨기기 (기록은 보관됨)"
                      style={{ background: 'none', border: 'none', color: T.textMute, fontSize: '18px', cursor: 'pointer', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>×</button>
                  )}
                  </>)}
                </div>
                {(isNew || isStale || s.textbooks?.length > 0) && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {isNew && !s.archived && (
                      <span style={{ background: C.primaryLight, color: C.primary, fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px' }}>신규생</span>
                    )}
                    {isStale && (
                      <span style={{ background: C.warningBg, color: C.warningText, fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <AlertTriangle size={10} /> {daysSince >= 21 ? `${Math.floor(daysSince / 7)}주째` : '2주째'} 리포트 없음
                      </span>
                    )}
                    {s.textbooks?.map((t, i) => <span key={i} style={{ background: C.primaryLight, color: C.primary, fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px' }}>{t.name}</span>)}
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

// ── 학생 정보 수정 모달 — StudentsView에서만 씀
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
  // studentType이 없던 시절 학생은 빈 값으로 둠 — 'returning'으로 기본값을 주면 다른 항목만
  // 수정해도 재학생으로 확정돼, GrowthStory의 리포트 수 기반 자동 판정 폴백이 영구히 꺼짐
  const [studentType, setStudentType] = useState(student.studentType || '');
  const [saving, setSaving] = useState(false);

  const phoneOk = isValidPhone(parentPhone);
  // 등록 모달과 동일하게 교재를 필수로 — 등록 때 필수였던 교재가 수정 한 번에 사라지던 문제 방지
  const isValid = name.trim() && school.trim() && textbooks.some(t => t.name.trim()) && phoneOk;

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
      // 미선택(레거시 학생)이면 필드를 아예 보내지 않아 자동 판정 폴백을 유지
      ...(studentType ? { studentType } : {}),
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
                { key: 'new', label: '신규생' },
                { key: 'returning', label: '재학생' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setStudentType(key)}
                  style={{
                    flex: 1, padding: '9px', border: 'none', cursor: 'pointer',
                    background: studentType === key ? C.info : '#fff',
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
              {/* placeholder 필수 — guessCourseKey가 이 문자열에서 학년/학교급을 파싱해
                  단원 추천을 만들기 때문에, 형식이 깨지면 추천이 조용히 죽음 */}
              <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="예: 교현초 5학년" style={inputStyle} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={labelStyle}>교재 *</label>
              <button onClick={addTextbook} style={{ background: C.primaryLight, color: C.primary, border: 'none', borderRadius: '5px', padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>+ 추가</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {textbooks.map((t, idx) => (
                <div key={t.id} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <div style={{ background: C.primaryLight, color: C.primary, width: '22px', height: '22px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{idx + 1}</div>
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
            <input type="tel" value={parentPhone} onChange={(e) => setParentPhone(formatPhone(e.target.value))} placeholder="010-0000-0000"
              style={{ ...inputStyle, borderColor: phoneOk ? '#E5E7EB' : C.errorDark }} />
            {!phoneOk && <p style={{ fontSize: '11px', color: C.errorDark, margin: '4px 0 0' }}>휴대폰 번호 형식이 올바르지 않습니다 (예: 010-1234-5678)</p>}
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
                    border: avatar === av.key ? `2.5px solid ${C.info}` : '2px solid #E5E7EB',
                    borderRadius: '12px', padding: '8px 6px',
                    cursor: 'pointer', textAlign: 'center',
                    background: avatar === av.key ? C.infoBg : '#F9FAFB',
                    transition: 'all 0.15s',
                  }}
                >
                  <img src={av.url} alt={av.label} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '4px' }} />
                  <p style={{ fontSize: '10px', fontWeight: 600, color: avatar === av.key ? C.infoDark : '#6B7280', margin: 0, lineHeight: 1.3 }}>{av.label}</p>
                  {avatar === av.key && (
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: C.info, margin: '4px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  style={{ width: '36px', height: '20px', borderRadius: '20px', background: useCustomSkin ? C.info : '#D1D5DB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
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
                      style={{ borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: skinColor === sk.main ? `2.5px solid ${C.info}` : '2px solid #E5E7EB' }}>
                      <div style={{ height: '24px', background: sk.main }}></div>
                      <div style={{ padding: '3px', background: '#F9FAFB', textAlign: 'center' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: skinColor === sk.main ? C.infoDark : '#6B7280' }}>{sk.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* 커스텀 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F9FAFB', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ position: 'relative', width: '36px', height: '36px', borderRadius: '10px', background: skinColor || C.primary, border: '2px solid rgba(0,0,0,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                    <input type="color" value={skinColor || C.primary} onChange={(e) => setSkinColor(e.target.value)}
                      style={{ position: 'absolute', inset: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', border: 'none', cursor: 'pointer', opacity: 0 }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>직접 색상 선택</p>
                    <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '1px 0 0', fontFamily: 'monospace' }}>{skinColor || C.primary}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 버튼 */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px', justifyContent: 'center', background: '#F9FAFB', borderRadius: '0 0 18px 18px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '9px', border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer' }}>취소</button>
          <button onClick={handleSubmit} disabled={!isValid || saving} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '9px', border: 'none', background: isValid ? C.primary : '#E5E7EB', color: '#fff', cursor: isValid ? 'pointer' : 'not-allowed' }}>
            {saving ? '저장 중...' : '✓ 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
