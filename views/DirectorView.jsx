import React, { useState } from 'react';
import { db } from '../firebase';
import { updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { FileText, AlertTriangle, Copy, CalendarDays } from 'lucide-react';
import { kstDay, kstWeekday, toPct, ratingLabel, getKstWeekRange, conceptStatusLabel, flattenReportsForAnalysis, isHandledToday, isReportSent } from '../growth.js';
import { DIAG_BADGE as DIAG_MAP } from '../diagnosis.js';
import { T, C, R } from '../tokens.jsx';
import { groupByClassId, onKeyActivate } from './shared.jsx';
import GrowthDashboard from './GrowthDashboard.jsx';

// 두 Firestore Timestamp(초 단위) 사이 경과 시간을 "N분/N시간/N일" 중 가장 자연스러운 단위로 표시
function formatElapsed(fromSeconds, toSeconds) {
  const diffSec = Math.max(0, toSeconds - fromSeconds);
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${Math.max(1, diffMin)}분`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간`;
  return `${Math.round(diffHour / 24)}일`;
}

export default function DirectorView({ reports, students, classes = [], teachers = [], reportViews = [], reportQuestions = [], onToast, academyId, academyName, onOpenStudentProfile, statusThresholds }) {
  // 기간 컨트롤 통합(재설계 1단계) — 예전엔 날짜 선택기(이 화면)와 기간 토글(GrowthDashboard)이
  // 완전히 분리된 state라 서로 반응하지 않았음. 이제 이 view 하나가 "오늘 카드 목록"과
  // "기간 KPI/추이/표"(GrowthDashboard에 위임) 중 무엇을 보여줄지 전체를 결정한다 — 두 뷰가
  // 동시에 보이는 일이 없어야 "지금 보는 숫자가 어느 기간인지" 헷갈릴 수 없다는 게 재설계 핵심.
  const [view, setView] = useState('today'); // 'today' | 'week' | 'month' | '3month'
  // 기본값은 오늘이 아니라 "가장 최근 수업이 있었던 날" — 오늘 수업이 없는 날(주말 등) 열면
  // 늘 텅 빈 화면부터 보이던 문제 해결. reports는 dataReady 이후에만 이 컴포넌트가 마운트되므로
  // 최초 렌더 시점엔 이미 로드돼 있음(App.jsx의 dataReady 게이트).
  const [selectedDate, setSelectedDate] = useState(() => {
    const latestSeconds = reports.reduce((max, r) => (r.createdAt?.seconds > max ? r.createdAt.seconds : max), 0);
    return latestSeconds > 0 ? kstDay(latestSeconds) : kstDay(Date.now() / 1000);
  });
  const dateInputRef = React.useRef(null);
  const [expandedId, setExpandedId] = useState(null);
  const [memos, setMemos] = useState({});
  const [savingMemo, setSavingMemo] = useState(null);
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [savingAnswer, setSavingAnswer] = useState(null);
  const [showAnswered, setShowAnswered] = useState(false);
  const [showEngagement, setShowEngagement] = useState(false);
  // 질문 삭제 — 계속 쌓이는 목록이라 정리 용도. 2번 눌러야 지워짐(오터치 방지), 3초 지나면 확인 상태 풀림
  const [confirmDeleteQuestionId, setConfirmDeleteQuestionId] = useState(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState(null);

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

  const handleDeleteQuestion = async (questionId) => {
    if (confirmDeleteQuestionId !== questionId) {
      setConfirmDeleteQuestionId(questionId);
      setTimeout(() => setConfirmDeleteQuestionId(prev => prev === questionId ? null : prev), 3000);
      return;
    }
    setDeletingQuestionId(questionId);
    try {
      await deleteDoc(doc(db, 'academies', academyId, 'reportQuestions', questionId));
    } catch (e) {
      console.error('질문 삭제 실패:', e);
      onToast?.('질문 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
    setConfirmDeleteQuestionId(null);
    setDeletingQuestionId(null);
  };

  // 선택 날짜 리포트 필터 (KST 기준) — 원장 보고서는 발송 여부와 무관하게 해당 날짜의 모든 작성 활동을 보여줌
  const todayReports = reports.filter(r => r.createdAt?.seconds && kstDay(r.createdAt.seconds) === selectedDate);

  // 진단 집계
  const diagCount = {};
  todayReports.forEach(r => (r.diagnosis || []).forEach(d => {
    diagCount[d.key] = (diagCount[d.key] || 0) + 1;
  }));
  const diagEntries = Object.entries(diagCount).sort((a, b) => b[1] - a[1]);
  const maxDiag = diagEntries[0]?.[1] || 1;

  const totalOnTime = todayReports.filter(r => r.attendance === '정시').length;

  // 리포트 미작성 — 예전엔 "전체 학생 수 - 오늘 작성 건수" 뺄셈이라, 수업이 없는 날(주말 등)에도
  // 전원이 미작성으로 잡히는 버그가 있었음(예: 일요일에 총 수업 0인데 미작성 4건). 위 "이번 주
  // 현황" 위젯의 스케줄 판정과 동일하게, 선택한 날짜가 그 학생의 수업 요일일 때만(또는 스케줄
  // 미설정 시 기존처럼 매일 대상) 미작성으로 센다.
  const selectedDow = new Date(`${selectedDate}T00:00:00Z`).getUTCDay();
  const reportedStudentIds = new Set(todayReports.map(r => r.studentId));
  const notWrittenStudents = students.filter(s => {
    if (reportedStudentIds.has(s.id)) return false;
    if (!s.scheduleDays || s.scheduleDays.length === 0) return true;
    return s.scheduleDays.includes(selectedDow);
  });
  // 수업이 아예 없는 날(주말·휴원)과 수업은 있었는데 리포트가 없는 날을 구분하기 위한 판정 —
  // scheduleDays 미설정 학생은 항상 "수업 있음"으로 간주(기존 컨벤션과 동일)
  const anyScheduledToday = students.some(s => !s.scheduleDays || s.scheduleDays.length === 0 || s.scheduleDays.includes(selectedDow));
  const totalAbsent = todayReports.filter(r => r.attendance === '결석').length;

  const todayStr = kstDay(Date.now() / 1000);
  const shiftDate = (deltaDays) => {
    const d = new Date(`${selectedDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  // toLocaleDateString은 옵션에 timeZone을 안 주면 브라우저의 로컬 타임존을 따름 — 이 앱은
  // KST 고정이 원칙(growth.js의 kstDay 등)인데 이 화면만 그 규칙이 빠져 있었음. 원장님 기기가
  // KST가 아니면(해외 등) 날짜가 하루 밀려 보이거나, 학부모에게 나가는 문구까지 틀릴 수 있었음.
  const fmtDateShort = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' });
  };

  const handleMemoSave = async (reportId, memo) => {
    setSavingMemo(reportId);
    try {
      await updateDoc(doc(db, 'academies', academyId, 'reports', reportId), { directorMemo: memo });
    } catch (e) {
      console.error('원장 메모 저장 실패:', e);
      onToast?.('메모 저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
    setSavingMemo(null);
  };

  // "관심이 필요한 학생" — 예전엔 개념 이해도 경고/주의 배지(1주·1개월 탭에서만), 참여도
  // "조용함"(챙길 것 카드), N주째 리포트 없음(학생관리 화면) 3곳에 흩어져 있어서, 매일 보는
  // "오늘" 화면에서는 경고/주의를 놓치기 쉬웠음. 반별로 묶어 오늘/1주/1개월과 무관하게 항상
  // 노출(2026-08-03 통합 결정) — 기존 판정 로직(conceptStatusLabel/조용함/14일)은 그대로
  // 재사용하고, 이 화면에 새로 얹는 건 "반별 묶음 + 확인 처리"뿐임.
  const RISK_PERIOD_DAYS = 30; // 개념 이해도 경고/주의 판정 기간(GrowthDashboard "1개월" 탭과 동일)
  const STALE_DAYS = 14; // 학생관리 화면(StudentsView.jsx)의 "N주째 리포트 없음" 배지와 동일 임계값
  const flatReportsForRisk = React.useMemo(() => flattenReportsForAnalysis(reports), [reports]);
  const riskCutoffMs = Date.now() - RISK_PERIOD_DAYS * 86400000;
  const getRecentConceptReports = (sid) => flatReportsForRisk
    .filter(r => r.studentId === sid && !r.isDraft && r.createdAt?.seconds * 1000 >= riskCutoffMs && r.conceptRating != null)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({ ...r, conceptRating: toPct(r.conceptRating) }));

  // 마지막 처리일 기준 — isHandledToday(발송됨 또는 확정 결석)로 학생관리 화면
  // (StudentsView.jsx)의 daysSinceLastReport와 판정을 통일(2026-08-05). 예전엔 여기는
  // isReportSent, 저쪽은 !isDraft라서 결석만 이어지는 학생의 무보고 경고가 화면마다 달랐음.
  const sentReportsAll = reports.filter(isHandledToday);
  const daysSinceLastReport = (sid) => {
    const last = sentReportsAll.filter(r => r.studentId === sid).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
    if (!last?.createdAt?.seconds) return null;
    return Math.floor((Date.now() - last.createdAt.seconds * 1000) / 86400000);
  };

  const [dismissingRiskId, setDismissingRiskId] = useState(null);
  const handleDismissRisk = async (student, signals) => {
    setDismissingRiskId(student.id);
    try {
      await updateDoc(doc(db, 'academies', academyId, 'students', student.id), {
        riskDismissed: { signals, at: serverTimestamp() },
      });
    } catch (e) {
      console.error('위험 신호 확인 처리 실패:', e);
      onToast?.('확인 처리에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
    setDismissingRiskId(null);
  };

  // 참여도("조용함" 등) — "이번 주 챙길 것" 카드와 "관심이 필요한 학생" 섹션이 같은 판정을
  // 공유해야 해서 이 레벨로 끌어올림(예전엔 챙길 것 카드의 IIFE 안에서만 계산됐음)
  const MIN_REPORTS = 3; // 샘플이 너무 적으면(신규생 등) 판단 근거가 약해 제외
  // students(App.jsx의 visibleStudents)는 이미 !archived로 걸러진 상태로 내려오므로 여기서 다시 거를 필요 없음
  const engagement = students
    .map(s => {
      // 열람률 분모는 실제로 학부모에게 발송된 리포트만(isReportSent) — 확정 결석 기록은
      // 발송 링크 자체가 없어 열람이 불가능한데 분모에 넣으면 '조용함'이 과대판정됨(2026-08-05)
      const sentReports = reports.filter(r => r.studentId === s.id && isReportSent(r));
      if (sentReports.length < MIN_REPORTS) return null;
      const viewedCount = sentReports.filter(r => reportViews.some(v => v.reportId === r.id)).length;
      const viewRate = Math.round(viewedCount / sentReports.length * 100);
      const questionCount = reportQuestions.filter(q => q.studentId === s.id).length;
      let label, labelBg, labelColor;
      if (questionCount > 0) { label = '적극적'; labelBg = C.successBg; labelColor = C.successDark; }
      else if (viewRate < 50) { label = '조용함'; labelBg = '#FDF0F0'; labelColor = C.errorDark; }
      else { label = '양호'; labelBg = '#F3F4F6'; labelColor = '#6B7280'; }
      return { student: s, sentCount: sentReports.length, viewRate, questionCount, label, labelBg, labelColor };
    })
    .filter(Boolean)
    .sort((a, b) => a.viewRate - b.viewRate);
  const quietCount = engagement.filter(e => e.label === '조용함').length;

  const atRiskStudents = students.map(s => {
    const academicLabel = conceptStatusLabel(getRecentConceptReports(s.id), statusThresholds);
    const daysSince = daysSinceLastReport(s.id);
    const isQuiet = engagement.find(e => e.student.id === s.id)?.label === '조용함';
    const signals = [];
    if (academicLabel === '경고' || academicLabel === '주의') signals.push(academicLabel);
    if (daysSince != null && daysSince >= STALE_DAYS) signals.push('무보고');
    if (isQuiet) signals.push('저조');
    if (signals.length === 0) return null;
    // 확인함(dismiss)은 14일만 유지 — 예전엔 신호 문자열만 비교해서, 확인한 신호가
    // 해소됐다가 몇 달 뒤 재발해도 영원히 안 보였음(2026-08-05 감사 발견). 저장해둔
    // at 타임스탬프를 읽어 14일 지나면 자동 해제 — 같은 신호가 계속 살아있으면
    // 2주마다 한 번씩 다시 떠서 원장이 재확인하게 됨.
    // ponytail: 시간 만료 방식. "신호 해소 시점에 즉시 리셋"이 더 정확하지만
    // 렌더 경로에서 Firestore 쓰기가 필요해져 복잡도 대비 이득이 낮음.
    const DISMISS_TTL_DAYS = 14;
    const dismissedAtMs = s.riskDismissed?.at?.seconds ? s.riskDismissed.at.seconds * 1000 : 0;
    const dismissValid = Date.now() - dismissedAtMs < DISMISS_TTL_DAYS * 86400000;
    const dismissed = dismissValid ? (s.riskDismissed?.signals || []) : [];
    const visibleSignals = signals.filter(sig => !dismissed.includes(sig));
    if (visibleSignals.length === 0) return null;
    return { student: s, signals, visibleSignals, daysSince };
  }).filter(Boolean);
  const atRiskByClass = groupByClassId(atRiskStudents, x => x.student.id, students, classes);

  // 중앙 1컬럼 880px — 시안 7a 기준. 위→아래로 요약 현황 → 처리할 일(질문) → 참여도 →
  // 데일리 보고서 순으로 우선순위가 잡혀 있어, 폭을 너무 넓히면 한 줄이 길어져 읽기 불편함
  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", boxSizing: 'border-box' }}>

      {/* 이번 주 챙길 것 — 재설계 2단계. 예전엔 "이번 주 현황"(숫자만) / "답변 대기 질문" /
          "학부모 참여도" 3개가 따로 놀아서, 실제로 처리해야 할 항목이 몇 개인지 한눈에 안 보였음.
          하나의 카드로 합치고 기간 컨트롤(오늘/1주/1개월/3개월)과 무관하게 항상 이번 주 기준으로
          고정 표시한다. 0건인 항목도 숨기지 않고 흐리게만(배경만 낮추고 텍스트 알파는 유지 —
          wrapper opacity로 흐리게 하면 이미 옅은 보조 텍스트가 대비 기준 미달까지 떨어짐) 남겨서
          "확인은 했다"는 확신을 준다. */}
      {(() => {
        const week = getKstWeekRange(0);
        const weekReports = reports.filter(r => r.createdAt?.seconds && kstDay(r.createdAt.seconds) >= week.startStr);
        const weekStudentIds = [...new Set(weekReports.map(r => r.studentId))];
        // 화목토 학생이 월요일 아침이라 아직 이번 주 수업이 시작도 안 됐는데 미제출로 뜨는 걸 방지
        const todayDow = kstWeekday(Date.now() / 1000);
        const dowRank = (d) => (d + 6) % 7;
        const noReportStudents = students.filter(s => {
          if (weekStudentIds.includes(s.id)) return false;
          if (!s.scheduleDays || s.scheduleDays.length === 0) return true;
          return s.scheduleDays.some(d => dowRank(d) <= dowRank(todayDow));
        });

        // 카드 제목이 "항상 이번 주"라고 안내하는데, 질문 목록만 기간 제한이 없어서 지난 주
        // 이전 질문까지 계속 섞여 나오던 불일치 — weekReports와 동일하게 askedAt 기준 이번 주로 제한
        const weekQuestions = reportQuestions.filter(q => q.askedAt?.seconds && kstDay(q.askedAt.seconds) >= week.startStr);
        const pending = weekQuestions
          .filter(q => !q.answerText)
          .sort((a, b) => (b.askedAt?.seconds || 0) - (a.askedAt?.seconds || 0));
        const answered = weekQuestions
          .filter(q => q.answerText)
          .sort((a, b) => (b.answeredAt?.seconds || 0) - (a.answeredAt?.seconds || 0));

        // engagement/quietCount는 이제 컴포넌트 레벨로 끌어올려짐(관심이 필요한 학생 섹션과 공유)

        // §7 숫자 일관성 — 이 총계도 students/reportQuestions에서 파생된 위 세 값의 합일 뿐,
        // 화면 어디에도 직접 하드코딩된 숫자가 없다
        const todoCount = noReportStudents.length + pending.length + quietCount;
        const dim = { color: 'rgba(55,56,60,0.75)' };
        const rowStyle = { padding: '14px 20px', borderTop: '1px solid #EEF0F3' };

        return (
          <div style={{ background: '#F6F8FC', border: '1px solid #E6EBF4', borderLeft: '3px solid #0D2D6B', borderRadius: '14px', marginBottom: '20px', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#0D2D6B', margin: 0 }}>이번 주 챙길 것 · {todoCount}건</p>
              {/* "항상 이번 주"는 미작성·질문 두 줄에만 해당 — 참여도 줄은 아래 자체 각주("최근
                  발송 N건 이상")대로 원래부터 전체 기간 기준(표본이 적으면 판단이 흔들려서
                  일부러 넓게 봄). 캡션이 세 줄 다 "이번 주"라고 뭉뚱그려 오해 소지가 있었음 */}
              <span style={{ fontSize: '11px', color: '#6C7586' }}>{week.label} · 미작성·질문은 이번 주, 참여도는 최근 활동 기준</span>
            </div>

            {/* 이번 주 미제출 — "오늘" 뷰 KPI의 "리포트 미작성"(그 날 하루 기준)과는 다른 개념이라
                이름을 다르게 씀(§10 결정: 둘 다 실제로 필요하지만 같은 이름이면 헷갈림) */}
            <div style={rowStyle}>
              <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, ...(noReportStudents.length === 0 ? dim : { color: '#1A1A1A' }) }}>
                이번 주 미제출 <span style={{ fontWeight: 800 }}>{noReportStudents.length}건</span>
              </p>
              {noReportStudents.length > 0 && (
                <p style={{ fontSize: '12px', margin: '4px 0 0', ...dim }}>{noReportStudents.map(s => s.name).join(', ')}</p>
              )}
            </div>

            {/* 학부모 질문 미답변 */}
            <div style={rowStyle}>
              <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, ...(pending.length === 0 ? dim : { color: '#1A1A1A' }) }}>
                학부모 질문 미답변 <span style={{ fontWeight: 800 }}>{pending.length}건</span>
              </p>
              {pending.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {pending.map(q => {
                    // 질문은 "질문한 날짜"가 아니라 "어느 리포트에 대한 질문인지"가 중요 —
                    // 질문한 날짜와 리포트 날짜가 다른 경우가 많아서(리포트 받고 며칠 뒤에 질문하는 경우 등)
                    // 원본 리포트를 찾아 그 날짜/내용을 같이 보여주고, 클릭하면 그 날짜로 바로 이동
                    const sourceReport = reports.find(r => r.id === q.reportId);
                    const reportDateStr = sourceReport?.createdAt?.seconds ? kstDay(sourceReport.createdAt.seconds) : null;
                    const reportLabel = sourceReport
                      ? `${new Date(reportDateStr).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })} 리포트${sourceReport.unit ? ` · ${sourceReport.unit}` : (sourceReport.textbook ? ` · ${sourceReport.textbook}` : '')}`
                      : '원본 리포트를 찾을 수 없음';
                    return (
                    <div key={q.id} style={{ background: '#fff', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <p style={{ fontSize: '11px', color: '#6B7785', margin: 0 }}>
                          {q.studentName} · {reportLabel}
                          {q.askedAt?.seconds && (
                            <span style={{ color: '#B0752A', fontWeight: 700 }}> · {formatElapsed(q.askedAt.seconds, Date.now() / 1000)}째 대기</span>
                          )}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                          {reportDateStr && (
                            <button onClick={() => { setView('today'); setSelectedDate(reportDateStr); }}
                              style={{ background: 'none', border: 'none', color: C.primary, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                              그 날짜로 이동
                            </button>
                          )}
                          <button onClick={() => handleDeleteQuestion(q.id)} disabled={deletingQuestionId === q.id}
                            style={{
                              background: confirmDeleteQuestionId === q.id ? C.danger : 'none', border: 'none', borderRadius: '6px',
                              padding: confirmDeleteQuestionId === q.id ? '2px 8px' : 0,
                              color: confirmDeleteQuestionId === q.id ? '#fff' : '#6B7280', fontSize: '11px', fontWeight: 700,
                              cursor: deletingQuestionId === q.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                            }}>
                            {deletingQuestionId === q.id ? '삭제 중' : confirmDeleteQuestionId === q.id ? '확인' : '삭제'}
                          </button>
                        </div>
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
                          style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, background: savingAnswer === q.id ? '#E5E7EB' : '#0D2D6B', color: savingAnswer === q.id ? '#6C7586' : '#fff', border: 'none', borderRadius: '8px', cursor: savingAnswer === q.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                          {savingAnswer === q.id ? '저장 중' : '답변 저장'}
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 참여도 조정 필요 */}
            <div style={rowStyle}>
              <button onClick={() => setShowEngagement(v => !v)} disabled={engagement.length === 0}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'none', border: 'none', padding: 0, cursor: engagement.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, ...(quietCount === 0 ? dim : { color: '#1A1A1A' }) }}>
                  참여도 조정 필요 <span style={{ fontWeight: 800 }}>{quietCount}명</span>
                </p>
                {engagement.length > 0 && <span style={{ fontSize: '11px', color: '#6C7586', flexShrink: 0 }}>{showEngagement ? '접기' : '명단 보기'}</span>}
              </button>
              {showEngagement && engagement.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '10px' }}>
                  <p style={{ fontSize: '11px', color: '#6C7586', margin: '0 0 6px' }}>최근 발송 {MIN_REPORTS}건 이상인 학생만 표시 · 열람률 낮은 순</p>
                  {engagement.map(e => (
                    <div key={e.student.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A', flexShrink: 0, minWidth: '52px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.student.name}</span>
                      <div style={{ flex: 1, height: '5px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${e.viewRate}%`, height: '100%', background: e.viewRate < 50 ? C.errorDark : '#0D2D6B', borderRadius: '4px' }} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#5A6472', flexShrink: 0, width: '34px', textAlign: 'right' }}>{e.viewRate}%</span>
                      {e.questionCount > 0 && <span style={{ fontSize: '10px', color: '#6B7785', flexShrink: 0, whiteSpace: 'nowrap' }}>질문{e.questionCount}</span>}
                      <span style={{ fontSize: '10px', fontWeight: 700, background: e.labelBg, color: e.labelColor, padding: '2px 8px', borderRadius: '10px', flexShrink: 0 }}>{e.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 답변 완료 — 처리할 항목은 아니지만(§5) 숨기지 않고 마지막 줄에 흐리게 남겨 참고용으로 둠 */}
            <div style={rowStyle}>
              <button onClick={() => setShowAnswered(v => !v)} disabled={answered.length === 0}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'none', border: 'none', padding: 0, cursor: answered.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, ...dim }}>답변 완료 <span style={{ fontWeight: 800 }}>{answered.length}건</span></p>
                {answered.length > 0 && <span style={{ fontSize: '11px', color: '#6C7586', flexShrink: 0 }}>{showAnswered ? '접기' : '펼치기'}</span>}
              </button>
              {showAnswered && answered.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {answered.map(q => {
                    const sourceReport = reports.find(r => r.id === q.reportId);
                    const reportLabel = sourceReport?.createdAt?.seconds
                      ? `${new Date(kstDay(sourceReport.createdAt.seconds)).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })} 리포트`
                      : '원본 리포트를 찾을 수 없음';
                    return (
                      <div key={q.id} style={{ background: '#FAFAFA', border: '0.5px solid #E8E6E0', borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                          <p style={{ fontSize: '11px', color: '#6B7785', margin: 0 }}>{q.studentName} · {reportLabel}</p>
                          <button onClick={() => handleDeleteQuestion(q.id)} disabled={deletingQuestionId === q.id}
                            style={{
                              background: confirmDeleteQuestionId === q.id ? C.danger : 'none', border: 'none', borderRadius: '6px',
                              padding: confirmDeleteQuestionId === q.id ? '2px 8px' : 0, flexShrink: 0,
                              color: confirmDeleteQuestionId === q.id ? '#fff' : '#6B7280', fontSize: '11px', fontWeight: 700,
                              cursor: deletingQuestionId === q.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                            }}>
                            {deletingQuestionId === q.id ? '삭제 중' : confirmDeleteQuestionId === q.id ? '확인' : '삭제'}
                          </button>
                        </div>
                        <p style={{ fontSize: '12px', color: '#1A1A1A', margin: '0 0 6px', fontWeight: 600, lineHeight: 1.6 }}>Q. {q.questionText}</p>
                        <div style={{ borderLeft: `2px solid ${C.successDark}`, paddingLeft: '10px' }}>
                          <p style={{ fontSize: '12px', color: '#5A6472', margin: 0, lineHeight: 1.6 }}>A. {q.answerText}</p>
                          {q.askedAt?.seconds && q.answeredAt?.seconds && (
                            <p style={{ fontSize: '10px', color: '#6C7586', margin: '4px 0 0' }}>답변까지 {formatElapsed(q.askedAt.seconds, q.answeredAt.seconds)} 소요</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 관심이 필요한 학생 — 개념 이해도 경고/주의(GrowthDashboard와 판정 공유) + 참여도 저조
          (위 챙길 것 카드와 신호 공유) + N주째 리포트 없음(학생관리와 판정 공유)을 반별로 묶어
          하나로. 오늘/1주/1개월 탭과 무관하게 항상 보임 — 예전엔 경고/주의 배지가 1주·1개월
          탭에서만 보여서 매일 보는 오늘 화면에서 놓치기 쉬웠음(2026-08-03 통합 결정). */}
      <div style={{ background: '#fff', border: '1px solid #F3D9D9', borderLeft: '3px solid #B92C2C', borderRadius: '14px', marginBottom: '20px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 14px' }}>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#8A2020', margin: 0 }}>관심이 필요한 학생 · {atRiskStudents.length}명</p>
          <span style={{ fontSize: '11px', color: '#6C7586' }}>개념 이해도 경고/주의 · 참여도 저조 · {STALE_DAYS}일 넘게 리포트 없음</span>
        </div>
        {atRiskStudents.length === 0 ? (
          <div style={{ padding: '0 20px 18px' }}>
            <p style={{ fontSize: '12px', color: 'rgba(55,56,60,0.6)', margin: 0 }}>지금은 특별히 챙길 학생이 없어요.</p>
          </div>
        ) : (
          atRiskByClass.map(group => (
            <div key={group.classId || 'unassigned'} style={{ borderTop: '1px solid #F6ECEC', padding: '12px 20px 14px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#6C7586', margin: '0 0 8px' }}>{group.className}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.items.map(({ student, signals, visibleSignals, daysSince }) => (
                  <div key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => onOpenStudentProfile?.(student.id)}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', fontWeight: 700, color: '#1A1A1A', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                      {student.name}
                    </button>
                    {visibleSignals.map(sig => (
                      <span key={sig} style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                        ...(sig === '경고' ? { background: '#FCEBEB', color: C.errorDark }
                          : sig === '주의' ? { background: '#FAEEDA', color: C.warningText }
                          : sig === '저조' ? { background: '#FDF0F0', color: C.errorDark }
                          : { background: '#F3F4F6', color: '#6B7280' }), // 무보고
                      }}>
                        {sig === '무보고' ? `${daysSince}일째 무보고` : sig}
                      </span>
                    ))}
                    <button onClick={() => handleDismissRisk(student, signals)} disabled={dismissingRiskId === student.id}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '11px', color: '#6C7586', cursor: dismissingRiskId === student.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      {dismissingRiskId === student.id ? '처리 중' : '확인함'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 기간 컨트롤 — 예전의 날짜 선택기(이 화면 전용)와 기간 토글(GrowthDashboard 전용)을
          하나로 통합. "오늘"이면 아래에 날짜별 리포트 카드, 그 외엔 GrowthDashboard의
          KPI/추이/학생표로 완전히 전환된다(둘이 동시에 보이지 않음). */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {[['today', '오늘'], ['week', '1주'], ['month', '1개월'], ['3month', '3개월']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: '7px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
            border: `1.5px solid ${view === k ? '#0D2D6B' : '#E8E6E0'}`,
            background: view === k ? '#0D2D6B' : '#fff',
            color: view === k ? '#fff' : '#6B7280',
          }}>{l}</button>
        ))}
      </div>

      {view !== 'today' ? (
        <GrowthDashboard reports={reports} students={students} period={view} classes={classes} teachers={teachers} onOpenStudentProfile={onOpenStudentProfile} statusThresholds={statusThresholds} />
      ) : (
      <>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '11px', color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px' }}>학부모 공유</p>
          <p style={{ fontFamily: R.serif, fontSize: '22px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.01em', margin: 0 }}>원장님 데일리 보고서</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {/* 날짜 네비게이션 — 달력에서 하루씩 고르던 것을 ‹ › 이전/다음 날짜 이동으로 교체(오늘
              뷰 안에서만 나타남). 특정 날짜로 바로 점프해야 할 때를 위해 숨김 date input +
              달력 아이콘은 그대로 남겨둠(기존 showPicker() 방식 재사용). */}
          <button onClick={() => shiftDate(-1)} aria-label="이전 날짜"
            style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: '16px', padding: '4px 6px', fontFamily: 'inherit' }}>‹</button>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', minWidth: '112px', textAlign: 'center' }}>{fmtDateShort(selectedDate)}</span>
          <button onClick={() => shiftDate(1)} disabled={selectedDate >= todayStr} aria-label="다음 날짜"
            style={{ background: 'none', border: 'none', color: selectedDate >= todayStr ? '#D4D7DD' : '#374151', cursor: selectedDate >= todayStr ? 'not-allowed' : 'pointer', fontSize: '16px', padding: '4px 6px', fontFamily: 'inherit' }}>›</button>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: '4px' }}>
            {/* max 없으면 옆의 "다음 날짜" 화살표(todayStr 이상이면 비활성)와 달리 달력
                아이콘으로는 미래 날짜를 고를 수 있어, 같은 상태로 가는 두 경로의 규칙이 달랐음.
                예전엔 별도 <style> 태그로 클래스를 정의했는데, 렌더마다 새 <style> 엘리먼트가
                DOM에 재삽입돼 낭비였음 — 인라인 style로 대체해 <style> 태그 자체를 없앰 */}
            <input ref={dateInputRef} type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)} tabIndex={-1}
              style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} />
            <CalendarDays size={18} strokeWidth={2}
              role="button" tabIndex={0} aria-label="날짜 선택"
              onClick={() => dateInputRef.current?.showPicker ? dateInputRef.current.showPicker() : dateInputRef.current?.focus()}
              onKeyDown={onKeyActivate(() => dateInputRef.current?.showPicker ? dateInputRef.current.showPicker() : dateInputRef.current?.focus())}
              style={{ color: '#0D2D6B', cursor: 'pointer', flexShrink: 0 }} />
          </label>
        </div>
      </div>

      {/* 핵심 지표 — 0은 옅게, 미작성 건수만 경고색으로 눈에 띄게 */}
      <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', background: '#FAFBFC', border: '1px solid #EEF0F3', borderRadius: '14px', padding: '16px 18px', marginBottom: '20px' }}>
        {[
          { label: '총 수업', num: todayReports.length, unit: '회' },
          { label: '정시 출석', num: totalOnTime, unit: '명' },
          { label: '결석', num: totalAbsent, unit: '명' },
          { label: '리포트 미작성', num: notWrittenStudents.length, unit: '건', warnIfNonZero: true },
        ].map((item, i) => {
          const isZero = item.num === 0;
          const color = item.warnIfNonZero && !isZero ? C.warningText : isZero ? '#D4D7DD' : '#1A1A1A';
          return (
            <div key={i}>
              <span style={{ fontSize: '22px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{item.num}</span>
              <span style={{ fontSize: '12px', color: '#6C7586', marginLeft: '5px' }}>{item.label}</span>
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
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6C7586', background: '#fff', borderRadius: '14px', border: '0.5px solid #E8E6E0', gridColumn: '1 / -1' }}>
            <FileText size={28} style={{ marginBottom: '8px' }} />
            {anyScheduledToday ? (
              <>
                <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>이 날짜의 리포트가 없습니다</p>
                <p style={{ fontSize: '12px', margin: 0 }}>다른 날짜를 선택해보세요</p>
              </>
            ) : (
              <>
                <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>이 날은 예정된 수업이 없어요</p>
                <p style={{ fontSize: '12px', margin: 0 }}>학생들의 수업 요일에 포함되지 않은 날짜예요</p>
              </>
            )}
          </div>
        ) : cardItems.map(item => {
          if (item.type === 'header') {
            return (
              <p key={item.key} style={{ gridColumn: '1 / -1', fontSize: '13px', fontWeight: 700, color: '#5A6472', margin: '10px 0 2px', paddingTop: '4px', borderTop: '1px solid #EEF0F3' }}>
                {item.label} <span style={{ color: '#6C7586', fontWeight: 500 }}>· {item.count}건</span>
              </p>
            );
          }
          const r = item.report;
          const isOpen = expandedId === r.id;
          const weakDiag = (r.diagnosis || []).filter(d => d.key !== 'perfect');
          const goodDiag = (r.diagnosis || []).filter(d => d.key === 'perfect');
          // 배열 순서로만 뽑으면(구 로직: r.diagnosis?.[0]) 약점 태그와 perfect 태그가 같이
          // 선택된 리포트에서 perfect가 우연히 먼저 오면, 테두리는 빨강(약점 있음)인데 배지는
          // "개념 완벽"이 뜨는 자기모순이 생김 — 테두리 우선순위(약점 > 완벽)와 맞춤
          const mainDiag = weakDiag[0] || goodDiag[0];
          const borderColor = weakDiag.length > 0 ? C.errorDark : goodDiag.length > 0 ? C.successDark : '#E8E6E0';
          // timeZone 고정 필수 — 이 값이 학부모에게 실제로 나가는 카톡 복사 텍스트에도 그대로
          // 쓰인다(아래 dateStr 참조). 원장님 기기가 KST가 아니면 문구 날짜가 틀릴 수 있었음.
          const dateStr = r.createdAt?.seconds
            ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })
            : '';

          // 열람 여부 확인
          const views = reportViews.filter(v => v.reportId === r.id);
          const isViewed = views.length > 0;
          const lastView = isViewed ? views.sort((a, b) => (b.viewedAt?.seconds || 0) - (a.viewedAt?.seconds || 0))[0] : null;
          const lastViewTime = lastView?.viewedAt?.seconds
            ? new Date(lastView.viewedAt.seconds * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
            : '';
          const viewSrc = lastView?.src === 'kakao' ? '카카오' : lastView?.src === 'copy' ? '링크복사' : '직접';

          // 학부모 질문 — reportViews와 동일하게 이미 메모리에 있는 목록을 reportId로 필터링(추가 조회 없음)
          const questions = reportQuestions.filter(q => q.reportId === r.id);
          const unansweredCount = questions.filter(q => !q.answerText).length;

          return (
            <div key={r.id} style={{ background: '#fff', border: `0.5px solid ${borderColor}`, borderRadius: '14px', overflow: 'hidden', gridColumn: isOpen ? '1 / -1' : 'auto' }}>

              {/* 요약 행 — 안에 종합 프로필 버튼·성장 포트폴리오 링크가 따로 있어 role="button"은
                  안 씀(중첩 시맨틱 충돌). tabIndex+onKeyDown으로 키보드 포커스·Enter/Space만 추가.
                  중첩된 버튼/링크는 onClick에서 stopPropagation하지만 keydown은 그대로 버블링돼
                  이 div까지 올라오므로(React 합성 이벤트는 버블 단계에서 잡힘), 키보드로 그
                  버튼/링크에 Enter를 눌러도 의도한 동작 대신 카드가 접히기만 했음 —
                  e.target===e.currentTarget로 이 div 자체에서 시작된 keydown만 처리하도록 제한 */}
              <div tabIndex={0} style={{ padding: '12px 14px', cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onKeyDown={(e) => { if (e.target === e.currentTarget) onKeyActivate(() => setExpandedId(expandedId === r.id ? null : r.id))(e); }}>

                {/* 상단: 학생명 + 열람배지 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EAF0F9', color: '#0D2D6B', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {r.studentName?.[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{r.studentName}</p>
                      <p style={{ fontSize: '10px', color: '#6B7785', margin: 0 }}>{r.teacherName}{/선생님$/.test(r.teacherName || '') ? '' : ' 선생님'}</p>
                    </div>
                  </div>

                  {/* 열람 배지 — draft(자동저장만 되고 아직 최종 저장 안 됨)는 열람 여부와
                      무관하게 "작성 중"으로 표시. 안 그러면 선생님이 쓰다 만 리포트가
                      "미열람"으로 잡혀 실제로는 보낸 적도 없는데 발송된 것처럼 보임.
                      결석 처리된 날은 평가/열람 자체가 의미가 없어서 다른 배지보다 우선 표시 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexShrink: 0 }}>
                    {unansweredCount > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: C.primary, background: '#EAF0F9', padding: '2px 8px', borderRadius: '10px' }}>질문 {unansweredCount}건</span>
                    )}
                    {r.attendance === '결석' ? (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: C.errorDark, background: C.errorBg, padding: '2px 8px', borderRadius: '10px' }}>결석</span>
                    ) : r.isDraft ? (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: C.warningText, background: C.warningBg, padding: '2px 8px', borderRadius: '10px' }}>작성 중</span>
                    ) : isViewed ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: C.successDark, background: C.successBg, padding: '2px 8px', borderRadius: '10px' }}>✓ 열람완료</span>
                        <span style={{ fontSize: '10px', color: T.textMute, marginTop: '2px' }}>{viewSrc} · {lastViewTime}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: C.warningText, background: C.warningBg, padding: '2px 8px', borderRadius: '10px' }}>미열람</span>
                    )}
                  </div>
                </div>

                {/* 2행: 교재+단원 · 점수 — 항상 한 줄, 넘치면 말줄임(줄바꿈 안 함).
                    결석 처리된 날은 과제/개념 평가가 원래 없는 게 정상이라 0%로 보여주지 않음 */}
                <p style={{ fontSize: '12px', color: r.attendance === '결석' ? '#6C7586' : '#1A1A1A', margin: '0 0 6px', paddingLeft: '36px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.attendance === '결석' ? '수업 없이 결석 처리됐어요' : (
                    <>
                      {r.textbook && <span style={{ fontWeight: 600 }}>{r.textbook}{r.unit ? ` · ${r.unit}` : ''}{r.pages ? ` ${r.pages}` : ''}</span>}
                      <span style={{ color: '#5A6472' }}>
                        {r.textbook ? ' · ' : ''}과제 {r.homeworkRating != null ? `${toPct(r.homeworkRating)}%` : '미평가'} · 개념 {r.conceptRating != null ? `${toPct(r.conceptRating)}%` : '미평가'}
                        {/* r.testScore != null && !== '' — 지금은 testScore가 항상 문자열이라
                            truthy 체크로도 문제없지만(빈 문자열만 falsy), 혹시 나중에 숫자
                            타입으로 바뀌면 진짜 0점이 "미입력"처럼 사라지는 걸 미리 방지 */}
                        {r.hasTest && r.testScore != null && r.testScore !== '' ? ` · 시험 ${r.testScore}점` : ''}
                      </span>
                    </>
                  )}
                </p>

                {/* 3행: 진단태그(있으면) + 버튼 — 태그 유무와 무관하게 항상 이 줄 하나만 차지해서 카드 높이가 통일됨 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingLeft: '36px' }}>
                  {mainDiag && DIAG_MAP[mainDiag.key] ? (
                    <span style={{ background: DIAG_MAP[mainDiag.key].bg, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                      {DIAG_MAP[mainDiag.key].prefix} {DIAG_MAP[mainDiag.key].label}
                    </span>
                  ) : <span />}

                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {/* 서랍(경량) 대신 학생관리 탭으로 바로 이동 — 여기는 "기간" 개념이 없는
                        오늘 카드 목록이라애초에 statusInfo도 못 채워주는 얕은 진입점이었음.
                        서랍을 한 번 더 거치지 않고 깊은 화면으로 바로 보내는 게 더 맞음 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenStudentProfile?.(r.studentId); }}
                      style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, background: '#EAF0F9', color: C.primary, border: `1px solid ${C.primary}`, borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      종합 프로필
                    </button>
                    {/* 원장분석에서 성장 포트폴리오로 갈 방법이 없었음 — 성장 대시보드/학생관리
                        탭까지 넘어가야 했던 걸 여기서 바로 열게 함 */}
                    <a href={`/story/${r.studentId}?edit=1`} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, background: '#FBF1DE', color: '#8A6412', border: '1px solid #8A6412', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                      성장 포트폴리오
                    </a>
                  </div>
                </div>
              </div>

              {/* 펼쳐진 상세 */}
              {isOpen && (
                <div style={{ borderTop: '0.5px solid #F3F4F6', background: '#FAFAFA', padding: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>

                    {/* 약점 상세 */}
                    {r.diagnosis?.length > 0 && (
                      <div>
                        <p style={{ fontSize: '11px', color: T.textMute, fontWeight: 600, margin: '0 0 6px', letterSpacing: '0.06em' }}>약점 상세</p>
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
                        <p style={{ fontSize: '11px', color: T.textMute, fontWeight: 600, margin: '0 0 6px', letterSpacing: '0.06em' }}>선생님 코멘트</p>
                        <div style={{ borderLeft: '2px solid #C9A227', paddingLeft: '10px' }}>
                          <p style={{ fontSize: '12px', color: '#5A6472', margin: 0, lineHeight: 1.7, fontStyle: 'italic' }}>"{r.teacherNote}"</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 다음 수업 계획 */}
                  {r.nextPlan && (
                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#EAF0F9', borderRadius: '8px' }}>
                      <p style={{ fontSize: '11px', color: C.primary, fontWeight: 600, margin: '0 0 3px', letterSpacing: '0.06em' }}>다음 수업 계획</p>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#0D2D6B', margin: 0 }}>{r.nextPlan}{r.nextPlanDetail ? ` · ${r.nextPlanDetail}` : ''}</p>
                    </div>
                  )}

                  {/* 원장님 메모 */}
                  <div>
                    <p style={{ fontSize: '11px', color: T.textMute, fontWeight: 600, margin: '0 0 5px', letterSpacing: '0.06em' }}>원장님 메모</p>
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
                        style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, background: savingMemo === r.id ? '#E5E7EB' : '#0D2D6B', color: savingMemo === r.id ? '#6C7586' : '#fff', border: 'none', borderRadius: '8px', cursor: savingMemo === r.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                        {savingMemo === r.id ? '저장 중' : '저장'}
                      </button>
                    </div>
                  </div>

                  {/* 학부모 질문 */}
                  {questions.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <p style={{ fontSize: '11px', color: T.textMute, fontWeight: 600, margin: '0 0 5px', letterSpacing: '0.06em' }}>학부모 질문 · {questions.length}건</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {questions.map(q => (
                          <div key={q.id} style={{ background: '#FAFAFA', border: '0.5px solid #E8E6E0', borderRadius: '8px', padding: '10px 12px' }}>
                            <p style={{ fontSize: '12px', color: '#1A1A1A', margin: '0 0 8px', lineHeight: 1.6 }}>{q.questionText}</p>
                            {q.answerText ? (
                              <div style={{ borderLeft: `2px solid ${C.successDark}`, paddingLeft: '10px' }}>
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
                                  style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, background: savingAnswer === q.id ? '#E5E7EB' : '#0D2D6B', color: savingAnswer === q.id ? '#6C7586' : '#fff', border: 'none', borderRadius: '8px', cursor: savingAnswer === q.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
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
                    <p style={{ fontSize: '11px', color: T.textMute, fontWeight: 600, margin: '0 0 7px', letterSpacing: '0.06em' }}>학부모 전송 미리보기</p>
                    {/* 미리보기 카드 */}
                    <div style={{ background: '#F5F8FF', border: '1px solid #C5D5F0', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
                      <p style={{ fontSize: '11px', color: C.primary, fontWeight: 700, margin: '0 0 6px' }}>📋 {academyName || '데일리 리포트'} 수업 리포트</p>
                      <p style={{ fontSize: '13px', fontWeight: 800, color: '#0D2D6B', margin: '0 0 4px' }}>{r.studentName} 학생 · {dateStr}</p>
                      <div style={{ display: 'flex', gap: '10px', margin: '0 0 6px', flexWrap: 'wrap' }}>
                        {r.homeworkRating != null && <span style={{ fontSize: '11px', color: '#5A6472' }}>과제 {toPct(r.homeworkRating)}%</span>}
                        {r.conceptRating != null && <span style={{ fontSize: '11px', color: '#5A6472' }}>개념 {toPct(r.conceptRating)}%</span>}
                        <span style={{ fontSize: '11px', color: r.attendance === '정시' ? C.successDark : C.errorDark }}>{r.attendance}</span>
                        {r.hasTest && r.testScore != null && r.testScore !== '' && <span style={{ fontSize: '11px', color: '#5A6472' }}>시험 {r.testScore}점</span>}
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
                      <p style={{ fontSize: '10px', color: '#6B7785', margin: 0 }}>👉 자세한 리포트 보기 →</p>
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
                          r.hasTest && r.testScore != null && r.testScore !== '' ? `▸ 시험: ${r.testName ? `${r.testName} ` : ''}${r.testScore}점` : '',
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
        <div style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '14px', padding: '14px' }}>
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
      </>
      )}
    </div>
  );
}
