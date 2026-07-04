import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { calculateTotalPoints, getStageInfo } from './growth.js';

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

export default function PublicReport() {
  const { reportId } = useParams();
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
      <p style={{ color: '#9CA3AF', fontSize: '14px' }}>{error}</p>
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
  const stageInfo = getStageInfo(calculateTotalPoints(allStudentReports));
  const teacherSuffix = /선생님?$/.test(r.teacherName || '') ? '' : ' 선생님';

  // TODAY'S SUMMARY
  const summaryParts = [];
  if (r.attendance === '정시') summaryParts.push('정시 등원');
  else if (r.attendance === '지각') summaryParts.push('지각 등원');
  else if (r.attendance === '결석') summaryParts.push('결석');
  if (r.homeworkRating >= 4) summaryParts.push('과제 완벽');
  else if (r.homeworkRating === 3) summaryParts.push('과제 양호');
  else if (r.homeworkRating > 0 && r.homeworkRating < 3) summaryParts.push('과제 미흡');
  if (r.conceptRating >= 4) summaryParts.push('개념 이해 우수');
  else if (r.conceptRating === 3) summaryParts.push('개념 이해 보통');
  else if (r.conceptRating > 0 && r.conceptRating < 3) summaryParts.push('개념 보강 필요');
  if (r.diagnosis?.length > 0) {
    const TAG_MAP = { calc: '계산 실수 확인', concept: '개념 누락 확인', apply: '응용 부족 확인', time: '시간 부족', perfect: '개념 완벽' };
    summaryParts.push(TAG_MAP[r.diagnosis[0].key] || '');
  }

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
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.15em', margin: '0 0 4px', fontWeight: 600 }}>LEARNING REPORT</p>
                <p style={{ fontFamily: serif, fontSize: '26px', fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{r.studentName}</p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', margin: 0 }}>{dateStr} · {r.teacherName}{teacherSuffix}</p>
              </div>
              {/* 성장 배지 */}
              <div style={{ border: `1px solid rgba(201,162,39,0.5)`, padding: '6px 12px', textAlign: 'center', borderRadius: '2px', flexShrink: 0 }}>
                <p style={{ fontSize: '9px', color: gold, margin: '0 0 2px', letterSpacing: '0.08em', fontWeight: 700 }}>성장 단계</p>
                <p style={{ fontSize: '13px', fontWeight: 800, color: '#fff', margin: 0 }}>{stageInfo.current.label} · {stageInfo.totalPoints}P</p>
              </div>
            </div>
          </div>

          {/* 바디 */}
          <div style={{ padding: '18px 20px' }}>

            {/* TODAY'S SUMMARY */}
            {summaryParts.length > 0 && (
              <div style={{ borderLeft: `3px solid ${gold}`, paddingLeft: '13px', marginBottom: '18px' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: gold, letterSpacing: '0.12em', margin: '0 0 4px' }}>TODAY'S SUMMARY</p>
                <p style={{ fontSize: '14px', fontWeight: 800, color: navy, margin: 0, lineHeight: 1.5, wordBreak: 'keep-all' }}>
                  {summaryParts.join(' · ')}
                </p>
              </div>
            )}

            <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />

            {/* 핵심 지표 — 수직선 구분 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '18px' }}>
              <div style={{ borderRight: `1px solid ${rule}`, paddingRight: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>과제 수행</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.homeworkRating || '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>/5</span>
                </p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{homework?.label || ''}</p>
              </div>
              <div style={{ borderRight: `1px solid ${rule}`, padding: '0 14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>개념 이해</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {r.conceptRating || '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>/5</span>
                </p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{concept?.label || ''}</p>
              </div>
              <div style={{ paddingLeft: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>출결</p>
                <p style={{ fontSize: '16px', fontWeight: 800, color: r.attendance === '정시' ? positive : navy, margin: '4px 0', lineHeight: 1 }}>{r.attendance}</p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{r.arrivalTime} 등원</p>
              </div>
            </div>

            <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />

            {/* TEACHER'S NOTE */}
            {r.teacherNote && (
              <>
                <div style={{ borderLeft: `3px solid ${gold}`, paddingLeft: '13px', marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: gold, letterSpacing: '0.12em', margin: '0 0 7px' }}>TEACHER'S NOTE</p>
                  <p style={{ fontSize: '13px', color: ink, margin: 0, lineHeight: 1.9, fontWeight: 500 }}>{r.teacherNote}</p>
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* 학습 범위 + 진단 */}
            {(r.textbook || r.unit || r.pages || r.diagnosis?.length > 0) && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: r.diagnosis?.length > 0 ? '1fr 1fr' : '1fr', gap: '16px', marginBottom: '18px' }}>
                  {(r.textbook || r.unit || r.pages) && (
                    <div>
                      <p style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 6px' }}>학습 범위</p>
                      {r.textbook && <p style={{ fontSize: '12px', fontWeight: 700, color: navy, margin: '0 0 2px', wordBreak: 'keep-all' }}>{r.textbook}</p>}
                      {r.unit && <p style={{ fontSize: '11px', color: inkSub, margin: '0 0 1px' }}>{r.unit}</p>}
                      {r.pages && <p style={{ fontSize: '11px', color: inkMute, margin: 0 }}>{r.pages}</p>}
                    </div>
                  )}
                  {r.diagnosis?.length > 0 && (
                    <div>
                      <p style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 6px' }}>진단</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {r.diagnosis.map((d, i) => (
                          <span key={i} style={{ display: 'inline-block', background: '#FAEEDA', border: `1.5px solid ${gold}`, color: '#8A5A00', fontSize: '11px', fontWeight: 700, padding: '4px 11px', borderRadius: '20px' }}>
                            {DIAGNOSIS_LABELS[d.key] || d.key}
                            {d.unit ? ` · ${d.unit}단원` : ''}{d.pages ? ` ${d.pages}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* 시험 */}
            {r.hasTest && r.testName && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 8px' }}>TEST RESULT</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                    <p style={{ fontSize: '28px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{r.testScore}<span style={{ fontSize: '13px', fontWeight: 600, color: inkMute, marginLeft: '2px' }}>점</span></p>
                    <p style={{ fontSize: '12px', color: inkSub, margin: 0 }}>{r.testName}</p>
                  </div>
                </div>
                <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
              </>
            )}

            {/* 문제집 사진 */}
            {r.photoUrls?.length > 0 && (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 8px' }}>TODAY'S WORK</p>
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
                  <p style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>NEXT CLASS</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: navy, margin: 0 }}>{r.nextPlan}</p>
                  {r.nextPlanDetail && <p style={{ fontSize: '11px', color: inkSub, margin: '2px 0 0' }}>{r.nextPlanDetail}</p>}
                </div>
                <div style={{ width: '28px', height: '28px', background: '#EAF0F9', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A5CB8', fontSize: '14px', flexShrink: 0 }}>→</div>
              </div>
            )}
          </div>

          {/* 푸터 */}
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: inkMute, letterSpacing: '0.12em' }}>교현학원</span>
            <span style={{ fontSize: '9px', color: inkMute }}>031-707-0591</span>
          </div>
        </div>
      </div>
    </div>
  );
}
