import React from 'react';
import { X, Check } from 'lucide-react';
import { kstDay, kstWeekday, isReportSent } from '../growth.js';
import { T, C, RADIUS2 } from '../tokens.jsx';
import { AVATARS, StatCard } from './shared.jsx';
import { useMediaQuery } from '../hooks.js';

// 학생 아바타(사진 없을 때 이니셜 배경) 색 순환 — 실제 유형과 무관하게 그냥 시각적 다양성용
const AVATAR_PALETTE = [
  { color: '#8A6412', bg: '#F6EDD6' },
  { color: '#4E627E', bg: '#E7ECF3' },
  { color: '#B34A2E', bg: '#F6E7E1' },
  { color: '#5C8A63', bg: '#E4EEE5' },
];

export default function DashboardView({ students, reports, classes = [], reportViews = [], onTabChange, onWriteFor, reviews = [], onCompleteReview, onToggleReviewInstructed, onQuickAbsence, onDismissUnreadReminder }) {
  const [copiedReportId, setCopiedReportId] = React.useState(null);
  const handleCopyReportLink = (reportId) => {
    navigator.clipboard.writeText(`${window.location.origin}/report/${reportId}`).then(() => {
      setCopiedReportId(reportId);
      setTimeout(() => setCopiedReportId(prev => prev === reportId ? null : prev), 2000);
    });
  };
  // 리마인더에서 숨김 처리한 리포트 — Firestore 반영 전에도 바로 목록에서 사라지도록 낙관적 갱신.
  // X는 아이콘만 있고 title(툴팁)은 모바일에서 안 보여서 "삭제되나?" 오해를 살 수 있어 —
  // 숨긴 직후 몇 초간 "실행취소" 배너를 화면에 직접 띄워 "삭제 아니고 숨김"이라는 걸 눈으로 보여줌
  const [dismissedIds, setDismissedIds] = React.useState(new Set());
  const [undoBanner, setUndoBanner] = React.useState(null); // { id, studentName, timeoutId }
  const handleDismissUnread = (report) => {
    setDismissedIds(prev => new Set(prev).add(report.id));
    onDismissUnreadReminder?.(report.id, true);
    setUndoBanner(prev => {
      if (prev) clearTimeout(prev.timeoutId);
      const timeoutId = setTimeout(() => setUndoBanner(cur => cur?.id === report.id ? null : cur), 5000);
      return { id: report.id, studentName: report.studentName, timeoutId };
    });
  };
  const handleUndoDismiss = () => {
    if (!undoBanner) return;
    clearTimeout(undoBanner.timeoutId);
    setDismissedIds(prev => { const next = new Set(prev); next.delete(undoBanner.id); return next; });
    onDismissUnreadReminder?.(undoBanner.id, false);
    setUndoBanner(null);
  };
  const [markingAbsent, setMarkingAbsent] = React.useState(null); // studentId 처리 중
  const [confirmAbsenceStudent, setConfirmAbsenceStudent] = React.useState(null); // 결석 처리 확인 모달 대상
  // 복습 알림 카드의 세 가지 동작:
  //   "복습 지시" — 학생에게 복습하라고 알려줬다는 가벼운 표시(instructed 필드). 목록에서
  //     사라지진 않고 카드만 흐려짐 — 진짜 끝난 게 아니라 "지시는 했다"는 중간 상태이기 때문.
  //   "메모" — 인라인 텍스트 입력을 열고 닫음. 뭘 복습시킬지 미리 적어두는 용도, 완료 여부와 무관.
  //   "확인하기" — 실제 완료 처리(같은 약점의 밀린 라운드 전부 status:'done'으로, 메모+점수도 같이 저장).
  // 메모/점수 입력값은 카드(group.key)별로 따로 들고 있어야 함 — 예전엔 입력창 하나를 모든 카드가
  // 공유해서, A 카드 메모를 열고 타이핑만 한 채 B 카드에서 확인하기를 누르면 A에 쓰던 내용이
  // B의 완료 기록으로 저장되는 버그가 있었음.
  const [memoOpenKey, setMemoOpenKey] = React.useState(null);
  const [noteDrafts, setNoteDrafts] = React.useState({}); // key -> 메모 텍스트
  const [scoreDrafts, setScoreDrafts] = React.useState({}); // key -> 재시험 점수(문자열)
  const [completingGroupKey, setCompletingGroupKey] = React.useState(null);
  const [togglingInstructedKey, setTogglingInstructedKey] = React.useState(null);

  const toggleMemo = (group) => {
    setMemoOpenKey(prev => prev === group.key ? null : group.key);
  };
  const handleToggleInstructed = async (group) => {
    setTogglingInstructedKey(group.key);
    try {
      await onToggleReviewInstructed?.(group.reviews.map(rv => rv.id), !group.instructed);
    } finally {
      setTogglingInstructedKey(null);
    }
  };
  const handleConfirmGroup = async (group) => {
    setCompletingGroupKey(group.key);
    try {
      const note = noteDrafts[group.key] ?? group.reviews[0]?.note ?? '';
      const scoreStr = scoreDrafts[group.key] ?? '';
      const testScore = scoreStr.trim() === '' ? null : Number(scoreStr);
      await Promise.all(group.reviews.map(rv => onCompleteReview?.(rv.id, { note, testScore })));
      setMemoOpenKey(null);
    } finally {
      setCompletingGroupKey(null);
    }
  };

  // 발송 완료 판정 + 날짜 비교 — 리포트 탭 상태바/원장 보고서와 동일한 공용 기준(growth.js) 사용.
  // 결석 처리는 teacherNote 없이 출결만 채운 리포트라 isReportSent 기준으론 안 걸러지므로,
  // "오늘 결석으로 처리됨(초안 아님)"도 완료로 별도 인정 — 안 그러면 결석 처리해도 계속 "대기"로 남음
  const todayKst = kstDay(Date.now() / 1000);
  const isHandledToday = (r) => isReportSent(r) || (r.attendance === '결석' && r.isDraft !== true);
  const todayReports = reports.filter(r => r.createdAt?.seconds && isHandledToday(r) && kstDay(r.createdAt.seconds) === todayKst);
  // 주간형(reportType==='weekly') 리포트는 한 주 내내 isDraft:true라서(원장이 발송할 때만 false로
  // 바뀜) 위 todayReports 기준으론 절대 안 걸림 — 오늘 세션을 실제로 저장했는지는 컨테이너의
  // isDraft/createdAt이 아니라 sessions[]에 오늘 날짜가 있는지로 따로 판정해야 함
  const hasWeeklySessionToday = (r) => r.reportType === 'weekly' && (r.sessions || []).some(s => s.date === todayKst);
  const doneOf = (s) => todayReports.some(r => r.studentId === s.id) || reports.some(r => r.studentId === s.id && hasWeeklySessionToday(r));

  // 미열람 리마인더 — 발송된(초안 아닌) 리포트 중 reportViews에 기록이 없는 것.
  // 오늘 보낸 건 아직 확인 못 봤을 수 있어 제외하고, "하루 이상 지났는데도 안 읽음"만 모아서
  // 실제로 따라가볼 만한 것만 노출. 기간도 최근 14일로 제한 — 안 그러면 오래된 것까지 계속
  // 쌓여서(수십 건) 정작 챙길 만한 최근 건이 묻히고 소음이 됨. 그래도 남는 개별 건은 X로 숨김 가능.
  const UNREAD_REMINDER_WINDOW_DAYS = 14;
  const unreadCutoff = new Date(todayKst); unreadCutoff.setDate(unreadCutoff.getDate() - UNREAD_REMINDER_WINDOW_DAYS);
  const unreadCutoffStr = unreadCutoff.toISOString().split('T')[0];
  const viewedReportIds = new Set(reportViews.map(v => v.reportId));
  const unreadReports = reports
    .filter(r => r.createdAt?.seconds && isReportSent(r) && !r.reminderDismissed && !dismissedIds.has(r.id))
    .filter(r => {
      const day = kstDay(r.createdAt.seconds);
      return day < todayKst && day >= unreadCutoffStr;
    })
    .filter(r => !viewedReportIds.has(r.id))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

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
  // "오늘 발송"(filteredTodayReports)은 실제 발송 여부 그대로 두고, "오늘 미작성"은 doneOf와
  // 같은 기준(주간형은 세션 저장만 해도 완료로 인정)으로 별도 계산 — 안 그러면 목록의 "완료 ✓"
  // 표시(doneOf 기준)와 상단 미작성 숫자가 서로 어긋나 보임
  const pendingCount = filteredStudents.filter(s => !doneOf(s)).length;

  // 넓은 화면(PC)에서는 스크롤 없이 복습 알림(왼쪽) + 오늘의 현황·오늘 학생 현황(오른쪽)이
  // 한 화면에 들어오는 2단 배치로, 모바일은 기존 세로 스택 그대로 유지
  const isWide = useMediaQuery('(min-width: 900px)');

  // 복습 알림 위젯 — 약점 태그가 있던 리포트는 7/14/30일 후 복습 일정이 자동 생성됨.
  // 학생 섹션으로 묶고, 같은 리포트(reportId)에서 나온 라운드는 카드 하나로 합쳐서 가장 급한
  // 라운드만 보여준다. 왼쪽 색 강조선/뱃지는 "얼마나 급한지"(지남/오늘), 약점 이름 글자색은
  // "어떤 유형인지"를 나타내 — 두 신호가 겹치지 않게 분리했다. 모바일/PC 두 레이아웃에서
  // 그대로 재사용할 수 있도록 미리 계산해둔다.
  const reviewWidget = (() => {
    const dueReviews = reviews.filter(rv => rv.status !== 'done' && rv.dueDate && rv.dueDate <= todayKst);
    if (dueReviews.length === 0) return null;

    const URGENCY = {
      over:  { color: '#B34A2E', bg: '#F6E4DD' },
      today: { color: '#9A6B12', bg: '#FAF0D4' },
    };
    const CATEGORY = {
      concept: { color: '#B34A2E', bg: '#F6E7E1' },
      calc:    { color: '#9A6B12', bg: '#F6EDD6' },
      apply:   { color: '#4E627E', bg: '#E7ECF3' },
      time:    { color: '#7A5C8C', bg: '#EFE7F0' },
    };
    const DEFAULT_CATEGORY = { color: '#5C564C', bg: '#F3EEE3' };

    // reportId가 없는 예전 데이터는 학생+교재+단원 조합으로 폴백해서 그룹키를 만듦
    const groupsMap = new Map();
    dueReviews.forEach(rv => {
      const key = rv.reportId || `${rv.studentId}-${rv.textbook}-${rv.unit}`;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(rv);
    });
    const groups = [...groupsMap.entries()].map(([key, list]) => {
      const sorted = [...list].sort((a, b) => (a.round || 0) - (b.round || 0));
      const first = sorted[0];
      const latest = sorted[sorted.length - 1]; // 가장 큰 라운드 = 지금 밀려있는 가장 최근 체크포인트
      const minDueDate = sorted.reduce((min, rv) => (!min || rv.dueDate < min) ? rv.dueDate : min, null);
      const overdueDays = Math.floor((new Date(todayKst) - new Date(latest.dueDate)) / 86400000);
      return {
        key, reviews: sorted, minDueDate, overdueDays, isOverdue: overdueDays > 0, latestRound: latest.round,
        studentId: first.studentId, studentName: first.studentName, textbook: first.textbook, unit: first.unit,
        weakTypes: first.weakTypes || [],
        diagnosedAt: first.createdAt?.seconds || null,
        instructed: sorted.every(rv => rv.instructed),
      };
    }).sort((a, b) => (a.minDueDate || '').localeCompare(b.minDueDate || ''));

    // 우선순위(급한 순) 정렬은 그대로 두고, 너무 많으면 앞쪽 N건만 보여주고 나머지는 안내만
    const CAP = 8;
    const shown = groups.slice(0, CAP);
    const overflow = groups.length - shown.length;

    // 학생 섹션으로 재구성 — shown 순서(급한 순)를 그대로 유지
    const byStudent = new Map();
    shown.forEach(g => {
      if (!byStudent.has(g.studentId)) byStudent.set(g.studentId, { studentName: g.studentName, groups: [] });
      byStudent.get(g.studentId).groups.push(g);
    });
    const studentSections = [...byStudent.values()];
    const overdueCount = groups.filter(g => g.isOverdue).length;
    const todayCount = groups.length - overdueCount;
    const instructedCount = groups.filter(g => g.instructed).length;

    return (
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #EDE6D7', boxShadow: '0 1px 3px rgba(60,50,30,.05)', overflow: 'hidden', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '15px 16px', borderBottom: '1px solid #F0EADD', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#E3A11B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', fontWeight: 800 }}>!</div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#2A2724', margin: 0 }}>
                복습할 때가 됐어요 · {studentSections.length}명 {groups.length}건
              </h3>
              <p style={{ fontSize: '12px', color: '#7D7465', margin: '2px 0 0' }}>
                지남 {overdueCount}건 · 오늘 기한 {todayCount}건
              </p>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '20px', background: '#F5EFE1' }}>
            <span style={{ fontSize: '11px', color: '#7D7465', fontWeight: 700 }}>지시</span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#8A6412' }}>{instructedCount}/{groups.length}</span>
          </div>
        </div>

        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {studentSections.map((section, si) => (
            <div key={section.studentName + si}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 2px 8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#2A2724' }}>{section.studentName}</span>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#fff', background: '#B7AE9C', padding: '1px 7px', borderRadius: '20px' }}>{section.groups.length}건</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {section.groups.map(group => {
                  const memoOpen = memoOpenKey === group.key;
                  const diagLabel = group.diagnosedAt
                    ? (d => `${d.getMonth() + 1}/${d.getDate()}`)(new Date(group.diagnosedAt * 1000))
                    : null;
                  const mainWeak = group.weakTypes[0];
                  const cat = (mainWeak && CATEGORY[mainWeak.key]) || DEFAULT_CATEGORY;
                  const urg = group.isOverdue ? URGENCY.over : URGENCY.today;
                  const isTogglingInstructed = togglingInstructedKey === group.key;
                  const isCompleting = completingGroupKey === group.key;
                  const hasMemoContent = !!group.reviews[0]?.note?.trim();
                  return (
                    <div key={group.key} style={{
                      border: '1px solid #EFE9DC', borderLeft: `4px solid ${urg.color}`, borderRadius: '11px',
                      padding: '12px 14px', background: '#FDFCF9', opacity: group.instructed ? 0.5 : 1, transition: 'opacity .18s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.01em', color: cat.color }}>
                          {group.weakTypes.map(w => w.label).join(', ') || '복습 필요'}
                        </span>
                        <span style={{ padding: '3px 9px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap', color: urg.color, background: urg.bg }}>
                          {group.latestRound}차{group.isOverdue ? ` · ${group.overdueDays}일 지남` : ' · 오늘 기한'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '4px' }}>
                        {diagLabel && <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#7D7465' }}>{diagLabel} 진단</span>}
                        {diagLabel && (group.textbook || group.unit) && <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#D6CEBE' }} />}
                        <span style={{ fontSize: '13px', color: '#5C564C' }}>{[group.textbook, group.unit].filter(Boolean).join(' · ')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '11px', paddingTop: '11px', borderTop: '1px solid #F3EEE3' }}>
                        <button onClick={() => !isTogglingInstructed && handleToggleInstructed(group)} disabled={isTogglingInstructed}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', padding: '5px 4px', cursor: isTogglingInstructed ? 'not-allowed' : 'pointer', fontFamily: 'inherit', color: group.instructed ? '#3F6B49' : '#8B8375' }}>
                          <span style={{
                            width: '17px', height: '17px', borderRadius: '50%', flexShrink: 0,
                            border: `1.5px solid ${group.instructed ? '#5C8A63' : '#D8D0C1'}`, background: group.instructed ? '#5C8A63' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', lineHeight: 1,
                          }}>
                            {group.instructed && <Check size={10} strokeWidth={3} />}
                          </span>
                          <span style={{ fontSize: '12.5px', fontWeight: 700 }}>{group.instructed ? '복습 지시함' : '복습 지시'}</span>
                        </button>
                        <button onClick={() => toggleMemo(group)}
                          style={{ position: 'relative', background: 'none', border: 'none', padding: '5px 6px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700, color: '#8B8375' }}>
                          메모
                          {hasMemoContent && <span style={{ display: 'inline-block', position: 'absolute', top: '2px', right: '0', width: '6px', height: '6px', borderRadius: '50%', background: '#C67A2E' }} />}
                        </button>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => handleConfirmGroup(group)} disabled={isCompleting}
                          style={{ padding: '7px 15px', borderRadius: '9px', border: '1px solid #EBDFC0', background: isCompleting ? '#F0EADD' : '#FCF4DE', color: '#8A6412', fontSize: '12.5px', fontWeight: 800, cursor: isCompleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          {isCompleting ? '처리 중...' : '확인하기'}
                        </button>
                      </div>
                      {memoOpen && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <textarea
                            value={noteDrafts[group.key] ?? group.reviews[0]?.note ?? ''}
                            onChange={e => setNoteDrafts(prev => ({ ...prev, [group.key]: e.target.value }))}
                            placeholder="무엇을 복습시킬지 메모…" rows={2}
                            style={{ width: '100%', minHeight: '50px', resize: 'vertical', border: '1px solid #E7E0D0', borderRadius: '8px', padding: '8px 10px', fontFamily: 'inherit', fontSize: '12.5px', color: '#3A362F', background: '#FBFAF6', outline: 'none', boxSizing: 'border-box' }} />
                          <input
                            type="number"
                            value={scoreDrafts[group.key] ?? ''}
                            onChange={e => setScoreDrafts(prev => ({ ...prev, [group.key]: e.target.value }))}
                            placeholder="재시험 점수 (선택)"
                            style={{ width: '140px', padding: '7px 9px', fontSize: '12.5px', border: '1px solid #E7E0D0', borderRadius: '8px', fontFamily: 'inherit', outline: 'none', background: '#FBFAF6', color: '#3A362F' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {overflow > 0 && (
          <p style={{ padding: '0 18px 14px', fontSize: '11px', color: '#7D7465', margin: 0, textAlign: 'center' }}>
            외 {overflow}건 더 있어요
          </p>
        )}
      </div>
    );
  })();

  // "오늘 학생 현황" 헤더(반 필터 + 리포트 작성 버튼) — 패딩/테두리는 모바일/PC 각자의 바깥
  // 컨테이너가 맡고, 여기선 내용만
  const studentListHeader = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#2A2724', margin: 0 }}>오늘 학생 현황</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {classes.length > 0 && (
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, borderRadius: `${RADIUS2.input}px`, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="">전체 반</option>
            <option value="__unassigned__">미배정</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button onClick={() => onTabChange('write')}
          style={{ padding: '7px 15px', borderRadius: '9px', border: '1px solid #EBDFC0', background: '#FCF4DE', color: '#8A6412', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          리포트 작성
        </button>
      </div>
    </div>
  );

  const studentListBody = orderedStudents.length === 0
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
    : orderedStudents.map((s, idx) => {
      const done = doneOf(s);
      const avatarUrl = AVATARS.find(a => a.key === s.avatar)?.url;
      const palette = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
      return (
        <div key={s.id} onClick={() => onWriteFor?.(s, done)}
          style={{ padding: '13px 2px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${T.bgSoft}`, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', overflow: 'hidden', background: done ? T.brand : palette.bg, color: done ? '#fff' : palette.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, flexShrink: 0 }}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name?.[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '14.5px', fontWeight: 800, color: '#2A2724', margin: 0 }}>{s.name}</p>
            <p style={{ fontSize: '12px', color: '#7D7465', margin: '1px 0 0' }}>{s.school}</p>
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
          <span style={{ fontSize: '12.5px', fontWeight: 800, flexShrink: 0, color: done ? '#3F6B49' : '#B08A3A' }}>{done ? '완료 ✓' : '대기'}</span>
        </div>
      );
    });

  // 미열람 리마인더 — 발송된 지 하루 넘었는데도 학부모가 안 읽은 리포트. 오늘 막 보낸
  // 건 아직 안 읽었을 수 있어 자연스러운 거라 제외하고, 진짜 따라가볼 만한 것만 모음
  const unreadWidget = unreadReports.length > 0 && (
    <div style={{ background: '#F5F8FF', borderRadius: '16px', border: '1px solid #C5D5F0', overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #C5D5F060' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B', margin: 0 }}>
          📭 아직 안 읽은 리포트 · {unreadReports.length}건
        </h3>
        <p style={{ fontSize: '11px', color: '#1A5CB8', margin: '2px 0 0' }}>발송한 지 하루가 지났는데도 학부모가 확인하지 않았어요</p>
      </div>
      {unreadReports.slice(0, 5).map(r => {
        const unreadDays = Math.floor((new Date(todayKst) - new Date(kstDay(r.createdAt.seconds))) / 86400000);
        return (
          <div key={r.id} style={{ padding: '10px 18px', borderBottom: '1px solid #C5D5F030', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>
                {r.studentName} <span style={{ fontSize: '10px', fontWeight: 600, color: '#1A5CB8' }}>{unreadDays}일째 미열람</span>
              </p>
              <p style={{ fontSize: '11px', color: '#6B7280', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[r.textbook, r.unit].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button onClick={() => handleCopyReportLink(r.id)}
              style={{ flexShrink: 0, padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '8px', border: '1px solid #1A5CB8', background: copiedReportId === r.id ? '#1A5CB8' : '#fff', color: copiedReportId === r.id ? '#fff' : '#1A5CB8', cursor: 'pointer', fontFamily: 'inherit' }}>
              {copiedReportId === r.id ? '✓ 복사됨' : '링크 복사'}
            </button>
            <button onClick={() => handleDismissUnread(r)} title="이 리마인더에서 숨기기 (리포트 자체는 그대로 남아요)"
              style={{ flexShrink: 0, width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#6B7785', cursor: 'pointer', borderRadius: '6px' }}>
              <X size={15} />
            </button>
          </div>
        );
      })}
      {undoBanner && (
        <div style={{ padding: '9px 18px', background: '#EAF0F9', borderTop: '1px solid #C5D5F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#1A5CB8' }}>{undoBanner.studentName} 리포트를 리마인더에서 숨겼어요 (삭제 아님)</span>
          <button onClick={handleUndoDismiss} style={{ flexShrink: 0, background: 'none', border: 'none', color: '#0D2D6B', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
            실행취소
          </button>
        </div>
      )}
      {unreadReports.length > 5 && (
        <p style={{ padding: '8px 18px', fontSize: '11px', color: '#1A5CB8', margin: 0, textAlign: 'center' }}>
          외 {unreadReports.length - 5}건 더 있어요
        </p>
      )}
    </div>
  );

  const absenceModal = confirmAbsenceStudent && (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px', backdropFilter: 'blur(4px)' }}
      onClick={() => setConfirmAbsenceStudent(null)}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: C.warningBg, border: '2px solid #D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '22px', color: '#D97706', fontWeight: 700 }}>!</div>
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
  );

  if (isWide) {
    return (
      <div style={{ padding: '20px', maxWidth: '1040px', margin: '0 auto', boxSizing: 'border-box' }}>
        {absenceModal}
        <div style={{ background: '#FBF9F4', border: '1px solid #EDE6D7', borderRadius: '20px', padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 16px', color: '#2A2724' }}>오늘의 현황</h2>
          <div style={{ display: 'grid', gridTemplateColumns: reviewWidget ? '392px 1fr' : '1fr', gap: '20px', alignItems: 'stretch' }}>
            {reviewWidget && <div>{reviewWidget}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ background: '#fff', border: '1px solid #EDE6D7', borderRadius: '16px', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#E3A11B' }} />
                    <span style={{ fontSize: '13px', color: '#8A8378', fontWeight: 700 }}>오늘 미작성</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginTop: '8px' }}>
                    <span style={{ fontSize: '30px', fontWeight: 800, color: '#E3A11B', lineHeight: 1 }}>{Math.max(0, pendingCount)}</span>
                    <span style={{ fontSize: '14px', color: '#7D7465', fontWeight: 700 }}>명</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#7E755F', marginTop: '6px' }}>전체 {filteredStudents.length}명 중</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #EDE6D7', borderRadius: '16px', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#8FAF92' }} />
                    <span style={{ fontSize: '13px', color: '#8A8378', fontWeight: 700 }}>오늘 발송</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginTop: '8px' }}>
                    <span style={{ fontSize: '30px', fontWeight: 800, color: '#3F6B49', lineHeight: 1 }}>{filteredTodayReports.length}</span>
                    <span style={{ fontSize: '14px', color: '#7D7465', fontWeight: 700 }}>건</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#7E755F', marginTop: '6px' }}>리포트 발송 완료</div>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #EDE6D7', borderRadius: '16px', padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '14px' }}>{studentListHeader}</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>{studentListBody}</div>
              </div>
            </div>
          </div>
        </div>
        {unreadWidget && <div style={{ marginTop: '20px' }}>{unreadWidget}</div>}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', boxSizing: 'border-box' }}>
      {absenceModal}

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>오늘의 현황</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="오늘 미작성" value={Math.max(0, pendingCount)} unit="명" color={C.warning} />
        <StatCard label="오늘 발송" value={filteredTodayReports.length} unit="건" color={C.midGray} />
      </div>

      {reviewWidget && <div style={{ marginBottom: '20px' }}>{reviewWidget}</div>}
      {unreadWidget && <div style={{ marginBottom: '20px' }}>{unreadWidget}</div>}

      <div style={{ background: T.bg, borderRadius: '16px', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6' }}>{studentListHeader}</div>
        {/* 학생 행 자체는 좌우 2px 패딩만 갖고 있음(PC 카드처럼 바깥 컨테이너가 18~20px를
            대신 채워주는 걸 전제) — 모바일은 바깥 컨테이너에 그 여백이 없어서 여기서 보충 */}
        <div style={{ padding: '0 16px' }}>{studentListBody}</div>
      </div>
    </div>
  );
}
