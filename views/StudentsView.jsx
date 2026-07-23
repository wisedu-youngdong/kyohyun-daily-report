import React, { useState } from 'react';
import { Pencil, AlertTriangle } from 'lucide-react';
import { isNewStudent } from '../growth.js';
import { T, C } from '../tokens.jsx';
import { StudentModal } from './StudentModal.jsx';
import { AVATARS } from './shared.jsx';
import { StudentProfileModal, StudentProfileContent } from './StudentProfileModal.jsx';
import { useMediaQuery } from '../hooks.js';

export default function StudentsView({ students, reports, reviews = [], onSave, onDelete, onRestore, teachers = [], classes = [], currentTeacherId = null, isDirector = false, onToast, academyName = null }) {
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

  // PC(900px 이상)에서는 목록(왼쪽)+요약 패널(오른쪽) 마스터-디테일로 — 학생 여러 명을 계속
  // 클릭→모달 열기→닫기로 훑어보는 게 불편하다는 의견 반영. 모바일은 화면이 좁아 기존처럼
  // 목록 클릭 시 바로 전체 모달을 열게 둠(레이아웃 자체를 바꾸지 않음).
  const isWide = useMediaQuery('(min-width: 900px)');
  const [selectedId, setSelectedId] = useState(null);
  const selectedStudent = filtered.find(s => s.id === selectedId) || (isWide ? filtered[0] : null);

  const rosterList = filtered.length === 0
    ? (
      search
        ? (
          <div style={{ background: '#fff', borderRadius: '16px', border: `1px solid ${T.border}`, padding: '40px 20px', textAlign: 'center', color: T.textSub, fontSize: '13px' }}>
            "{search}"에 해당하는 학생이 없습니다
          </div>
        )
        : (
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
    )
    : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map(s => {
          const sReports = reports.filter(r => r.studentId === s.id);
          const assignedTeacher = teachers.find(t => t.id === s.assignedTeacherId);
          const daysSince = daysSinceLastReport(s.id);
          const isStale = !s.archived && (daysSince === null ? false : daysSince >= 14);
          const isNew = isNewStudent(s, sReports.length);
          const isSelected = isWide && !s.archived && selectedStudent?.id === s.id;
          return (
            <div key={s.id}
              style={{
                background: s.archived ? T.bgSoft : '#fff', borderRadius: '16px', padding: '16px 18px',
                border: isSelected ? `1.5px solid ${C.primary}` : isStale ? '1px solid #EF9F27' : `1px solid ${T.border}`,
                boxShadow: isSelected ? `0 2px 8px ${C.primary}20` : 'none',
                cursor: 'pointer', opacity: s.archived ? 0.85 : 1,
              }}
              onClick={() => isWide && !s.archived ? setSelectedId(s.id) : setProfileStudent(s)}>
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
    );

  const header = (
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
  );

  const searchAndFilter = (
    <>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="#6C7586" strokeWidth="1.5"/>
            <path d="M9.5 9.5L12 12" stroke="#6C7586" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="이름 또는 학교 검색"
            style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '16px', fontFamily: 'inherit', outline: 'none', background: '#fff' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6C7586', cursor: 'pointer', fontSize: '16px', lineHeight: 1, width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
          )}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '16px', fontFamily: 'inherit', background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none' }}>
          <option value="name">이름순</option>
          <option value="recent">최근 수업순</option>
          <option value="reports">리포트 많은순</option>
        </select>
      </div>

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
    </>
  );

  const modals = (
    <>
      {/* 학생 프로필 모달 — "자세히 보기"(PC) 또는 목록 클릭(모바일)으로 열림 */}
      {profileStudent && (
        <StudentProfileModal
          student={profileStudent}
          reports={reports.filter(r => r.studentId === profileStudent.id)}
          reviews={reviews.filter(rv => rv.studentId === profileStudent.id)}
          onClose={() => setProfileStudent(null)}
          onToast={onToast}
          academyName={academyName}
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
    </>
  );

  if (isWide) {
    // 목록을 빠르게 훑어보는 게 목적이라, 오른쪽 상세 내용이 아무리 길어도(출결 캘린더 등)
    // 왼쪽 목록이 스크롤에 같이 밀려나면 안 됨 — 2단 영역 자체를 뷰포트 높이로 고정하고
    // 왼쪽/오른쪽이 각자 안에서만 스크롤되게 함(검색·필터는 왼쪽 컬럼 상단에 고정).
    return (
      <div style={{ padding: '20px', maxWidth: '1040px', margin: '0 auto', boxSizing: 'border-box' }}>
        {modals}
        {header}
        {/* 193px = 이 그리드 위에 쌓인 것들의 높이(헤더 + 관리 서브탭 + 화면 제목/버튼 줄).
            학습기록(108)보다 큰 건 여기엔 서브탭 알약과 제목 줄이 더 있기 때문. 값이 실제보다
            작으면 뷰포트 밖으로 넘치므로, 상단 구조가 바뀌면 다시 잴 것 */}
        <div style={{ display: 'grid', gridTemplateColumns: '392px 1fr', gap: '20px', height: 'calc(100vh - 193px)', minHeight: '480px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {!showArchived && searchAndFilter}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '2px' }}>
              {rosterList}
            </div>
          </div>
          <div style={{ minHeight: 0, overflowY: 'auto', background: '#fff', borderRadius: '16px', border: `1px solid ${T.border}` }}>
            {selectedStudent
              ? (
                <StudentProfileContent
                  student={selectedStudent}
                  reports={reports.filter(r => r.studentId === selectedStudent.id)}
                  reviews={reviews.filter(rv => rv.studentId === selectedStudent.id)}
                  onToast={onToast}
                  academyName={academyName}
                />
              )
              : (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: T.textSub, fontSize: '13px' }}>
                  왼쪽에서 학생을 선택하면 상세 내용이 보여요
                </div>
              )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', boxSizing: 'border-box' }}>
      {modals}
      {header}
      {!showArchived && searchAndFilter}
      {rosterList}
    </div>
  );
}
