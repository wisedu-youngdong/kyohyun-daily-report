import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

const RATING_LEVELS = [
  { level: 1, label: '노력 필요' },
  { level: 2, label: '조금 부족' },
  { level: 3, label: '보통' },
  { level: 4, label: '잘함' },
  { level: 5, label: '아주 잘함' },
];

const DIAGNOSIS_LABELS = {
  calc: '계산 실수', concept: '개념 누락',
  apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽',
};

const DIAG_BADGES = {
  calc:    { label: '⚠ 계산 실수', bg: '#A32D2D' },
  concept: { label: '⚠ 개념 누락', bg: '#A32D2D' },
  apply:   { label: '⚠ 응용 부족', bg: '#A32D2D' },
  time:    { label: '△ 시간 부족', bg: '#8A5A00' },
  perfect: { label: '✓ 개념 완벽', bg: '#0F6E56' },
};

export default function PublicReport() {
  const { reportId } = useParams();
  const location = useLocation();
  const [report, setReport] = useState(null);
  const [allStudentReports, setAllStudentReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const rSnap = await getDoc(doc(db, 'reports', reportId));
        if (!rSnap.exists()) { setError('리포트를 찾을 수 없습니다.'); setLoading(false); return; }
        const r = { id: rSnap.id, ...rSnap.data() };
        setReport(r);

        // 열람 기록 저장
        const params = new URLSearchParams(location.search);
        const src = params.get('src') || 'direct';
        try {
          await addDoc(collection(db, 'reportViews'), {
            reportId,
            studentId: r.studentId,
            studentName: r.studentName,
            src,
            viewedAt: serverTimestamp(),
            ua: navigator.userAgent.slice(0, 100),
          });
        } catch (e) { /* 열람 기록 실패해도 리포트 표시는 계속 */ }

        // 동적 OG 메타 태그 — 학생 이름 반영
        if (r.studentName) {
          const title = `${r.studentName} 학생의 성장 리포트`;
          const sub   = `교현학원 · 숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.`;
          const ogImg = `https://kyohyun-daily-report.vercel.app/api/og?title=${encodeURIComponent(title)}&sub=${encodeURIComponent(sub)}`;

          document.title = title;
          const setMeta = (prop, val, isName) => {
            const sel = isName ? `meta[name="${prop}"]` : `meta[property="${prop}"]`;
            let el = document.querySelector(sel);
            if (!el) { el = document.createElement('meta'); isName ? el.setAttribute('name', prop) : el.setAttribute('property', prop); document.head.appendChild(el); }
            el.setAttribute('content', val);
          };
          setMeta('og:title', title);
          setMeta('og:description', sub);
          setMeta('og:image', ogImg);
          setMeta('twitter:title', title, true);
          setMeta('twitter:image', ogImg, true);
        }

        if (r.studentId) {
          const q = query(collection(db, 'reports'), where('studentId', '==', r.studentId));
          const snap = await getDocs(q);
          setAllStudentReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (e) { setError('리포트를 불러오지 못했습니다.'); }
      setLoading(false);
    })();
  }, [reportId]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F0', fontFamily: 'Pretendard, sans-serif' }}>
      <p style={{ color: '#6B7280', fontSize: '14px' }}>리포트를 불러오는 중...</p>
    </div>
  );
  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F0' }}>
      <p style={{ color: '#4B5563', fontSize: '15px' }}>{error}</p>
    </div>
  );

  const r = report;
  const dateStr = r.createdAt?.seconds
    ? (() => {
        const d = new Date(r.createdAt.seconds * 1000);
        return `${d.getMonth()+1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
      })()
    : '';

  const homework = RATING_LEVELS.find(x => x.level === r.homeworkRating);
  const concept  = RATING_LEVELS.find(x => x.level === r.conceptRating);
  const teacherSuffix = /선생님?$/.test(r.teacherName || '') ? '' : ' 선생님';

  // DS 토큰
  const navy = '#0D2D6B';
  const gold = '#C9A227';
  const rule = '#E8E6E0';
  const inkMute = '#98A1AC';
  const inkSub = '#5A6472';
  const ink = '#1A1A1A';
  const positive = '#1E6B4E';
  const serif = "'Noto Serif KR', serif";
  const body = "'Pretendard Variable', Pretendard, sans-serif";

  return (
    <div style={{ background: '#F5F5F0', minHeight: '100vh', padding: '24px 16px', display: 'flex', justifyContent: 'center', fontFamily: body }}>
      <div style={{ width: '100%', maxWidth: '390px' }}>
        <div style={{ background: '#fff', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.10)' }}>

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
                  {r.homeworkRating || '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>/5</span>
                </p>
                <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{homework?.label || ''}</p>
              </div>
              <div style={{ borderRight: `1px solid ${rule}`, padding: '0 8px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>개념 이해</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.conceptRating || '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>/5</span>
                </p>
                <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{concept?.label || ''}</p>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
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
            {r.photoUrls?.length > 0 && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 8px' }}>TODAY'S WORK</p>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(r.photoUrls.length, 2)}, 1fr)`, gap: '6px' }}>
                    {r.photoUrls.map((url, i) => (
                      <img key={i} src={url} alt={`문제집 ${i+1}`} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${rule}` }} />
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


        </div>
      </div>
    </div>
  );
}
