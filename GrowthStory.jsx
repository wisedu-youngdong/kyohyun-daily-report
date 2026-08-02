import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDoc, getDocs, query, where, doc, setDoc, limit } from 'firebase/firestore';
import { ReportCard, R } from './tokens.jsx';
import { toPct, isNewStudent as computeIsNewStudent, fetchAcademyBranding, fmtPages } from './growth.js';
import { findUnitKey, extractUnitNumbers } from './curriculum.js';
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
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // 'network' | null
  const [retryKey, setRetryKey] = useState(0);
  const [narLoading, setNarLoading] = useState(false);
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
        fetchAcademyBranding(foundAcademyId).then(b => setAcademyName(b.academyName || null));

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

  // 단원별 차수 점수 집계
  //
  // "2~3단원", "4단원,5단원"처럼 이름 없이 번호만 적은 리포트는 findUnitKey가 이름 기준
  // 매칭이라 전혀 못 잡아서, 원문 그대로 따로 쪼개진 카드가 생기던 문제(views/StudentProfileModal.jsx
  // "단원별 이해도"에서 41da598로 먼저 고친 것과 동일한 원인). 번호가 뽑히면 언급된 단원
  // 전부에 이 시험 점수를 반영 — 그 시간에 실제로 다 다뤘을 테니 하나만 대표로 고르기보다
  // 전부 반영하는 쪽을 택함. 번호가 없는 순수 단원명 텍스트는 기존 findUnitKey 경로 유지.
  const unitScoreMap = {};
  const pushUnitScore = (groupKey, label, round, score, dateStr, seconds) => {
    if (!unitScoreMap[groupKey]) unitScoreMap[groupKey] = { label, scores: [], lastSeconds: 0 };
    unitScoreMap[groupKey].scores.push({ round, score, date: dateStr });
    unitScoreMap[groupKey].lastSeconds = seconds || unitScoreMap[groupKey].lastSeconds;
  };
  sorted.forEach(r => {
    if (!r.hasTest || !r.testScore) return;
    // unit → testName → textbook → '단원평가' 순으로 표시용 라벨 결정
    const unitLabel = (r.unit && r.unit.trim()) || (r.testName && r.testName.trim()) || (r.textbook && r.textbook.trim()) || '단원평가';
    const round = r.testRound || '';
    const score = Number(r.testScore);
    const dateStr = fmtDate(r);
    const seconds = r.createdAt?.seconds || 0;

    // 이름 매칭(unitKey/findUnitKey)을 먼저 시도 — extractUnitNumbers 주석이 원래 의도한 순서대로,
    // 이름 매칭이 이미 성공하는 케이스("3단원 소수의 나눗셈"처럼 작성 화면 placeholder가
    // 권장하는 형식도 포함)는 숫자 경로가 가로채지 않게 한다. 번호만 있고 이름 매칭이 실패할
    // 때만("2~3단원", "4단원,5단원") 번호 단위로 쪼개 여러 단원 통계에 반영
    const nameKey = r.unitKey || findUnitKey(r.subject || '수학', r.unit || '');
    if (nameKey) {
      pushUnitScore(nameKey, unitLabel, round, score, dateStr, seconds);
      return;
    }
    const unitNumbers = extractUnitNumbers(r.unit || '');
    if (unitNumbers.length > 0) {
      unitNumbers.forEach(num => {
        const groupKey = `num|${r.subject || '수학'}|${r.textbook || ''}|${num}`;
        const label = `${r.textbook ? r.textbook + ' · ' : ''}${num}단원`;
        pushUnitScore(groupKey, label, round, score, dateStr, seconds);
      });
      return;
    }
    pushUnitScore(unitLabel, unitLabel, round, score, dateStr, seconds);
  });
  // 최근에 다룬 단원이 먼저 보이도록 정렬 — "전체" 기간처럼 단원이 많을 때 최신순으로 우선 노출
  const unitScores = Object.values(unitScoreMap)
    .sort((a, b) => b.lastSeconds - a.lastSeconds)
    .map(({ label, scores }) => ({ unit: label, scores }));

  // 단원별 정리 카드 — 사진+평균 이해도+코멘트를 단원 단위로 묶어서 보여줌(상담용, 2026-08-02
  // 결정: 텍스트로만 설명하던 걸 사진·차트·코멘트로 객관적으로 보여주고 싶다는 요청).
  // 위 단원별 시험 점수 집계와 같은 방식으로 단원을 식별하되(findUnitKey→extractUnitNumbers→
  // 원문 순), 시험 본 날만 잡는 unitScoreMap과 달리 이건 매 리포트(사진·이해도·코멘트가 남는
  // 평상시 수업)를 전부 대상으로 함 — 실제로 매일 기록되는 건 시험이 아니라 숙제 체크이기 때문.
  const resolveUnitGroups = (r) => {
    const unitLabel = (r.unit && r.unit.trim()) || (r.textbook && r.textbook.trim());
    if (!unitLabel) return [];
    const nameKey = r.unitKey || findUnitKey(r.subject || '수학', r.unit || '');
    if (nameKey) return [{ key: nameKey, label: unitLabel }];
    const unitNumbers = extractUnitNumbers(r.unit || '');
    if (unitNumbers.length > 0) {
      return unitNumbers.map(num => ({
        key: `num|${r.subject || '수학'}|${r.textbook || ''}|${num}`,
        label: `${r.textbook ? r.textbook + ' · ' : ''}${num}단원`,
      }));
    }
    return [{ key: unitLabel, label: unitLabel }];
  };
  const unitCardMap = {};
  sorted.forEach(r => {
    resolveUnitGroups(r).forEach(({ key, label }) => {
      if (!unitCardMap[key]) unitCardMap[key] = { label, reports: [], lastSeconds: 0 };
      unitCardMap[key].reports.push(r);
      unitCardMap[key].lastSeconds = Math.max(unitCardMap[key].lastSeconds, r.createdAt?.seconds || 0);
    });
  });
  const unitCards = Object.entries(unitCardMap)
    .sort((a, b) => b[1].lastSeconds - a[1].lastSeconds)
    .map(([key, { label, reports }]) => {
      const asc = [...reports].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      const conceptPcts = asc.filter(r => r.conceptRating != null).map(r => toPct(r.conceptRating));
      const homeworkPcts = asc.filter(r => r.homeworkRating != null).map(r => toPct(r.homeworkRating));
      const photoReports = asc.filter(r => r.photoUrls?.length > 0);
      // 코멘트는 이 단원에서 가장 최근에 남긴 것 하나만 — 지어내지 않고 실제 작성분 그대로(무과장 원칙)
      const latestWithNote = [...asc].reverse().find(r => r.teacherNote?.trim());
      const tagCount = {};
      asc.forEach(r => (r.diagnosis || []).forEach(d => { tagCount[d.key] = (tagCount[d.key] || 0) + 1; }));
      return {
        key, label, count: asc.length,
        avgConcept: conceptPcts.length ? Math.round(conceptPcts.reduce((a, b) => a + b, 0) / conceptPcts.length) : null,
        avgHomework: homeworkPcts.length ? Math.round(homeworkPcts.reduce((a, b) => a + b, 0) / homeworkPcts.length) : null,
        photoReports,
        comment: latestWithNote?.teacherNote || '',
        topTags: Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
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
  // 출석 요약 — KEY METRICS 맨 아래 카드가 결석 유무/지각 유무에 따라 3가지로 갈림
  // (기존 allAttended는 attendance값이 '정시'/'지각'/'결석'/... 인데 '출석'과 비교해서 항상 false였던 죽은 코드였음)
  const onTimeCount = sorted.filter(r => r.attendance === '정시').length;
  const lateCount = sorted.filter(r => r.attendance === '지각').length;
  const absentCount = sorted.filter(r => r.attendance === '결석').length;
  const attendanceRate = sorted.length > 0 ? Math.round(onTimeCount / sorted.length * 100) : 0;

  // 공통 변수
  const firstPerfect = sorted.find(r => r.conceptRating >= 100);
  const over70 = sorted.find(r => r.hasTest && Number(r.testScore) >= 70);

  // 신규생/재학생 분기
  const isNewStudent = computeIsNewStudent(student, sorted.length);

  // PHASE 마일스톤 — 날짜 기반 4개 고정 생성
  const milestones = [];

  if (sorted.length > 0) {
    const len = sorted.length;
    // 4개 구간 인덱스 (중복 없이)
    const idx = [
      0,
      Math.min(len - 1, Math.max(1, Math.floor(len * 0.33))),
      Math.min(len - 1, Math.max(2, Math.floor(len * 0.66))),
      len - 1,
    ].filter((v, i, arr) => arr.indexOf(v) === i); // 중복 제거

    // 취약 단원
    const unitErrMap = {};
    sorted.forEach(r => {
      const u = r.unit || r.textbook || '';
      if (u) (r.diagnosis||[]).forEach(d => {
        if (d.key !== 'perfect') unitErrMap[u] = (unitErrMap[u]||0) + 1;
      });
    });
    const weakUnit = Object.entries(unitErrMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';

    // 점수 추이
    const testReps = sorted.filter(r => r.hasTest && r.testScore);
    const firstScore = testReps[0]?.testScore;
    const bestScore = testReps.length ? Math.max(...testReps.map(r=>Number(r.testScore))) : null;
    const growth = firstScore && bestScore ? bestScore - Number(firstScore) : 0;

    // 오답률 전반/후반 비교
    const half = Math.floor(len/2);
    const errRate = (arr) => arr.length
      ? (arr.reduce((s,r)=>s+(r.diagnosis||[]).filter(d=>d.key!=='perfect').length,0)/arr.length).toFixed(1)
      : '0';
    const firstErr = errRate(sorted.slice(0, half));
    const secondErr = errRate(sorted.slice(half));
    const improved = Number(secondErr) < Number(firstErr);

    const phaseConfigs = isNewStudent ? [
      {
        phase: 'PHASE 1 · 시작',
        title: '첫 수업 시작 및 학습 리듬 안착',
        desc: '낯선 개념 앞에서도 스스로 해결의 실마리를 찾으려는 의지로 시작했습니다.',
        badge: '학습 리듬 형성 시작',
        active: false,
      },
      {
        phase: 'PHASE 2 · 개념 흡수',
        title: firstPerfect ? '첫 개념 이해 만점 달성' : '기본 개념 반복 학습 진행 중',
        desc: '개념의 구조를 하나씩 이해하며 자신만의 풀이 패턴을 만들어가고 있습니다.',
        badge: '개념 내면화 진행',
        active: false,
      },
      {
        phase: 'PHASE 3 · 첫 성취',
        title: over70 ? `단원평가 ${over70.testScore}점 달성` : '꾸준한 출석으로 학습 기반 구축',
        desc: '반복 학습이 쌓이며 문제 유형에 대한 직관이 생기기 시작했습니다.',
        badge: '성취 경험 확보',
        active: false,
      },
      {
        phase: 'PHASE 4 · 가능성 확인',
        title: bestScore ? `단원평가 최고 ${bestScore}점 · 가능성 확인` : '꾸준함으로 만들어낸 성장',
        desc: '짧은 기간 안에 눈에 띄는 변화가 시작됐습니다. 다음 단계가 기대됩니다.',
        badge: '성장 가능성 확인',
        active: true,
      },
    ] : [
      {
        phase: 'PHASE 1 · 도전 설정',
        title: weakUnit ? `${weakUnit} 약점 보완 시작` : '새로운 단원 도전 시작',
        desc: weakUnit
          ? `${weakUnit} 단원에서 반복되는 오답 유형을 확인했습니다.`
          : '반복되는 약점을 인식하고 보완을 시작했습니다.',
        badge: '약점 분석 완료',
        active: false,
      },
      {
        phase: 'PHASE 2 · 패턴 교정',
        title: improved
          ? `오답 패턴 개선 — 회당 ${firstErr}개 → ${secondErr}개`
          : '반복 오답 유형 집중 훈련',
        desc: improved
          ? '회당 오답 개수가 줄어드는 추세가 데이터로 확인되고 있습니다.'
          : '오답의 원인을 태그로 기록하고 유형별로 다시 풀어보는 과정입니다.',
        badge: improved ? `오답률 감소 확인` : '패턴 분석 중',
        active: false,
      },
      {
        phase: 'PHASE 3 · 점수 상승',
        title: growth > 0
          ? `단원평가 ${firstScore}점 → ${bestScore}점 (+${growth}점 상승)`
          : over70 ? `단원평가 ${over70.testScore}점 달성` : '개념 이해도 꾸준히 상승 중',
        desc: growth > 0
          ? '이전보다 높은 점수를 기록하며 상승 흐름을 보이고 있습니다.'
          : '풀이 과정을 스스로 정리하는 연습을 이어가고 있습니다.',
        badge: growth > 0 ? `+${growth}점 성장` : '꾸준히 진행 중',
        active: false,
      },
      {
        phase: 'PHASE 4 · 최근 성과',
        title: improved
          ? (bestScore ? `단원평가 최고 ${bestScore}점 기록` : '오답 패턴 개선 지속 중')
          : '기초 다지기 — 반복 오답 패턴 재점검 중',
        desc: improved
          ? '최근 오답 개수가 줄고 점수도 오르는 추세를 보이고 있습니다.'
          : '최근 오답 패턴이 다시 늘어 기초 개념을 한 번 더 점검하는 시기입니다.',
        badge: improved ? '오답 감소 추세' : '재점검 진행 중',
        active: true,
      },
    ];

    // idx 개수만큼 PHASE 생성 (최대 4개, 리포트 적으면 그만큼만)
    idx.forEach((i, pi) => {
      const r = sorted[i];
      // 해당 리포트 실데이터 추출
      const diagTags = (r.diagnosis||[])
        .filter(d => d.key !== 'perfect')
        .map(d => diagLabels[d.key] || d.key);

      // 선생님 코멘트 첫 줄 (태그 제거)
      const rawNote = r.teacherNote || '';
      const cleanNote = rawNote.replace(/\[([^\]]+)\]\s*/g, '').trim();
      const notePreview = cleanNote.length > 50
        ? cleanNote.slice(0, 50) + '...'
        : cleanNote;

      milestones.push({
        ...phaseConfigs[pi],
        date: fmtDate(r),
        // 실데이터
        realData: {
          textbook: r.textbook || '',
          unit: r.unit || '',
          pages: r.pages || '',
          homeworkRating: r.homeworkRating,
          conceptRating: r.conceptRating,
          testScore: r.hasTest ? r.testScore : null,
          diagTags,
          notePreview,
          photoUrl: r.photoUrls?.[0] || null,
        },
      });
    });
  }

  // 기간 표시
  const periodLabel = sorted.length > 0
    ? `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])} · ${sorted.length}회 수업`
    : '';

  // 날짜 입력의 min/max — 실제 리포트가 있는 범위 밖은 애초에 고를 수 없게(리포트 0건 구간
  // 선택 방지). allSorted는 오름차순 정렬이라 첫/마지막이 그대로 최소/최대.
  const earliestDay = allSorted[0]?.createdAt?.seconds ? dayKeyOf(allSorted[0].createdAt.seconds) : undefined;
  const latestDay = allSorted[allSorted.length - 1]?.createdAt?.seconds ? dayKeyOf(allSorted[allSorted.length - 1].createdAt.seconds) : undefined;

  // AI 서사 생성 — 전체(4개 항목 한 번에). 이미 서사가 있으면 직접 편집한 내용까지
  // 통째로 덮어써지므로 반드시 한 번 확인받음
  const handleGenNarrative = async () => {
    if (narrative && !window.confirm('4개 항목(성장 마일스톤 2개 + 선생님 한마디 + 다음 이야기)이 전부 새로 생성되고, 직접 편집한 내용도 덮어써져요. 계속할까요?')) return;
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
          milestones,
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
          milestones,
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
  const teacherDisplay = teacherName ? teacherName.replace(/선생님?$/, '').trim() + ' 선생님' : '담당 교사';

  // 카드 폭 420→680px 확대(2026-07-31 성장 포트폴리오 개선) — 개별 섹션이 크림 배경(#F5F5F0)
  // 위에 떠 있는 흰 카드로 바뀌어 "인쇄된 한 장" 느낌에서 "앨범" 느낌으로. 흰 배경 위 골드
  // 텍스트는 기존 R.goldText(#8A6500) 재사용 — 제안서 §5의 #8A6A22는 육안 차이가 없는
  // 중복값이라 새로 안 만듦.
  const S = {
    header: { background: R.navy, padding: '26px 32px 22px', position: 'relative', overflow: 'hidden' },
    section: { background: '#fff', border: '1px solid #EEECEA', borderRadius: '14px', padding: '22px' },
    label: { fontSize: '10px', fontWeight: 700, color: R.navy, letterSpacing: '0.14em', marginBottom: '16px' },
  };
  // 구분 라벨(예: GROWTH MILESTONE, KEY METRICS) — 골드 라벨 + 옆으로 뻗는 옅은 선.
  // 여러 페이지에서 재사용하려고 함수로 뺌(2/3단계에서도 씀).
  const sectionDivider = (text) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.8px', color: R.goldText }}>{text}</span>
      <span style={{ flex: 1, height: '1px', background: '#E2DFD9', display: 'block' }} />
    </div>
  );

  return (
    <ReportCard maxWidth="680px">
      <style>{FONT_STYLE}</style>

      {/* 헤더 */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ width: '3px', height: '16px', background: R.gold, borderRadius: '1px' }} />
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
                background: !hasCustomRange ? R.gold : 'rgba(255,255,255,0.08)',
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
          style={{ width: '100%', padding: '13px', background: narLoading ? '#E5E7EB' : narrative ? '#F0FAF5' : R.navy, color: narLoading ? '#6C7586' : narrative ? R.positive : '#fff', border: narrative ? `1px solid ${R.positive}40` : 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: narLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {narLoading ? '⏳ AI 서사 생성 중...' : narrative ? '🔄 전체 서사 다시 만들기 (4개 항목 모두)' : '✨ AI 서사 자동 생성'}
        </button>
        );

        // '처음과 지금' 히어로(2026-07-31 신규 → 2026-08-01 초기/최근 평균 비교로 재설계) —
        // 개념 이해도 기준으로 고정(결정 ①). 원래는 첫/마지막 리포트 단건을 그냥 뺐는데, 그날
        // 나간 단원이 우연히 더 어려우면 실력 변화가 아니라 단원 난이도 차이가 하락으로 보이는
        // 문제가 있었음(단원 무관 비교라 착시 발생, 실사용 피드백으로 발견). 초기 N회 평균 vs
        // 최근 N회 평균으로 바꿔 노이즈를 상쇄. N=3이면 4~6회 수업(약 2~3주)만 지나도 카드가
        // 활성화됨. 하락이어도 숨기지 않고(과장 금지 원칙) 이유를 지어내지 않음 — "심화 단원
        // 진입" 같은 근거 없는 해석은 절대 넣지 않고, 원인은 아래 반복 약점 패턴/단원별 이해도의
        // 실제 데이터로 유도. 기간 토글은 이미 sorted 자체가 필터링돼 있어(결정 ⑥) 별도 처리 불필요.
        const conceptReports = sorted.filter(r => r.conceptRating != null);
        const HERO_AVG_N = 3;
        const heroFirstGroup = conceptReports.slice(0, HERO_AVG_N);
        const heroLastGroup = conceptReports.slice(-HERO_AVG_N);
        const avgOf = (group) => Math.round(group.reduce((s, r) => s + r.conceptRating, 0) / group.length);
        const heroFirstAvg = heroFirstGroup.length ? avgOf(heroFirstGroup) : 0;
        const heroLastAvg = heroLastGroup.length ? avgOf(heroLastGroup) : 0;
        const heroDelta = heroLastAvg - heroFirstAvg;
        const heroDeltaStyle = heroDelta > 0
          ? { bg: '#E8F1EC', color: R.positive, text: `+${heroDelta}%p` }
          : heroDelta < 0
          ? { bg: '#FBEDED', color: R.negative, text: `${heroDelta}%p` }
          : { bg: '#F3F4F6', color: '#6B7280', text: '변화 없음' };
        // 사진은 평균이 아니라 실제 첫/마지막 리포트 사진 그대로 — 숫자만 평균으로 바꾸고
        // 사진 없는 마일스톤/히어로는 접지 않고 네이비 단색 블록으로 대체(결정 ③) — 레이아웃이
        // 데이터 유무에 따라 들쭉날쭉해지는 걸 방지. 단, 둘 중 하나만 있으면 반반으로 쪼개
        // 한쪽만 네이비로 비워두지 않고 있는 사진 1장을 꽉 채움(둘 다 있을 때만 반반 비교)
        const heroFirst = conceptReports[0];
        const heroLast = conceptReports[conceptReports.length - 1];
        const heroFirstPhoto = heroFirst.photoUrls?.[0] || null;
        const heroLastPhoto = heroLast.photoUrls?.[0] || null;
        const heroContent = conceptReports.length < 2 ? null : (
          <div style={{ background: '#fff', border: '1px solid #EEECEA', borderRadius: '14px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: '186px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {!heroFirstPhoto && !heroLastPhoto ? (
                <div style={{ flex: 1, background: R.navy }} />
              ) : heroFirstPhoto && heroLastPhoto ? (
                <>
                  <img src={heroFirstPhoto} alt="수업 사진" style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'cover', display: 'block' }} />
                  <img src={heroLastPhoto} alt="수업 사진" style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'cover', display: 'block' }} />
                </>
              ) : (
                <img src={heroFirstPhoto || heroLastPhoto} alt="수업 사진" style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'cover', display: 'block' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.6px', color: R.goldText }}>처음과 지금</span>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>초기 {heroFirstGroup.length}회 평균</span>
                  <span style={{ fontSize: '26px', fontWeight: 600, lineHeight: 1, color: 'rgba(55,56,60,0.75)' }}>{heroFirstAvg}<span style={{ fontSize: '12px', fontWeight: 600 }}>%</span></span>
                </span>
                <span style={{ fontSize: '18px', color: '#B0B5BD', marginBottom: '4px' }}>→</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>최근 {heroLastGroup.length}회 평균</span>
                  <span style={{ fontSize: '40px', fontWeight: 700, lineHeight: 1, letterSpacing: '-1px', color: R.navy }}>{heroLastAvg}<span style={{ fontSize: '14px', fontWeight: 600 }}>%</span></span>
                </span>
                <span style={{ background: heroDeltaStyle.bg, color: heroDeltaStyle.color, fontSize: '13px', fontWeight: 700, padding: '7px 12px', borderRadius: '8px', marginBottom: '5px' }}>{heroDeltaStyle.text}</span>
              </div>
              {/* 방향(상승/하락)에 따라 다른 문구를 쓰지 않음 — 카드가 실제로 계산한 방식만
                  그대로 설명하고, 이유는 지어내지 않는다(2026-08-01 결정, ai-hallucination-fix-pattern). */}
              <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.7, color: 'rgba(55,56,60,0.9)' }}>총 {sorted.length}회 수업 중 초기 {heroFirstGroup.length}회와 최근 {heroLastGroup.length}회의 성취도 집계 결과입니다.</span>
            </div>
          </div>
        );

        // 1페이지 — GROWTH MILESTONE (항상 존재, 데이터 없을 때 안내 문구)
        const milestoneContent = milestones.length === 0 ? (
          <div style={S.section}>
            <p style={S.label}>GROWTH MILESTONE</p>
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#6C7586', fontSize: '13px' }}>
              리포트가 쌓이면 성장 마일스톤이 자동으로 생성됩니다
            </div>
          </div>
        ) : (
        <>
        {heroContent}
        {/* 핵심 숫자 3개 — 타임라인을 읽기 전에 결과부터 한눈에. 전부 위에서 이미 계산해둔
            실데이터(avgScore/attendanceRate)만 쓰고 새 지표는 지어내지 않음 */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { value: `${sorted.length}회`, label: '수업' },
            { value: avgScore != null ? `${avgScore}점` : (hwAvg != null ? `${hwAvg}%` : '-'), label: avgScore != null ? '평균 점수' : '평균 과제' },
            { value: `${attendanceRate}%`, label: '정시 출석' },
          ].map((stat, si) => (
            <div key={si} style={{ flex: 1, textAlign: 'center', padding: '14px 8px', background: '#F8F9FC', border: '0.5px solid #E5E7EB', borderRadius: '10px' }}>
              <p style={{ fontSize: '20px', fontWeight: 800, color: R.navy, margin: '0 0 3px' }}>{stat.value}</p>
              <p style={{ fontSize: '10px', fontWeight: 600, color: '#8A93A3', margin: 0, letterSpacing: '0.02em' }}>{stat.label}</p>
            </div>
          ))}
        </div>
        {sectionDivider('GROWTH MILESTONE')}
        {sorted.length > milestones.length && (
          <p style={{ fontSize: '13px', color: '#6C7586', margin: '-4px 0 0', lineHeight: 1.6 }}>
            총 {sorted.length}회 수업 중 의미 있었던 {milestones.length}개의 순간을 모았어요
          </p>
        )}

        {/* 마일스톤 카드 — narrative 유무로 주(첫·마지막)/보조(중간) 2등급 파생(승인된 결정 ②,
            추가 승격 규칙 없음). 예전 세로 타임라인(선+점)은 카드 자체가 이제 앨범 사진 카드라서
            제거 — 1d 시안에 맞춤. 사진 없는 주 마일스톤은 접지 않고 네이비 단색으로 대체(결정 ③) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {milestones.map((m, i) => {
            const isChapter1 = i === 0;
            const isChapter2 = i === milestones.length - 1;
            const isMajor = isChapter1 || isChapter2;
            const chapterField = isChapter1 ? 'chapter1' : isChapter2 ? 'chapter2' : null;
            const chapterText = narrative
              ? (isChapter1 ? narrative.chapter1 : isChapter2 ? narrative.chapter2 : m.desc)
              : m.desc;
            const rd = m.realData;
            const range = [rd.textbook, rd.unit, rd.pages && fmtPages(rd.pages)].filter(Boolean).join(' · ');
            const figures = [
              rd.homeworkRating != null && { label: '과제', value: `${rd.homeworkRating}%`, color: R.navy },
              rd.conceptRating != null && { label: '개념', value: `${rd.conceptRating}%`, color: R.navy },
              rd.testScore && { label: '시험', value: `${rd.testScore}점`, color: R.goldText },
            ].filter(Boolean);

            if (!isMajor) {
              // 보조 마일스톤 — 사진·코멘트·서사 없이 한 줄 행만(길이 절감의 핵심)
              return (
                <div key={i} style={{ background: '#fff', border: '1px solid #EEECEA', borderRadius: '12px', padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', color: R.goldText }}>{m.phase.split(' · ')[0]}</span>
                      <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>{m.date}</span>
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.5, color: '#171719' }}>{m.title}</span>
                    {range && <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)' }}>{range}</span>}
                  </span>
                  {figures.length > 0 && (
                    <span style={{ display: 'flex', gap: '7px', flexShrink: 0 }}>
                      {figures.map((f, fi) => (
                        <span key={fi} style={{ background: '#F5F5F0', borderRadius: '7px', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                          <span style={{ fontSize: '9.5px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>{f.label}</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: f.color }}>{f.value}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              );
            }

            // 주 마일스톤 — 196px 사진 + 기록 띠 + 코멘트 + 서사(첫·마지막 카드만)
            const hasFigureRow = !!range || figures.length > 0 || rd.diagTags.length > 0;
            return (
              <div key={i} style={{ background: '#fff', border: '1px solid #EEECEA', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* 사진 있으면 196px 사진 위에 오버레이, 없으면 그 자리를 통째로 네이비로
                    채우지 않고(빈 배너처럼 커 보임) 내용만큼만 높이가 나오는 얇은 헤더 띠로 대체 */}
                {rd.photoUrl ? (
                  <div style={{ position: 'relative', height: '196px' }}>
                    <img src={rd.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 18px', background: 'rgba(13,45,107,0.84)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '14px' }}>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.6px', color: '#E4C978' }}>{m.phase}</span>
                        <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px', color: '#fff' }}>{m.title}</span>
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.86)', whiteSpace: 'nowrap' }}>{m.date}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: R.navy, padding: '16px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '14px' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.6px', color: '#E4C978' }}>{m.phase}</span>
                      <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px', color: '#fff' }}>{m.title}</span>
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.86)', whiteSpace: 'nowrap' }}>{m.date}</span>
                  </div>
                )}

                {hasFigureRow && (
                  <div style={{ padding: '14px 18px', borderBottom: (rd.notePreview || chapterField) ? '1px solid #F1EFEC' : 'none', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    {range && <span style={{ fontSize: '12px', fontWeight: 600, color: '#171719' }}>{range}</span>}
                    {range && (figures.length > 0 || rd.diagTags.length > 0) && <span style={{ width: '1px', height: '11px', background: '#E2DFD9', display: 'block' }} />}
                    {figures.map((f, fi) => (
                      <span key={fi} style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>{f.label}</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: f.color }}>{f.value}</span>
                      </span>
                    ))}
                    {rd.diagTags.map((tag, ti) => (
                      <span key={ti} style={{ background: '#FBEDED', color: R.negative, fontSize: '10px', fontWeight: 700, padding: '4px 9px', borderRadius: '6px' }}>{tag}</span>
                    ))}
                  </div>
                )}

                {rd.notePreview && (
                  <div style={{ padding: '13px 18px', borderBottom: chapterField ? '1px solid #F1EFEC' : 'none', display: 'flex', gap: '9px', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: R.goldText, whiteSpace: 'nowrap' }}>코멘트</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 500, lineHeight: 1.65, color: 'rgba(55,56,60,0.9)' }}>{rd.notePreview}</span>
                  </div>
                )}

                {chapterField && (
                  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {editing === chapterField ? (
                      <div>
                        <textarea value={editText} onChange={e => setEditText(e.target.value.slice(0, NARRATIVE_MAX_LEN))} maxLength={NARRATIVE_MAX_LEN}
                          style={{ width: '100%', minHeight: '70px', padding: '10px', border: '1px solid #E5E5E5', borderRadius: '8px', color: '#2C2C2C', fontSize: '16px', lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                        <EditCharCount text={editText} />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button onClick={saveEdit} style={{ flex: 1, padding: '7px', background: R.navy, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
                          <button onClick={cancelEdit} style={{ flex: 1, padding: '7px', background: '#F3F4F6', border: 'none', borderRadius: '6px', color: '#6B7280', fontSize: '11px', cursor: 'pointer' }}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.75, color: '#171719' }}>{chapterText}</span>
                        {isEditor && narrative && (
                          <span style={{ display: 'flex', gap: '7px' }}>
                            <button onClick={() => startEdit(chapterField)}
                              style={{ border: '1px solid #DCDFE4', borderRadius: '7px', background: '#fff', color: R.navy, fontSize: '11px', fontWeight: 700, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                              편집
                            </button>
                            <button onClick={() => handleRegenField(chapterField)} disabled={!!regenField}
                              title="이 항목만 AI로 다시 생성 (다른 항목은 그대로)"
                              style={{ border: '1px solid #DCDFE4', borderRadius: '7px', background: '#fff', color: R.navy, fontSize: '11px', fontWeight: 700, padding: '7px 12px', cursor: regenField ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: regenField && regenField !== chapterField ? 0.5 : 1 }}>
                              {regenField === chapterField ? '⏳ 생성 중' : '이 항목만 재생성'}
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        </>
        );

        // 2페이지 — 성적 추이(라인차트) + 단원별 평가 추이 + 자주 나온 약점 유형 (셋 다 없으면 페이지 자체가 생략됨)
        // 시험 점수(testScore)는 hasTest일 때만 존재해 값이 듬성듬성 비어 라인이 끊기므로 제외 —
        // 과제/개념은 매 리포트마다 항상 기록되는 값이라 안정적인 연속 라인이 나옴. recharts는
        // 여기서도 안 씀(위 weakTypeContent 주석과 같은 이유, 공개 페이지 번들 크기).
        const trendPoints = sorted.filter(r => r.conceptRating != null || r.homeworkRating != null).slice(-10);
        const scoreTrendContent = trendPoints.length < 2 ? null : (() => {
          const W = 340, H = 120, PAD_L = 4, PAD_R = 4, PAD_T = 10, PAD_B = 20;
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
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: R.navy, display: 'inline-block' }} />개념
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#757575', fontWeight: 600 }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#7BA4D4', display: 'inline-block' }} />과제
                </span>
              </div>
              <div ref={trendChartRef}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                  {/* 선택된 지점의 세로 가이드선 — 그래프 위를 덮는 툴팁 대신, 어느 지점을
                      보고 있는지만 은은하게 표시. 값 자체는 차트 아래 고정 정보줄에 표시(겹침 없음) */}
                  {trendTooltip != null && (
                    <line x1={xAt(trendTooltip)} y1={PAD_T} x2={xAt(trendTooltip)} y2={H - PAD_B} stroke="#C9D3E6" strokeWidth="1" strokeDasharray="3 3" />
                  )}
                  {homeworkPts.length >= 2 && <polyline points={toPolyline(homeworkPts)} fill="none" stroke="#7BA4D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                  {conceptPts.length >= 2 && <polyline points={toPolyline(conceptPts)} fill="none" stroke={R.navy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                  {homeworkPts.map((p, i) => <circle key={`h${i}`} cx={p[0]} cy={p[1]} r={i === trendTooltip ? 4 : 2.5} fill="#7BA4D4" />)}
                  {conceptPts.map((p, i) => {
                    const isLast = i === conceptPts.length - 1;
                    const isSelected = i === trendTooltip;
                    return (
                      <g key={`c${i}`}>
                        {isSelected && <circle cx={p[0]} cy={p[1]} r="9" fill={R.gold} fillOpacity="0.18" />}
                        <circle cx={p[0]} cy={p[1]} r={isLast || isSelected ? 4.5 : 2.5} fill={isLast || isSelected ? R.gold : R.navy} />
                      </g>
                    );
                  })}
                  <text x={PAD_L} y={H - 4} fontSize="9" fill="#9A9A9A">{fmtDate(trendPoints[0])}</text>
                  <text x={W - PAD_R} y={H - 4} fontSize="9" fill="#9A9A9A" textAnchor="end">{fmtDate(trendPoints[trendPoints.length - 1])}</text>
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
                {/* 선택 정보 — 차트 위에 겹쳐 뜨는 툴팁 대신 항상 같은 자리(차트 바로 아래)에
                    표시. 선택 전에도 안내 문구로 자리를 미리 차지해둬서, 선택해도 카드 높이가
                    안 바뀜(레이아웃 흔들림 방지) */}
                {trendTooltip != null ? (() => {
                  const r = trendPoints[trendTooltip];
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F7F5F1', borderRadius: '4px', borderLeft: `2px solid ${R.gold}`, padding: '9px 12px', marginTop: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: R.navy, flexShrink: 0 }}>{fmtDate(r)}</span>
                      {r.conceptRating != null && <span style={{ fontSize: '12px', color: '#2C2C2C' }}>개념 {r.conceptRating}%</span>}
                      {r.homeworkRating != null && <span style={{ fontSize: '12px', color: '#2C2C2C' }}>과제 {r.homeworkRating}%</span>}
                      <button onClick={() => setTrendTooltip(null)} aria-label="선택 해제"
                        style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9A9A9A', fontSize: '14px', lineHeight: 1, padding: '2px', fontFamily: 'inherit' }}>✕</button>
                    </div>
                  );
                })() : (
                  <div style={{ border: '1px dashed #DFE3EA', borderRadius: '4px', padding: '9px 12px', marginTop: '8px', fontSize: '11px', color: '#B0B5BD' }}>
                    지점을 탭하면 그 날짜의 값이 여기에 표시돼요
                  </div>
                )}
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
                  <span style={{ fontSize: '9px', color: R.navy, background: '#EAF0F9', padding: '2px 7px', borderRadius: '3px', fontWeight: 600 }}>
                    {u.scores.length}회 평가
                  </span>
                </p>
                {u.scores.map((s, si) => {
                  const isMax = s.score === Math.max(...u.scores.map(x => x.score));
                  const pct = Math.min(100, Math.round((s.score / 100) * 100));
                  const barColor = pct < 60 ? '#757575' : pct < 75 ? '#7BA4D4' : isMax ? `linear-gradient(90deg, ${R.navy}, ${R.gold})` : R.navy;
                  const prev = si > 0 ? u.scores[si - 1].score : null;
                  const delta = prev !== null ? s.score - prev : null;
                  return (
                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#757575', fontWeight: 600, width: '24px', flexShrink: 0 }}>{s.round || `${si + 1}차`}</span>
                      <div style={{ flex: 1, height: '6px', background: '#F3F4F6', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '6px', background: barColor }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: isMax ? R.navy : '#2C2C2C', width: '42px', textAlign: 'right', flexShrink: 0 }}>{s.score}점</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, width: '36px', flexShrink: 0, color: delta > 0 ? R.positive : delta < 0 ? R.negative : '#757575', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        {delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`}
                        {isMax && <span style={{ fontSize: '9px', background: R.gold, color: '#fff', padding: '2px 5px', borderRadius: '3px', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>최고</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button onClick={() => setShowAllUnits(true)}
              style={{ width: '100%', marginTop: '10px', padding: '9px', fontSize: '11px', fontWeight: 700, color: R.navy, background: '#F0F7FC', border: '1px solid #E6F1FB', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
              + {hiddenCount}개 단원 더보기
            </button>
          )}
          {/* 전체 요약 — 2회 이상 평가 시만 표시. 서로 다른 단원 시험 점수를 모은 범위라
              "→"로 이으면 마치 같은 시험이 오른 것처럼 보여 오해를 살 수 있어 "~"로 표기 */}
          {allScores.length >= 2 && (
            <div style={{ padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: `2px solid ${R.gold}`, marginTop: '12px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: `2px solid ${R.gold}`, marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: '#757575', fontWeight: 600 }}>이번 평가</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: R.navy, marginLeft: 'auto' }}>{maxScore}점</span>
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
                    <div style={{ position: 'relative', height: '180px', background: R.navy }}>
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
                    {(u.avgConcept != null || u.avgHomework != null) && (
                      <div style={{ display: 'flex', gap: '18px' }}>
                        {u.avgConcept != null && (
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                            <span style={{ fontSize: '11px', color: 'rgba(55,56,60,0.6)' }}>개념 이해</span>
                            <span style={{ fontSize: '17px', fontWeight: 700, color: R.navy }}>{u.avgConcept}%</span>
                          </span>
                        )}
                        {u.avgHomework != null && (
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                            <span style={{ fontSize: '11px', color: 'rgba(55,56,60,0.6)' }}>과제 수행</span>
                            <span style={{ fontSize: '17px', fontWeight: 700, color: R.navy }}>{u.avgHomework}%</span>
                          </span>
                        )}
                      </div>
                    )}
                    {u.topTags.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {u.topTags.map(k => {
                          const t = DIAG_COLORS[k];
                          if (!t) return null;
                          return <span key={k} style={{ fontSize: '11px', fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, padding: '3px 9px', borderRadius: '20px' }}>{t.label}</span>;
                        })}
                      </div>
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
                      <span style={{ background: '#EAF0F9', color: R.navy, fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '5px' }}>{p.weakLabel}</span>
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

        const keyMetricsContent = (() => {
        // 2열 그리드 — 각 타일이 개별 흰 카드(마일스톤/히어로와 같은 카드 체계), 출석은
        // 네이비 강조 카드. 결석/지각 유무에 따라 막대 폭만 달라질 뿐 항상 같은 3색 막대
        // 하나로 통일(예전 3분기 로직 제거 — flex:0.0001 트릭으로 0건도 안전하게 렌더).
        const cardTile = { background: '#fff', border: '1px solid #EEECEA', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 };
        const tileLabel = { fontSize: '12px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' };
        const tileValue = { fontSize: '30px', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.6px', color: R.navy };
        const tileUnit = { fontSize: '13px', fontWeight: 600, marginLeft: '2px' };
        const tileSub = { fontSize: '13px', fontWeight: 500, lineHeight: 1.5, color: 'rgba(55,56,60,0.75)' };

        return (
      <>
        {sectionDivider('KEY METRICS')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '14px' }}>
          {maxScore != null && (
            <div style={cardTile}>
              <span style={tileLabel}>최고 단원평가</span>
              <span style={tileValue}>{maxScore}<span style={tileUnit}>점</span></span>
              <span style={tileSub}>
                {maxScoreReport && <b style={{ color: R.goldText, fontWeight: 700 }}>{fmtDate(maxScoreReport)}</b>}
                {maxScoreReport ? ' · ' : ''}
                {maxScoreReport?.unit || maxScoreReport?.textbook || '100점 만점'}
              </span>
            </div>
          )}
          {hwAvg != null && (
            <div style={cardTile}>
              <span style={tileLabel}>과제 수행 평균</span>
              <span style={tileValue}>{hwAvg}<span style={tileUnit}>%</span></span>
              <span style={tileSub}>{hwRated.length}회 평균 · 담당교사 관찰</span>
            </div>
          )}
          {avgScore != null && (
            <div style={cardTile}>
              <span style={tileLabel}>전체 시험 평균</span>
              <span style={tileValue}>{avgScore}<span style={tileUnit}>점</span></span>
              <span style={tileSub}>{allScores.length}회 시험 평균</span>
            </div>
          )}

          {/* 출석 — 제안서 §5 출석 3색 토큰(출석/지각/결석) 그대로 사용 */}
          <div style={{ background: R.navy, borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '11px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>정시 출석률</span>
            <span style={{ fontSize: '30px', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.6px', color: '#fff' }}>{attendanceRate}<span style={{ fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>%</span></span>
            <div style={{ display: 'flex', height: '7px', borderRadius: '4px', overflow: 'hidden', gap: '2px' }}>
              <div style={{ flex: onTimeCount || 0.0001, background: '#5A8BD8' }} />
              <div style={{ flex: lateCount || 0.0001, background: R.gold }} />
              <div style={{ flex: absentCount || 0.0001, background: '#D46A6A' }} />
            </div>
            <span style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {[['출석', onTimeCount, '#5A8BD8'], ['지각', lateCount, R.gold], ['결석', absentCount, '#D46A6A']].map(([label, count, color]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.86)' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, display: 'inline-block' }} />{label} {count}
                </span>
              ))}
            </span>
          </div>
        </div>
      </>
        );
        })();

        // 4페이지 — 선생님 한마디 + 다음 목표 (둘 다 항상 존재, fallback 문구 있음)
        const teacherWordContent = (
      <div style={{ background: R.navy, borderRadius: '14px', padding: '26px 28px' }}>
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
              <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: R.gold, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
              <button onClick={cancelEdit} style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '14px', color: '#fff', lineHeight: 2.0, fontWeight: 500, wordBreak: 'keep-all', borderLeft: `2px solid ${R.gold}`, paddingLeft: '14px', marginBottom: '12px' }}>
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
                style={{ background: '#EAF0F9', border: 'none', color: R.navy, fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', cursor: regenField ? 'wait' : 'pointer', opacity: regenField && regenField !== 'nextChapter' ? 0.5 : 1 }}>
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
              <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: R.navy, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
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

        // 4개 페이지 구성 — 2페이지(평가 추이)는 시험 점수도 단원 평가도 없는 학생이면
        // 통째로 비어(scoreTrendContent/unitTrendContent 둘 다 null) 아래 filter(Boolean)로 걸러짐.
        // 약점 유형은 더 이상 이 페이지에 없음(4페이지 '다음 목표'로 흡수)
        const pages = [
          { key: 'milestone', label: '성장 마일스톤', content: (<>{aiGenButtonContent}{milestoneContent}</>) },
          unitCardsContent && { key: 'units', label: '단원별 정리', content: unitCardsContent },
          (scoreTrendContent || unitTrendContent) && { key: 'trend', label: '평가 추이', content: (<>{scoreTrendContent}{unitTrendContent}</>) },
          { key: 'metrics', label: '핵심 지표', content: (<>{reviewEffectContent}{keyMetricsContent}</>) },
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
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #E5E7EB', background: curPage === 0 ? '#F7F5F1' : '#fff', color: curPage === 0 ? '#D0D0D0' : R.navy, fontSize: '18px', lineHeight: 1, cursor: curPage === 0 ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                ‹
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {pages.map((p, i) => (
                    <button key={p.key} onClick={() => goPage(i)} title={p.label} aria-label={p.label}
                      style={{ width: i === curPage ? '18px' : '6px', height: '6px', borderRadius: '3px', border: 'none', padding: 0, background: i === curPage ? R.navy : '#E5E7EB', cursor: 'pointer', transition: 'width 0.2s, background 0.2s' }} />
                  ))}
                </div>
                <span style={{ fontSize: '10px', color: '#757575', fontWeight: 600, whiteSpace: 'nowrap' }}>{curPage + 1} / {pages.length} · {pages[curPage].label}</span>
              </div>
              <button onClick={() => goPage(curPage + 1)} disabled={curPage === pages.length - 1} aria-label="다음 페이지"
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #E5E7EB', background: curPage === pages.length - 1 ? '#F7F5F1' : '#fff', color: curPage === pages.length - 1 ? '#D0D0D0' : R.navy, fontSize: '18px', lineHeight: 1, cursor: curPage === pages.length - 1 ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
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
