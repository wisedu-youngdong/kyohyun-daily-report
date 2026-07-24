import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDoc, getDocs, query, where, doc, setDoc, limit } from 'firebase/firestore';
import { ReportCard } from './tokens.jsx';
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
    <p style={{ fontSize: '10px', textAlign: 'right', margin: '4px 0 0', color: over ? '#DC2626' : dark ? 'rgba(255,255,255,0.4)' : '#6C7586' }}>
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
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [completedReviews, setCompletedReviews] = useState([]); // 복습 효과 증명 그래프용
  const [editText, setEditText] = useState('');

  // 책장 넘기듯 좌우 탐색 — 예전엔 한 화면에 전부 이어붙여서 스크롤이 너무 길었음.
  // 페이지 목록(pages)은 실데이터 유무에 따라 페이지 자체가 없을 수도 있어(예: 시험 점수도
  // 약점 태그도 없는 신규생은 "평가 추이" 페이지가 통째로 비어 아래에서 필터링됨) 아래
  // return 문 안에서 실데이터 계산이 끝난 뒤 동적으로 구성함.
  const [page, setPage] = useState(0);
  const [slideDir, setSlideDir] = useState(1); // 1: 다음(→에서 옴), -1: 이전(←에서 옴)
  const touchStartXRef = useRef(null);

  // 기간 토글 — URL 파라미터 연동
  const periodParam = searchParams.get('period');
  const [period, setPeriod] = useState(periodParam === '3m' ? '3m' : 'all');

  // 학부모 공개 링크에는 관리자용 생성/편집 UI를 숨김 (?edit=1일 때만 노출)
  const isEditor = searchParams.get('edit') === '1';

  const handlePeriodChange = (val) => {
    setPeriod(val);
    setShowAllUnits(false);
    setPage(0); // 기간 바꾸면 페이지 구성(빈 페이지 여부 등)이 달라질 수 있어 처음 페이지로
    if (val === '3m') setSearchParams({ period: '3m' });
    else setSearchParams({});
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
  const sorted = period === '3m'
    ? allSorted.filter(r => {
        const ts = r.createdAt?.seconds || 0;
        const cutoff = Date.now() / 1000 - 90 * 86400; // 90일
        return ts >= cutoff;
      })
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
  const periodCutoff = period === '3m' ? Date.now() / 1000 - 90 * 86400 : null;
  const reviewProof = completedReviews
    .filter(rv => rv.testScore != null && (!periodCutoff || rv.completedAt >= periodCutoff))
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
        title: weakUnit ? `${weakUnit} 취약점 극복 프로젝트 시작` : '새로운 단원 도전 시작',
        desc: weakUnit
          ? `${weakUnit} 단원의 오답 패턴을 정확히 파악하고 체계적인 극복 전략을 수립했습니다.`
          : '반복되는 약점을 인식하고 집중 보완 전략을 세우기 시작했습니다.',
        badge: '약점 분석 완료',
        active: false,
      },
      {
        phase: 'PHASE 2 · 패턴 교정',
        title: improved
          ? `오답 패턴 개선 — 회당 ${firstErr}개 → ${secondErr}개`
          : '반복 오답 유형 집중 훈련',
        desc: improved
          ? '같은 실수를 두 번 하지 않겠다는 고집이 데이터로 확인되기 시작했습니다.'
          : '오답의 원인을 언어로 정리하고 풀이 전략을 다듬어가는 과정입니다.',
        badge: improved ? `오답률 감소 확인` : '패턴 분석 중',
        active: false,
      },
      {
        phase: 'PHASE 3 · 성장 증명',
        title: growth > 0
          ? `단원평가 ${firstScore}점 → ${bestScore}점 (+${growth}점 상승)`
          : over70 ? `단원평가 ${over70.testScore}점 달성` : '개념 이해도 꾸준히 상승 중',
        desc: growth > 0
          ? '단순히 점수가 오른 것이 아니라, 문제를 대하는 판단 기준 자체가 달라진 결과입니다.'
          : '풀이 방향을 스스로 결정하는 과정에서 자신만의 기준을 세우기 시작했습니다.',
        badge: growth > 0 ? `+${growth}점 성장` : '판단 기준 형성',
        active: false,
      },
      {
        phase: 'PHASE 4 · 전략 고도화',
        title: improved
          ? '사고력 고도화 — 응용 문제 자력 해결 체계 완성'
          : '기초 다지기 — 반복 오답 패턴 재점검 중',
        desc: improved
          ? '이제 낯선 문제 유형에서도 스스로 판단 기준을 세우고 전략을 선택할 수 있습니다. 다음 단원에서 이 고집이 더 빛을 발할 것입니다.'
          : '최근 오답 패턴이 다시 늘어 기초 개념을 한 번 더 점검하는 시기입니다. 이 과정을 거치면 다음 도약이 더 단단해집니다.',
        badge: improved ? '해결 전략 완성 단계' : '재점검 진행 중',
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

      // 이전 PHASE 대비 평점 변화 (PHASE 2 이상) — 둘 다 실제로 평가된 경우만 계산
      const prevR = pi > 0 ? sorted[idx[pi - 1]] : null;
      const hwDelta = (prevR && r.homeworkRating != null && prevR.homeworkRating != null)
        ? r.homeworkRating - prevR.homeworkRating
        : null;

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
          hwDelta,
          photoUrl: r.photoUrls?.[0] || null,
        },
      });
    });
  }

  // 기간 표시
  const periodLabel = sorted.length > 0
    ? `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])} · ${sorted.length}회 수업`
    : '';

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
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.10)' }}>
          <div style={{ background: '#0D2D6B', padding: '32px 24px 28px' }}>
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
      <button onClick={() => setRetryKey(k => k + 1)} style={{ padding: '9px 20px', background: '#0D2D6B', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>다시 시도</button>
    </div>
  );

  if (!student) return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif", color: '#757575', fontSize: '14px' }}>
      학생 정보를 찾을 수 없습니다.
    </div>
  );

  const teacherName = sorted[sorted.length - 1]?.teacherName || '';
  const teacherDisplay = teacherName ? teacherName.replace(/선생님?$/, '').trim() + ' 선생님' : '담당 교사';

  const S = {
    header: { background: '#0D2D6B', padding: '32px 24px 28px', position: 'relative', overflow: 'hidden' },
    section: { background: '#fff', padding: '22px', borderBottom: '1px solid #EEECEA' },
    label: { fontSize: '10px', fontWeight: 700, color: '#0D2D6B', letterSpacing: '0.14em', marginBottom: '16px' },
  };

  return (
    <ReportCard maxWidth="420px">
      <style>{FONT_STYLE}</style>

      {/* 헤더 */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ width: '3px', height: '16px', background: '#C9A227', borderRadius: '1px' }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.16em' }}>{academyName || '데일리 리포트 시스템'}</span>
        </div>
        <div style={{ height: '1px', background: 'rgba(201,162,39,0.2)', marginBottom: '20px' }} />
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.18em', fontWeight: 600, marginBottom: '6px' }}>GROWTH PORTFOLIO</p>
        <p style={{ fontSize: '26px', fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: '4px' }}>{student.name}의 성장 포트폴리오</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>{periodLabel}</p>

        {/* 기간 토글 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '3px' }}>
            {[
              { key: 'all', label: '전체 여정' },
              { key: '3m', label: '최근 3개월' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => handlePeriodChange(key)}
                style={{
                  padding: '10px 16px', minHeight: '40px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                  background: period === key ? '#C9A227' : 'transparent',
                  color: period === key ? '#1A1A1A' : 'rgba(255,255,255,0.5)',
                  fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.2s',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* 공유 버튼 */}
          <button onClick={() => {
            const url = `${window.location.origin}/story/${studentId}${period === '3m' ? '?period=3m' : ''}`;
            navigator.clipboard.writeText(url)
              .then(() => alert('링크가 복사됐어요!'))
              .catch(() => window.prompt('아래 링크를 길게 눌러 복사하세요', url));
          }}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', padding: '10px 16px', minHeight: '40px', color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            📤 링크 복사
          </button>
        </div>
      </div>

      {(() => {
        // AI 서사 생성 버튼 (강사 전용, ?edit=1) — 1페이지(마일스톤) 맨 위에 포함
        const aiGenButtonContent = !isEditor ? null : (
      <div style={{ padding: '12px 22px 0' }}>
        <button onClick={handleGenNarrative} disabled={narLoading}
          style={{ width: '100%', padding: '11px', background: narLoading ? '#E5E7EB' : narrative ? '#F0FAF5' : '#0D2D6B', color: narLoading ? '#6C7586' : narrative ? '#0F6E56' : '#fff', border: narrative ? '1px solid #0F6E5640' : 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: narLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {narLoading ? '⏳ AI 서사 생성 중...' : narrative ? '🔄 전체 서사 다시 만들기 (4개 항목 모두)' : '✨ AI 서사 자동 생성'}
        </button>
      </div>
        );

        // 1페이지 — GROWTH MILESTONE (항상 존재, 데이터 없을 때 안내 문구)
        const milestoneContent = (
      <div style={S.section}>
        <p style={S.label}>GROWTH MILESTONE</p>
        {milestones.length > 0 && sorted.length > milestones.length && (
          <p style={{ fontSize: '11px', color: '#6C7586', margin: '-10px 0 16px', lineHeight: 1.6 }}>
            총 {sorted.length}회 수업 중 의미 있었던 {milestones.length}개의 순간을 모았어요
          </p>
        )}
        {milestones.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#6C7586', fontSize: '13px' }}>
            리포트가 쌓이면 성장 마일스톤이 자동으로 생성됩니다
          </div>
        ) : (
        <>
        <div style={{ position: 'relative', paddingLeft: '28px' }}>
          <div style={{ position: 'absolute', left: '7px', top: '8px', bottom: '8px', width: '2px', background: 'linear-gradient(to bottom, #0D2D6B, #C9A227)', borderRadius: '2px' }} />
          {milestones.map((m, i) => {
            const isChapter1 = i === 0;
            const isChapter2 = i === milestones.length - 1;
            const chapterField = isChapter1 ? 'chapter1' : isChapter2 ? 'chapter2' : null;
            const chapterText = narrative
              ? (isChapter1 ? narrative.chapter1 : isChapter2 ? narrative.chapter2 : m.desc)
              : m.desc;

            return (
            <div key={i} style={{ position: 'relative', marginBottom: i < milestones.length - 1 ? '20px' : 0 }}>
              <div style={{ position: 'absolute', left: '-24px', top: '4px', width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${m.active ? '#C9A227' : '#0D2D6B'}`, background: m.active ? '#C9A227' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: m.active ? '0 0 0 3px rgba(201,162,39,0.2)' : 'none' }}>
                {m.active
                  ? <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="2" fill="#0D2D6B"/></svg>
                }
              </div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#C9A227', letterSpacing: '0.14em', marginBottom: '3px' }}>{m.phase}</p>
              <span style={{ fontSize: '11px', color: '#757575', fontWeight: 500, marginBottom: '4px', display: 'block' }}>{m.date}</span>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B', margin: '0 0 4px' }}>{m.title}</p>

              {/* 실데이터 카드 */}
              {m.realData && (
                <div style={{ background: '#F8F9FC', border: '0.5px solid #E5E7EB', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px' }}>
                  {/* 교재/단원 */}
                  {(m.realData.textbook || m.realData.unit) && (
                    <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 5px', fontWeight: 500 }}>
                      📚 {[m.realData.textbook, m.realData.unit, m.realData.pages && fmtPages(m.realData.pages)].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {/* 평점 */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: m.realData.diagTags.length > 0 || m.realData.testScore || m.realData.notePreview ? '5px' : 0 }}>
                    {m.realData.homeworkRating != null && (
                      <span style={{ fontSize: '12px', color: '#374151' }}>
                        과제 <strong style={{ color: '#0D2D6B' }}>{m.realData.homeworkRating}%</strong>
                        {m.realData.hwDelta !== null && m.realData.hwDelta !== 0 && (
                          <span style={{ color: m.realData.hwDelta > 0 ? '#0F6E56' : '#DC2626', marginLeft: '3px' }}>
                            {m.realData.hwDelta > 0 ? `+${m.realData.hwDelta}` : m.realData.hwDelta}
                          </span>
                        )}
                      </span>
                    )}
                    {m.realData.conceptRating != null && (
                      <span style={{ fontSize: '12px', color: '#374151' }}>
                        개념 <strong style={{ color: '#0D2D6B' }}>{m.realData.conceptRating}%</strong>
                      </span>
                    )}
                    {m.realData.testScore && (
                      <span style={{ fontSize: '12px', color: '#374151' }}>
                        시험 <strong style={{ color: '#C9A227' }}>{m.realData.testScore}점</strong>
                      </span>
                    )}
                  </div>
                  {/* 진단 태그 */}
                  {m.realData.diagTags.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: m.realData.notePreview ? '5px' : 0 }}>
                      {m.realData.diagTags.map((tag, ti) => (
                        <span key={ti} style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '8px', background: '#FDF0F0', color: '#8A2020' }}>{tag}</span>
                      ))}
                    </div>
                  )}
                  {/* 코멘트 미리보기 */}
                  {m.realData.notePreview && (
                    <p style={{ fontSize: '12px', color: '#6B7280', margin: m.realData.photoUrl ? '0 0 6px' : '0', lineHeight: 1.6, fontStyle: 'italic' }}>
                      "{m.realData.notePreview}"
                    </p>
                  )}
                  {/* 그 순간의 사진 — 있으면 한 장만 대표로 보여줌 */}
                  {m.realData.photoUrl && (
                    <a href={m.realData.photoUrl} target="_blank" rel="noopener noreferrer">
                      <img src={m.realData.photoUrl} alt="수업 사진"
                        style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #E5E7EB', display: 'block' }} />
                    </a>
                  )}
                </div>
              )}

              {chapterField && editing === chapterField ? (
                <div style={{ marginBottom: '6px' }}>
                  <textarea value={editText} onChange={e => setEditText(e.target.value.slice(0, NARRATIVE_MAX_LEN))} maxLength={NARRATIVE_MAX_LEN}
                    style={{ width: '100%', minHeight: '70px', padding: '10px', border: '1px solid #E5E5E5', borderRadius: '8px', color: '#2C2C2C', fontSize: '16px', lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                  <EditCharCount text={editText} />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button onClick={saveEdit} style={{ flex: 1, padding: '7px', background: '#0D2D6B', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
                    <button onClick={cancelEdit} style={{ flex: 1, padding: '7px', background: '#F3F4F6', border: 'none', borderRadius: '6px', color: '#6B7280', fontSize: '11px', cursor: 'pointer' }}>취소</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#4A4A4A', lineHeight: 1.8, wordBreak: 'keep-all', marginBottom: '6px' }}>
                  {chapterText}
                  {isEditor && narrative && chapterField && (
                    <>
                      <button onClick={() => startEdit(chapterField)}
                        style={{ marginLeft: '6px', background: '#F0EDE8', border: 'none', color: '#757575', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', cursor: 'pointer', verticalAlign: 'middle' }}>
                        ✏️ 편집
                      </button>
                      <button onClick={() => handleRegenField(chapterField)} disabled={!!regenField}
                        title="이 항목만 AI로 다시 생성 (다른 항목은 그대로)"
                        style={{ marginLeft: '4px', background: '#EAF0F9', border: 'none', color: '#0D2D6B', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', cursor: regenField ? 'wait' : 'pointer', verticalAlign: 'middle', opacity: regenField && regenField !== chapterField ? 0.5 : 1 }}>
                        {regenField === chapterField ? '⏳ 생성 중' : '🔄 이 항목만'}
                      </button>
                    </>
                  )}
                </p>
              )}

              <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: 700, color: m.active ? '#8A6500' : '#0D2D6B', background: m.active ? 'rgba(201,162,39,0.12)' : '#EAF0F9', padding: '3px 9px', borderRadius: '3px' }}>{m.badge}</span>
            </div>
            );
          })}
        </div>

        {/* 요약에 안 들어간 나머지 회차를 원하는 학부모를 위한 전체 목록 — 스토리는 깔끔하게 두고 여기서만 펼침 */}
        {sorted.length > milestones.length && (
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed #E5E7EB' }}>
            <button onClick={() => setShowAllSessions(v => !v)}
              style={{ width: '100%', padding: '9px', fontSize: '11px', fontWeight: 700, color: '#0D2D6B', background: '#F0F7FC', border: '1px solid #E6F1FB', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
              {showAllSessions ? '접기' : `전체 ${sorted.length}회 리포트 보기`}
            </button>
            {showAllSessions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                {sorted.map((r, ri) => {
                  const cleanNote = (r.teacherNote || '').replace(/\[([^\]]+)\]\s*/g, '').trim();
                  return (
                    <div key={r.id || ri} style={{ display: 'flex', gap: '8px', padding: '8px 10px', background: '#F9FAFB', borderRadius: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#6C7586', fontWeight: 600, flexShrink: 0, width: '44px' }}>{fmtDate(r)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '11px', color: '#374151', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[r.textbook, r.unit].filter(Boolean).join(' · ') || '수업'}
                        </p>
                        {cleanNote && (
                          <p style={{ fontSize: '11px', color: '#6C7586', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cleanNote}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
        );

        // 2페이지 — 단원별 평가 추이 + 자주 나온 약점 유형 (둘 다 없으면 페이지 자체가 생략됨)
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
                  <span style={{ fontSize: '9px', color: '#0D2D6B', background: '#EAF0F9', padding: '2px 7px', borderRadius: '3px', fontWeight: 600 }}>
                    {u.scores.length}회 평가
                  </span>
                </p>
                {u.scores.map((s, si) => {
                  const isMax = s.score === Math.max(...u.scores.map(x => x.score));
                  const pct = Math.min(100, Math.round((s.score / 100) * 100));
                  const barColor = pct < 60 ? '#757575' : pct < 75 ? '#7BA4D4' : isMax ? 'linear-gradient(90deg, #0D2D6B, #C9A227)' : '#0D2D6B';
                  const prev = si > 0 ? u.scores[si - 1].score : null;
                  const delta = prev !== null ? s.score - prev : null;
                  return (
                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#757575', fontWeight: 600, width: '24px', flexShrink: 0 }}>{s.round || `${si + 1}차`}</span>
                      <div style={{ flex: 1, height: '6px', background: '#F3F4F6', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '6px', background: barColor }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: isMax ? '#0D2D6B' : '#2C2C2C', width: '42px', textAlign: 'right', flexShrink: 0 }}>{s.score}점</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, width: '36px', flexShrink: 0, color: delta > 0 ? '#0F6E56' : delta < 0 ? '#A32D2D' : '#757575', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        {delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`}
                        {isMax && <span style={{ fontSize: '9px', background: '#C9A227', color: '#fff', padding: '2px 5px', borderRadius: '3px', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>최고</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button onClick={() => setShowAllUnits(true)}
              style={{ width: '100%', marginTop: '10px', padding: '9px', fontSize: '11px', fontWeight: 700, color: '#0D2D6B', background: '#F0F7FC', border: '1px solid #E6F1FB', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
              + {hiddenCount}개 단원 더보기
            </button>
          )}
          {/* 전체 요약 — 2회 이상 평가 시만 표시. 서로 다른 단원 시험 점수를 모은 범위라
              "→"로 이으면 마치 같은 시험이 오른 것처럼 보여 오해를 살 수 있어 "~"로 표기 */}
          {allScores.length >= 2 && (
            <div style={{ padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: '2px solid #C9A227', marginTop: '12px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: '2px solid #C9A227', marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: '#757575', fontWeight: 600 }}>이번 평가</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#0D2D6B', marginLeft: 'auto' }}>{maxScore}점</span>
              <span style={{ fontSize: '11px', color: '#757575' }}>/ 100점 만점</span>
            </div>
          )}
        </div>
        );
        })();

        // 자주 나온 약점 유형 — 이미 로드된 sorted(이 학생 전체 리포트)로 집계, 새 조회 없음.
        // recharts는 여기선 안 씀 — 공개 페이지 번들에 375KB 차트 라이브러리가 딸려오는 걸 피하려고
        // 단원별 평가 추이와 같은 hand-rolled div 막대 방식 유지.
        // 어느 단원에서 나온 건지도 같이 집계 — nextChapterContent의 "다음 목표"에도 재사용
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
        const topWeakLabel = diagList.length > 0 ? (DIAG_COLORS[diagList[0][0]]?.label || diagList[0][0]) : null;

        const weakTypeContent = (() => {
        if (diagList.length === 0) return null;
        const maxCount = diagList[0][1];
        return (
          <div style={S.section}>
            <p style={S.label}>자주 나온 약점 유형</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {diagList.map(([key, count]) => {
                const info = DIAG_COLORS[key] || { label: key, color: '#757575' };
                const topUnits = diagUnitMap[key]
                  ? Object.entries(diagUnitMap[key]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([u]) => u)
                  : [];
                return (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '12px', color: '#2C2C2C', fontWeight: 600 }}>{info.label}</span>
                      <span style={{ fontSize: '11px', color: '#757575' }}>{count}회</span>
                    </div>
                    <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(count / maxCount * 100)}%`, height: '100%', background: info.color, borderRadius: '6px' }} />
                    </div>
                    {topUnits.length > 0 && (
                      <p style={{ fontSize: '12px', color: '#2C2C2C', margin: '4px 0 0' }}>주로 {topUnits.join(', ')}에서 나왔어요</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
        })();

        // 3페이지 — 복습 효과(있을 때만) + 핵심 지표(항상 존재)
        const reviewEffectContent = reviewProof.length === 0 ? null : (
      <div style={S.section}>
          <p style={S.label}>복습 효과</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: '2px solid #C9A227', marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', color: '#757575', fontWeight: 600 }}>복습 완료</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#0D2D6B' }}>{reviewProof.length}건</span>
            {reviewProofImproved > 0 && (
              <span style={{ fontSize: '11px', color: '#0F6E56', fontWeight: 700, marginLeft: 'auto' }}>{reviewProofImproved}건 점수 향상</span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {reviewProof.slice(0, 5).map(p => {
              const delta = p.after - p.before;
              return (
                <div key={p.id}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#2C2C2C', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {p.unit || '복습'}
                    {p.weakLabel && (
                      <span style={{ fontSize: '9px', color: '#0D2D6B', background: '#EAF0F9', padding: '2px 7px', borderRadius: '3px', fontWeight: 600 }}>{p.weakLabel}</span>
                    )}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {/* 4칸 모두 "캡션 줄(9px, 고정) + 값 줄(20px 고정 높이, 세로 중앙정렬)" 구조로
                        통일 — 폰트 크기가 13/16/12/11px로 제각각이라 lineHeight 차이로 살짝
                        어긋나 보이던 걸, 값 줄 자체를 고정 높이 박스로 만들어 완전히 맞춤 */}
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '9px', color: '#757575', fontWeight: 600, margin: '0 0 2px' }}>복습 전</p>
                      <div style={{ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#757575', lineHeight: 1 }}>{p.before}점</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '9px', margin: '0 0 2px', visibility: 'hidden' }}>·</p>
                      <div style={{ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#C9A227', lineHeight: 1 }}>→</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '9px', color: '#757575', fontWeight: 600, margin: '0 0 2px' }}>복습 후</p>
                      <div style={{ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: delta > 0 ? '#0D2D6B' : '#2C2C2C', lineHeight: 1 }}>{p.after}점</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '9px', margin: '0 0 2px', visibility: 'hidden' }}>·</p>
                      <div style={{ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: delta > 0 ? '#0F6E56' : delta < 0 ? '#A32D2D' : '#757575', lineHeight: 1 }}>
                          {delta === 0 ? '동일' : delta > 0 ? `+${delta}` : `${delta}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  {p.note && <p style={{ fontSize: '12px', color: '#2C2C2C', margin: '5px 0 0', lineHeight: 1.5 }}>{p.note}</p>}
                </div>
              );
            })}
          </div>
          {reviewProof.length > 5 && (
            <p style={{ fontSize: '10px', color: '#757575', marginTop: '10px', textAlign: 'center' }}>외 {reviewProof.length - 5}건 더</p>
          )}
        </div>
        );

        const keyMetricsContent = (() => {
        // 세로 리스트 — 예전엔 2x2 타일이었는데, 프레임 높이가 마일스톤 페이지 기준으로
        // 고정돼 있어서 짧은 통계 4개만으로는 위아래에 빈 여백이 크게 남았음. 한 줄짜리
        // 카드 4개로 바꾸면 그 높이를 자연스럽게 채우고, 맨 아래 출석 카드도 더 크게 보여줄 수 있음.
        const tileStyle = { background: '#F7F5F1', borderRadius: '8px', padding: '13px 14px', borderLeft: '2px solid #C9A227' };
        const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' };
        const labelStyle = { fontSize: '12px', fontWeight: 600, color: '#2C2C2C', margin: '0 0 3px' };
        const captionStyle = { fontSize: '12px', color: '#2C2C2C', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
        const numStyle = { fontSize: '22px', fontWeight: 800, color: '#0D2D6B', flexShrink: 0, lineHeight: 1 };
        const unitStyle = { fontSize: '11px', color: '#5C5C5C', fontWeight: 600 };

        return (
      <div style={S.section}>
        <p style={S.label}>KEY METRICS</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {maxScore && (
            <div style={tileStyle}>
              <div style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <p style={labelStyle}>최고 단원평가</p>
                  <p style={captionStyle}>
                    {maxScoreReport && <span style={{ color: '#8A6412', fontWeight: 700 }}>{fmtDate(maxScoreReport)}</span>}
                    {maxScoreReport && (maxScoreReport.unit || maxScoreReport.textbook) ? ' · ' : ''}
                    {maxScoreReport?.unit || maxScoreReport?.textbook || '100점 만점'}
                  </p>
                </div>
                <span style={numStyle}>{maxScore}<span style={unitStyle}>점</span></span>
              </div>
            </div>
          )}
          {hwAvg && (
            <div style={tileStyle}>
              <div style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <p style={labelStyle}>과제 수행 평균</p>
                  <p style={captionStyle}>{hwRated.length}회 평균 · 담당교사 관찰</p>
                </div>
                <span style={numStyle}>{hwAvg}<span style={unitStyle}>%</span></span>
              </div>
            </div>
          )}
          {avgScore && (
            <div style={tileStyle}>
              <div style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <p style={labelStyle}>전체 시험 평균</p>
                  <p style={captionStyle}>{allScores.length}회 시험 평균</p>
                </div>
                <span style={numStyle}>{avgScore}<span style={unitStyle}>점</span></span>
              </div>
            </div>
          )}

          {/* 출석 카드 — 결석 있으면 3색 비율 막대, 지각만 있으면 출석/지각 필, 개근이면 칭찬 문구 */}
          <div style={tileStyle}>
            {absentCount > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#0D2D6B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: '16px', fontWeight: 800 }}>{sorted.length}</div>
                  <div style={{ minWidth: 0 }}>
                    <p style={labelStyle}>총 {sorted.length}회 수업 · 출석률 {attendanceRate}%</p>
                    <p style={captionStyle}>{fmtDate(sorted[0])} – {fmtDate(sorted[sorted.length - 1])} 기준</p>
                  </div>
                </div>
                <div style={{ display: 'flex', height: '6px', borderRadius: '5px', overflow: 'hidden', gap: '2px', marginTop: '10px' }}>
                  <div style={{ flex: onTimeCount || 0.0001, background: '#0D2D6B' }} />
                  <div style={{ flex: lateCount || 0.0001, background: '#C9A227' }} />
                  <div style={{ flex: absentCount, background: '#A32D2D' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '7px', fontSize: '10px', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#0D2D6B' }}><i style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0D2D6B', display: 'inline-block' }} />출석 {onTimeCount}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#8A6412' }}><i style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C9A227', display: 'inline-block' }} />지각 {lateCount}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#A32D2D' }}><i style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A32D2D', display: 'inline-block' }} />결석 {absentCount}</span>
                </div>
              </>
            ) : lateCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#0D2D6B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: '16px', fontWeight: 800 }}>{sorted.length}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={labelStyle}>총 {sorted.length}회 수업 · 출석 {onTimeCount}</p>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#0D2D6B', background: '#E8EEFA', padding: '2px 8px', borderRadius: '20px' }}>출석 {onTimeCount}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#8A6412', background: '#FBF1DE', padding: '2px 8px', borderRadius: '20px' }}>지각 {lateCount}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#C9A227', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: '16px', fontWeight: 800 }}>{sorted.length}</div>
                <div style={{ minWidth: 0 }}>
                  <p style={labelStyle}>총 {sorted.length}회 수업 · 개근</p>
                  <p style={{ fontSize: '11px', color: '#8A6412', fontWeight: 700, margin: 0 }}>지각 한 번도 없어요!</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
        );
        })();

        // 4페이지 — 선생님 한마디 + 다음 목표 (둘 다 항상 존재, fallback 문구 있음)
        const teacherWordContent = (
      <div style={{ background: '#0D2D6B', padding: '24px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.14em', fontWeight: 600 }}>TEACHER'S WORD</p>
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
              <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: '#C9A227', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
              <button onClick={cancelEdit} style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '14px', color: '#fff', lineHeight: 2.0, fontWeight: 500, wordBreak: 'keep-all', borderLeft: '2px solid #C9A227', paddingLeft: '14px', marginBottom: '12px' }}>
            {narrative?.teacherWord || (bestReport?.teacherNote
              ? `"${bestReport.teacherNote.slice(0, 60)}${bestReport.teacherNote.length > 60 ? '...' : ''}"`
              : `${student.name}이(가) 바뀐 건 점수가 아닙니다. 문제를 스스로 바라보는 시선이 바뀌었습니다.`)}
          </p>
        )}
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
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
                style={{ background: '#EAF0F9', border: 'none', color: '#0D2D6B', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', cursor: regenField ? 'wait' : 'pointer', opacity: regenField && regenField !== 'nextChapter' ? 0.5 : 1 }}>
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
              <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: '#0D2D6B', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
              <button onClick={cancelEdit} style={{ flex: 1, padding: '8px', background: '#F3F4F6', border: 'none', borderRadius: '6px', color: '#6B7280', fontSize: '12px', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '12px', color: '#4A4A4A', lineHeight: 1.9, wordBreak: 'keep-all', marginBottom: '14px' }}>
            {narrative?.nextChapter || '판단 기준을 세우는 힘이 생기기 시작했습니다. 이제는 그 힘을 더 단단하게 만들 차례입니다.'}
          </p>
        )}
        <div style={{ padding: '14px 16px', background: '#F7F5F1', borderRadius: '6px', borderLeft: '2px solid #C9A227' }}>
          <p style={{ fontSize: '11px', color: '#757575', fontWeight: 600, marginBottom: '3px' }}>다음 목표</p>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B' }}>{topWeakLabel ? `${topWeakLabel} 집중 보완` : '다음 단원 준비'}</p>
        </div>
      </div>
        );

        // 4개 페이지 구성 — 2페이지(평가 추이)는 시험 점수도 약점 태그도 없는 학생이면
        // 통째로 비어(unitTrendContent/weakTypeContent 둘 다 null) 아래 filter(Boolean)로 걸러짐
        const pages = [
          { key: 'milestone', label: '성장 마일스톤', content: (<>{aiGenButtonContent}{milestoneContent}</>) },
          (unitTrendContent || weakTypeContent) && { key: 'trend', label: '평가 추이', content: (<>{unitTrendContent}{weakTypeContent}</>) },
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
        const onTouchStart = (e) => { touchStartXRef.current = e.touches[0].clientX; };
        const onTouchEnd = (e) => {
          if (touchStartXRef.current == null) return;
          const dx = e.changedTouches[0].clientX - touchStartXRef.current;
          touchStartXRef.current = null;
          if (Math.abs(dx) < 40) return; // 너무 짧은 터치는 무시
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
                display: 'flex', flexDirection: 'column',
              }}>
              <div style={{ margin: 'auto 0' }}>
                {pages[curPage].content}
              </div>
            </div>

            {/* 페이지 내비게이션 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '14px 22px', background: '#fff', borderTop: '1px solid #EEECEA' }}>
              <button onClick={() => goPage(curPage - 1)} disabled={curPage === 0} aria-label="이전 페이지"
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #E5E7EB', background: curPage === 0 ? '#F7F5F1' : '#fff', color: curPage === 0 ? '#D0D0D0' : '#0D2D6B', fontSize: '18px', lineHeight: 1, cursor: curPage === 0 ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                ‹
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {pages.map((p, i) => (
                    <button key={p.key} onClick={() => goPage(i)} title={p.label} aria-label={p.label}
                      style={{ width: i === curPage ? '18px' : '6px', height: '6px', borderRadius: '3px', border: 'none', padding: 0, background: i === curPage ? '#0D2D6B' : '#E5E7EB', cursor: 'pointer', transition: 'width 0.2s, background 0.2s' }} />
                  ))}
                </div>
                <span style={{ fontSize: '10px', color: '#757575', fontWeight: 600, whiteSpace: 'nowrap' }}>{curPage + 1} / {pages.length} · {pages[curPage].label}</span>
              </div>
              <button onClick={() => goPage(curPage + 1)} disabled={curPage === pages.length - 1} aria-label="다음 페이지"
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #E5E7EB', background: curPage === pages.length - 1 ? '#F7F5F1' : '#fff', color: curPage === pages.length - 1 ? '#D0D0D0' : '#0D2D6B', fontSize: '18px', lineHeight: 1, cursor: curPage === pages.length - 1 ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
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
