import React, { useState } from 'react';
import { db } from '../firebase';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { FileText, AlertTriangle, Copy, Bell, CalendarDays, MessageCircle } from 'lucide-react';
import { kstDay, toPct, ratingLabel } from '../growth.js';
import { C, R } from '../tokens.jsx';
import { StudentProfileModal } from './StudentProfileModal.jsx';
import { groupByClassId } from './shared.jsx';

export default function DirectorView({ reports, students, classes = [], reportViews = [], reportQuestions = [], reviews = [], onToast, academyId, academyName }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const dateInputRef = React.useRef(null);
  const [expandedId, setExpandedId] = useState(null);
  const [memos, setMemos] = useState({});
  const [savingMemo, setSavingMemo] = useState(null);
  const [profileStudent, setProfileStudent] = useState(null);
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [savingAnswer, setSavingAnswer] = useState(null);
  const [showAnswered, setShowAnswered] = useState(false);

  const handleAnswerSave = async (questionId, answerText) => {
    setSavingAnswer(questionId);
    try {
      await updateDoc(doc(db, 'academies', academyId, 'reportQuestions', questionId), {
        answerText, answeredAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('답변 저장 실패:', e);
      onToast?.('답변 저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
    setSavingAnswer(null);
  };

  const DIAG_MAP = {
    calc:    { label: '계산 실수', bg: '#A32D2D', prefix: '⚠' },
    concept: { label: '개념 누락', bg: '#A32D2D', prefix: '⚠' },
    apply:   { label: '응용 부족', bg: '#A32D2D', prefix: '⚠' },
    time:    { label: '시간 부족', bg: '#8A5A00', prefix: '△' },
    perfect: { label: '개념 완벽', bg: '#0F6E56', prefix: '✓' },
  };

  // 선택 날짜 리포트 필터 (KST 기준) — 원장 보고서는 발송 여부와 무관하게 해당 날짜의 모든 작성 활동을 보여줌
  const todayReports = reports.filter(r => r.createdAt?.seconds && kstDay(r.createdAt.seconds) === selectedDate);

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
    await updateDoc(doc(db, 'academies', academyId, 'reports', reportId), { directorMemo: memo });
    setSavingMemo(null);
  };

  const fmtDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", boxSizing: 'border-box' }}>

      {/* 학생 종합 프로필 모달 */}
      {profileStudent && (
        <StudentProfileModal
          student={profileStudent}
          reports={reports.filter(r => r.studentId === profileStudent.id)}
          reviews={reviews.filter(rv => rv.studentId === profileStudent.id)}
          onClose={() => setProfileStudent(null)}
          DIAG_MAP={DIAG_MAP}
          onToast={onToast}
          academyName={academyName}
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

        // 미제출 — 이번 주 리포트가 없는 학생 중, 스케줄 요일이 이번 주에 이미 한 번이라도
        // 지났는데도(오늘 포함) 리포트가 없는 경우만. 스케줄 미설정(레거시 포함)은 기존처럼 매일 대상 유지.
        // 화목토 학생이 월요일 아침이라 아직 이번 주 수업이 시작도 안 됐는데 미제출로 뜨는 걸 방지.
        const todayDow = now.getDay(); // 0=일...6=토, 위 weekStart 계산과 동일 기준
        const dowRank = (d) => (d + 6) % 7; // 월요일=0 기준으로 재정렬해 "이미 지난 요일인지" 비교
        const noReportStudents = students.filter(s => {
          if (weekStudentIds.includes(s.id)) return false;
          if (!s.scheduleDays || s.scheduleDays.length === 0) return true;
          return s.scheduleDays.some(d => dowRank(d) <= dowRank(todayDow));
        });

        return (
          <div style={{ background: '#F6F8FC', border: '1px solid #E6EBF4', borderLeft: '3px solid #0D2D6B', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#0D2D6B', margin: 0 }}>이번 주 현황 · {weekLabel}</p>
              <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                {weekStart.getMonth() + 1}/{weekStart.getDate()} 기준
              </span>
            </div>

            {/* 수치 3개 — 숫자가 주인공: 카드로 감싸지 않고 큰 숫자만 나란히 */}
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              {[
                { label: '리포트', value: `${weekReports.length}`, unit: '건' },
                { label: '출석률', value: `${attendRate}`, unit: '%', accent: true },
                { label: '미제출', value: `${noReportStudents.length}`, unit: '명', warn: noReportStudents.length > 0 },
              ].map((s, i) => (
                <div key={i}>
                  <p style={{ fontSize: '34px', fontWeight: 800, letterSpacing: '-0.03em', margin: 0, fontVariantNumeric: 'tabular-nums', color: s.warn ? '#B92C2C' : s.accent ? '#0D2D6B' : '#1A1A1A' }}>
                    {s.value}<span style={{ fontSize: '16px', fontWeight: 700 }}>{s.unit}</span>
                  </p>
                  <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '2px 0 0' }}>{s.label}</p>
                </div>
              ))}

              {/* 미제출 학생 알림 — 우측 정렬 배지 */}
              {noReportStudents.length > 0 && (
                <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '9px', background: '#FEF6F5', border: '1px solid #F7DCD8', borderRadius: '14px', padding: '9px 14px' }}>
                  <Bell size={16} style={{ color: '#B92C2C', flexShrink: 0 }} />
                  <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0, lineHeight: 1.4 }}>
                    리포트 미작성<br />
                    <span style={{ color: '#1A1A1A', fontSize: '13px', fontWeight: 700 }}>
                      {noReportStudents.map(s => s.name).join(', ')}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 답변 대기 중인 질문 — 날짜 선택과 무관하게 전체 학원의 미답변 질문을 한 번에 모아봄.
          아래 날짜별 카드는 선택한 날짜 리포트에만 질문이 보이는데, 질문은 어떤 날짜의
          리포트에도 달릴 수 있어서 날짜를 안 옮겨도 놓치지 않게 여기 따로 둠 */}
      {(() => {
        const pending = reportQuestions
          .filter(q => !q.answerText)
          .sort((a, b) => (b.askedAt?.seconds || 0) - (a.askedAt?.seconds || 0));
        if (pending.length === 0) return null;
        return (
          <div style={{ background: '#F5F8FF', border: '1px solid #C5D5F0', borderRadius: '14px', padding: '16px 18px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <MessageCircle size={16} style={{ color: '#1A5CB8' }} />
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>답변 대기 중인 질문 · {pending.length}건</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pending.map(q => {
                // 질문은 "질문한 날짜"가 아니라 "어느 리포트에 대한 질문인지"가 중요 —
                // 질문한 날짜와 리포트 날짜가 다른 경우가 많아서(리포트 받고 며칠 뒤에 질문하는 경우 등)
                // 원본 리포트를 찾아 그 날짜/내용을 같이 보여주고, 클릭하면 그 날짜로 바로 이동
                const sourceReport = reports.find(r => r.id === q.reportId);
                const reportDateStr = sourceReport?.createdAt?.seconds ? kstDay(sourceReport.createdAt.seconds) : null;
                const reportLabel = sourceReport
                  ? `${new Date(reportDateStr).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 리포트${sourceReport.unit ? ` · ${sourceReport.unit}` : (sourceReport.textbook ? ` · ${sourceReport.textbook}` : '')}`
                  : '원본 리포트를 찾을 수 없음';
                return (
                <div key={q.id} style={{ background: '#fff', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                    <p style={{ fontSize: '11px', color: '#98A1AC', margin: 0 }}>
                      {q.studentName} · {reportLabel}
                    </p>
                    {reportDateStr && (
                      <button onClick={() => setSelectedDate(reportDateStr)}
                        style={{ background: 'none', border: 'none', color: '#1A5CB8', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, textDecoration: 'underline' }}>
                        그 날짜로 이동
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: '#1A1A1A', margin: '0 0 8px', lineHeight: 1.6 }}>{q.questionText}</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <textarea
                      value={answerDrafts[q.id] ?? ''}
                      onChange={e => setAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="답변을 입력해주세요" rows={2}
                      style={{ flex: 1, padding: '8px 10px', fontSize: '16px', border: '0.5px solid #E8E6E0', borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }}
                    />
                    <button
                      onClick={() => handleAnswerSave(q.id, answerDrafts[q.id] || '')}
                      disabled={savingAnswer === q.id || !(answerDrafts[q.id] || '').trim()}
                      style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, background: savingAnswer === q.id ? '#E5E7EB' : '#0D2D6B', color: savingAnswer === q.id ? '#9CA3AF' : '#fff', border: 'none', borderRadius: '8px', cursor: savingAnswer === q.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                      {savingAnswer === q.id ? '저장 중' : '답변 저장'}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 답변 완료 — 기본은 접어둠(계속 쌓이는 목록이라 화면 차지 안 하게), 눌러야 펼쳐짐 */}
      {(() => {
        const answered = reportQuestions
          .filter(q => q.answerText)
          .sort((a, b) => (b.answeredAt?.seconds || 0) - (a.answeredAt?.seconds || 0));
        if (answered.length === 0) return null;
        return (
          <div style={{ border: '1px solid #E8E6E0', borderRadius: '14px', marginBottom: '20px', overflow: 'hidden' }}>
            <button onClick={() => setShowAnswered(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 18px', background: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <MessageCircle size={15} style={{ color: '#0F6E56', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>답변 완료 · {answered.length}건</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#9CA3AF' }}>{showAnswered ? '접기' : '펼치기'}</span>
            </button>
            {showAnswered && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 18px 16px' }}>
                {answered.map(q => {
                  const sourceReport = reports.find(r => r.id === q.reportId);
                  const reportLabel = sourceReport?.createdAt?.seconds
                    ? `${new Date(kstDay(sourceReport.createdAt.seconds)).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 리포트`
                    : '원본 리포트를 찾을 수 없음';
                  return (
                    <div key={q.id} style={{ background: '#FAFAFA', border: '0.5px solid #E8E6E0', borderRadius: '8px', padding: '10px 12px' }}>
                      <p style={{ fontSize: '11px', color: '#98A1AC', margin: '0 0 4px' }}>{q.studentName} · {reportLabel}</p>
                      <p style={{ fontSize: '12px', color: '#1A1A1A', margin: '0 0 6px', fontWeight: 600, lineHeight: 1.6 }}>Q. {q.questionText}</p>
                      <div style={{ borderLeft: '2px solid #0F6E56', paddingLeft: '10px' }}>
                        <p style={{ fontSize: '12px', color: '#5A6472', margin: 0, lineHeight: 1.6 }}>A. {q.answerText}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '11px', color: '#B0B5BD', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px' }}>학부모 공유</p>
          <p style={{ fontFamily: R.serif, fontSize: '22px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.01em', margin: 0 }}>원장님 데일리 보고서</p>
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#374151', borderBottom: '1.5px solid #1A1A1A', paddingBottom: '3px', cursor: 'pointer' }}>
            {/* 네이티브 달력 아이콘은 확대해도 안에 그림이 안 커져서 휑해 보임 — 아예 숨기고
                lucide 아이콘으로 대체. 아이콘 클릭 시 showPicker()로 같은 달력을 띄움. */}
            <style>{`.dv-date-input::-webkit-calendar-picker-indicator { display: none; }`}</style>
            <input ref={dateInputRef} type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="dv-date-input"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '16px', fontFamily: 'inherit', color: 'inherit', fontWeight: 700, cursor: 'pointer', width: '105px' }}
            />
            <CalendarDays size={20} strokeWidth={2}
              onClick={() => dateInputRef.current?.showPicker ? dateInputRef.current.showPicker() : dateInputRef.current?.focus()}
              style={{ color: '#0D2D6B', cursor: 'pointer', flexShrink: 0 }} />
          </label>
          <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '6px 0 0', textAlign: 'right' }}>
            날짜를 클릭하면 다른 날짜의 보고서를 볼 수 있어요
          </p>
        </div>
      </div>

      <p style={{ fontSize: '16px', fontWeight: 700, color: '#5A6472', margin: '0 0 14px' }}>{fmtDate(selectedDate)}</p>

      {/* 핵심 지표 — 0은 옅게, 미작성 건수만 경고색으로 눈에 띄게 */}
      <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', background: '#FAFBFC', border: '1px solid #EEF0F3', borderRadius: '14px', padding: '16px 18px', marginBottom: '20px' }}>
        {[
          { label: '총 수업', num: todayReports.length, unit: '회' },
          { label: '정시 출석', num: totalOnTime, unit: '명' },
          { label: '결석', num: totalAbsent, unit: '명' },
          { label: '리포트 미작성', num: Math.max(0, students.length - todayReports.length), unit: '건', warnIfNonZero: true },
        ].map((item, i) => {
          const isZero = item.num === 0;
          const color = item.warnIfNonZero && !isZero ? C.warningText : isZero ? '#D4D7DD' : '#1A1A1A';
          return (
            <div key={i}>
              <span style={{ fontSize: '22px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{item.num}</span>
              <span style={{ fontSize: '12px', color: '#9CA3AF', marginLeft: '5px' }}>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* 학생 카드 목록 — PC에선 2열 그리드, 펼친 카드는 전체 폭 사용. 반이 있으면 반별 소제목으로 묶음 */}
      {(() => {
        const classGroups = classes.length > 0 ? groupByClassId(todayReports, r => r.studentId, students, classes) : null;
        const cardItems = classGroups
          ? classGroups.flatMap(g => [
              { type: 'header', key: `h-${g.classId || 'unassigned'}`, label: g.className, count: g.items.length },
              ...g.items.map(r => ({ type: 'card', key: r.id, report: r })),
            ])
          : todayReports.map(r => ({ type: 'card', key: r.id, report: r }));
        return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '8px', marginBottom: '14px', alignItems: 'start' }}>
        {todayReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF', background: '#fff', borderRadius: '10px', border: '0.5px solid #E8E6E0', gridColumn: '1 / -1' }}>
            <FileText size={28} style={{ marginBottom: '8px' }} />
            <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>이 날짜의 리포트가 없습니다</p>
            <p style={{ fontSize: '12px', margin: 0 }}>다른 날짜를 선택해보세요</p>
          </div>
        ) : cardItems.map(item => {
          if (item.type === 'header') {
            return (
              <p key={item.key} style={{ gridColumn: '1 / -1', fontSize: '13px', fontWeight: 700, color: '#5A6472', margin: '10px 0 2px', paddingTop: '4px', borderTop: '1px solid #EEF0F3' }}>
                {item.label} <span style={{ color: '#9CA3AF', fontWeight: 500 }}>· {item.count}건</span>
              </p>
            );
          }
          const r = item.report;
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

          // 학부모 질문 — reportViews와 동일하게 이미 메모리에 있는 목록을 reportId로 필터링(추가 조회 없음)
          const questions = reportQuestions.filter(q => q.reportId === r.id);
          const unansweredCount = questions.filter(q => !q.answerText).length;

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

                  {/* 열람 배지 — draft(자동저장만 되고 아직 최종 저장 안 됨)는 열람 여부와
                      무관하게 "작성 중"으로 표시. 안 그러면 선생님이 쓰다 만 리포트가
                      "미열람"으로 잡혀 실제로는 보낸 적도 없는데 발송된 것처럼 보임 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexShrink: 0 }}>
                    {unansweredCount > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#1A5CB8', background: '#EAF0F9', padding: '2px 8px', borderRadius: '10px' }}>질문 {unansweredCount}건</span>
                    )}
                    {r.isDraft ? (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: C.warningText, background: C.warningBg, padding: '2px 8px', borderRadius: '10px' }}>작성 중</span>
                    ) : isViewed ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: C.successDark, background: C.successBg, padding: '2px 8px', borderRadius: '10px' }}>✓ 열람완료</span>
                        <span style={{ fontSize: '9px', color: '#98A1AC', marginTop: '2px' }}>{viewSrc} · {lastViewTime}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: C.warningText, background: C.warningBg, padding: '2px 8px', borderRadius: '10px' }}>미열람</span>
                    )}
                  </div>
                </div>

                {/* 2행: 교재+단원 · 점수 — 항상 한 줄, 넘치면 말줄임(줄바꿈 안 함) */}
                <p style={{ fontSize: '12px', color: '#1A1A1A', margin: '0 0 6px', paddingLeft: '36px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.textbook && <span style={{ fontWeight: 600 }}>{r.textbook}{r.unit ? ` · ${r.unit}` : ''}{r.pages ? ` ${r.pages}` : ''}</span>}
                  <span style={{ color: '#5A6472' }}>
                    {r.textbook ? ' · ' : ''}과제 {toPct(r.homeworkRating)}% · 개념 {toPct(r.conceptRating)}%
                    {r.hasTest && r.testScore ? ` · 시험 ${r.testScore}점` : ''}
                  </span>
                </p>

                {/* 3행: 진단태그(있으면) + 버튼 — 태그 유무와 무관하게 항상 이 줄 하나만 차지해서 카드 높이가 통일됨 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingLeft: '36px' }}>
                  {mainDiag && DIAG_MAP[mainDiag.key] ? (
                    <span style={{ background: DIAG_MAP[mainDiag.key].bg, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                      {DIAG_MAP[mainDiag.key].prefix} {DIAG_MAP[mainDiag.key].label}
                    </span>
                  ) : <span />}

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

                  {/* 학부모 질문 */}
                  {questions.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 5px', letterSpacing: '0.08em' }}>학부모 질문 · {questions.length}건</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {questions.map(q => (
                          <div key={q.id} style={{ background: '#FAFAFA', border: '0.5px solid #E8E6E0', borderRadius: '8px', padding: '10px 12px' }}>
                            <p style={{ fontSize: '12px', color: '#1A1A1A', margin: '0 0 8px', lineHeight: 1.6 }}>{q.questionText}</p>
                            {q.answerText ? (
                              <div style={{ borderLeft: '2px solid #0F6E56', paddingLeft: '10px' }}>
                                <p style={{ fontSize: '12px', color: '#5A6472', margin: 0, lineHeight: 1.6 }}>{q.answerText}</p>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <textarea
                                  value={answerDrafts[q.id] ?? ''}
                                  onChange={e => setAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                                  placeholder="답변을 입력해주세요"
                                  rows={2}
                                  style={{ flex: 1, padding: '8px 10px', fontSize: '16px', border: '0.5px solid #E8E6E0', borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }}
                                />
                                <button
                                  onClick={() => handleAnswerSave(q.id, answerDrafts[q.id] || '')}
                                  disabled={savingAnswer === q.id || !(answerDrafts[q.id] || '').trim()}
                                  style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, background: savingAnswer === q.id ? '#E5E7EB' : '#0D2D6B', color: savingAnswer === q.id ? '#9CA3AF' : '#fff', border: 'none', borderRadius: '8px', cursor: savingAnswer === q.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                                  {savingAnswer === q.id ? '저장 중' : '답변 저장'}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 링크 복사 — 미리보기 카드. draft는 선생님이 아직 최종 저장을 안 한
                      상태라 여기서 복사해 보내면 미완성 리포트가 학부모에게 나갈 수 있어
                      미리보기/복사 버튼 자체를 막음 */}
                  {r.isDraft ? (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid #E8E6E0' }}>
                      <div style={{ background: C.warningBg, borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <AlertTriangle size={13} style={{ color: C.warningText, flexShrink: 0 }} />
                        <p style={{ fontSize: '11px', color: C.warningText, margin: 0, fontWeight: 600 }}>
                          아직 작성 중인 리포트예요. 선생님이 최종 저장을 완료해야 학부모에게 보낼 수 있습니다.
                        </p>
                      </div>
                    </div>
                  ) : (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid #E8E6E0' }}>
                    <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 7px', letterSpacing: '0.08em' }}>학부모 전송 미리보기</p>
                    {/* 미리보기 카드 */}
                    <div style={{ background: '#F5F8FF', border: '1px solid #C5D5F0', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
                      <p style={{ fontSize: '11px', color: '#1A5CB8', fontWeight: 700, margin: '0 0 6px' }}>📋 {academyName || '데일리 리포트'} 수업 리포트</p>
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
                          `📋 ${academyName || '데일리 리포트'} 수업 리포트`,
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
                          onToast?.('링크 복사됐어요! 카톡에 붙여넣기 하세요.')
                        );
                      }}
                      style={{
                        width: '100%', padding: '10px 14px', fontSize: '12px', fontWeight: 700,
                        background: '#0D2D6B', border: 'none', color: '#fff',
                        borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                      }}>
                      <Copy size={13} /> 위 내용 카톡으로 복사하기
                    </button>
                  </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
        );
      })()}

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
