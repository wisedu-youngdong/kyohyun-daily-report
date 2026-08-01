import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { R, ReportCard, deriveSkinColors } from './tokens.jsx';
import { toPct, ratingLabel, fetchAcademyBranding } from './growth.js';
import { WRONG_TAG_LABELS } from './diagnosis.js';
const SkeletonReport = () => (
  <div style={{ background: '#F5F5F0', minHeight: '100dvh', padding: '24px 16px', display: 'flex', justifyContent: 'center', fontFamily: 'Pretendard, sans-serif' }}>
    <style>{`@keyframes reportPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.9; } }`}</style>
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
  const [errorType, setErrorType] = useState(null); // 'notfound' | 'network'
  const [retryKey, setRetryKey] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null); // photoUrls 배열의 인덱스 — 좌우 넘기기 위해 URL 대신 인덱스로 관리
  const [brokenPhotos, setBrokenPhotos] = useState({});
  const [academyName, setAcademyName] = useState(null);
  const [academyId, setAcademyId] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false); // 선생님 노트 "자세히 보기" 접기/펼침
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
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F5F5F0', padding: '24px', gap: '8px', textAlign: 'center' }}>
      <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B', letterSpacing: '0.08em' }}>{academyName || '데일리 리포트 시스템'}</p>
      <p style={{ color: '#4B5563', fontSize: '15px', margin: '4px 0 0' }}>
        {errorType === 'notfound' ? '리포트를 찾을 수 없습니다.' : '리포트를 불러오지 못했습니다.'}
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
  const teacherSuffix = /선생님?$/.test(r.teacherName || '') ? '' : ' 선생님';

  // 스킨 6색 — 저장된 건 주조색/포인트색 2개(skin.main/accent)뿐이라 나머지(second/tint/track/
  // bannerLabel)는 여기서 파생 계산한다. 스킨 없는 기존 리포트는 기본 네이비+골드로 계산됨.
  const sk = deriveSkinColors(r.skin?.main || R.navy, r.skin?.accent || R.gold);
  const { body } = R;
  // "리포트 스킨 우측 패널" 개선(2026-07-30) 디자인 확정 토큰 — 이 카드 전용, 앱 전역 R 토큰과는
  // 별개(디자인 핸드오프가 지정한 값을 그대로 씀)
  const INK = '#171719';
  const INK_SOFT = 'rgba(55,56,60,0.75)';
  const CARD_BORDER = '#E4E6EB';

  // 선생님 노트 — 첫 문단을 결론으로 상단에 크게, 나머지는 200자 넘으면 접어서 "자세히 보기"로.
  // 오늘 눈에 띈 문항은 자유 텍스트에서 추출하지 않고, 이미 구조화돼 저장된 wrongItems를 그대로 씀
  const noteParagraphs = (r.teacherNote || '').split('\n').filter(Boolean);
  const noteLead = noteParagraphs[0] || '';
  const noteRest = noteParagraphs.slice(1);
  const noteCollapsible = noteRest.join(' ').length > 200;
  const noteRestVisible = noteCollapsible ? noteOpen : true;

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
                {r.attendance === '결석' ? ` · ${r.attendance}` : ` · ${r.arrivalTime} ${r.attendance} 등원`}
                {r.attendance !== '결석' && r.departureTime ? ` (${r.departureTime} 하원)` : ''}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.6px', color: INK_SOFT }}>오늘 학습 범위</span>
                    {r.textbook && <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px', color: INK, wordBreak: 'keep-all' }}>{r.textbook}</span>}
                    {r.unit && <span style={{ alignSelf: 'flex-start', background: sk.tint, color: sk.primary, fontSize: '12px', fontWeight: 700, padding: '5px 10px', borderRadius: '6px' }}>{r.unit}</span>}
                  </div>
                  {r.pages && <span style={{ fontSize: '24px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.5px', color: sk.primary, flexShrink: 0 }}>{r.pages}</span>}
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

          {/* 선생님 노트 — 결론 문장 → 오늘 눈에 띈 문항(wrongItems) → 나머지는 200자 넘으면 접기 */}
          {r.teacherNote && (
            <div style={{ padding: '0 24px 24px' }}>
              <div style={{ background: sk.tint, borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.6px', color: sk.primary }}>선생님 노트</span>
                {noteLead && <span style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.6, color: INK, textWrap: 'pretty' }}>{noteLead}</span>}

                {r.wrongItems?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: INK_SOFT }}>오늘 눈에 띈 문항</span>
                    {r.wrongItems.map((w, i) => {
                      const extra = w.memo?.trim() || (w.tags?.length ? w.tags.map(t => WRONG_TAG_LABELS[t]).filter(Boolean).join(', ') : '');
                      return (
                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                          <span style={{ minWidth: '38px', fontSize: '12px', fontWeight: 700, color: sk.primary, flexShrink: 0 }}>{w.number}번</span>
                          <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.6, color: INK, textWrap: 'pretty' }}>{w.type}{extra ? ` — ${extra}` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {noteRestVisible && noteRest.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', ...(noteCollapsible ? { borderTop: '1px solid rgba(23,23,25,0.10)', paddingTop: '14px' } : {}) }}>
                    {noteRest.map((p, i) => <p key={i} style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.75, color: INK, margin: 0, textWrap: 'pretty' }}>{p}</p>)}
                  </div>
                )}
                {noteCollapsible && (
                  <button onClick={() => setNoteOpen(v => !v)} style={{ alignSelf: 'flex-start', border: `1px solid ${sk.primary}`, borderRadius: '20px', background: 'transparent', color: sk.primary, fontSize: '12px', fontWeight: 700, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {noteOpen ? '접기' : '선생님 노트 자세히 보기'}
                  </button>
                )}
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
              사진 하나만 어중간하게 남는 걸 피함 */}
          {r.photoUrls?.filter((_, i) => !brokenPhotos[i]).length > 0 && (
            <div style={{ padding: '0 24px 24px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: INK_SOFT, letterSpacing: '1.6px', margin: '0 0 8px' }}>TODAY'S WORK</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${r.photoUrls.length === 1 ? 1 : (r.photoUrls.length === 2 || r.photoUrls.length === 4) ? 2 : 3}, 1fr)`, gap: '6px' }}>
                {r.photoUrls.map((url, i) => !brokenPhotos[i] && (
                  <img key={i} src={url} alt={`문제집 ${i+1}`} loading="lazy"
                    onClick={() => setLightboxIndex(i)}
                    onError={() => setBrokenPhotos(prev => ({ ...prev, [i]: true }))}
                    style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${CARD_BORDER}`, cursor: 'pointer' }} />
                ))}
              </div>
            </div>
          )}

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
              <p style={{ fontSize: '12px', color: '#00963C', margin: 0 }}>질문이 전달됐어요. 선생님이 확인 후 답변드릴게요.</p>
            )}
            <span style={{ fontSize: '12px', fontWeight: 500, color: INK_SOFT }}>궁금한 점이 있으신가요? 선생님이 직접 답변드립니다.</span>
            <textarea
              value={questionText} onChange={e => setQuestionText(e.target.value)}
              placeholder="선생님께 궁금한 점을 남겨주세요" rows={2}
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', border: `1px solid ${CARD_BORDER}`, borderRadius: '12px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', background: '#fff' }}
            />
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
            <button onClick={goPrev} title="이전 사진" style={{ ...arrowBtnStyle, left: '12px' }}>‹</button>
            <button onClick={goNext} title="다음 사진" style={{ ...arrowBtnStyle, right: '12px' }}>›</button>
            <span style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: '20px' }}>
              {pos + 1} / {visible.length}
            </span>
          </>
        )}
        <button onClick={() => setLightboxIndex(null)} title="닫기" style={{
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
