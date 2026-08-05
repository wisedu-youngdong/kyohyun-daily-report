import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { R, ReportCard, deriveSkinColors, accentLabelOnPrimary } from './tokens.jsx';
import { toPct, ratingLabel, fetchAcademyBranding } from './growth.js';
// 구형 Android 카카오톡 인앱 웹뷰처럼 dvh 미지원 엔진은 인식 못 하는 값의 선언 자체를 통째로
// 무시해 min-height가 사라짐 — vh를 먼저 선언해 폴백으로 두고, dvh가 지원되면 그 값으로
// 덮어쓰게 함(인라인 style 객체는 같은 프로퍼티를 두 번 못 써서 클래스로 분리)
const VH_FALLBACK_CSS = `.pr-full-h { min-height: 100vh; min-height: 100dvh; }`;
const SkeletonReport = () => (
  <div className="pr-full-h" style={{ background: '#F5F5F0', padding: '24px 16px', display: 'flex', justifyContent: 'center', fontFamily: R.body }}>
    <style>{`${VH_FALLBACK_CSS} @keyframes reportPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.9; } }`}</style>
    <div style={{ width: '100%', maxWidth: '390px' }}>
      <div style={{ background: '#fff', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.10)' }}>
        <div style={{ background: '#0D2D6B', padding: '20px 22px 18px' }}>
          <div style={{ width: '55%', height: '14px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', marginBottom: '10px', animation: 'reportPulse 1.4s ease-in-out infinite' }} />
          <div style={{ width: '35%', height: '10px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', animation: 'reportPulse 1.4s ease-in-out infinite' }} />
        </div>
        <div style={{ padding: '22px' }}>
          {[85, 60, 92, 45, 70].map((w, i) => (
            <div key={i} style={{ width: `${w}%`, height: '12px', background: '#EDEBE7', borderRadius: '4px', marginBottom: '14px', animation: 'reportPulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default function PublicReport() {
  const { reportId } = useParams();
  const location = useLocation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorType, setErrorType] = useState(null); // 'notfound' | 'network' | 'draft'
  const [retryKey, setRetryKey] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null); // photoUrls 배열의 인덱스 — 좌우 넘기기 위해 URL 대신 인덱스로 관리
  const [brokenPhotos, setBrokenPhotos] = useState({});
  const [academyName, setAcademyName] = useState(null);
  const [academyId, setAcademyId] = useState(null);
  // 선생님 피드백 3단(잘하고 있는 점/보완이 필요한 점) 근거 접기/펼침 — 기본 둘 다 접힘
  const [strongOpen, setStrongOpen] = useState(false);
  const [weakOpen, setWeakOpen] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [questionText, setQuestionText] = useState('');
  const [questionSubmitting, setQuestionSubmitting] = useState(false);
  const [questionSubmitted, setQuestionSubmitted] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [newAnswerIds, setNewAnswerIds] = useState(new Set()); // 이번 방문에서 처음 보는 답변 — "답변 도착" 배지용
  const viewLoggedRef = React.useRef(false); // StrictMode 개발 모드 이펙트 2회 실행 시 열람 기록 중복 방지
  const touchStartXRef = React.useRef(null); // 라이트박스 스와이프 넘기기용

  useEffect(() => {
    setLoading(true);
    setErrorType(null);
    (async () => {
      try {
        // 리포트는 academies/{academyId}/reports 밑에 있어서, 우선 최상위 reportIndex에서
        // 이 ID가 어느 학원 소속인지 찾은 다음 실제 문서를 조회한다 (멀티테넌시 전환).
        const indexSnap = await getDoc(doc(db, 'reportIndex', reportId));
        if (!indexSnap.exists()) { setErrorType('notfound'); setLoading(false); return; }
        const { academyId } = indexSnap.data();
        const rSnap = await getDoc(doc(db, 'academies', academyId, 'reports', reportId));
        if (!rSnap.exists()) { setErrorType('notfound'); setLoading(false); return; }
        const r = { id: rSnap.id, ...rSnap.data() };
        // 원장 검토·발송 전 초안(주간형은 세션 저장 때마다 항상 isDraft:true)이 URL만
        // 알면 조회되던 문제 — 발송 전에는 학부모에게 절대 보여주면 안 됨
        if (r.isDraft) { setErrorType('draft'); setLoading(false); return; }
        setReport(r);
        setLoading(false);
        setAcademyId(academyId);
        fetchAcademyBranding(academyId).then(b => setAcademyName(b.academyName || null));

        // 이 리포트에 남긴 질문/답변 — Firestore 직접 list는 전체 학원 질문 열람으로 이어질 수 있어
        // 막혀 있고(firestore.rules), reportId로 스코프된 결과만 서버(Admin SDK)를 통해 받아온다.
        fetch(`/api/report-questions?academyId=${encodeURIComponent(academyId)}&reportId=${encodeURIComponent(reportId)}`)
          .then(r => r.ok ? r.json() : { questions: [] })
          .then(({ questions }) => setQuestions(questions || []))
          .catch(() => {});

        // 열람 기록 저장 (화면 표시를 막지 않도록 fire-and-forget)
        if (!viewLoggedRef.current) {
          viewLoggedRef.current = true;
          const params = new URLSearchParams(location.search);
          const src = params.get('src') || 'direct';
          addDoc(collection(db, 'academies', academyId, 'reportViews'), {
            reportId,
            studentId: r.studentId,
            studentName: r.studentName,
            src,
            viewedAt: serverTimestamp(),
            ua: navigator.userAgent.slice(0, 100),
          }).catch(() => { /* 열람 기록 실패해도 리포트 표시는 계속 */ });
        }

        // 브라우저 탭 제목 — OG 메타 태그는 크롤러가 JS를 실행하지 않아 여기서 갱신해도
        // 카톡/SNS 링크 미리보기에는 반영되지 않음(봇 UA는 /api/report-og로 별도 라우팅됨). document.title만 갱신.
        if (r.studentName) {
          document.title = `${r.studentName} 학생의 성장 리포트`;
        }
      } catch (e) { console.error('리포트 로드 실패:', e); setErrorType('network'); setLoading(false); }
    })();
  }, [reportId, retryKey]);

  // 라이트박스 열려있을 때 키보드로도 넘기기/닫기 — early return(로딩/에러 화면)보다 위에 있어야
  // hooks 순서가 매 렌더 동일하게 유지됨
  useEffect(() => {
    if (lightboxIndex == null || !report?.photoUrls) return;
    const visible = report.photoUrls.map((_, i) => i).filter(i => !brokenPhotos[i]);
    const move = (delta) => {
      setLightboxIndex(prev => {
        const pos = visible.indexOf(prev);
        if (pos === -1 || visible.length < 2) return prev;
        return visible[(pos + delta + visible.length) % visible.length];
      });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, brokenPhotos, report]);

  // 답변 도착 배지 — "이 답변을 이 브라우저에서 이미 봤는지"를 서버 없이 localStorage로 추적.
  // reportViews는 직원 전용 컬렉션이라 공개 페이지에서 "지난 방문 시각"을 읽을 방법이 없고,
  // 새 프록시 API를 추가하기엔 Vercel 함수가 이미 12개 한도에 닿아 있어 이 방식을 택함.
  // 단점: 기기/브라우저를 바꾸면 다시 "새 답변"으로 보일 수 있음 — 낮은 리스크로 판단.
  useEffect(() => {
    if (questions.length === 0) return;
    const storageKey = `seenAnswers_${reportId}`;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { /* 손상된 값은 무시 */ }
    const seenSet = new Set(seen);
    const answered = questions.filter(q => q.answerText);
    const freshlyAnswered = answered.filter(q => !seenSet.has(q.id));
    if (freshlyAnswered.length > 0) setNewAnswerIds(new Set(freshlyAnswered.map(q => q.id)));
    // 이번에 보여준 답변들은 "본 것"으로 기록 — 다음 방문부턴 배지가 안 뜸
    try { localStorage.setItem(storageKey, JSON.stringify(answered.map(q => q.id))); } catch { /* 저장 실패해도 배지 표시엔 지장 없음 */ }
  }, [questions, reportId]);

  const handleAskQuestion = async () => {
    const text = questionText.trim();
    if (!text || !academyId || !report) return;
    setQuestionSubmitting(true);
    setQuestionError('');
    try {
      const questionRef = await addDoc(collection(db, 'academies', academyId, 'reportQuestions'), {
        reportId, studentId: report.studentId, studentName: report.studentName,
        questionText: text, askedAt: serverTimestamp(),
      });
      // 원장님께 이메일 알림 — 실패해도 질문 등록 자체는 이미 끝났으니 UX를 막지 않음.
      // questionId만 넘기고 실제 studentName/questionText는 서버가 Firestore에서 직접 읽음 —
      // 클라이언트가 보낸 텍스트를 그대로 믿으면 임의 내용으로 이메일을 지어보낼 수 있어서
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'question', academyId, questionId: questionRef.id }),
      }).catch(() => {});
      // 새 질문을 목록에 바로 반영 — 안 하면 등록했는데도 화면엔 안 보여서 사라진 것처럼 느껴짐.
      // 폼도 계속 보이게 해서(아래 JSX) 새로고침 없이 두 번째 질문도 바로 이어서 등록 가능
      setQuestions(prev => [...prev, { id: questionRef.id, questionText: text, answerText: null }]);
      setQuestionText('');
      setQuestionSubmitted(true);
      setTimeout(() => setQuestionSubmitted(false), 3000);
    } catch (e) {
      console.error('질문 등록 실패:', e);
      setQuestionError('질문 전송에 실패했어요. 잠시 후 다시 시도해주세요.');
    }
    setQuestionSubmitting(false);
  };

  if (loading) return <SkeletonReport />;
  if (errorType) return (
    <div className="pr-full-h" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F5F5F0', padding: '24px', gap: '8px', textAlign: 'center' }}>
      <style>{VH_FALLBACK_CSS}</style>
      <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B', letterSpacing: '0.08em' }}>{academyName || '데일리 리포트 시스템'}</p>
      <p style={{ color: '#4B5563', fontSize: '15px', margin: '4px 0 0' }}>
        {errorType === 'notfound' ? '리포트를 찾을 수 없습니다.'
          : errorType === 'draft' ? '아직 준비 중인 리포트예요. 선생님이 마무리하면 다시 안내드릴게요.'
          : '리포트를 불러오지 못했습니다.'}
      </p>
      {errorType === 'network' && (
        <button onClick={() => setRetryKey(k => k + 1)} style={{ marginTop: '10px', padding: '9px 20px', background: '#0D2D6B', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          다시 시도
        </button>
      )}
    </div>
  );

  const r = report;
  const dateStr = r.createdAt?.seconds
    ? (() => {
        const d = new Date(r.createdAt.seconds * 1000);
        return `${d.getMonth()+1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
      })()
    : '';

  const homeworkPct = toPct(r.homeworkRating);
  const conceptPct = toPct(r.conceptRating);
  const teacherSuffix = /선생님$/.test(r.teacherName || '') ? '' : ' 선생님';

  // 스킨 6색 — 저장된 건 주조색/포인트색 2개(skin.main/accent)뿐이라 나머지(second/tint/track/
  // bannerLabel)는 여기서 파생 계산한다. 스킨 없는 기존 리포트는 기본 네이비+골드로 계산됨.
  const sk = deriveSkinColors(r.skin?.main || R.navy, r.skin?.accent || R.gold);
  const { body } = R;
  // "리포트 스킨 우측 패널" 개선(2026-07-30) 디자인 확정 토큰 — 이 카드 전용, 앱 전역 R 토큰과는
  // 별개(디자인 핸드오프가 지정한 값을 그대로 씀)
  const INK = '#171719';
  const INK_SOFT = 'rgba(55,56,60,0.75)';
  const CARD_BORDER = '#E4E6EB';

  // 선생님 피드백 3단 — 짙은 바탕(closing) 위 라벨은 하드코딩 금지, 스킨마다 대비 계산해서 결정
  const labelInk = accentLabelOnPrimary(sk);
  // 근거 항목에 빈 문장이 섞여 들어오면(드문 AI 응답 오류) 빈 줄이 그대로 렌더되므로 미리 거름
  const strongEvidence = (r.feedback?.strengths?.evidence || []).filter(it => it.text?.trim());
  const weakEvidence = (r.feedback?.improvements?.evidence || []).filter(it => it.text?.trim());
  // 3단 피드백 카드를 그릴 수 있는지 — 없으면 아래에서 teacherNote 폴백 카드로 대체.
  // feedback은 AI 다듬기를 거친 매일형에만 생기고, 주간형 발송(원장 총평)·다듬기 생략·
  // 파싱 실패 리포트엔 없다 — 폴백이 없으면 그런 리포트는 선생님 노트가 통째로 사라져
  // 학부모가 수치·사진만 보게 됨(2026-08-05 감사에서 발견).
  const hasFeedbackCard = !!(r.feedback && (r.feedback.strengths?.headline || r.feedback.improvements?.headline || r.feedback.closing?.text));

  return (
    <>
    <ReportCard maxWidth="390px" fontFamily={body}>

          {/* 헤더 — 학생 메타 줄에 출결까지 포함(핵심 지표에서 이동) */}
          <div style={{ background: sk.primary, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: sk.accent }}>
                <span style={{ width: '4px', height: '12px', background: sk.accent, display: 'inline-block', flexShrink: 0 }} />
                {academyName || '데일리 리포트 시스템'}
              </span>
              {dateStr && <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.82)', flexShrink: 0 }}>{dateStr}</span>}
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.16)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2.2px', color: sk.accent }}>LEARNING REPORT</span>
              <span style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.1, color: '#fff' }}>{r.studentName}</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.82)' }}>
                {r.teacherName}{teacherSuffix}
                {/* 주간형은 최상위 attendance/arrivalTime이 없어(세션별로만 존재) 가드 없이는
                    "undefined undefined 등원"이 그대로 노출됐음(2026-08-05 발견) — 값 있을 때만 표시 */}
                {r.attendance === '결석' ? ` · ${r.attendance}`
                  : r.attendance ? ` · ${r.arrivalTime ? `${r.arrivalTime} ` : ''}${r.attendance} 등원` : ''}
                {r.attendance && r.attendance !== '결석' && r.departureTime ? ` (${r.departureTime} 하원)` : ''}
              </span>
            </div>
          </div>

          {/* 오늘의 한 줄 — AI가 코멘트 다듬기와 함께 생성, 선생님이 수정 가능. 없으면 배너 자체를 숨김 */}
          {r.summary && (
            <div style={{ background: sk.tint, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.6px', color: sk.bannerLabel }}>오늘의 한 줄</span>
              <span style={{ fontSize: '19px', fontWeight: 700, lineHeight: 1.6, letterSpacing: '-0.3px', color: INK, textWrap: 'pretty' }}>{r.summary}</span>
            </div>
          )}

          {/* 핵심 지표 — 과제/개념 막대 2개만(출결은 헤더로 이동) */}
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>과제 수행</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1, color: sk.primary }}>
                    {r.homeworkRating != null ? homeworkPct : '-'}<span style={{ fontSize: '12px', fontWeight: 600 }}>%</span>
                  </span>
                  {r.homeworkRating != null && <span style={{ fontSize: '12px', fontWeight: 600, color: INK_SOFT }}>{ratingLabel(homeworkPct)}</span>}
                </span>
              </div>
              <div style={{ height: '8px', borderRadius: '6px', background: sk.track, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${r.homeworkRating != null ? homeworkPct : 0}%`, background: sk.primary }} />
              </div>
            </div>
            <div style={{ height: '1px', background: '#EEF0F3' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>개념 이해</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1, color: sk.second }}>
                    {r.conceptRating != null ? conceptPct : '-'}<span style={{ fontSize: '12px', fontWeight: 600 }}>%</span>
                  </span>
                  {r.conceptRating != null && <span style={{ fontSize: '12px', fontWeight: 600, color: INK_SOFT }}>{ratingLabel(conceptPct)}</span>}
                </span>
              </div>
              <div style={{ height: '8px', borderRadius: '6px', background: sk.track, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${r.conceptRating != null ? conceptPct : 0}%`, background: sk.second }} />
              </div>
            </div>
            {/* 정확히 측정된 점수가 아니라 선생님의 종합 체감이라는 걸 짧게 알려줌 — 숫자만 보고
                "왜 이 점수?"에서 멈추지 않고 아래 선생님 노트로 자연스럽게 이어지도록(2026-07-30 결정) */}
            {(r.homeworkRating != null || r.conceptRating != null) && (
              <p style={{ fontSize: '11px', color: INK_SOFT, margin: 0 }}>선생님의 종합 체감이에요. 자세한 내용은 아래 노트를 봐주세요.</p>
            )}
          </div>

          {/* 학습 범위 — 카드화 */}
          {(r.textbook || r.unit || r.pages) && (
            <div style={{ padding: '0 24px 24px' }}>
              <div style={{ border: `1px solid ${CARD_BORDER}`, borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ height: '4px', background: sk.primary }} />
                <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  {/* 왼쪽(라벨/교재/단원)은 항상 제 크기를 유지(flexShrink:0) — 페이지 범위(pages)는
                      선생님이 자유 텍스트로 입력해 길이가 들쭉날쭉한데, 예전엔 이쪽이 flexShrink:0이라
                      길게 입력되면 반대로 왼쪽 라벨이 통째로 짜부라져 한글이 한 글자씩 세로로 쪼개져
                      보였음(실사용 스크린샷으로 발견). minWidth:0은 이제 pages 쪽으로 옮겨 그쪽만
                      필요하면 줄바꿈되게 함 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.6px', color: INK_SOFT }}>오늘 학습 범위</span>
                    {r.textbook && <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px', color: INK, wordBreak: 'keep-all' }}>{r.textbook}</span>}
                    {r.unit && <span style={{ alignSelf: 'flex-start', background: sk.tint, color: sk.primary, fontSize: '12px', fontWeight: 700, padding: '5px 10px', borderRadius: '6px' }}>{r.unit}</span>}
                  </div>
                  {/* wordBreak:'break-word' 하나만 쓰면 줄바꿈 지점을 브라우저가 아무 데나
                      골라서 "150~151"이 "15" / "0~151"처럼 숫자 중간에서 잘렸음(실사용 스크린샷).
                      <wbr/>로 쉼표 뒤만 줄바꿈 가능 지점으로 못박아 숫자 묶음은 항상 붙어 있게 함
                      — break-word는 그래도 안 맞는 극단적 케이스를 위한 안전망으로 유지. */}
                  {r.pages && (
                    <span style={{ fontSize: '24px', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.5px', color: sk.primary, minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {r.pages.split(',').flatMap((seg, i, arr) => i < arr.length - 1 ? [seg + ',', <wbr key={i} />] : [seg])}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TEST RESULT — 진단 배지는 2026-07-30 결정으로 학부모 화면에서 비노출
              (진단은 내부 기록·코멘트/다음 계획의 근거로만 사용, 원장 보고서·종합 프로필에는 계속 표시) */}
          {r.hasTest && r.testName && (
            <div style={{ padding: '0 24px 24px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: INK_SOFT, letterSpacing: '1.6px', margin: '0 0 8px' }}>TEST RESULT</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '28px', fontWeight: 800, color: sk.primary, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{r.testScore}<span style={{ fontSize: '13px', fontWeight: 600, color: INK_SOFT, marginLeft: '2px' }}>점</span></p>
                <p style={{ fontSize: '12px', color: INK_SOFT, margin: 0 }}>{r.testName}</p>
              </div>
            </div>
          )}

          {/* 선생님 피드백 3단 — 잘하고 있는 점(흰 바탕) / 보완이 필요한 점(스킨 틴트) /
              선생님 한마디(스킨 주조색, 짙음). 색이 아니라 바탕 톤으로 구획 — 스킨이 주조색·
              포인트색 2개뿐이고 하루 세션 1건이라 과목별 색 구획이 안 되기 때문(2026-08-03 결정).
              근거(evidence)는 기본 접힘 — 3단을 더해도 리포트가 길어지지 않게. 번호를 안 매기므로
              한 단이 비어도(headline 없음) 그 단만 조용히 숨기면 되고 나머지는 그대로 둔다.
              세 단 다 비면(드문 경우) 그림자만 있는 빈 카드가 뜨지 않도록 통째로 숨김 */}
          {hasFeedbackCard && (
            <div style={{ padding: '0 24px 24px' }}>
              <div style={{ borderRadius: '18px', overflow: 'hidden', boxShadow: '0 6px 28px rgba(23,23,25,0.10)' }}>
                {r.feedback.strengths?.headline && (
                  <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: INK }}>잘하고 있는 점</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.65, letterSpacing: '-0.2px', color: INK, textWrap: 'pretty' }}>{r.feedback.strengths.headline}</span>
                    {strongOpen && strongEvidence.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                        {strongEvidence.map((it, i) => (
                          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                            {it.no && <span style={{ minWidth: '34px', fontSize: '12px', fontWeight: 700, color: sk.primary, flexShrink: 0 }}>{it.no}</span>}
                            <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.7, color: INK, textWrap: 'pretty' }}>{it.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {strongEvidence.length > 0 && (
                      <button onClick={() => setStrongOpen(v => !v)} style={{ alignSelf: 'flex-start', minHeight: '44px', padding: '0 16px', border: '1px solid #DCDFE4', borderRadius: '20px', background: '#fff', color: sk.primary, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {strongOpen ? '근거 접기' : `문항별로 보기 ${strongEvidence.length}건`}
                      </button>
                    )}
                  </div>
                )}

                {r.feedback.improvements?.headline && (
                  <div style={{ background: sk.tint, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: INK }}>보완이 필요한 점</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.65, letterSpacing: '-0.2px', color: INK, textWrap: 'pretty' }}>{r.feedback.improvements.headline}</span>
                    {weakOpen && weakEvidence.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                        {weakEvidence.map((it, i) => (
                          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                            {it.no && <span style={{ minWidth: '34px', fontSize: '12px', fontWeight: 700, color: sk.primary, flexShrink: 0 }}>{it.no}</span>}
                            <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.7, color: INK, textWrap: 'pretty' }}>{it.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {weakEvidence.length > 0 && (
                      <button onClick={() => setWeakOpen(v => !v)} style={{ alignSelf: 'flex-start', minHeight: '44px', padding: '0 16px', border: '1px solid rgba(23,23,25,0.14)', borderRadius: '20px', background: 'rgba(255,255,255,0.7)', color: sk.primary, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {weakOpen ? '근거 접기' : `문항별로 보기 ${weakEvidence.length}건`}
                      </button>
                    )}
                    {/* 다음 수업 계획 — 새 필드를 따로 안 만들고 기존 nextPlan/nextPlanDetail을
                        재사용(2026-08-03 결정) — "보완이 필요한 점"을 지적이 아니라 계획으로
                        마무리. 값이 없으면(선생님이 안 채웠으면) 이 블록만 조용히 숨김 */}
                    {r.nextPlan && (
                      <div style={{ borderTop: '1px solid rgba(23,23,25,0.10)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.6px', color: sk.primary }}>다음 수업 계획</span>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, lineHeight: 1.7, color: INK, textWrap: 'pretty' }}>{r.nextPlan}{r.nextPlanDetail ? ` — ${r.nextPlanDetail}` : ''}</span>
                      </div>
                    )}
                  </div>
                )}

                {r.feedback.closing?.text && (
                  <div style={{ background: sk.primary, padding: '24px 26px 26px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: labelInk }}>선생님 한마디</span>
                    <span style={{ fontSize: '14.5px', fontWeight: 500, lineHeight: 1.85, color: '#fff', textWrap: 'pretty' }}>{r.feedback.closing.text}</span>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>{r.teacherName}{teacherSuffix}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 폴백 — 3단 피드백이 없는 리포트(주간형 총평, 다듬기 생략, 파싱 실패)는
              teacherNote 원문을 "선생님 노트" 카드로 보여줌. 발송 검증이 teacherNote를
              필수로 요구하므로(매일형·주간형 모두) 이 폴백으로 "노트 없는 리포트"가
              구조적으로 사라짐. 시각은 3단 카드의 '선생님 한마디' 단과 동일한 네이비 블록 */}
          {!hasFeedbackCard && r.teacherNote?.trim() && (
            <div style={{ padding: '0 24px 24px' }}>
              <div style={{ borderRadius: '18px', overflow: 'hidden', boxShadow: '0 6px 28px rgba(23,23,25,0.10)' }}>
                <div style={{ background: sk.primary, padding: '24px 26px 26px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: labelInk }}>선생님 노트</span>
                  <span style={{ fontSize: '14.5px', fontWeight: 500, lineHeight: 1.85, color: '#fff', whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{r.teacherNote}</span>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>{r.teacherName}{teacherSuffix}</span>
                </div>
              </div>
            </div>
          )}

          {/* 이번 주 수업 기록 — 주간형(reportType:'weekly') 리포트에만 존재. 그룹수업 학원은
              하루치 리포트 대신 한 주를 모아 보내므로, 위 선생님 노트(원장이 다듬은 총평)
              아래에 실제 수업마다의 기록을 날짜별로 펼쳐서 "묶음 요약"이 아니라는 걸 보여줌 */}
          {r.sessions?.length > 0 && (
            <div style={{ padding: '0 24px 24px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: INK_SOFT, letterSpacing: '1.6px', margin: '0 0 10px' }}>THIS WEEK'S SESSIONS</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[...r.sessions].sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => (
                  <div key={i} style={{ borderLeft: `2px solid ${CARD_BORDER}`, paddingLeft: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: sk.primary }}>{s.date}</span>
                      <span style={{ fontSize: '11px', color: INK_SOFT }}>{s.attendance}</span>
                      {(s.homeworkRating != null || s.conceptRating != null) && (
                        <span style={{ fontSize: '11px', color: INK_SOFT }}>
                          {s.homeworkRating != null ? `과제 ${toPct(s.homeworkRating)}%` : ''}
                          {s.homeworkRating != null && s.conceptRating != null ? ' · ' : ''}
                          {s.conceptRating != null ? `개념 ${toPct(s.conceptRating)}%` : ''}
                        </span>
                      )}
                    </div>
                    {/* 진단 배지 — 2026-07-30 결정으로 학부모 화면 비노출 (내부 기록 전용) */}
                    {s.teacherNote && <p style={{ fontSize: '12px', color: INK, margin: 0, lineHeight: 1.7 }}>{s.teacherNote}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 문제집 사진 — 2장/4장은 꽉 채워지는 2열, 그 외(1/3/5장)는 3열이라 마지막 줄에
              사진 하나만 어중간하게 남는 걸 피함. 사진이 깨진(브로큰) 것도 총 개수에 넣으면
              실제로 보이는 장수와 열 배치가 어긋나므로 화면에 보이는 개수 기준으로 계산 */}
          {(() => {
            const visibleCount = r.photoUrls?.filter((_, i) => !brokenPhotos[i]).length || 0;
            if (visibleCount === 0) return null;
            const cols = visibleCount === 1 ? 1 : (visibleCount === 2 || visibleCount === 4) ? 2 : 3;
            return (
            <div style={{ padding: '0 24px 24px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: INK_SOFT, letterSpacing: '1.6px', margin: '0 0 8px' }}>TODAY'S WORK</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '6px' }}>
                {r.photoUrls.map((url, i) => !brokenPhotos[i] && (
                  <img key={i} src={url} alt={`문제집 ${i+1}`} loading="lazy"
                    onClick={() => setLightboxIndex(i)}
                    onError={() => setBrokenPhotos(prev => ({ ...prev, [i]: true }))}
                    style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${CARD_BORDER}`, cursor: 'pointer' }} />
                ))}
              </div>
            </div>
            );
          })()}

          {/* 다음 수업 */}
          {r.nextPlan && (
            <div style={{ padding: '0 24px 24px' }}>
              <div style={{ border: `1px solid ${CARD_BORDER}`, borderRadius: '14px', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.6px', color: INK_SOFT }}>NEXT CLASS</span>
                  <span style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.5, color: INK }}>{r.nextPlan}</span>
                  {r.nextPlanDetail && <span style={{ fontSize: '12px', fontWeight: 500, color: INK_SOFT }}>{r.nextPlanDetail}</span>}
                </div>
                <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: sk.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ width: 0, height: 0, borderLeft: '8px solid #fff', borderTop: '5px solid transparent', borderBottom: '5px solid transparent', marginLeft: '2px', display: 'block' }} />
                </span>
              </div>
            </div>
          )}

          {/* 학부모 질문하기 — 풀폭 버튼으로 존재감을 키움 */}
          <div style={{ padding: '20px 24px 24px', background: '#F7F8FA', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {questions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {questions.map(q => (
                  <div key={q.id} style={newAnswerIds.has(q.id) ? { background: '#FDF8EC', border: '1px solid #F0D584', borderRadius: '8px', padding: '8px 10px' } : undefined}>
                    <p style={{ fontSize: '12px', color: INK, margin: '0 0 4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Q. {q.questionText}
                      {newAnswerIds.has(q.id) && (
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#8A5A00', background: '#FFF3D6', padding: '2px 7px', borderRadius: '10px', flexShrink: 0 }}>답변 도착</span>
                      )}
                    </p>
                    {q.answerText
                      ? <p style={{ fontSize: '12px', color: INK_SOFT, margin: 0, lineHeight: 1.7 }}>A. {q.answerText}</p>
                      : <p style={{ fontSize: '11px', color: INK_SOFT, margin: 0, fontStyle: 'italic' }}>답변 대기 중이에요</p>}
                  </div>
                ))}
              </div>
            )}
            {questionSubmitted && (
              <p style={{ fontSize: '12px', color: R.positive, margin: 0 }}>질문이 전달됐어요. 선생님이 확인 후 답변드릴게요.</p>
            )}
            <span style={{ fontSize: '12px', fontWeight: 500, color: INK_SOFT }}>궁금한 점이 있으신가요? 선생님이 직접 답변드립니다.</span>
            <textarea
              value={questionText} onChange={e => setQuestionText(e.target.value)}
              placeholder="선생님께 궁금한 점을 남겨주세요" rows={2} maxLength={500}
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', border: `1px solid ${CARD_BORDER}`, borderRadius: '12px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', background: '#fff' }}
            />
            {questionText.length > 400 && (
              <span style={{ fontSize: '11px', color: questionText.length >= 500 ? R.negative : INK_SOFT, textAlign: 'right' }}>{questionText.length}/500</span>
            )}
            <button onClick={handleAskQuestion} disabled={questionSubmitting || !questionText.trim()}
              style={{ width: '100%', border: 'none', borderRadius: '12px', background: questionSubmitting || !questionText.trim() ? '#D1D5DB' : sk.primary, color: '#fff', fontSize: '14px', fontWeight: 700, padding: '16px', cursor: questionSubmitting || !questionText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {questionSubmitting ? '전송 중...' : '질문 남기기'}
            </button>
            {questionError && (
              <p style={{ fontSize: '11px', color: R.negative, margin: 0 }}>{questionError}</p>
            )}
          </div>

    </ReportCard>
    {lightboxIndex != null && (() => {
      const visible = r.photoUrls.map((_, i) => i).filter(i => !brokenPhotos[i]);
      const pos = visible.indexOf(lightboxIndex);
      const hasMultiple = visible.length > 1;
      const goPrev = (e) => { e.stopPropagation(); setLightboxIndex(visible[(pos - 1 + visible.length) % visible.length]); };
      const goNext = (e) => { e.stopPropagation(); setLightboxIndex(visible[(pos + 1) % visible.length]); };
      const arrowBtnStyle = {
        position: 'fixed', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      };
      return (
      <div
        onClick={() => setLightboxIndex(null)}
        onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStartXRef.current == null || !hasMultiple) return;
          const delta = e.changedTouches[0].clientX - touchStartXRef.current;
          touchStartXRef.current = null;
          if (Math.abs(delta) < 40) return; // 짧은 탭/흔들림은 무시
          if (delta > 0) setLightboxIndex(visible[(pos - 1 + visible.length) % visible.length]);
          else setLightboxIndex(visible[(pos + 1) % visible.length]);
        }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', cursor: 'zoom-out',
        }}>
        <img src={r.photoUrls[lightboxIndex]} alt={`문제집 ${lightboxIndex + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }} />
        {hasMultiple && (
          <>
            <button onClick={goPrev} title="이전 사진" aria-label="이전 사진" style={{ ...arrowBtnStyle, left: '12px' }}>‹</button>
            <button onClick={goNext} title="다음 사진" aria-label="다음 사진" style={{ ...arrowBtnStyle, right: '12px' }}>›</button>
            <span style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: '20px' }}>
              {pos + 1} / {visible.length}
            </span>
          </>
        )}
        <button onClick={() => setLightboxIndex(null)} title="닫기" aria-label="닫기" style={{
          position: 'fixed', top: '16px', right: '16px', width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </div>
      );
    })()}
    </>
  );
}
