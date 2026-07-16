import React, { useState } from 'react';
import { db } from '../firebase';
import { updateDoc, doc } from 'firebase/firestore';
import { FileText, AlertTriangle, Copy } from 'lucide-react';
import { kstDay, toPct, ratingLabel } from '../growth.js';
import { C } from '../tokens.jsx';
import { StudentProfileModal } from './StudentProfileModal.jsx';

export default function DirectorView({ reports, students, reportViews = [], onToast, academyId }) {
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
          onClose={() => setProfileStudent(null)}
          DIAG_MAP={DIAG_MAP}
          onToast={onToast}
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
          { label: '총 수업', value: `${todayReports.length}회`, color: C.primary },
          { label: '정시 출석', value: `${totalOnTime}명`, color: '#0F6E56' },
          { label: '결석', value: `${totalAbsent}명`, color: totalAbsent > 0 ? C.error : '#98A1AC' },
          { label: '리포트 미작성', value: `${Math.max(0, students.length - todayReports.length)}건`, color: students.length - todayReports.length > 0 ? C.warningText : '#98A1AC' },
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
            <FileText size={28} style={{ marginBottom: '8px' }} />
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

                  {/* 열람 배지 — draft(자동저장만 되고 아직 최종 저장 안 됨)는 열람 여부와
                      무관하게 "작성 중"으로 표시. 안 그러면 선생님이 쓰다 만 리포트가
                      "미열람"으로 잡혀 실제로는 보낸 적도 없는데 발송된 것처럼 보임 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
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
