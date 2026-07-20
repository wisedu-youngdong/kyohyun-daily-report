import React from 'react';
import { kstDay, kstWeekday, isReportSent } from '../growth.js';
import { T, C, RADIUS2 } from '../tokens.jsx';
import { AVATARS, StatCard } from './shared.jsx';

export default function DashboardView({ students, reports, classes = [], onTabChange, onWriteFor, reviews = [], onCompleteReview, onQuickAbsence }) {
  const [markingAbsent, setMarkingAbsent] = React.useState(null); // studentId 처리 중
  const [confirmAbsenceStudent, setConfirmAbsenceStudent] = React.useState(null); // 결석 처리 확인 모달 대상
  // 복습 "완료" — 그냥 done 플래그만 남기면 나중에 "뭘 했었는지" 알 길이 없어서, 완료 처리 전에
  // 조치 메모(+선택적 재시험 점수)를 받는 인라인 폼으로 펼침. 학생 프로필의 "복습 이력"에서 다시 확인 가능.
  const [expandedReviewId, setExpandedReviewId] = React.useState(null);
  const [reviewNote, setReviewNote] = React.useState('');
  const [reviewScore, setReviewScore] = React.useState('');
  const [completingReview, setCompletingReview] = React.useState(null);

  const toggleReviewExpand = (rv) => {
    if (expandedReviewId === rv.id) { setExpandedReviewId(null); return; }
    setExpandedReviewId(rv.id);
    setReviewNote(''); setReviewScore('');
  };
  const handleSubmitReview = async (rv) => {
    setCompletingReview(rv.id);
    try {
      await onCompleteReview?.(rv.id, { note: reviewNote, testScore: reviewScore.trim() === '' ? null : Number(reviewScore) });
      setExpandedReviewId(null);
    } finally {
      setCompletingReview(null);
    }
  };

  // 발송 완료 판정 + 날짜 비교 — 리포트 탭 상태바/원장 보고서와 동일한 공용 기준(growth.js) 사용.
  // 결석 처리는 teacherNote 없이 출결만 채운 리포트라 isReportSent 기준으론 안 걸러지므로,
  // "오늘 결석으로 처리됨(초안 아님)"도 완료로 별도 인정 — 안 그러면 결석 처리해도 계속 "대기"로 남음
  const todayKst = kstDay(Date.now() / 1000);
  const isHandledToday = (r) => isReportSent(r) || (r.attendance === '결석' && r.isDraft !== true);
  const todayReports = reports.filter(r => r.createdAt?.seconds && isHandledToday(r) && kstDay(r.createdAt.seconds) === todayKst);
  const doneOf = (s) => todayReports.some(r => r.studentId === s.id);

  // 버튼 클릭 → 확인 모달만 띄움(오탭 방지). 실제 처리는 handleConfirmAbsence에서.
  const handleQuickAbsence = (e, student) => {
    e.stopPropagation(); // 행 클릭(리포트 작성 이동)으로 안 번지게
    setConfirmAbsenceStudent(student);
  };
  const handleConfirmAbsence = async () => {
    const student = confirmAbsenceStudent;
    if (!student || markingAbsent) return;
    setMarkingAbsent(student.id);
    setConfirmAbsenceStudent(null);
    try {
      await onQuickAbsence?.(student);
    } finally {
      setMarkingAbsent(null);
    }
  };

  const [classFilter, setClassFilter] = React.useState('');
  // 삭제된 반을 가리키는 고아 classId는 미배정으로 취급 — HistoryView/groupByClassId와 동일 기준
  const classIds = new Set(classes.map(c => c.id));
  // scheduleDays 미설정(레거시 학생 포함)이면 매일 대상 — 오늘 스케줄이 아니어도 이미 리포트가
  // 있으면(보강 등) 목록에서 사라지지 않고 "완료 ✓"로 그대로 보이게 doneOf도 함께 확인
  const todayDow = kstWeekday(Date.now() / 1000);
  const isScheduledToday = (s) => !s.scheduleDays || s.scheduleDays.length === 0 || s.scheduleDays.includes(todayDow);
  const filteredStudents = (classFilter
    ? students.filter(s => {
        const cid = s.classId && classIds.has(s.classId) ? s.classId : null;
        return classFilter === '__unassigned__' ? !cid : cid === classFilter;
      })
    : students
  ).filter(s => isScheduledToday(s) || doneOf(s));
  // 대기 학생을 먼저 — 할 일이 완료된 학생들 사이에 묻히지 않도록 (반 필터와 무관하게 항상 유지)
  const orderedStudents = [...filteredStudents].sort((a, b) =>
    (doneOf(a) === doneOf(b) ? (a.name || '').localeCompare(b.name || '') : (doneOf(a) ? 1 : -1))
  );
  // 상단 통계도 반 필터를 따라가야 함 — 목록은 필터링되는데 숫자만 학원 전체 기준이면 헷갈림
  const filteredTodayReports = classFilter ? todayReports.filter(r => filteredStudents.some(s => s.id === r.studentId)) : todayReports;
  const pendingCount = filteredStudents.length - filteredTodayReports.length;

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* 결석 처리 확인 모달 — 오탭 한 번으로 리포트 데이터가 생기는 걸 방지 */}
      {confirmAbsenceStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px', backdropFilter: 'blur(4px)' }}
          onClick={() => setConfirmAbsenceStudent(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FFF8EC', border: '2px solid #D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '22px', color: '#D97706', fontWeight: 700 }}>!</div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 6px' }}>{confirmAbsenceStudent.name} 학생을 오늘 결석 처리할까요?</p>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 20px', lineHeight: 1.6 }}>기록 보관소에서 나중에 수정할 수 있어요.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setConfirmAbsenceStudent(null)}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                취소
              </button>
              <button onClick={handleConfirmAbsence}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: 'none', background: '#D97706', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                결석 처리
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>오늘의 현황</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="오늘 미작성" value={Math.max(0, pendingCount)} unit="명" color={C.warning} />
        <StatCard label="오늘 발송" value={filteredTodayReports.length} unit="건" color={C.midGray} />
      </div>
      {/* 복습 알림 — 약점 태그가 있던 리포트는 7/14/30일 후 복습 일정이 자동 생성됨 */}
      {(() => {
        const dueReviews = reviews
          .filter(rv => rv.status !== 'done' && rv.dueDate && rv.dueDate <= todayKst)
          .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
        if (dueReviews.length === 0) return null;
        return (
          <div style={{ background: '#FFF8E7', borderRadius: '16px', border: '1px solid #F5D76E', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #F5D76E60' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#7A5200', margin: 0 }}>
                🔁 복습할 때가 됐어요 · {dueReviews.length}건
              </h3>
              <p style={{ fontSize: '11px', color: '#9A6800', margin: '2px 0 0' }}>이전에 약점으로 진단된 내용이에요</p>
            </div>
            {dueReviews.slice(0, 5).map(rv => {
              const overdueDays = Math.floor((new Date(todayKst) - new Date(rv.dueDate)) / 86400000);
              const expanded = expandedReviewId === rv.id;
              return (
                <div key={rv.id} style={{ padding: '10px 18px', borderBottom: '1px solid #F5D76E30' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>
                        {rv.studentName} <span style={{ fontSize: '10px', fontWeight: 600, color: '#9A6800' }}>{rv.round}차 복습</span>
                        {overdueDays > 0 && <span style={{ fontSize: '10px', fontWeight: 700, color: '#A32D2D', marginLeft: '5px' }}>{overdueDays}일 지남</span>}
                      </p>
                      <p style={{ fontSize: '11px', color: '#6B7280', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[rv.textbook, rv.unit].filter(Boolean).join(' · ')}
                        {rv.weakTypes?.length > 0 && ` — ${rv.weakTypes.map(w => w.label).join(', ')}`}
                      </p>
                    </div>
                    <button onClick={() => toggleReviewExpand(rv)}
                      style={{ flexShrink: 0, padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '8px', border: '1px solid #C9A227', background: expanded ? '#C9A227' : '#fff', color: expanded ? '#fff' : '#7A5200', cursor: 'pointer', fontFamily: 'inherit' }}>
                      완료
                    </button>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #F0D584', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                        placeholder="어떤 조치를 하셨나요? (예: 오답노트 다시 풀림, 재시험 통과)" rows={2}
                        style={{ width: '100%', padding: '7px 9px', fontSize: '12px', border: '1px solid #F0D584', borderRadius: '8px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: '#fff' }} />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input type="number" value={reviewScore} onChange={e => setReviewScore(e.target.value)} placeholder="재시험 점수 (선택)"
                          style={{ width: '140px', padding: '7px 9px', fontSize: '12px', border: '1px solid #F0D584', borderRadius: '8px', fontFamily: 'inherit', outline: 'none', background: '#fff' }} />
                        <button onClick={() => handleSubmitReview(rv)} disabled={completingReview === rv.id}
                          style={{ flex: 1, padding: '7px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', border: 'none', background: completingReview === rv.id ? '#E5E7EB' : '#C9A227', color: '#fff', cursor: completingReview === rv.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          {completingReview === rv.id ? '처리 중...' : '완료 처리'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {dueReviews.length > 5 && (
              <p style={{ padding: '8px 18px', fontSize: '11px', color: '#9A6800', margin: 0, textAlign: 'center' }}>
                외 {dueReviews.length - 5}건 더 있어요
              </p>
            )}
          </div>
        );
      })()}

      <div style={{ background: T.bg, borderRadius: '16px', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid #F3F4F6`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700 }}>오늘 학생 현황</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {classes.length > 0 && (
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, borderRadius: `${RADIUS2.input}px`, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontFamily: 'inherit', cursor: 'pointer' }}>
                <option value="">전체 반</option>
                <option value="__unassigned__">미배정</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button onClick={() => onTabChange('write')} style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: `${RADIUS2.input}px`, padding: '6px 14px', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>리포트 작성</button>
          </div>
        </div>
        {orderedStudents.length === 0
          ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ color: T.textSub, fontSize: '13px', margin: '0 0 12px' }}>{students.length === 0 ? '등록된 학생이 없습니다' : '해당 반에 학생이 없습니다'}</p>
              {students.length === 0 && (
                <button onClick={() => onTabChange('write')} style={{ background: C.primaryLight, color: C.primary, border: 'none', borderRadius: `${RADIUS2.input}px`, padding: '8px 16px', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                  + 첫 학생 등록하기
                </button>
              )}
            </div>
          )
          : orderedStudents.map(s => {
            const done = doneOf(s);
            const avatarUrl = AVATARS.find(a => a.key === s.avatar)?.url;
            return (
              <div key={s.id} onClick={() => onWriteFor?.(s, done)}
                style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${T.bgSoft}`, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden', background: done ? T.brand : '#F3F4F6', color: done ? '#fff' : T.textMute, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>
                  {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name?.[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{s.name}</p>
                  <p style={{ fontSize: '11px', color: T.textSub, margin: 0, fontWeight: 500 }}>{s.school}</p>
                </div>
                {/* 결석/공휴일 등으로 수업 자체가 없었던 학생 — 무거운 진단 리포트 폼 없이 출결만 원터치 기록 */}
                {!done && (
                  <button onClick={(e) => handleQuickAbsence(e, s)} disabled={markingAbsent === s.id}
                    style={{
                      fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: `${RADIUS2.pill}px`, flexShrink: 0,
                      border: '1px solid #E5E7EB', background: '#fff', color: T.textSub,
                      cursor: markingAbsent === s.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    }}>
                    {markingAbsent === s.id ? '처리 중' : '결석'}
                  </button>
                )}
                {/* 대기가 유일한 '할 일' 신호 — 완료보다 눈에 띄어야 함 */}
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: `${RADIUS2.pill}px`, flexShrink: 0,
                  color: done ? T.textMute : '#8A5A00', background: done ? 'transparent' : '#FFF8EC',
                }}>{done ? '완료 ✓' : '대기'}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
