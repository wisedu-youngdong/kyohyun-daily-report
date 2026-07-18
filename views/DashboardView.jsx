import React from 'react';
import { kstDay, isReportSent } from '../growth.js';
import { T, C, RADIUS2 } from '../tokens.jsx';
import { AVATARS, StatCard } from './shared.jsx';

export default function DashboardView({ students, reports, classes = [], onTabChange, onWriteFor, reviews = [], onCompleteReview }) {
  // 발송 완료 판정 + 날짜 비교 — 리포트 탭 상태바/원장 보고서와 동일한 공용 기준(growth.js) 사용
  const todayKst = kstDay(Date.now() / 1000);
  const todayReports = reports.filter(r => r.createdAt?.seconds && isReportSent(r) && kstDay(r.createdAt.seconds) === todayKst);

  const [classFilter, setClassFilter] = React.useState('');
  // 삭제된 반을 가리키는 고아 classId는 미배정으로 취급 — HistoryView/groupByClassId와 동일 기준
  const classIds = new Set(classes.map(c => c.id));
  const filteredStudents = classFilter
    ? students.filter(s => {
        const cid = s.classId && classIds.has(s.classId) ? s.classId : null;
        return classFilter === '__unassigned__' ? !cid : cid === classFilter;
      })
    : students;

  const doneOf = (s) => todayReports.some(r => r.studentId === s.id);
  // 대기 학생을 먼저 — 할 일이 완료된 학생들 사이에 묻히지 않도록 (반 필터와 무관하게 항상 유지)
  const orderedStudents = [...filteredStudents].sort((a, b) =>
    (doneOf(a) === doneOf(b) ? (a.name || '').localeCompare(b.name || '') : (doneOf(a) ? 1 : -1))
  );
  // 상단 통계도 반 필터를 따라가야 함 — 목록은 필터링되는데 숫자만 학원 전체 기준이면 헷갈림
  const filteredTodayReports = classFilter ? todayReports.filter(r => filteredStudents.some(s => s.id === r.studentId)) : todayReports;
  const pendingCount = filteredStudents.length - filteredTodayReports.length;

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', boxSizing: 'border-box' }}>
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
              return (
                <div key={rv.id} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #F5D76E30' }}>
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
                  <button onClick={() => onCompleteReview?.(rv.id)}
                    style={{ flexShrink: 0, padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '8px', border: '1px solid #C9A227', background: '#fff', color: '#7A5200', cursor: 'pointer', fontFamily: 'inherit' }}>
                    완료
                  </button>
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
