import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { R, ReportCard } from './tokens.jsx';
import { toPct, ratingLabel } from './growth.js';

const DIAG_BADGES = {
  calc:    { label: '⚠ 계산 실수', bg: '#A32D2D' },
  concept: { label: '⚠ 개념 누락', bg: '#A32D2D' },
  apply:   { label: '⚠ 응용 부족', bg: '#A32D2D' },
  time:    { label: '△ 시간 부족', bg: '#8A5A00' },
  perfect: { label: '✓ 개념 완벽', bg: '#0F6E56' },
};

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
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [brokenPhotos, setBrokenPhotos] = useState({});
  const viewLoggedRef = React.useRef(false); // StrictMode 개발 모드 이펙트 2회 실행 시 열람 기록 중복 방지

  useEffect(() => {
    setLoading(true);
    setErrorType(null);
    (async () => {
      try {
        const rSnap = await getDoc(doc(db, 'reports', reportId));
        if (!rSnap.exists()) { setErrorType('notfound'); setLoading(false); return; }
        const r = { id: rSnap.id, ...rSnap.data() };
        setReport(r);
        setLoading(false);

        // 열람 기록 저장 (화면 표시를 막지 않도록 fire-and-forget)
        if (!viewLoggedRef.current) {
          viewLoggedRef.current = true;
          const params = new URLSearchParams(location.search);
          const src = params.get('src') || 'direct';
          addDoc(collection(db, 'reportViews'), {
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

  if (loading) return <SkeletonReport />;
  if (errorType) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F5F5F0', padding: '24px', gap: '8px', textAlign: 'center' }}>
      <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B', letterSpacing: '0.08em' }}>와이즈에듀 교현학원</p>
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

  // DS 토큰
  const { navy, gold, rule, inkMute, inkSub, ink, positive, serif, body } = R;

  return (
    <>
    <ReportCard maxWidth="390px" fontFamily={body}>

          {/* 헤더 */}
          <div style={{ background: navy, padding: '20px 22px 18px', position: 'relative' }}>
            {/* 브랜드 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '4px', height: '20px', background: gold, borderRadius: '1px', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.15em' }}>와이즈에듀 교현학원</span>
            </div>
            <div style={{ height: '1px', background: `rgba(201,162,39,0.3)`, marginBottom: '14px' }} />
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
                <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{r.homeworkRating != null ? ratingLabel(homeworkPct) : ''}</p>
              </div>
              <div style={{ borderRight: `1px solid ${rule}`, padding: '0 8px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>개념 이해</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.conceptRating != null ? conceptPct : '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>%</span>
                </p>
                <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{r.conceptRating != null ? ratingLabel(conceptPct) : ''}</p>
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

            {/* 문제집 사진 */}
            {r.photoUrls?.filter((_, i) => !brokenPhotos[i]).length > 0 && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 8px' }}>TODAY'S WORK</p>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(r.photoUrls.length, 2)}, 1fr)`, gap: '6px' }}>
                    {r.photoUrls.map((url, i) => !brokenPhotos[i] && (
                      <img key={i} src={url} alt={`문제집 ${i+1}`} loading="lazy"
                        onClick={() => setLightboxUrl(url)}
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
          </div>

    </ReportCard>
    {lightboxUrl && (
      <div onClick={() => setLightboxUrl(null)} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', cursor: 'zoom-out',
      }}>
        <img src={lightboxUrl} alt="확대 이미지" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }} />
        <button onClick={() => setLightboxUrl(null)} style={{
          position: 'fixed', top: '16px', right: '16px', width: '40px', height: '40px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </div>
    )}
    </>
  );
}
