import { useState } from 'react';
import { getKstWeekRange } from '../growth.js';
import { DIAG_LABELS, DIAG_SOFT } from '../diagnosis.js';
import { T, C, RADIUS2 } from '../tokens.jsx';

// 주간형(reportType:'weekly') 리포트 전용 — 강사가 수업마다 남긴 세션 메모를 원장이 모아서
// 한 주에 한 번 검토·다듬어 발송하는 화면. 원장 전용(App.jsx의 insight 탭이 이미 director로
// 스코프됨), 주간형 학생이 하나도 없으면 App.jsx가 이 탭 자체를 숨김.

const MAX_PHOTOS_WEEKLY_SEND = 10; // 세션당 캡(DiagnosticReportInput.jsx의 MAX_PHOTOS=5)과는 별개 —
// 한 주 여러 세션 사진을 모아 보내는 용도라 더 넉넉하게 잡음

// 월요일=0 기준으로 재정렬해 "이미 지난 요일인지" 비교 — DirectorView.jsx의 기존 판정과 동일 패턴
function dowRank(d) { return (d + 6) % 7; }
// 세션 날짜 문자열('YYYY-MM-DD', KST)의 요일(0=일...6=토) — growth.js의 kstWeekday와 동일한
// "KST 자정 기준" 방식, 다만 입력이 이미 날짜 문자열이라 seconds가 아니라 문자열을 직접 파싱
function weekdayOfDateStr(dateStr) { return new Date(`${dateStr}T00:00:00+09:00`).getUTCDay(); }

function isReadyToSend(student, sessions, todayDow) {
  if (!student.scheduleDays || student.scheduleDays.length === 0) return sessions.length > 0;
  const passedDays = student.scheduleDays.filter(d => dowRank(d) <= dowRank(todayDow));
  if (passedDays.length === 0) return sessions.length > 0;
  const coveredDows = new Set(sessions.map(s => weekdayOfDateStr(s.date)));
  return passedDays.every(d => coveredDows.has(d));
}

function defaultWeeklyNote(sessions) {
  return sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => `[${s.date}] ${s.teacherNote || '(메모 없음)'}`)
    .join('\n\n');
}

export default function WeeklyReviewView({ reports = [], students = [], classes = [], academyReportMode = 'daily', onSave, onToast }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const week = getKstWeekRange(weekOffset);
  const todayDow = new Date(Date.now() + 9 * 3600 * 1000).getUTCDay();

  const weeklyStudents = students
    .filter(s => !s.archived)
    .filter(s => (classes.find(c => c.id === s.classId)?.reportMode || academyReportMode) === 'weekly');

  const draftFor = (studentId) => reports.find(r =>
    r.studentId === studentId && r.reportType === 'weekly' && r.isDraft === true &&
    (r.sessions || []).some(s => s.date >= week.startStr && s.date <= week.endStr)
  );

  // 이번 주 범위와 안 겹치는, 아직 발송 안 된 열린 주간 draft — 놓치고 있는 지난주 이전 리포트
  const staleDrafts = reports.filter(r =>
    r.reportType === 'weekly' && r.isDraft === true &&
    (r.sessions || []).length > 0 &&
    !(r.sessions || []).some(s => s.date >= week.startStr && s.date <= week.endStr)
  );

  const [expandedId, setExpandedId] = useState(null);
  const [noteEdits, setNoteEdits] = useState({}); // reportId -> { teacherNote, textbook, subject, unit }
  const [photoSelection, setPhotoSelection] = useState({}); // reportId -> Set(url)
  const [sendingId, setSendingId] = useState(null);

  const getEdit = (draft, sessions) => {
    const base = { teacherNote: defaultWeeklyNote(sessions), textbook: '', subject: '수학', unit: '' };
    const last = [...sessions].sort((a, b) => a.date.localeCompare(b.date))[sessions.length - 1];
    if (last) { base.textbook = last.textbook || ''; base.subject = last.subject || '수학'; base.unit = last.unit || ''; }
    return { ...base, ...(noteEdits[draft.id] || {}) };
  };

  const getSelectedPhotos = (draft, allPhotos) => {
    if (photoSelection[draft.id]) return photoSelection[draft.id];
    return new Set(allPhotos.slice(0, MAX_PHOTOS_WEEKLY_SEND));
  };

  const togglePhoto = (draftId, url, allPhotos) => {
    setPhotoSelection(prev => {
      const current = new Set(prev[draftId] || allPhotos.slice(0, MAX_PHOTOS_WEEKLY_SEND));
      if (current.has(url)) current.delete(url);
      else if (current.size < MAX_PHOTOS_WEEKLY_SEND) current.add(url);
      return { ...prev, [draftId]: current };
    });
  };

  const handleSend = async (student, draft) => {
    const sessions = draft.sessions || [];
    const edit = getEdit(draft, sessions);
    const allPhotos = sessions.flatMap(s => s.photoUrls || []);
    const selectedPhotos = [...getSelectedPhotos(draft, allPhotos)];
    const diagnosis = sessions.flatMap(s => s.diagnosis || []);
    const wrongItems = sessions.flatMap(s => s.wrongItems || []).filter(Boolean);

    setSendingId(draft.id);
    try {
      await onSave({
        id: draft.id,
        studentId: student.id, studentName: student.name,
        reportType: 'weekly',
        sessions,
        diagnosis,
        wrongItems: wrongItems.length > 0 ? wrongItems : null,
        teacherNote: edit.teacherNote,
        photoUrls: selectedPhotos,
        textbook: edit.textbook, subject: edit.subject, unit: edit.unit,
        isDraft: false,
      });
      onToast?.(`${student.name} 학생 이번 주 리포트를 발송했어요.`, 'success');
      setExpandedId(null);
      setNoteEdits(prev => { const next = { ...prev }; delete next[draft.id]; return next; });
      setPhotoSelection(prev => { const next = { ...prev }; delete next[draft.id]; return next; });
    } catch (e) {
      console.error('주간 리포트 발송 실패:', e);
      onToast?.('발송에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
    setSendingId(null);
  };

  if (weeklyStudents.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: T.textMute, fontSize: '13px' }}>
        주간형으로 설정된 학생이 없어요. 관리 › 설정에서 리포트 작성 방식을 바꿀 수 있어요.
      </div>
    );
  }

  const groups = classes.length > 0
    ? [
        ...classes.map(c => ({ cls: c, students: weeklyStudents.filter(s => s.classId === c.id) })).filter(g => g.students.length > 0),
        { cls: null, students: weeklyStudents.filter(s => !s.classId || !classes.some(c => c.id === s.classId)) },
      ].filter(g => g.students.length > 0)
    : [{ cls: null, students: weeklyStudents }];

  return (
    <div style={{ padding: '0 20px 20px', maxWidth: '760px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{week.label} <span style={{ color: T.textMute, fontWeight: 500, fontSize: '12px' }}>({week.rangeLabel})</span></h2>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setWeekOffset(o => o + 1)} style={{ padding: '5px 10px', fontSize: '12px', border: `1px solid ${T.border}`, background: '#fff', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>‹ 이전 주</button>
          <button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0} style={{ padding: '5px 10px', fontSize: '12px', border: `1px solid ${T.border}`, background: weekOffset === 0 ? '#F3F4F6' : '#fff', color: weekOffset === 0 ? T.textMute : T.text, borderRadius: '8px', cursor: weekOffset === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>이번 주</button>
          <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} disabled={weekOffset === 0} style={{ padding: '5px 10px', fontSize: '12px', border: `1px solid ${T.border}`, background: '#fff', borderRadius: '8px', cursor: weekOffset === 0 ? 'default' : 'pointer', opacity: weekOffset === 0 ? 0.4 : 1, fontFamily: 'inherit' }}>다음 주 ›</button>
        </div>
      </div>

      {staleDrafts.length > 0 && weekOffset === 0 && (
        <div style={{ background: '#FFF8E7', border: '1px solid #F5D76E', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: C.warningText, margin: '0 0 4px' }}>⚠ 지난주 이전에 발송하지 못한 리포트가 {staleDrafts.length}건 있어요</p>
          <p style={{ fontSize: '11px', color: '#8A6A2A', margin: 0, lineHeight: 1.6 }}>
            {staleDrafts.map(r => r.studentName).join(', ')} — 주 선택기에서 해당 주로 이동해 확인해주세요.
          </p>
        </div>
      )}

      {groups.map(g => (
        <div key={g.cls?.id || '__unassigned__'} style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: T.textMute, margin: '0 0 8px' }}>{g.cls?.name || '미배정'} · {g.students.length}명</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {g.students.map(student => {
              const draft = draftFor(student.id);
              const sessions = draft?.sessions || [];
              const scheduledCount = student.scheduleDays?.length > 0 ? student.scheduleDays.length : sessions.length;
              const ready = draft ? isReadyToSend(student, sessions, todayDow) : false;
              const isExpanded = expandedId === draft?.id;
              const allPhotos = sessions.flatMap(s => s.photoUrls || []);
              const edit = draft ? getEdit(draft, sessions) : null;
              const selectedPhotos = draft ? getSelectedPhotos(draft, allPhotos) : new Set();

              return (
                <div key={student.id} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: `${RADIUS2.card}px`, overflow: 'hidden' }}>
                  <button
                    onClick={() => draft && setExpandedId(isExpanded ? null : draft.id)}
                    disabled={!draft}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'none', border: 'none', cursor: draft ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: T.text, flex: 1 }}>{student.name}</span>
                    <span style={{ fontSize: '11px', color: T.textMute }}>{sessions.length}/{scheduledCount}회</span>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '10px',
                      background: !draft ? '#F3F4F6' : ready ? C.successBg : C.warningBg,
                      color: !draft ? T.textMute : ready ? C.successDark : C.warningText,
                    }}>
                      {!draft ? '세션 없음' : ready ? '발송 준비 완료' : '진행 중'}
                    </span>
                  </button>

                  {isExpanded && draft && (
                    <div style={{ padding: '0 14px 16px', borderTop: `1px solid ${T.border}` }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' }}>
                        {sessions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => (
                          <div key={i} style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px 10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: T.text }}>{s.date} · {s.attendance}</span>
                              <span style={{ fontSize: '11px', color: T.textMute }}>
                                {s.homeworkRating != null && `과제 ${s.homeworkRating}%`}
                                {s.conceptRating != null && ` · 개념 ${s.conceptRating}%`}
                              </span>
                            </div>
                            {(s.diagnosis || []).length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                {s.diagnosis.map((d, di) => {
                                  const info = DIAG_SOFT[d.key] || { label: DIAG_LABELS[d.key] || d.key, color: '#4A4A4A', bg: '#F3F4F6' };
                                  return <span key={di} style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '8px', background: info.bg, color: info.color, fontWeight: 600 }}>{info.label}</span>;
                                })}
                              </div>
                            )}
                            <p style={{ fontSize: '11px', color: '#5A6472', margin: 0, lineHeight: 1.6 }}>{s.teacherNote}</p>
                          </div>
                        ))}
                      </div>

                      {allPhotos.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <p style={{ fontSize: '11px', fontWeight: 700, color: T.text, margin: '0 0 6px' }}>보낼 사진 선택 ({selectedPhotos.size}/{MAX_PHOTOS_WEEKLY_SEND})</p>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {allPhotos.map((url, pi) => {
                              const picked = selectedPhotos.has(url);
                              return (
                                <button key={pi} type="button" onClick={() => togglePhoto(draft.id, url, allPhotos)}
                                  style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', border: picked ? `2px solid ${C.primary}` : `1px solid ${T.border}`, padding: 0, cursor: 'pointer', background: 'none' }}>
                                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: picked ? 1 : 0.4 }} />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div style={{ marginBottom: '10px' }}>
                        <p style={{ fontSize: '11px', fontWeight: 700, color: T.text, margin: '0 0 4px' }}>이번 주 총평 (학부모에게 발송)</p>
                        <textarea
                          value={edit.teacherNote}
                          onChange={e => setNoteEdits(prev => ({ ...prev, [draft.id]: { ...edit, teacherNote: e.target.value } }))}
                          rows={4}
                          style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${T.border}`, borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <input value={edit.textbook} onChange={e => setNoteEdits(prev => ({ ...prev, [draft.id]: { ...edit, textbook: e.target.value } }))} placeholder="교재"
                          style={{ flex: '1 1 100px', padding: '7px 10px', fontSize: '12px', border: `1px solid ${T.border}`, borderRadius: '8px', fontFamily: 'inherit' }} />
                        <input value={edit.unit} onChange={e => setNoteEdits(prev => ({ ...prev, [draft.id]: { ...edit, unit: e.target.value } }))} placeholder="단원"
                          style={{ flex: '1 1 140px', padding: '7px 10px', fontSize: '12px', border: `1px solid ${T.border}`, borderRadius: '8px', fontFamily: 'inherit' }} />
                      </div>

                      <button onClick={() => handleSend(student, draft)} disabled={sendingId === draft.id || !edit.teacherNote.trim()}
                        style={{ width: '100%', padding: '11px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: 'none', background: sendingId === draft.id ? '#E5E7EB' : C.primary, color: sendingId === draft.id ? T.textMute : '#fff', cursor: sendingId === draft.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        {sendingId === draft.id ? '발송 중...' : `${student.name} 학생 이번 주 리포트 발송`}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
