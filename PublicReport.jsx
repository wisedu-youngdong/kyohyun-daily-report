import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp, getDocs, query, where, limit } from 'firebase/firestore';
import { R, ReportCard } from './tokens.jsx';
import { toPct, ratingLabel, fetchAcademyBranding } from './growth.js';
import { DIAG_BADGE } from './diagnosis.js';

const DIAG_BADGES = Object.fromEntries(
  Object.entries(DIAG_BADGE).map(([key, v]) => [key, { label: `${v.prefix} ${v.label}`, bg: v.bg }])
);

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
  const [prevReport, setPrevReport] = useState(null); // 지난 리포트 — 과제/개념 점수 추세(▲▼) 표시용
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

        // 지난 리포트 조회 — 과제/개념 점수 추세(▲▼) 표시용. studentId 단일 조건만 걸고
        // (createdAt과 함께 걸면 복합 색인이 필요해짐) 클라이언트에서 정렬/필터
        // — GrowthAward.jsx가 같은 이유로 쓰는 것과 동일한 패턴
        if (r.studentId && r.createdAt?.seconds) {
          getDocs(query(collection(db, 'academies', academyId, 'reports'), where('studentId', '==', r.studentId), limit(200)))
            .then(snap => {
              const candidates = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(pr => pr.id !== r.id && pr.isDraft !== true && pr.createdAt?.seconds && pr.createdAt.seconds < r.createdAt.seconds)
                .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
              if (candidates[0]) setPrevReport(candidates[0]);
            })
            .catch(() => {}); // 추세 표시는 부가 기능 — 실패해도 리포트 본문엔 영향 없음
        }

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
      setQuestionText('');
      setQuestionSubmitted(true);
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

  // 지난 리포트 대비 추세 — 둘 다 값이 있을 때만 계산(한쪽이 미입력이면 비교 자체가 의미 없음)
  const homeworkTrend = (r.homeworkRating != null && prevReport?.homeworkRating != null)
    ? homeworkPct - toPct(prevReport.homeworkRating) : null;
  const conceptTrend = (r.conceptRating != null && prevReport?.conceptRating != null)
    ? conceptPct - toPct(prevReport.conceptRating) : null;

  // DS 토큰 — 주조색(navy)/포인트색(gold)은 리포트에 저장된 스킨이 있으면 그 색으로 교체.
  // 스킨 없는 기존 리포트는 그대로 기본 네이비+골드 (작성 화면 픽커에서 저장한 skin.main/accent)
  const { rule, inkMute, inkSub, ink, positive, serif, body } = R;
  const navy = r.skin?.main || R.navy;
  const gold = r.skin?.accent || R.gold;

  // 추세 배지 — 지난 리포트 대비 ▲/▼N%p, 변화 없으면 "동일"
  const TrendBadge = ({ trend }) => {
    if (trend == null) return null;
    const color = trend > 0 ? positive : trend < 0 ? '#B92C2C' : inkMute;
    const text = trend > 0 ? `▲${trend}` : trend < 0 ? `▼${Math.abs(trend)}` : '동일';
    return <span style={{ fontSize: '11px', fontWeight: 700, color, marginLeft: '5px' }}>{text}</span>;
  };

  return (
    <>
    <ReportCard maxWidth="390px" fontFamily={body}>

          {/* 헤더 */}
          <div style={{ background: navy, padding: '20px 22px 18px', position: 'relative' }}>
            {/* 브랜드 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '4px', height: '20px', background: gold, borderRadius: '1px', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.15em' }}>{academyName || '데일리 리포트 시스템'}</span>
            </div>
            <div style={{ height: '1px', background: `${gold}4D`, marginBottom: '14px' }} />
            {/* 학생 정보 */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.15em', margin: '0 0 4px', fontWeight: 600 }}>LEARNING REPORT</p>
                <p style={{ fontFamily: serif, fontSize: '26px', fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{r.studentName}</p>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', margin: 0 }}>{dateStr} · {r.teacherName}{teacherSuffix}</p>
              </div>
            </div>
          </div>

          {/* 바디 */}
          <div style={{ padding: '18px 20px' }}>

            {/* 핵심 지표 — B안: SUMMARY 제거, 수치 → TEACHER'S NOTE 바로 연결 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '18px' }}>
              <div style={{ borderRight: `1px solid ${rule}`, padding: '0 8px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>과제 수행</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.homeworkRating != null ? homeworkPct : '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>%</span>
                </p>
                <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>
                  {r.homeworkRating != null ? ratingLabel(homeworkPct) : ''}
                  <TrendBadge trend={homeworkTrend} />
                </p>
              </div>
              <div style={{ borderRight: `1px solid ${rule}`, padding: '0 8px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>개념 이해</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.conceptRating != null ? conceptPct : '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>%</span>
                </p>
                <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>
                  {r.conceptRating != null ? ratingLabel(conceptPct) : ''}
                  <TrendBadge trend={conceptTrend} />
                </p>
              </div>
              <div style={{ padding: '0 8px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>출결</p>
                <p style={{ fontSize: '16px', fontWeight: 800, color: r.attendance === '정시' ? positive : navy, margin: 0, lineHeight: '24px' }}>{r.attendance}</p>
                <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{r.arrivalTime} 등원</p>
              </div>
            </div>

            <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />

            {/* 학습 범위 */}
            {(r.textbook || r.unit || r.pages) && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 6px' }}>학습 범위</p>
                  {r.textbook && <p style={{ fontSize: '12px', fontWeight: 700, color: navy, margin: '0 0 2px', wordBreak: 'keep-all' }}>{r.textbook}</p>}
                  {r.unit && <p style={{ fontSize: '12px', color: inkSub, margin: '0 0 1px' }}>{r.unit}</p>}
                  {r.pages && <p style={{ fontSize: '12px', color: inkMute, margin: 0 }}>{r.pages}</p>}
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* TEST RESULT + 진단 배지 (시험 있는 경우) */}
            {r.hasTest && r.testName && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 8px' }}>TEST RESULT</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                      <p style={{ fontSize: '28px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{r.testScore}<span style={{ fontSize: '13px', fontWeight: 600, color: inkMute, marginLeft: '2px' }}>점</span></p>
                      <p style={{ fontSize: '12px', color: inkSub, margin: 0 }}>{r.testName}</p>
                    </div>
                    {r.diagnosis?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {r.diagnosis.map((d, i) => {
                          const tag = DIAG_BADGES[d.key] || { label: d.key, bg: '#8A5A00' };
                          return (
                            <span key={i} style={{ display: 'inline-block', background: tag.bg, color: '#fff', fontSize: '12px', fontWeight: 700, padding: '4px 11px', borderRadius: '20px' }}>
                              {tag.label}{d.unit ? ` · ${d.unit}` : ''}{d.pages ? ` ${d.pages}` : ''}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* 진단 배지 (시험 없는 경우 — 독립 섹션) */}
            {(!r.hasTest || !r.testName) && r.diagnosis?.length > 0 && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 8px' }}>진단</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {r.diagnosis.map((d, i) => {
                      const tag = DIAG_BADGES[d.key] || { label: d.key, bg: '#8A5A00' };
                      return (
                        <span key={i} style={{ display: 'inline-block', background: tag.bg, color: '#fff', fontSize: '12px', fontWeight: 700, padding: '4px 11px', borderRadius: '20px' }}>
                          {tag.label}{d.unit ? ` · ${d.unit}` : ''}{d.pages ? ` ${d.pages}` : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* TEACHER'S NOTE */}
            {r.teacherNote && (
              <>
                <div style={{ borderLeft: `3px solid ${gold}`, paddingLeft: '13px', marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: gold, letterSpacing: '0.12em', margin: '0 0 7px' }}>TEACHER'S NOTE</p>
                  {r.teacherNote.split('\n').filter(Boolean).map((para, i) => (
                    <p key={i} style={{ fontSize: '13px', color: ink, margin: i === 0 ? '0 0 10px' : '0', lineHeight: 1.9, fontWeight: 500 }}>{para}</p>
                  ))}
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* 이번 주 수업 기록 — 주간형(reportType:'weekly') 리포트에만 존재. 그룹수업 학원은
                하루치 리포트 대신 한 주를 모아 보내므로, 위 TEACHER'S NOTE(원장이 다듬은 총평)
                아래에 실제 수업마다의 기록을 날짜별로 펼쳐서 "묶음 요약"이 아니라는 걸 보여줌 */}
            {r.sessions?.length > 0 && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 10px' }}>THIS WEEK'S SESSIONS</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[...r.sessions].sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => (
                      <div key={i} style={{ borderLeft: `2px solid ${rule}`, paddingLeft: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: navy }}>{s.date}</span>
                          <span style={{ fontSize: '11px', color: inkSub }}>{s.attendance}</span>
                          {(s.homeworkRating != null || s.conceptRating != null) && (
                            <span style={{ fontSize: '11px', color: inkMute }}>
                              {s.homeworkRating != null ? `과제 ${toPct(s.homeworkRating)}%` : ''}
                              {s.homeworkRating != null && s.conceptRating != null ? ' · ' : ''}
                              {s.conceptRating != null ? `개념 ${toPct(s.conceptRating)}%` : ''}
                            </span>
                          )}
                        </div>
                        {(s.diagnosis || []).length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '3px' }}>
                            {s.diagnosis.map((d, di) => {
                              const badge = DIAG_BADGES[d.key];
                              if (!badge) return null;
                              return <span key={di} style={{ fontSize: '9px', fontWeight: 700, color: '#fff', background: badge.bg, padding: '2px 7px', borderRadius: '3px' }}>{badge.label}</span>;
                            })}
                          </div>
                        )}
                        {s.teacherNote && <p style={{ fontSize: '12px', color: ink, margin: 0, lineHeight: 1.7 }}>{s.teacherNote}</p>}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* 문제집 사진 — 2장/4장은 꽉 채워지는 2열, 그 외(1/3/5장)는 3열이라 마지막 줄에
                사진 하나만 어중간하게 남는 걸 피함 */}
            {r.photoUrls?.filter((_, i) => !brokenPhotos[i]).length > 0 && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 8px' }}>TODAY'S WORK</p>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${r.photoUrls.length === 1 ? 1 : (r.photoUrls.length === 2 || r.photoUrls.length === 4) ? 2 : 3}, 1fr)`, gap: '6px' }}>
                    {r.photoUrls.map((url, i) => !brokenPhotos[i] && (
                      <img key={i} src={url} alt={`문제집 ${i+1}`} loading="lazy"
                        onClick={() => setLightboxIndex(i)}
                        onError={() => setBrokenPhotos(prev => ({ ...prev, [i]: true }))}
                        style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${rule}`, cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* 다음 수업 */}
            {r.nextPlan && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>NEXT CLASS</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: navy, margin: 0 }}>{r.nextPlan}</p>
                  {r.nextPlanDetail && <p style={{ fontSize: '12px', color: inkSub, margin: '2px 0 0' }}>{r.nextPlanDetail}</p>}
                </div>
                <div style={{ width: '28px', height: '28px', background: '#EAF0F9', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A5CB8', fontSize: '14px', flexShrink: 0 }}>→</div>
              </div>
            )}

            {/* 학부모 질문하기 */}
            <div style={{ height: '1px', background: rule, margin: '18px 0' }} />
            <div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 10px' }}>궁금한 점이 있으신가요?</p>
              {questions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                  {questions.map(q => (
                    <div key={q.id} style={newAnswerIds.has(q.id) ? { background: '#FDF8EC', border: '1px solid #F0D584', borderRadius: '8px', padding: '8px 10px' } : undefined}>
                      <p style={{ fontSize: '12px', color: ink, margin: '0 0 4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Q. {q.questionText}
                        {newAnswerIds.has(q.id) && (
                          <span style={{ fontSize: '9px', fontWeight: 700, color: '#8A5A00', background: '#FFF3D6', padding: '2px 7px', borderRadius: '10px', flexShrink: 0 }}>답변 도착</span>
                        )}
                      </p>
                      {q.answerText
                        ? <p style={{ fontSize: '12px', color: inkSub, margin: 0, lineHeight: 1.7 }}>A. {q.answerText}</p>
                        : <p style={{ fontSize: '11px', color: inkMute, margin: 0, fontStyle: 'italic' }}>답변 대기 중이에요</p>}
                    </div>
                  ))}
                </div>
              )}
              {questionSubmitted ? (
                <p style={{ fontSize: '12px', color: positive, margin: 0 }}>질문이 전달됐어요. 선생님이 확인 후 답변드릴게요.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <textarea
                      value={questionText} onChange={e => setQuestionText(e.target.value)}
                      placeholder="선생님께 궁금한 점을 남겨주세요" rows={2}
                      style={{ flex: 1, padding: '8px 10px', fontSize: '16px', border: `1px solid ${rule}`, borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
                    />
                    <button onClick={handleAskQuestion} disabled={questionSubmitting || !questionText.trim()}
                      style={{ padding: '12px 16px', minHeight: '44px', fontSize: '13px', fontWeight: 700, background: questionSubmitting || !questionText.trim() ? '#D1D5DB' : navy, color: '#fff', border: 'none', borderRadius: '8px', cursor: questionSubmitting || !questionText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                      {questionSubmitting ? '전송 중...' : '질문하기'}
                    </button>
                  </div>
                  {questionError && (
                    <p style={{ fontSize: '11px', color: '#B92C2C', margin: '6px 0 0' }}>{questionError}</p>
                  )}
                </>
              )}
            </div>
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
