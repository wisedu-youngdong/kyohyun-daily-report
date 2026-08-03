import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDoc, getDocs, query, where, doc, setDoc, limit } from 'firebase/firestore';
import { ReportCard, R, deriveSkinColors } from './tokens.jsx';
import { toPct, isNewStudent as computeIsNewStudent, fetchAcademyBranding, resolveUnitGroup } from './growth.js';
import { DIAG_LABELS as diagLabels, DIAG_SOFT as DIAG_COLORS } from './diagnosis.js';

// 학부모에게 저장 즉시 노출되는 서사 문구 — 강사가 너무 길게/짧게 써서 카드 UI가
// 무너지지 않도록 최대 글자 수를 두고, 입력창에 남은 글자 수를 보여준다.
const NARRATIVE_MAX_LEN = 150;
function EditCharCount({ text, dark }) {
  const len = (text || '').length;
  const over = len >= NARRATIVE_MAX_LEN;
  return (
    <p style={{ fontSize: '10px', textAlign: 'right', margin: '4px 0 0', color: over ? R.negative : dark ? 'rgba(255,255,255,0.4)' : '#6C7586' }}>
      {len}/{NARRATIVE_MAX_LEN}자
    </p>
  );
}

// 원장분석 등에서 새 탭으로 이 페이지를 처음 열면, Firebase가 저장된 로그인 세션을
// 로컬 저장소에서 복원하는 데 살짝 시간이 걸려서 auth.currentUser가 아직 비어있을 수
// 있음 — "AI 서사 생성" 클릭이 그 찰나에 걸리면 "로그인이 필요합니다"가 잘못 뜨던 버그.
// 이미 로그인 상태가 확정됐으면 즉시, 아직이면 onAuthStateChanged가 처음 알려줄 때까지 기다림
function waitForAuthUser() {
  return new Promise((resolve) => {
    if (auth.currentUser) { resolve(auth.currentUser); return; }
    const unsub = onAuthStateChanged(auth, (user) => { unsub(); resolve(user); });
  });
}

const FONT_STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif;
  }
  * { word-break: keep-all; }
  @keyframes pageSlideNext { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pageSlidePrev { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
`;

export default function GrowthStory() {
  const { studentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [student, setStudent] = useState(null);
  const [reports, setReports] = useState([]);
  // 학생 문서가 academies/{academyId}/students 밑으로 옮겨가면서, studentIndex에서
  // 먼저 academyId를 찾아야 실제 문서와 리포트를 조회할 수 있음 — 서사 저장 시에도 재사용
  const [academyId, setAcademyId] = useState(null);
  const [academyName, setAcademyName] = useState(null);
  const [academyGlobalSkinColor, setAcademyGlobalSkinColor] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // 'network' | null
  const [retryKey, setRetryKey] = useState(0);
  const [narLoading, setNarLoading] = useState(false);
  const [monthlySummaryLoading, setMonthlySummaryLoading] = useState(false);
  const [regenField, setRegenField] = useState(null); // 항목별 재생성 진행 중인 필드 키
  const [editing, setEditing] = useState(null);
  const [showAllUnits, setShowAllUnits] = useState(false);
  const [unitPhotoIdx, setUnitPhotoIdx] = useState({}); // 단원별 정리 카드 — 단원 key -> 현재 보여줄 사진 인덱스
  const [completedReviews, setCompletedReviews] = useState([]); // 복습 효과 증명 그래프용
  const [trendTooltip, setTrendTooltip] = useState(null); // 성적 추이 차트 — 탭해서 선택된 지점의 인덱스
  const [editText, setEditText] = useState('');
  const trendChartRef = useRef(null);

  // 성적 추이 차트 바깥을 탭하면 선택 해제 — 카드 안(같은 점 재클릭/✕ 버튼)에서 이미
  // 처리하는 케이스와 안 겹치게, ref로 감싼 영역 밖 클릭만 여기서 처리
  useEffect(() => {
    if (trendTooltip == null) return;
    const onDocClick = (e) => {
      if (trendChartRef.current && !trendChartRef.current.contains(e.target)) setTrendTooltip(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [trendTooltip]);

  // 책장 넘기듯 좌우 탐색 — 예전엔 한 화면에 전부 이어붙여서 스크롤이 너무 길었음.
  // 페이지 목록(pages)은 실데이터 유무에 따라 페이지 자체가 없을 수도 있어(예: 시험 점수도
  // 약점 태그도 없는 신규생은 "평가 추이" 페이지가 통째로 비어 아래에서 필터링됨) 아래
  // return 문 안에서 실데이터 계산이 끝난 뒤 동적으로 구성함.
  const [page, setPage] = useState(0);
  const [slideDir, setSlideDir] = useState(1); // 1: 다음(→에서 옴), -1: 이전(←에서 옴)
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);

  // 기간 선택 — 캘린더로 시작일/종료일 직접 지정. URL 파라미터(from/to)와 연동.
  // 새 UI 라이브러리 없이 <input type="date">의 브라우저 기본 캘린더를 그대로 씀
  // (달력 그리드를 직접 구현하지 않아도 진짜 캘린더 UI가 나옴).
  const [periodFrom, setPeriodFrom] = useState(searchParams.get('from') || '');
  const [periodTo, setPeriodTo] = useState(searchParams.get('to') || '');

  // 학부모 공개 링크에는 관리자용 생성/편집 UI를 숨김 (?edit=1일 때만 노출)
  const isEditor = searchParams.get('edit') === '1';

  const applySearchParams = (from, to) => {
    const next = {};
    if (from) next.from = from;
    if (to) next.to = to;
    if (isEditor) next.edit = '1';
    setSearchParams(next);
  };
  const handleFromChange = (val) => {
    setPeriodFrom(val);
    setShowAllUnits(false);
    setPage(0);
    applySearchParams(val, periodTo);
  };
  const handleToChange = (val) => {
    setPeriodTo(val);
    setShowAllUnits(false);
    setPage(0);
    applySearchParams(periodFrom, val);
  };
  const handleClearPeriod = () => {
    setPeriodFrom('');
    setPeriodTo('');
    setShowAllUnits(false);
    setPage(0);
    applySearchParams('', '');
  };

  // AI가 생성한 원문이 150자를 넘을 수 있어 편집창을 열 때부터 잘라서 불러옴
  // (maxLength는 신규 타이핑만 막고, 이미 불러온 긴 값은 못 막기 때문)
  const startEdit = (field) => { setEditing(field); setEditText((narrative[field] || '').slice(0, NARRATIVE_MAX_LEN)); };
  const saveEdit = async () => {
    const previous = narrative;
    const updated = { ...narrative, [editing]: editText };
    setNarrative(updated);
    setEditing(null);
    try {
      await setDoc(doc(db, 'academies', academyId, 'students', studentId), { narrative: updated }, { merge: true });
    } catch (e) {
      console.error('서사 저장 실패:', e);
      setNarrative(previous);
      alert('저장에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.');
    }
  };
  const cancelEdit = () => setEditing(null);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    setLoadError(null);
    async function load() {
      try {
        const indexSnap = await getDoc(doc(db, 'studentIndex', studentId));
        if (!indexSnap.exists()) { setLoading(false); return; } // student 상태가 null로 남아 "찾을 수 없음" 처리됨
        const foundAcademyId = indexSnap.data().academyId;
        setAcademyId(foundAcademyId);
        fetchAcademyBranding(foundAcademyId).then(b => {
          setAcademyName(b.academyName || null);
          setAcademyGlobalSkinColor(b.globalSkinColor || null);
        });

        // 복습 효과 증명 그래프용 — reviews는 강사 전용 컬렉션이라 서버 프록시로 조회 (부가 기능이라 실패해도 본문 표시는 계속)
        fetch(`/api/review-history?academyId=${encodeURIComponent(foundAcademyId)}&studentId=${encodeURIComponent(studentId)}`)
          .then(r => r.ok ? r.json() : { reviews: [] })
          .then(({ reviews }) => setCompletedReviews(reviews || []))
          .catch(() => {});

        const [stuSnap, rSnap] = await Promise.all([
          getDoc(doc(db, 'academies', foundAcademyId, 'students', studentId)),
          getDocs(query(collection(db, 'academies', foundAcademyId, 'reports'), where('studentId', '==', studentId), limit(200)))
        ]);

        if (stuSnap.exists()) {
          const studentData = stuSnap.data();
          setStudent({ id: stuSnap.id, ...studentData });
          if (studentData.narrative) setNarrative(studentData.narrative);
        }

        // isDraft !== true — 자동저장 초안만 제외. Firestore where('isDraft','==',false)로 하면
        // isDraft 필드 자체가 없는 예전 리포트(기능 추가 이전 작성분)까지 통째로 빠져버려서
        // (Firestore는 필드 없는 문서를 등호 쿼리에서 항상 제외함) 클라이언트에서 직접 거름.
        const rList = rSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r => r.isDraft !== true)
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        setReports(rList);
      } catch (e) {
        console.error('❌ Firebase 오류:', e);
        setLoadError('network');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studentId, retryKey]);

  // 데이터 가공
  // 기간 필터 적용
  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로 0~100(%) 기준으로 정규화
  const allSorted = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({ ...r, conceptRating: r.conceptRating == null ? null : toPct(r.conceptRating), homeworkRating: r.homeworkRating == null ? null : toPct(r.homeworkRating) }));
  // 'YYYY-MM-DD' — <input type="date">가 주는 값과 같은 포맷이라 문자열 비교로 바로 범위
  // 필터링 가능. fmtDate와 마찬가지로 별도 KST 보정 없이 브라우저 로컬 시간 기준(클라이언트
  // 렌더링이라 한국에서 보면 자연히 KST와 일치).
  const dayKeyOf = (seconds) => {
    const d = new Date(seconds * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const hasCustomRange = !!(periodFrom && periodTo);
  // 최소 2주 — 너무 좁은 구간은 마일스톤/차트가 텅 비어 보여서 최소 표본을 강제
  const rangeDays = hasCustomRange ? Math.abs(Math.round((new Date(`${periodTo}T00:00:00`) - new Date(`${periodFrom}T00:00:00`)) / 86400000)) + 1 : null;
  const rangeTooShort = hasCustomRange && rangeDays < 14;
  const rangeActive = hasCustomRange && !rangeTooShort;
  const sorted = rangeActive
    ? allSorted.filter(r => r.createdAt?.seconds && dayKeyOf(r.createdAt.seconds) >= periodFrom && dayKeyOf(r.createdAt.seconds) <= periodTo)
    : allSorted;
  const fmtDate = (r) => {
    if (!r?.createdAt?.seconds) return '';
    const d = new Date(r.createdAt.seconds * 1000);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  // 단원별 차수 점수 집계 — 한 세션이 여러 단원("2~3단원", "4단원,5단원")을 다루면 예전엔
  // 언급된 단원 전부에 회차를 반영했는데, 그러면 이 페이지 헤더의 "11회 수업"과 단원별 합
  // (12회)이 어긋나 학부모 신뢰를 해쳤다(실제 발견된 문제, 2026-08-03). growth.js의
  // resolveUnitGroup으로 세션마다 "주 단원" 하나만 정해 회차를 귀속시키고, 나머지는
  // "함께 다룬 단원"으로만 표기 — 세션 합계는 항상 sorted.length와 일치한다(호출부가
  // group.key 하나에만 1회씩 기여하므로 자동으로 보장됨).
  const unitScoreMap = {};
  const pushUnitScore = (groupKey, label, round, score, dateStr, seconds) => {
    if (!unitScoreMap[groupKey]) unitScoreMap[groupKey] = { label, scores: [], lastSeconds: 0 };
    unitScoreMap[groupKey].scores.push({ round, score, date: dateStr });
    unitScoreMap[groupKey].lastSeconds = seconds || unitScoreMap[groupKey].lastSeconds;
  };
  sorted.forEach(r => {
    if (!r.hasTest || !r.testScore) return;
    const group = resolveUnitGroup(r);
    // 단원/교재를 아예 안 적은 시험 점수는 group이 null — testName → '단원평가' 순으로 대체
    const label = group?.label || (r.testName && r.testName.trim()) || '단원평가';
    const key = group?.key || label;
    pushUnitScore(key, label, r.testRound || '', Number(r.testScore), fmtDate(r), r.createdAt?.seconds || 0);
  });
  // 최근에 다룬 단원이 먼저 보이도록 정렬 — "전체" 기간처럼 단원이 많을 때 최신순으로 우선 노출
  const unitScores = Object.values(unitScoreMap)
    .sort((a, b) => b.lastSeconds - a.lastSeconds)
    .map(({ label, scores }) => ({ unit: label, scores }));

  // 단원별 정리 카드 — 사진+평균 이해도+코멘트를 단원 단위로 묶어서 보여줌(상담용, 2026-08-02
  // 결정: 텍스트로만 설명하던 걸 사진·차트·코멘트로 객관적으로 보여주고 싶다는 요청).
  // 위 단원별 시험 점수 집계와 같은 resolveUnitGroup을 쓰되, 시험 본 날만 잡는 unitScoreMap과
  // 달리 이건 매 리포트(사진·이해도·코멘트가 남는 평상시 수업)를 전부 대상으로 함 — 실제로
  // 매일 기록되는 건 시험이 아니라 숙제 체크이기 때문. 부단원은 자기 카드를 안 만들고(0회
  // 카드가 뜨는 것 방지) 주 단원 카드 안에 "함께 다룬 단원"으로만 한 줄 표기한다.
  const unitCardMap = {};
  sorted.forEach(r => {
    const group = resolveUnitGroup(r);
    if (!group) return;
    if (!unitCardMap[group.key]) unitCardMap[group.key] = { label: group.label, reports: [], together: new Set(), lastSeconds: 0 };
    unitCardMap[group.key].reports.push(r);
    group.secondaryLabels.forEach(l => unitCardMap[group.key].together.add(l));
    unitCardMap[group.key].lastSeconds = Math.max(unitCardMap[group.key].lastSeconds, r.createdAt?.seconds || 0);
  });
  const unitCards = Object.entries(unitCardMap)
    .sort((a, b) => b[1].lastSeconds - a[1].lastSeconds)
    .map(([key, { label, reports, together }]) => {
      const asc = [...reports].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      const conceptPcts = asc.filter(r => r.conceptRating != null).map(r => toPct(r.conceptRating));
      const homeworkPcts = asc.filter(r => r.homeworkRating != null).map(r => toPct(r.homeworkRating));
      const photoReports = asc.filter(r => r.photoUrls?.length > 0);
      // 코멘트는 이 단원에서 가장 최근에 남긴 것 하나만 — 지어내지 않고 실제 작성분 그대로(무과장 원칙)
      const latestWithNote = [...asc].reverse().find(r => r.teacherNote?.trim());
      const tagCount = {};
      asc.forEach(r => (r.diagnosis || []).forEach(d => { tagCount[d.key] = (tagCount[d.key] || 0) + 1; }));
      // 태그 3개 나열 대신 한 문장으로(핸드오프 §2-3) — 성장 포트폴리오인데 태그가 전부
      // 결점이면 문서 성격과 어긋난다는 지적. 실제로 기록된 태그 이름만 인용(지어내지 않음).
      const topTagKeys = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
      const nonPerfectTags = topTagKeys.filter(k => k !== 'perfect').map(k => diagLabels[k] || k);
      const tagSentence = topTagKeys.length === 0 ? ''
        : nonPerfectTags.length === 0 ? '이 단원은 개념을 정확히 이해하고 있어요.'
        : `최근 자주 보인 유형은 ${nonPerfectTags.join(', ')}입니다.`;
      return {
        key, label, count: asc.length,
        together: Array.from(together),
        avgConcept: conceptPcts.length ? Math.round(conceptPcts.reduce((a, b) => a + b, 0) / conceptPcts.length) : null,
        avgHomework: homeworkPcts.length ? Math.round(homeworkPcts.reduce((a, b) => a + b, 0) / homeworkPcts.length) : null,
        photoReports,
        comment: latestWithNote?.teacherNote || '',
        tagSentence,
      };
    });

  // 전체 평균 추이 (차수별)
  const allScores = sorted.filter(r => r.hasTest && r.testScore).map(r => Number(r.testScore));
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;
  const maxScore = allScores.length > 0 ? Math.max(...allScores) : null;
  const minScore = allScores.length > 0 ? Math.min(...allScores) : null;
  // 최고점을 받은 실제 리포트 — KEY METRICS "최고 단원평가"에 어느 단원·언제인지 같이 보여주려고
  const maxScoreReport = sorted
    .filter(r => r.hasTest && r.testScore)
    .reduce((best, r) => (!best || Number(r.testScore) > Number(best.testScore)) ? r : best, null);

  // 복습 효과 증명 — 완료된 복습마다 "진단 당시 원본 리포트 점수 → 복습 후 재시험 점수" 비교.
  // 원본 리포트에 시험 점수 자체가 없던 진단(개념 이해도 기반 등)은 비교 대상이 없어 자연히 제외됨.
  const periodRange = rangeActive
    ? { start: new Date(`${periodFrom}T00:00:00`).getTime() / 1000, end: new Date(`${periodTo}T23:59:59`).getTime() / 1000 }
    : null;
  const reviewProof = completedReviews
    .filter(rv => rv.testScore != null && (!periodRange || (rv.completedAt >= periodRange.start && rv.completedAt <= periodRange.end)))
    .map(rv => {
      const sourceReport = reports.find(r => r.id === rv.reportId);
      if (!sourceReport?.hasTest || !sourceReport.testScore) return null;
      return {
        id: rv.id,
        unit: rv.unit || sourceReport.unit || '',
        weakLabel: rv.weakTypes?.[0]?.label || diagLabels[rv.weakTypes?.[0]?.key] || '',
        round: rv.round,
        before: Number(sourceReport.testScore),
        after: Number(rv.testScore),
        note: rv.note,
        completedAt: rv.completedAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.completedAt - a.completedAt);
  const reviewProofImproved = reviewProof.filter(p => p.after > p.before).length;

  // 최고 이해도 수업
  const bestReport = [...sorted].sort((a, b) => (b.conceptRating || 0) - (a.conceptRating || 0))[0];
  // 과제 평균 — 미입력(null) 리포트는 분모에서 제외
  const hwRated = sorted.filter(r => r.homeworkRating != null);
  const hwAvg = hwRated.length > 0
    ? Math.round(hwRated.reduce((s, r) => s + r.homeworkRating, 0) / hwRated.length)
    : null;
  // 개념 이해 평균 — 1페이지 "학습" 묶음에 과제 수행과 나란히 필요해 hwAvg와 같은 방식으로 추가
  const conceptRated = sorted.filter(r => r.conceptRating != null);
  const conceptAvg = conceptRated.length > 0
    ? Math.round(conceptRated.reduce((s, r) => s + r.conceptRating, 0) / conceptRated.length)
    : null;
  // 출석 요약 — KEY METRICS 맨 아래 카드가 결석 유무/지각 유무에 따라 3가지로 갈림
  // (기존 allAttended는 attendance값이 '정시'/'지각'/'결석'/... 인데 '출석'과 비교해서 항상 false였던 죽은 코드였음)
  const onTimeCount = sorted.filter(r => r.attendance === '정시').length;
  const lateCount = sorted.filter(r => r.attendance === '지각').length;
  const absentCount = sorted.filter(r => r.attendance === '결석').length;
  const attendanceRate = sorted.length > 0 ? Math.round(onTimeCount / sorted.length * 100) : 0;

  // 신규생/재학생 분기
  const isNewStudent = computeIsNewStudent(student, sorted.length);

  // 기간 표시
  const periodLabel = sorted.length > 0
    ? `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])} · ${sorted.length}회 수업`
    : '';

  // 날짜 입력의 min/max — 실제 리포트가 있는 범위 밖은 애초에 고를 수 없게(리포트 0건 구간
  // 선택 방지). allSorted는 오름차순 정렬이라 첫/마지막이 그대로 최소/최대.
  const earliestDay = allSorted[0]?.createdAt?.seconds ? dayKeyOf(allSorted[0].createdAt.seconds) : undefined;
  const latestDay = allSorted[allSorted.length - 1]?.createdAt?.seconds ? dayKeyOf(allSorted[allSorted.length - 1].createdAt.seconds) : undefined;

  // AI 서사 생성 — 전체(3개 항목 한 번에). 이미 서사가 있으면 직접 편집한 내용까지
  // 통째로 덮어써지므로 반드시 한 번 확인받음
  const handleGenNarrative = async () => {
    if (narrative && !window.confirm('3개 항목(한 달의 결론 + 선생님 한마디 + 다음 이야기)이 전부 새로 생성되고, 직접 편집한 내용도 덮어써져요. 계속할까요?')) return;
    setNarLoading(true);
    const teacherNotes = sorted
      .filter(r => r.teacherNote)
      .map(r => r.teacherNote);
    try {
      const user = await waitForAuthUser();
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/narrative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          studentName: student?.name || '학생',
          unitScores,
          teacherNotes,
          isNewStudent,
          totalReports: sorted.length,
        })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data?.error === '로그인이 필요합니다.' ? '로그인 후 이용해주세요.' : `오류: ${JSON.stringify(data)}`);
      } else {
        setNarrative(data);
        try {
          await setDoc(doc(db, 'academies', academyId, 'students', studentId), { narrative: data }, { merge: true });
        } catch (e) {
          console.error('서사 저장 실패:', e);
          alert('서사가 생성됐지만 저장에는 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.');
        }
      }
    } catch (e) {
      alert(`오류: ${e.message}`);
    }
    setNarLoading(false);
  };

  // 항목별 재생성 — 그 항목 하나만 새로 만들고 나머지는 그대로 둠. 다른 항목들에
  // 선생님이 직접 다듬어 둔 글이 있으면 서버가 그 문체를 참고해서 생성함
  const handleRegenField = async (fieldKey) => {
    if (regenField) return; // 이미 다른 항목 재생성 중
    setRegenField(fieldKey);
    const teacherNotes = sorted.filter(r => r.teacherNote).map(r => r.teacherNote);
    try {
      const user = await waitForAuthUser();
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/narrative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          field: fieldKey,
          currentNarrative: narrative,
          studentName: student?.name || '학생',
          unitScores,
          teacherNotes,
          isNewStudent,
          totalReports: sorted.length,
        })
      });
      const data = await response.json();
      if (!response.ok || !data.text) {
        alert(data?.error === '로그인이 필요합니다.' ? '로그인 후 이용해주세요.' : `오류: ${data?.error || '재생성에 실패했습니다.'}`);
      } else {
        const updated = { ...narrative, [fieldKey]: data.text };
        setNarrative(updated);
        try {
          await setDoc(doc(db, 'academies', academyId, 'students', studentId), { narrative: updated }, { merge: true });
        } catch (e) {
          console.error('서사 저장 실패:', e);
          alert('새 문구가 생성됐지만 저장에는 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.');
        }
      }
    } catch (e) {
      alert(`오류: ${e.message}`);
    }
    setRegenField(null);
  };

  // AI 기간 요약 생성 — "학습 기록 상세" 페이지 상단에 붙는 2~3문장 요약. 공개 페이지에서
  // 열람마다 자동 생성하면 비용/지연이 통제 안 되므로, 원장이 눌러야만 생성되고 결과는
  // 학생 문서에 캐싱됨(narrative와 동일한 패턴). 캐시에 생성 당시 선택된 기간을 같이 저장해,
  // 기간을 바꾸면 안 맞는 캐시가 조용히 숨겨지고 재생성을 유도함(가이드라인 문서 04번 참고).
  const handleGenMonthlySummary = async () => {
    setMonthlySummaryLoading(true);
    const teacherNotes = sorted.filter(r => r.teacherNote?.trim()).map(r => r.teacherNote);
    try {
      const user = await waitForAuthUser();
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/narrative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          type: 'monthlySummary',
          studentName: student?.name || '학생',
          teacherNotes,
        })
      });
      const data = await response.json();
      if (!response.ok || !data.text) {
        alert(data?.error === '로그인이 필요합니다.' ? '로그인 후 이용해주세요.' : `오류: ${data?.error || '요약 생성에 실패했습니다.'}`);
      } else {
        const updated = { text: data.text, periodFrom, periodTo, generatedAt: Date.now() };
        setStudent(s => ({ ...s, aiMonthlySummary: updated }));
        try {
          await setDoc(doc(db, 'academies', academyId, 'students', studentId), { aiMonthlySummary: updated }, { merge: true });
        } catch (e) {
          console.error('기간 요약 저장 실패:', e);
          alert('요약이 생성됐지만 저장에는 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.');
        }
      }
    } catch (e) {
      alert(`오류: ${e.message}`);
    }
    setMonthlySummaryLoading(false);
  };

  if (loading) return (
    <div style={{ background: '#F5F5F0', minHeight: '100dvh', padding: '24px 16px', display: 'flex', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif" }}>
      <style>{`@keyframes storyPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.9; } }`}</style>
      <div style={{ width: '100%', maxWidth: '680px' }}>
        <div style={{ borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.10)' }}>
          <div style={{ background: R.navy, padding: '32px 24px 28px' }}>
            <div style={{ width: '55%', height: '20px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', marginBottom: '10px', animation: 'storyPulse 1.4s ease-in-out infinite' }} />
            <div style={{ width: '35%', height: '12px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', animation: 'storyPulse 1.4s ease-in-out infinite' }} />
          </div>
          <div style={{ background: '#fff', padding: '22px' }}>
            {[85, 60, 92].map((w, i) => (
              <div key={i} style={{ width: `${w}%`, height: '12px', background: '#EDEBE7', borderRadius: '4px', marginBottom: '14px', animation: 'storyPulse 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (loadError) return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif", color: '#757575', fontSize: '14px' }}>
      <p style={{ margin: 0 }}>정보를 불러오지 못했습니다.</p>
      <button onClick={() => setRetryKey(k => k + 1)} style={{ padding: '9px 20px', background: R.navy, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>다시 시도</button>
    </div>
  );

  if (!student) return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif", color: '#757575', fontSize: '14px' }}>
      학생 정보를 찾을 수 없습니다.
    </div>
  );

  const teacherName = sorted[sorted.length - 1]?.teacherName || '';
  const teacherDisplay = teacherName ? teacherName.replace(/선생님$/, '').trim() + ' 선생님' : '담당 교사';

  // 학원/학생 스킨 반영 — 우선순위는 리포트 작성 화면·PublicReport와 동일(학생 개별 색 >
  // 학원 기본색 > navy). 학생/학원 스킨은 주조색 1개만 저장하는 구조라(accent는 항상 gold
  // 고정) PublicReport.jsx의 report.skin 저장 로직과 동일하게 gold를 accent로 고정 사용.
  // 이 페이지는 리포트 1건이 아니라 학생 단위 집계라 report.skin(발송 시점 스냅샷)을 쓸 수
  // 없어 "현재" 학원/학생 설정을 그대로 읽음 — 예전 리포트와 색이 다르게 보일 수 있는 게
  // 정상(설정 화면에서 방금 바꾼 색이 바로 반영돼야 하므로).
  const sk = deriveSkinColors(student.skinColor || academyGlobalSkinColor || R.navy, R.gold);

  // 카드 폭 420→680px 확대(2026-07-31 성장 포트폴리오 개선) — 개별 섹션이 크림 배경(#F5F5F0)
  // 위에 떠 있는 흰 카드로 바뀌어 "인쇄된 한 장" 느낌에서 "앨범" 느낌으로. 흰 배경 위 골드
  // 텍스트는 sk.bannerLabel(스킨의 accent를 흰 배경 대비 4.5:1로 보정한 값)을 씀.
  const S = {
    header: { background: sk.primary, padding: '26px 32px 22px', position: 'relative', overflow: 'hidden' },
    section: { background: '#fff', border: '1px solid #EEECEA', borderRadius: '14px', padding: '22px' },
    label: { fontSize: '10px', fontWeight: 700, color: sk.primary, letterSpacing: '0.14em', marginBottom: '16px' },
  };
  // 구분 라벨(예: GROWTH MILESTONE, KEY METRICS) — 골드 라벨 + 옆으로 뻗는 옅은 선.
  // 여러 페이지에서 재사용하려고 함수로 뺌(2/3단계에서도 씀).
  const sectionDivider = (text) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.8px', color: sk.bannerLabel }}>{text}</span>
      <span style={{ flex: 1, height: '1px', background: '#E2DFD9', display: 'block' }} />
    </div>
  );

  return (
    <ReportCard maxWidth="680px">
      <style>{FONT_STYLE}</style>

      {/* 헤더 */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ width: '3px', height: '16px', background: sk.accent, borderRadius: '1px' }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.16em' }}>{academyName || '데일리 리포트 시스템'}</span>
        </div>
        <div style={{ height: '1px', background: 'rgba(201,162,39,0.2)', marginBottom: '20px' }} />
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', fontWeight: 600, marginBottom: '6px' }}>GROWTH PORTFOLIO</p>
        <p style={{ fontFamily: R.serif, fontSize: '26px', fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: '4px' }}>{student.name}의 성장 포트폴리오</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>{periodLabel}</p>

        {/* 기간 선택 — 캘린더로 시작일/종료일 직접 지정(브라우저 기본 date input 사용,
            새 캘린더 컴포넌트 안 만듦). 최소 2주 미만이면 마일스톤/차트가 텅 비어 보여서
            아래 경고만 띄우고 필터는 적용 안 함(전체 기간으로 유지).
            원장 편집 모드(?edit=1)에서만 노출 — 학부모에게는 조작 방법이 불분명한 빈 날짜
            입력창으로 보여 화면 맨 위가 혼란스러웠음(실사용 피드백, 2026-08-01). 원장이 만든
            기간 필터 링크(?from=&to=)는 학부모 쪽에서도 그대로 적용된 상태로 보임 — 조작
            UI만 숨기고 필터 자체는 URL 파라미터로 계속 동작함. */}
        {isEditor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={handleClearPeriod}
              style={{
                flexShrink: 0, padding: '10px 16px', minHeight: '40px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                background: !hasCustomRange ? sk.accent : 'rgba(255,255,255,0.08)',
                color: !hasCustomRange ? R.ink : 'rgba(255,255,255,0.5)',
                fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}>
              전체 여정
            </button>
            <input type="date" value={periodFrom} min={earliestDay} max={latestDay} onChange={e => handleFromChange(e.target.value)}
              style={{ minHeight: '40px', padding: '0 10px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.1)', color: hasCustomRange ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: '12px', fontFamily: 'inherit', colorScheme: 'dark' }} />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>~</span>
            <input type="date" value={periodTo} min={earliestDay} max={latestDay} onChange={e => handleToChange(e.target.value)}
              style={{ minHeight: '40px', padding: '0 10px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.1)', color: hasCustomRange ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: '12px', fontFamily: 'inherit', colorScheme: 'dark' }} />

            {/* 공유 버튼 */}
            <button onClick={() => {
              const url = `${window.location.origin}/story/${studentId}${rangeActive ? `?from=${periodFrom}&to=${periodTo}` : ''}`;
              navigator.clipboard.writeText(url)
                .then(() => alert('링크가 복사됐어요!'))
                .catch(() => window.prompt('아래 링크를 길게 눌러 복사하세요', url));
            }}
              style={{ flexShrink: 0, marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', padding: '10px 16px', minHeight: '40px', color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              📤 링크 복사
            </button>
          </div>
          {rangeTooShort && (
            <p style={{ fontSize: '11px', color: '#F3B6B6', margin: 0, lineHeight: 1.5 }}>
              선택한 기간이 {rangeDays}일이에요 — 최소 2주 이상 선택해주세요. 자료가 부족해서 지금은 전체 기간으로 보여드리고 있어요.
            </p>
          )}
        </div>
        )}
      </div>

      {(() => {
        // AI 서사 생성 버튼 (강사 전용, ?edit=1) — 1페이지(마일스톤) 맨 위에 포함
        const aiGenButtonContent = !isEditor ? null : (
        <button onClick={handleGenNarrative} disabled={narLoading}
          style={{ width: '100%', padding: '13px', background: narLoading ? '#E5E7EB' : narrative ? '#F0FAF5' : sk.primary, color: narLoading ? '#6C7586' : narrative ? R.positive : '#fff', border: narrative ? `1px solid ${R.positive}40` : 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: narLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {narLoading ? '⏳ AI 서사 생성 중...' : narrative ? '🔄 전체 서사 다시 만들기 (3개 항목 모두)' : '✨ AI 서사 자동 생성'}
        </button>
        );

        // 1페이지 — 한 달의 결론 (2026-08-03 재편: 마일스톤 카드·처음과 지금 하락 배지 폐기).
        // narrative.monthConclusion(AI 생성, 편집 가능)을 결론 문장으로 쓰고, 없으면
        // 안내 문구만 보여준다(억지로 지어내지 않음 — "없는 데이터는 조건부 생략" 원칙).
        const conclusionTextContent = (
          <div style={S.section}>
            <p style={S.label}>한 달의 결론</p>
            {editing === 'monthConclusion' ? (
              <div>
                <textarea value={editText} onChange={e => setEditText(e.target.value.slice(0, NARRATIVE_MAX_LEN))} maxLength={NARRATIVE_MAX_LEN}
                  style={{ width: '100%', minHeight: '80px', padding: '10px', border: '1px solid #E5E5E5', borderRadius: '8px', color: '#2C2C2C', fontSize: '16px', lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                <EditCharCount text={editText} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button onClick={saveEdit} style={{ flex: 1, padding: '7px', background: sk.primary, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
                  <button onClick={cancelEdit} style={{ flex: 1, padding: '7px', background: '#F3F4F6', border: 'none', borderRadius: '6px', color: '#6B7280', fontSize: '11px', cursor: 'pointer' }}>취소</button>
                </div>
              </div>
            ) : narrative?.monthConclusion ? (
              <>
                <p style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.6, color: '#171719', margin: 0 }}>{narrative.monthConclusion}</p>
                {isEditor && (
                  <span style={{ display: 'flex', gap: '7px', marginTop: '10px' }}>
                    <button onClick={() => startEdit('monthConclusion')}
                      style={{ border: '1px solid #DCDFE4', borderRadius: '7px', background: '#fff', color: sk.primary, fontSize: '11px', fontWeight: 700, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      편집
                    </button>
                    <button onClick={() => handleRegenField('monthConclusion')} disabled={!!regenField}
                      title="이 항목만 AI로 다시 생성 (다른 항목은 그대로)"
                      style={{ border: '1px solid #DCDFE4', borderRadius: '7px', background: '#fff', color: sk.primary, fontSize: '11px', fontWeight: 700, padding: '7px 12px', cursor: regenField ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: regenField && regenField !== 'monthConclusion' ? 0.5 : 1 }}>
                      {regenField === 'monthConclusion' ? '⏳ 생성 중' : '이 항목만 재생성'}
                    </button>
                  </span>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#6C7586', fontSize: '13px' }}>
                {isEditor ? '위 "AI 서사 자동 생성" 버튼을 누르면 이번 달 결론이 채워집니다' : '리포트가 쌓이면 이번 달의 결론이 채워집니다'}
              </div>
            )}
          </div>
        );

        // 사진 2장(첫/마지막) — 델타 숫자 없이 날짜만 표기. 실제 사진이 있는 첫/마지막
        // 리포트를 찾는다(사진 없는 회차는 건너뜀 — 지어내지 않음).
        const heroPhotoReports = sorted.filter(r => r.photoUrls?.length > 0);
        const heroFirstPhotoR = heroPhotoReports[0];
        const heroLastPhotoR = heroPhotoReports[heroPhotoReports.length - 1];
        const twoPhotoContent = heroPhotoReports.length === 0 ? null : (
          <div style={S.section}>
            <div style={{ display: 'grid', gridTemplateColumns: heroPhotoReports.length > 1 ? 'repeat(2,minmax(0,1fr))' : '1fr', gap: '10px' }}>
              <img src={heroFirstPhotoR.photoUrls[0]} alt="수업 사진" style={{ width: '100%', height: '158px', objectFit: 'cover', borderRadius: '12px', display: 'block' }} />
              {heroPhotoReports.length > 1 && (
                <img src={heroLastPhotoR.photoUrls[0]} alt="수업 사진" style={{ width: '100%', height: '158px', objectFit: 'cover', borderRadius: '12px', display: 'block' }} />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)' }}>{fmtDate(heroFirstPhotoR)}</span>
              {heroPhotoReports.length > 1 && <span style={{ fontSize: '11px', fontWeight: 700, color: sk.primary }}>{fmtDate(heroLastPhotoR)}</span>}
            </div>
          </div>
        );

        // 지표 3분류(학습/성취/성실) — 단위·축이 다른 지표를 한 카드에 섞지 않고 성격별로
        // 분리(핸드오프 §2-1, 4페이지 KEY METRICS를 흡수). avgScore/hwAvg/conceptAvg/
        // attendanceRate 등 위에서 이미 계산해둔 값만 재사용 — 4페이지와 소스가 갈리지 않음.
        const metricGroups = [
          {
            title: '학습', scope: `수업 ${sorted.length}회 평균`,
            rows: [
              hwAvg != null && { label: '과제 수행', value: hwAvg, unit: '%', color: sk.primary, bar: hwAvg, note: '제출한 과제의 완성도' },
              conceptAvg != null && { label: '개념 이해', value: conceptAvg, unit: '%', color: sk.bannerLabel, bar: conceptAvg, note: '선생님이 수업 중 관찰한 값' },
            ].filter(Boolean),
          },
          allScores.length > 0 && {
            title: '성취', scope: `단원평가 ${allScores.length}회`,
            rows: [
              maxScore != null && { label: '최고 점수', value: maxScore, unit: '점', color: sk.primary,
                note: [maxScoreReport && fmtDate(maxScoreReport), maxScoreReport?.unit || maxScoreReport?.textbook].filter(Boolean).join(' · ') || '100점 만점' },
              avgScore != null && { label: `${allScores.length}회 평균`, value: avgScore, unit: '점', color: sk.bannerLabel, note: `${minScore}점 → ${maxScore}점` },
            ].filter(Boolean),
          },
          {
            title: '성실', scope: `예정 ${sorted.length}회`,
            rows: [
              { label: '정시 출석', value: attendanceRate, unit: '%', color: sk.primary, bar: attendanceRate,
                note: `출석 ${onTimeCount} · 지각 ${lateCount} · 결석 ${absentCount}` },
            ],
          },
        ].filter(Boolean);
        const metricGroupsContent = (
          <div style={S.section}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {metricGroups.map((g, gi) => (
                <div key={gi} style={{ padding: gi === 0 ? '0 0 16px' : '16px 0', borderTop: gi === 0 ? 'none' : '1px solid #EEECEA', display: 'flex', flexDirection: 'column', gap: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#171719' }}>{g.title}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>{g.scope}</span>
                  </div>
                  {g.rows.map((r, ri) => (
                    <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#171719' }}>{r.label}</span>
                        <span style={{ fontSize: '19px', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.3px', color: r.color }}>{r.value}<span style={{ fontSize: '11px', fontWeight: 600 }}>{r.unit}</span></span>
                      </div>
                      {r.bar != null && (
                        <div style={{ height: '7px', borderRadius: '5px', background: '#E7EAF2', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: `${Math.max(0, Math.min(100, r.bar))}%`, background: r.color }} />
                        </div>
                      )}
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)' }}>{r.note}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );

        const conclusionContent = (
          <>
            {conclusionTextContent}
            {twoPhotoContent}
            {metricGroupsContent}
          </>
        );

        // 2페이지 — 성적 추이(라인차트) + 단원별 평가 추이 + 자주 나온 약점 유형 (셋 다 없으면 페이지 자체가 생략됨)
        // 시험 점수(testScore)는 hasTest일 때만 존재해 값이 듬성듬성 비어 라인이 끊기므로 제외 —
        // 과제/개념은 매 리포트마다 항상 기록되는 값이라 안정적인 연속 라인이 나옴. recharts는
        // 여기서도 안 씀(위 weakTypeContent 주석과 같은 이유, 공개 페이지 번들 크기).
        // 10회 → 6회 — 점이 10개면 위아래로 흔들리는 것처럼 보여 "성장"이 아니라 "불안정"으로
        // 읽힌다(핸드오프 §2-2). 결석·기록 없는 회차는 conceptRating/homeworkRating이 null이라
        // 애초에 이 필터에서 자동 제외됨(기록 보관소와 동일 규칙 — 0%로 오인되지 않게).
        const trendPoints = sorted.filter(r => r.conceptRating != null || r.homeworkRating != null).slice(-6);
        const scoreTrendContent = trendPoints.length < 2 ? null : (() => {
          // y축 0/50/100 + 날짜 라벨을 넣기 위해 PAD_L 확대(핸드오프 §2-2 — 현행은 축 자체가 없었음)
          const W = 340, H = 120, PAD_L = 22, PAD_R = 4, PAD_T = 10, PAD_B = 20;
          const plotW = W - PAD_L - PAD_R;
          const plotH = H - PAD_T - PAD_B;
          const xAt = (i) => PAD_L + (trendPoints.length === 1 ? plotW / 2 : (i / (trendPoints.length - 1)) * plotW);
          const yAt = (v) => PAD_T + plotH - (Math.max(0, Math.min(100, v || 0)) / 100) * plotH;
          const conceptPts = trendPoints.map((r, i) => r.conceptRating == null ? null : [xAt(i), yAt(r.conceptRating)]).filter(Boolean);
          const homeworkPts = trendPoints.map((r, i) => r.homeworkRating == null ? null : [xAt(i), yAt(r.homeworkRating)]).filter(Boolean);
          const toPolyline = (pts) => pts.map(p => p.join(',')).join(' ');

          // 델타 캡션 — 개념 이해도를 앞/뒤 절반으로 나눠 평균 비교
          const conceptVals = trendPoints.map(r => r.conceptRating).filter(v => v != null);
          const half = Math.floor(conceptVals.length / 2);
          let deltaCaption = null;
          if (conceptVals.length >= 2) {
            const recentAvg = Math.round(conceptVals.slice(half).reduce((a, b) => a + b, 0) / conceptVals.slice(half).length);
            const prevAvg = Math.round(conceptVals.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(1, conceptVals.slice(0, half).length));
            const d = recentAvg - prevAvg;
            if (d !== 0) deltaCaption = { d, dir: d > 0 ? '상승' : '하락', color: d > 0 ? R.positive : R.negative };
          }

          return (
            <div style={S.section}>
              <p style={S.label}>성적 추이 — 최근 {trendPoints.length}회</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#757575', fontWeight: 600 }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: sk.primary, display: 'inline-block' }} />개념
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#757575', fontWeight: 600 }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#7BA4D4', display: 'inline-block' }} />과제
                </span>
              </div>
              <div ref={trendChartRef}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                  {/* y축 0/50/100 그리드 + 라벨(핸드오프 §2-2 — 현행은 축 자체가 없었음) */}
                  {[0, 50, 100].map(v => (
                    <g key={v}>
                      <line x1={PAD_L} y1={yAt(v)} x2={W - PAD_R} y2={yAt(v)} stroke="#EEECEA" strokeWidth="1" />
                      <text x={PAD_L - 5} y={yAt(v) + 3} fontSize="8" fill="#9A9A9A" textAnchor="end">{v}</text>
                    </g>
                  ))}
                  {/* 선택된 지점의 세로 가이드선 — 그래프 위를 덮는 툴팁 대신, 어느 지점을
                      보고 있는지만 은은하게 표시. 값 자체는 차트 아래 고정 정보줄에 표시(겹침 없음) */}
                  {trendTooltip != null && (
                    <line x1={xAt(trendTooltip)} y1={PAD_T} x2={xAt(trendTooltip)} y2={H - PAD_B} stroke="#C9D3E6" strokeWidth="1" strokeDasharray="3 3" />
                  )}
                  {homeworkPts.length >= 2 && <polyline points={toPolyline(homeworkPts)} fill="none" stroke="#7BA4D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                  {conceptPts.length >= 2 && <polyline points={toPolyline(conceptPts)} fill="none" stroke={sk.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                  {homeworkPts.map((p, i) => <circle key={`h${i}`} cx={p[0]} cy={p[1]} r={i === trendTooltip ? 4 : 2.5} fill="#7BA4D4" />)}
                  {conceptPts.map((p, i) => {
                    const isLast = i === conceptPts.length - 1;
                    const isSelected = i === trendTooltip;
                    return (
                      <g key={`c${i}`}>
                        {isSelected && <circle cx={p[0]} cy={p[1]} r="9" fill={sk.accent} fillOpacity="0.18" />}
                        <circle cx={p[0]} cy={p[1]} r={isLast || isSelected ? 4.5 : 2.5} fill={isLast || isSelected ? sk.accent : sk.primary} />
                      </g>
                    );
                  })}
                  {/* 날짜 라벨 — 6회로 줄여 첫/마지막뿐 아니라 지점마다 다 넣어도 안 빽빽함(핸드오프 §2-2) */}
                  {trendPoints.map((r, i) => (
                    <text key={`x${i}`} x={xAt(i)} y={H - 4} fontSize="8" fill="#9A9A9A"
                      textAnchor={i === 0 ? 'start' : i === trendPoints.length - 1 ? 'end' : 'middle'}>{fmtDate(r)}</text>
                  ))}
                  {/* 탭 히트 영역 — 처음엔 지점마다 반경 9(≈지름 18px) 원으로 했는데 실기기
                      터치로 확인해보니 손가락으로 정확히 맞추기엔 너무 작았음. 지점 좌우로 컬럼
                      전체(세로 풀하이트)를 히트 영역으로 넓혀서, 그 지점 근처 아무데나 눌러도
                      반응하게 함 */}
                  {trendPoints.map((r, i) => {
                    const colW = trendPoints.length > 1 ? plotW / (trendPoints.length - 1) : plotW;
                    return (
                      <rect key={`hit${i}`} x={xAt(i) - colW / 2} y={0} width={colW} height={H} fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setTrendTooltip(prev => (prev === i ? null : i))} />
                    );
                  })}
                </svg>
                {/* 선택 정보 — 탭하기 전엔 아무것도 안 보여줌(핸드오프 §2-2 — 빈 상태 안내
                    박스가 "빈 화면"으로 느껴진다는 지적, 회색 점선 박스 제거) */}
                {trendTooltip != null && (() => {
                  const r = trendPoints[trendTooltip];
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F7F5F1', borderRadius: '4px', borderLeft: `2px solid ${sk.accent}`, padding: '9px 12px', marginTop: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: sk.primary, flexShrink: 0 }}>{fmtDate(r)}</span>
                      {r.conceptRating != null && <span style={{ fontSize: '12px', color: '#2C2C2C' }}>개념 {r.conceptRating}%</span>}
                      {r.homeworkRating != null && <span style={{ fontSize: '12px', color: '#2C2C2C' }}>과제 {r.homeworkRating}%</span>}
                      <button onClick={() => setTrendTooltip(null)} aria-label="선택 해제"
                        style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9A9A9A', fontSize: '14px', lineHeight: 1, padding: '2px', fontFamily: 'inherit' }}>✕</button>
                    </div>
                  );
                })()}
              </div>
              {deltaCaption && (
                <p style={{ fontSize: '12px', color: '#2C2C2C', margin: '8px 0 0' }}>
                  최근 개념 이해도가 <span style={{ fontWeight: 700, color: deltaCaption.color }}>{Math.abs(deltaCaption.d)}%p {deltaCaption.dir}</span>했어요
                </p>
              )}
            </div>
          );
        })();

        const unitTrendContent = unitScores.length === 0 ? null : (() => {
        const UNIT_CAP = 6;
        const visibleUnits = showAllUnits ? unitScores : unitScores.slice(0, UNIT_CAP);
        const hiddenCount = unitScores.length - visibleUnits.length;
        return (
        <div style={S.section}>
          <p style={S.label}>단원별 평가 추이 — 진솔한 성장의 기록</p>
          {visibleUnits.map((u, ui) => {
            return (
              <div key={ui} style={{ marginBottom: ui < visibleUnits.length - 1 ? '16px' : 0 }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#2C2C2C', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {u.unit}
                  <span style={{ fontSize: '9px', color: sk.primary, background: '#EAF0F9', padding: '2px 7px', borderRadius: '3px', fontWeight: 600 }}>
                    {u.scores.length}회 평가
                  </span>
                </p>
                {u.scores.map((s, si) => {
                  const isMax = s.score === Math.max(...u.scores.map(x => x.score));
                  const pct = Math.min(100, Math.round((s.score / 100) * 100));
                  const barColor = pct < 60 ? '#757575' : pct < 75 ? '#7BA4D4' : isMax ? `linear-gradient(90deg, ${sk.primary}, ${sk.accent})` : sk.primary;
                  const prev = si > 0 ? u.scores[si - 1].score : null;
                  const delta = prev !== null ? s.score - prev : null;
                  return (
                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#757575', fontWeight: 600, width: '24px', flexShrink: 0 }}>{s.round || `${si + 1}차`}</span>
                      <div style={{ flex: 1, height: '6px', background: '#F3F4F6', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '6px', background: barColor }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: isMax ? sk.primary : '#2C2C2C', width: '42px', textAlign: 'right', flexShrink: 0 }}>{s.score}점</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, width: '36px', flexShrink: 0, color: delta > 0 ? R.positive : delta < 0 ? R.negative : '#757575', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        {delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`}
                        {isMax && <span style={{ fontSize: '9px', background: sk.accent, color: '#fff', padding: '2px 5px', borderRadius: '3px', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>최고</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button onClick={() => setShowAllUnits(true)}
              style={{ width: '100%', marginTop: '10px', padding: '9px', fontSize: '11px', fontWeight: 700, color: sk.primary, background: '#F0F7FC', border: '1px solid #E6F1FB', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
              + {hiddenCount}개 단원 더보기
            </button>
          )}
          {/* 전체 요약 — 2회 이상 평가 시만 표시. 서로 다른 단원 시험 점수를 모은 범위라
              "→"로 이으면 마치 같은 시험이 오른 것처럼 보여 오해를 살 수 있어 "~"로 표기 */}
          {allScores.length >= 2 && (
            <div style={{ padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: `2px solid ${sk.accent}`, marginTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#757575', fontWeight: 600, flexShrink: 0 }}>전체 점수 범위</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#2C2C2C' }}>{minScore}점</span>
                  <span style={{ fontSize: '12px', color: '#757575' }}>~</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#2C2C2C' }}>{maxScore}점</span>
                </div>
                <span style={{ fontSize: '11px', color: '#757575' }}>100점 만점</span>
              </div>
              <p style={{ fontSize: '12px', color: '#2C2C2C', margin: '4px 0 0' }}>서로 다른 단원 시험 점수를 모은 범위예요</p>
            </div>
          )}
          {allScores.length === 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: `2px solid ${sk.accent}`, marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: '#757575', fontWeight: 600 }}>이번 평가</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: sk.primary, marginLeft: 'auto' }}>{maxScore}점</span>
              <span style={{ fontSize: '11px', color: '#757575' }}>/ 100점 만점</span>
            </div>
          )}
        </div>
        );
        })();

        // 단원별 정리 페이지 — 상담 중에 "여기는 잘했고 여기는 아직"을 사진+숫자+코멘트로
        // 바로 보여주기 위함(2026-08-02 결정). 사진은 기본 최근 것을 보여주되, 화살표로
        // 그 단원에서 찍은 다른 사진으로 바로 넘겨볼 수 있음(상담 중 즉석 대응).
        const unitCardsContent = unitCards.length === 0 ? null : (
          <>
            {sectionDivider('단원별 정리')}
            <p style={{ fontSize: '13px', color: '#6C7586', margin: '-4px 0 0', lineHeight: 1.6 }}>
              단원마다 실제로 남긴 사진·이해도·코멘트를 모았어요
            </p>
            {unitCards.map(u => {
              const rawIdx = unitPhotoIdx[u.key] ?? (u.photoReports.length - 1);
              const photoIdx = Math.max(0, Math.min(u.photoReports.length - 1, rawIdx));
              const photo = u.photoReports[photoIdx];
              const goPhoto = (delta) => setUnitPhotoIdx(prev => ({ ...prev, [u.key]: Math.max(0, Math.min(u.photoReports.length - 1, photoIdx + delta)) }));
              return (
                <div key={u.key} style={{ background: '#fff', border: '1px solid #EEECEA', borderRadius: '14px', overflow: 'hidden' }}>
                  {photo && (
                    <div style={{ position: 'relative', height: '180px', background: sk.primary }}>
                      <img src={photo.photoUrls[0]} alt={u.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {u.photoReports.length > 1 && (
                        <>
                          <button onClick={() => goPhoto(-1)} disabled={photoIdx === 0} aria-label="이전 사진"
                            style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: photoIdx === 0 ? 'default' : 'pointer', opacity: photoIdx === 0 ? 0.35 : 1, fontSize: '15px', fontFamily: 'inherit', lineHeight: 1 }}>‹</button>
                          <button onClick={() => goPhoto(1)} disabled={photoIdx === u.photoReports.length - 1} aria-label="다음 사진"
                            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: photoIdx === u.photoReports.length - 1 ? 'default' : 'pointer', opacity: photoIdx === u.photoReports.length - 1 ? 0.35 : 1, fontSize: '15px', fontFamily: 'inherit', lineHeight: 1 }}>›</button>
                          <span style={{ position: 'absolute', right: '8px', bottom: '8px', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '10px' }}>{fmtDate(photo)}</span>
                        </>
                      )}
                    </div>
                  )}
                  <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#171719' }}>{u.label}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.6)' }}>{u.count}회 수업</span>
                    </div>
                    {u.together.length > 0 && (
                      <p style={{ fontSize: '11px', color: 'rgba(55,56,60,0.55)', margin: 0 }}>함께 다룬 단원 · {u.together.join(', ')}</p>
                    )}
                    {(u.avgConcept != null || u.avgHomework != null) && (
                      <div style={{ display: 'flex', gap: '18px' }}>
                        {u.avgConcept != null && (
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                            <span style={{ fontSize: '11px', color: 'rgba(55,56,60,0.6)' }}>개념 이해</span>
                            <span style={{ fontSize: '17px', fontWeight: 700, color: sk.primary }}>{u.avgConcept}%</span>
                          </span>
                        )}
                        {u.avgHomework != null && (
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                            <span style={{ fontSize: '11px', color: 'rgba(55,56,60,0.6)' }}>과제 수행</span>
                            <span style={{ fontSize: '17px', fontWeight: 700, color: sk.primary }}>{u.avgHomework}%</span>
                          </span>
                        )}
                      </div>
                    )}
                    {u.tagSentence && (
                      <p style={{ fontSize: '12px', color: 'rgba(55,56,60,0.75)', lineHeight: 1.6, margin: 0 }}>{u.tagSentence}</p>
                    )}
                    {u.comment && (
                      <p style={{ fontSize: '13px', color: '#2C2C2C', lineHeight: 1.7, margin: 0 }}>{u.comment.split('\n')[0]}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        );

        // 자주 나온 약점 유형 — 페이지 2 독립 차트는 제거하고 4페이지 '다음 목표' 한 줄
        // 요약으로 흡수(승인된 결정, 정보량 절감). 집계 자체는 이미 로드된 sorted로, 새 조회 없음.
        const diagCount = {};
        const diagUnitMap = {}; // key -> { 단원명: 횟수 }
        sorted.forEach(r => (r.diagnosis || []).forEach(d => {
          if (d.key === 'perfect') return; // 잘한 건 말고 약점만 집계
          diagCount[d.key] = (diagCount[d.key] || 0) + 1;
          const u = (r.unit && r.unit.trim()) || (r.textbook && r.textbook.trim()) || '';
          if (u) {
            if (!diagUnitMap[d.key]) diagUnitMap[d.key] = {};
            diagUnitMap[d.key][u] = (diagUnitMap[d.key][u] || 0) + 1;
          }
        }));
        const diagList = Object.entries(diagCount).sort((a, b) => b[1] - a[1]);
        const topWeak = diagList[0]; // [key, count] | undefined
        const topWeakLabel = topWeak ? (DIAG_COLORS[topWeak[0]]?.label || topWeak[0]) : null;
        const topWeakUnits = topWeak && diagUnitMap[topWeak[0]]
          ? Object.entries(diagUnitMap[topWeak[0]]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([u]) => u)
          : [];

        // 3페이지 — 복습 효과(있을 때만) + 핵심 지표(항상 존재)
        const reviewEffectContent = reviewProof.length === 0 ? null : (
      <div style={S.section}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '14px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#171719' }}>복습 효과</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>
              완료 {reviewProof.length}건{reviewProofImproved > 0 ? ` · 향상 ${reviewProofImproved}건` : ''}
            </span>
          </div>
          {reviewProof.slice(0, 5).map((p, pi) => {
            const delta = p.after - p.before;
            // 또래 비교 없이 이 학생 자신의 전/후만 — 낮은 점수까지 회색으로 채우고 그 위로
            // 변화폭만큼 델타 색(향상=초록/하락=빨강)을 이어 채움. 하락도 숨기지 않음(히어로와 같은 원칙)
            const beforePct = Math.max(0, Math.min(100, p.before));
            const afterPct = Math.max(0, Math.min(100, p.after));
            const lo = Math.min(beforePct, afterPct);
            const hi = Math.max(beforePct, afterPct);
            const deltaColor = delta > 0 ? R.positive : delta < 0 ? R.negative : '#8A8F98';
            return (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: pi > 0 ? '16px' : '16px', paddingTop: '16px', borderTop: '1px solid #F1EFEC' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#171719' }}>{p.unit || '복습'}</span>
                    {p.weakLabel && (
                      <span style={{ background: '#EAF0F9', color: sk.primary, fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '5px' }}>{p.weakLabel}</span>
                    )}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>{p.before}</span>
                    <span style={{ fontSize: '12px', color: '#B0B5BD' }}>→</span>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: '#171719' }}>{p.after}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: deltaColor }}>{delta === 0 ? '동일' : delta > 0 ? `+${delta}` : `${delta}`}</span>
                  </span>
                </div>
                <div style={{ height: '8px', borderRadius: '5px', background: '#E9E6E0', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${lo}%`, background: '#C7C3BB' }} />
                  <div style={{ position: 'absolute', left: `${lo}%`, top: 0, bottom: 0, width: `${hi - lo}%`, background: deltaColor }} />
                </div>
                {p.note && <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.6, color: 'rgba(55,56,60,0.75)' }}>{p.note}</span>}
              </div>
            );
          })}
          {reviewProof.length > 5 && (
            <p style={{ fontSize: '10px', color: '#757575', marginTop: '14px', textAlign: 'center' }}>외 {reviewProof.length - 5}건 더</p>
          )}
        </div>
        );

        // keyMetricsContent(최고단원평가/과제평균/시험평균/출석률 2×2 타일)는 2026-08-03
        // 폐기 — 1페이지 "지표 3분류"가 같은 값(hwAvg/conceptAvg/maxScore/avgScore/
        // attendanceRate)을 이미 보여줘서 그대로 재포장이었다(핸드오프 §2-1/§4-4).

        // 마지막 페이지 — 선생님 한마디 + 다음 목표 (둘 다 항상 존재, fallback 문구 있음)
        const teacherWordContent = (
      <div style={{ background: sk.primary, borderRadius: '14px', padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.14em', fontWeight: 600 }}>TEACHER'S WORD</p>
          {isEditor && narrative && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => startEdit('teacherWord')}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>
                ✏️ 편집
              </button>
              <button onClick={() => handleRegenField('teacherWord')} disabled={!!regenField}
                title="이 항목만 AI로 다시 생성 (다른 항목은 그대로)"
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', cursor: regenField ? 'wait' : 'pointer', opacity: regenField && regenField !== 'teacherWord' ? 0.5 : 1 }}>
                {regenField === 'teacherWord' ? '⏳ 생성 중' : '🔄 이 항목만'}
              </button>
            </div>
          )}
        </div>
        {editing === 'teacherWord' ? (
          <div>
            <textarea value={editText} onChange={e => setEditText(e.target.value.slice(0, NARRATIVE_MAX_LEN))} maxLength={NARRATIVE_MAX_LEN}
              style={{ width: '100%', minHeight: '100px', padding: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', color: '#fff', fontSize: '16px', lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
            <EditCharCount text={editText} dark />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: sk.accent, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
              <button onClick={cancelEdit} style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '14px', color: '#fff', lineHeight: 2.0, fontWeight: 500, wordBreak: 'keep-all', borderLeft: `2px solid ${sk.accent}`, paddingLeft: '14px', marginBottom: '12px' }}>
            {narrative?.teacherWord || (bestReport?.teacherNote
              ? `"${bestReport.teacherNote.slice(0, 60)}${bestReport.teacherNote.length > 60 ? '...' : ''}"`
              : `${student.name}이(가) 바뀐 건 점수가 아닙니다. 문제를 스스로 바라보는 시선이 바뀌었습니다.`)}
          </p>
        )}
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', textAlign: 'right' }}>
          {teacherDisplay}
        </p>
      </div>
        );

        const nextChapterContent = (
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <p style={S.label}>NEXT CHAPTER</p>
          {isEditor && narrative && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => startEdit('nextChapter')}
                style={{ background: '#F0EDE8', border: 'none', color: '#757575', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>
                ✏️ 편집
              </button>
              <button onClick={() => handleRegenField('nextChapter')} disabled={!!regenField}
                title="이 항목만 AI로 다시 생성 (다른 항목은 그대로)"
                style={{ background: '#EAF0F9', border: 'none', color: sk.primary, fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', cursor: regenField ? 'wait' : 'pointer', opacity: regenField && regenField !== 'nextChapter' ? 0.5 : 1 }}>
                {regenField === 'nextChapter' ? '⏳ 생성 중' : '🔄 이 항목만'}
              </button>
            </div>
          )}
        </div>
        {editing === 'nextChapter' ? (
          <div style={{ marginBottom: '14px' }}>
            <textarea value={editText} onChange={e => setEditText(e.target.value.slice(0, NARRATIVE_MAX_LEN))} maxLength={NARRATIVE_MAX_LEN}
              style={{ width: '100%', minHeight: '80px', padding: '12px', border: '1px solid #E5E5E5', borderRadius: '8px', color: '#2C2C2C', fontSize: '16px', lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
            <EditCharCount text={editText} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: sk.primary, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
              <button onClick={cancelEdit} style={{ flex: 1, padding: '8px', background: '#F3F4F6', border: 'none', borderRadius: '6px', color: '#6B7280', fontSize: '12px', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '12px', color: '#4A4A4A', lineHeight: 1.9, wordBreak: 'keep-all', marginBottom: '14px' }}>
            {narrative?.nextChapter || '판단 기준을 세우는 힘이 생기기 시작했습니다. 이제는 그 힘을 더 단단하게 만들 차례입니다.'}
          </p>
        )}
        <div style={{ borderTop: '1px solid #F1EFEC', paddingTop: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>다음 목표</span>
          <span style={{ background: '#FBEDED', color: R.negative, fontSize: '13px', fontWeight: 700, padding: '9px 14px', borderRadius: '8px' }}>
            {topWeakLabel ? `${topWeakLabel} 집중 보완` : '다음 단원 준비'}
          </span>
        </div>
        {/* 페이지 2에서 옮겨온 요약 — 약점 유형별 막대 대신 가장 잦은 유형 하나만 문장으로 */}
        {topWeak && (
          <p style={{ fontSize: '11.5px', fontWeight: 500, lineHeight: 1.7, color: 'rgba(55,56,60,0.75)', margin: '10px 0 0' }}>
            이번 기간 &lsquo;{topWeakLabel}&rsquo;이 {topWeak[1]}회로 가장 많이 나왔어요{topWeakUnits.length > 0 ? ` · 주로 ${topWeakUnits.join(', ')}에서 나왔습니다.` : '.'}
          </p>
        )}
      </div>
        );

        // 학습 기록 상세 — 원장이 선택한 기간(위 기간 선택 캘린더) 동안 선생님이 남긴 코멘트를
        // 날짜순(최근 먼저)으로 전부 모음. 요약 페이지들과 달리 축약 없이 원문 그대로 보여주는
        // "부록" 성격이라 마지막 페이지(선생님 한마디) 바로 앞에 배치(2026-08-03 결정 — 성장
        // 포트폴리오에 월간 상세 페이지 추가). 문항 하나하나까지 담긴 teacherNote 원문을 그대로
        // 쓰므로 새 AI 호출이 필요 없음 — teacherNote가 없는 리포트(과거 미작성 등)는 건너뜀.
        const notedReports = sorted.filter(r => r.teacherNote?.trim());
        // AI 기간 요약 — 캐시(student.aiMonthlySummary)가 지금 선택된 기간(periodFrom/periodTo)과
        // 일치할 때만 신뢰. 기간을 바꾸고 아직 그 기간으로 재생성 안 했으면 옛 요약을 보여주지
        // 않고 조용히 숨김(가이드라인 문서 톤 규칙 "근거 부족하면 조용히 생략"과 동일 원칙).
        const cachedSummary = student.aiMonthlySummary;
        const summaryMatchesPeriod = !!(cachedSummary && cachedSummary.periodFrom === periodFrom && cachedSummary.periodTo === periodTo);
        const summaryContent = !(isEditor || summaryMatchesPeriod) ? null : (
          <div style={{ background: sk.tint, border: `1px solid ${sk.primary}22`, borderRadius: '14px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: sk.primary, letterSpacing: '0.04em' }}>AI 요약</span>
              {isEditor && (
                <button onClick={handleGenMonthlySummary} disabled={monthlySummaryLoading}
                  style={{ padding: '6px 12px', minHeight: '30px', background: monthlySummaryLoading ? '#E5E7EB' : 'transparent', color: monthlySummaryLoading ? '#6C7586' : sk.primary, border: monthlySummaryLoading ? 'none' : `1px solid ${sk.primary}40`, borderRadius: '14px', fontSize: '11px', fontWeight: 700, cursor: monthlySummaryLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  {monthlySummaryLoading ? '생성 중...' : summaryMatchesPeriod ? '다시 생성' : '이 기간 요약 생성'}
                </button>
              )}
            </div>
            {summaryMatchesPeriod ? (
              <p style={{ fontSize: '13px', color: '#171719', margin: 0, lineHeight: 1.8, whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{cachedSummary.text}</p>
            ) : (
              <p style={{ fontSize: '12px', color: '#8A8478', margin: 0, lineHeight: 1.6 }}>이 기간에 대한 요약이 아직 없어요. 버튼을 눌러 만들어보세요.</p>
            )}
          </div>
        );
        const timelineContent = notedReports.length === 0 ? null : (
          <>
            {sectionDivider('학습 기록 상세')}
            {summaryContent}
            <p style={{ fontSize: '13px', color: '#6C7586', margin: '-4px 0 0', lineHeight: 1.6 }}>
              이 기간 선생님이 남긴 코멘트를 날짜순으로 모았어요 · {notedReports.length}건
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {notedReports.slice().reverse().map(r => (
                <div key={r.id} style={{ background: '#fff', border: '1px solid #EEECEA', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: sk.primary }}>{fmtDate(r)}</span>
                    {(r.textbook || r.unit) && (
                      <span style={{ fontSize: '11px', color: 'rgba(55,56,60,0.6)' }}>{[r.textbook, r.unit].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', color: '#171719', margin: 0, lineHeight: 1.75, whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{r.teacherNote}</p>
                </div>
              ))}
            </div>
          </>
        );

        // 4페이지 구성(핸드오프 Portfolio v2, 2026-08-03) — 예전 6페이지(마일스톤/단원별
        // 정리/평가추이/핵심지표/학습기록상세/선생님한마디)를 4개로 재편:
        // 1 한 달의 결론(위에서 구성) · 2 무엇이 달라졌나(평가추이+단원별기록+복습효과, 셋 다
        // 없으면 페이지 자체가 생략됨) · 3 수업 기록(세션 피드) · 4 선생님 한마디
        const pages = [
          { key: 'conclusion', label: '한 달의 결론', content: (<>{aiGenButtonContent}{conclusionContent}</>) },
          (scoreTrendContent || unitTrendContent || unitCardsContent || reviewEffectContent) &&
            { key: 'change', label: '무엇이 달라졌나', content: (<>{scoreTrendContent}{unitTrendContent}{unitCardsContent}{reviewEffectContent}</>) },
          timelineContent && { key: 'timeline', label: '수업 기록', content: timelineContent },
          { key: 'closing', label: '선생님 한마디', content: (<>{teacherWordContent}{nextChapterContent}</>) },
        ].filter(Boolean);
        // 기간 토글 등으로 페이지 수가 줄어든 사이 이전 페이지 인덱스가 범위를 벗어날 수 있어 방어
        const curPage = Math.min(page, pages.length - 1);

        const goPage = (next) => {
          if (next < 0 || next >= pages.length) return;
          setSlideDir(next > curPage ? 1 : -1);
          setPage(next);
        };
        const onTouchStart = (e) => {
          touchStartXRef.current = e.touches[0].clientX;
          touchStartYRef.current = e.touches[0].clientY;
        };
        const onTouchEnd = (e) => {
          if (touchStartXRef.current == null) return;
          const dx = e.changedTouches[0].clientX - touchStartXRef.current;
          const dy = e.changedTouches[0].clientY - (touchStartYRef.current ?? 0);
          touchStartXRef.current = null;
          touchStartYRef.current = null;
          // 세로 스크롤(글 읽다가 손가락 내리는 동작)이 가로 스와이프로 오인되던 버그 —
          // 가로 이동이 세로 이동보다 뚜렷하게 클 때만 페이지 전환으로 인정(실사용 피드백)
          if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
          if (dx < 0) goPage(curPage + 1); // 왼쪽으로 스와이프 → 다음 페이지
          else goPage(curPage - 1);
        };

        return (
          <>
            {/* 페이지마다 콘텐츠 양이 달라(마일스톤 4개 vs 핵심지표 4칸 등) 그냥 이어붙이면
                책장 넘길 때마다 카드 높이가 들쭉날쭉해 보임 — 프레임 높이를 고정해 짧은
                페이지는 안에서 세로 중앙정렬, 긴 페이지(주로 마일스톤)는 프레임 안에서만
                스크롤되게 함(카드 자체 높이는 항상 일정).
                중앙정렬은 justifyContent가 아니라 내부 래퍼의 margin:auto로 — flex 컨테이너에
                justifyContent:'center'를 주면 콘텐츠가 프레임보다 길 때 위쪽이 scrollTop 0 밖으로
                밀려나 스크롤로도 도달 불가(짧은 폰에서 마일스톤 페이지 상단 잘림 버그) */}
            <div key={pages[curPage].key} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
              style={{
                animation: `${slideDir > 0 ? 'pageSlideNext' : 'pageSlidePrev'} 0.25s ease`,
                minHeight: '480px', maxHeight: '65vh', overflowY: 'auto',
                background: '#F5F5F0', padding: '26px 32px 22px',
                display: 'flex', flexDirection: 'column',
              }}>
              <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                {pages[curPage].content}
              </div>
            </div>

            {/* 페이지 내비게이션 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '14px 22px', background: '#fff', borderTop: '1px solid #EEECEA' }}>
              <button onClick={() => goPage(curPage - 1)} disabled={curPage === 0} aria-label="이전 페이지"
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #E5E7EB', background: curPage === 0 ? '#F7F5F1' : '#fff', color: curPage === 0 ? '#D0D0D0' : sk.primary, fontSize: '18px', lineHeight: 1, cursor: curPage === 0 ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                ‹
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {pages.map((p, i) => (
                    <button key={p.key} onClick={() => goPage(i)} title={p.label} aria-label={p.label}
                      style={{ width: i === curPage ? '18px' : '6px', height: '6px', borderRadius: '3px', border: 'none', padding: 0, background: i === curPage ? sk.primary : '#E5E7EB', cursor: 'pointer', transition: 'width 0.2s, background 0.2s' }} />
                  ))}
                </div>
                <span style={{ fontSize: '10px', color: '#757575', fontWeight: 600, whiteSpace: 'nowrap' }}>{curPage + 1} / {pages.length} · {pages[curPage].label}</span>
              </div>
              <button onClick={() => goPage(curPage + 1)} disabled={curPage === pages.length - 1} aria-label="다음 페이지"
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #E5E7EB', background: curPage === pages.length - 1 ? '#F7F5F1' : '#fff', color: curPage === pages.length - 1 ? '#D0D0D0' : sk.primary, fontSize: '18px', lineHeight: 1, cursor: curPage === pages.length - 1 ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                ›
              </button>
            </div>
          </>
        );
      })()}

      {/* 푸터 */}
      <div style={{ padding: '16px 22px', background: '#F7F5F1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: '#757575', fontWeight: 600, letterSpacing: '0.08em' }}>{academyName || '데일리 리포트 시스템'}</span>
        <span style={{ fontSize: '10px', color: '#757575' }}>{new Date().getFullYear()}년 {new Date().getMonth() + 1}월</span>
      </div>

    </ReportCard>
  );
}
