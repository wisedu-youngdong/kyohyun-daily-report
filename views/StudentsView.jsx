import React, { useState } from 'react';
import { Pencil, AlertTriangle } from 'lucide-react';
import { isNewStudent } from '../growth.js';
import { T, C } from '../tokens.jsx';
import { StudentModal } from './StudentModal.jsx';
import { AVATARS } from './shared.jsx';
import { StudentProfileModal } from './StudentProfileModal.jsx';

export default function StudentsView({ students, reports, onSave, onDelete, onRestore, teachers = [], classes = [], currentTeacherId = null, isDirector = false, onToast }) {
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
          classes={classes}
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
        <StudentModal
          student={editingStudent}
          teachers={teachers}
          classes={classes}
          isDirector={isDirector}
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

