import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { calculateTotalPoints, getStageInfo } from './growth.js';
import { SKINS, deriveColorsToSkin } from './DiagnosticReportInput';

// ParentCard와 동일한 상수
const RATING_LEVELS = [
  { level: 1, label: '노력 필요', emoji: '😟' },
  { level: 2, label: '조금 부족', emoji: '😐' },
  { level: 3, label: '보통',     emoji: '🙂' },
  { level: 4, label: '잘함',     emoji: '😊' },
  { level: 5, label: '아주 잘함', emoji: '🌟' },
];

const DIAGNOSIS_TAGS = [
  { key: 'calc',    label: '계산 실수'  },
  { key: 'concept', label: '개념 누락'  },
  { key: 'apply',   label: '응용 부족'  },
  { key: 'time',    label: '시간 부족'  },
  { key: 'perfect', label: '개념 완벽'  },
];

const AVATAR_BASE = '/avatars';

export default function PublicReport() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [student, setStudent] = useState(null);
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
          const sSnap = await getDoc(doc(db, 'students', r.studentId));
          if (sSnap.exists()) setStudent({ id: sSnap.id, ...sSnap.data() });

          const q = query(collection(db, 'reports'), where('studentId', '==', r.studentId));
          const snap = await getDocs(q);
          setAllStudentReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (e) {
        setError('리포트를 불러오지 못했습니다.');
      }
      setLoading(false);
    })();
  }, [reportId]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontFamily: 'Pretendard, sans-serif' }}>
      <p style={{ color: '#6B7280', fontSize: '14px' }}>리포트를 불러오는 중...</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontFamily: 'Pretendard, sans-serif' }}>
      <p style={{ color: '#9CA3AF', fontSize: '14px' }}>{error}</p>
    </div>
  );

  const r = report;
  const dateStr = r.createdAt?.seconds
    ? (() => {
        const d = new Date(r.createdAt.seconds * 1000);
        return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${'일월화수목금토'[d.getDay()]})`;
      })()
    : '';

  // 스킨 — ParentCard와 동일 로직
  const skinColor = student?.skinColor;
  const s = skinColor ? deriveColorsToSkin(skinColor) : SKINS.navy;

  const homework = RATING_LEVELS.find(x => x.level === r.homeworkRating);
  const concept  = RATING_LEVELS.find(x => x.level === r.conceptRating);

  // 성장 단계
  const stageInfo = getStageInfo(calculateTotalPoints(allStudentReports));

  // TODAY'S SUMMARY — ParentCard와 동일 로직
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
    summaryParts.push(TAG_MAP[r.diagnosis[0].key] || r.diagnosis[0].key);
  }

  // cardLabel helper
  const cardLabel = (text, dark = false) => (
    <p style={{ fontSize: '9px', fontWeight: 800, color: dark ? 'rgba(255,255,255,0.55)' : s.cardSub, letterSpacing: '0.1em', margin: '0 0 5px', fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase' }}>{text}</p>
  );

  const teacherSuffix = /선생님?$/.test(r.teacherName || '') ? '' : ' 선생님';

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* ── ParentCard와 완전히 동일한 카드 구조 ── */}
        <div style={{ background: s.bodyBg, borderRadius: '18px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }}>

          {/* 헤더 */}
          <div style={{ background: s.headerBg, padding: '20px 18px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '110px', height: '110px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
            <div style={{ position: 'absolute', top: '20px', right: '10px', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.18em' }}>교현학원</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: '20px' }}>{dateStr}</span>
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.2em', margin: '0 0 8px' }}>LEARNING REPORT</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                {student?.avatar && (
                  <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden', flexShrink: 0 }}>
                    <img src={`${AVATAR_BASE}/${student.avatar}.png`} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <p style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.5px' }}>{r.studentName}</p>
              </div>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', marginBottom: '10px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{student?.school || ''}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{r.teacherName}{teacherSuffix} 드림</span>
              </div>
            </div>
          </div>

          {/* 바디 */}
          <div style={{ padding: '14px' }}>

            {/* TODAY'S SUMMARY */}
            {summaryParts.length > 0 && (
              <div style={{ borderLeft: `3px solid ${s.tagBorder}`, paddingLeft: '12px', marginBottom: '12px' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: s.cardSub, letterSpacing: '0.12em', margin: '0 0 4px', fontFamily: 'Montserrat, sans-serif' }}>TODAY'S SUMMARY</p>
                <p style={{ fontSize: '13px', fontWeight: 800, color: s.cardText, margin: 0, lineHeight: 1.5, wordBreak: 'keep-all' }}>
                  {summaryParts.join(' · ')}
                </p>
              </div>
            )}

            {/* TEACHER'S NOTE */}
            {r.teacherNote && (
              <div style={{ background: s.commentBg, borderRadius: '14px', padding: '13px 15px', marginBottom: '10px', borderLeft: `3px solid ${s.commentBorder}` }}>
                <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.14em', margin: '0 0 7px', fontFamily: 'Montserrat, sans-serif' }}>TEACHER'S NOTE</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: s.commentText, margin: 0, lineHeight: 1.9, letterSpacing: '0.01em' }}>{r.teacherNote}</p>
              </div>
            )}

            {/* 평가 + 출결 그리드 — 숫자+텍스트 레이블 */}
            {(r.homeworkRating || r.conceptRating) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>

                <div style={{ background: s.cardDarkBg, borderRadius: '14px', padding: '12px' }}>
                  {cardLabel('과제 수행', true)}
                  {homework ? <>
                    <p style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', margin: '2px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {r.homeworkRating}<span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '2px', opacity: 0.7 }}>/5</span>
                    </p>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{homework.label}</p>
                  </> : <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>미입력</p>}
                </div>

                <div style={{ background: s.cardBg, borderRadius: '14px', padding: '12px' }}>
                  {cardLabel('개념 이해', false)}
                  {concept ? <>
                    <p style={{ fontSize: '26px', fontWeight: 800, color: s.cardText, margin: '2px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {r.conceptRating}<span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '2px', opacity: 0.6 }}>/5</span>
                    </p>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardSub, margin: 0 }}>{concept.label}</p>
                  </> : <p style={{ fontSize: '12px', color: s.cardSub, margin: 0 }}>미입력</p>}
                </div>

                <div style={{ background: s.cardBg, borderRadius: '14px', padding: '12px' }}>
                  {cardLabel('출결', false)}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: s.cardSub, flexShrink: 0 }} />
                    <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardText, margin: 0 }}>{r.attendance}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: s.cardSub, flexShrink: 0 }} />
                    <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardText, margin: 0 }}>{r.arrivalTime} 등원</p>
                  </div>
                </div>

                <div style={{ background: s.cardDarkBg, borderRadius: '14px', padding: '12px' }}>
                  {cardLabel('학습 범위', true)}
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 9px', marginBottom: '4px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', margin: 0, lineHeight: 1.4, wordBreak: 'keep-all' }}>{r.textbook || '미입력'}</p>
                  </div>
                  {(r.unit || r.pages) && <div style={{ height: '1px', background: 'rgba(255,255,255,0.12)', margin: '7px 0' }} />}
                  {r.unit && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.45)', flexShrink: 0, marginTop: '5px' }} />
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.4, wordBreak: 'keep-all' }}>{r.unit}</p>
                    </div>
                  )}
                  {r.pages && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.45)', flexShrink: 0, marginTop: '5px' }} />
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.4 }}>{r.pages}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 시험 */}
            {r.hasTest && r.testName && (
              <div style={{ background: '#FFFBEB', borderRadius: '14px', padding: '12px 14px', marginBottom: '10px', border: '1.5px solid #F5D76E' }}>
                <p style={{ fontSize: '9px', fontWeight: 800, color: '#B8860B', margin: '0 0 5px', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.1em' }}>TEST RESULT</p>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#7A5500', margin: '0 0 4px' }}>{r.testName}</p>
                {r.testScore && (
                  <p style={{ fontSize: '26px', fontWeight: 800, color: '#7A5500', margin: 0, fontFamily: 'Montserrat, sans-serif', letterSpacing: '-1px', lineHeight: 1 }}>
                    {r.testScore}<span style={{ fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>점</span>
                  </p>
                )}
              </div>
            )}

            {/* 진단 태그 */}
            {r.diagnosis?.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.12em', margin: '0 0 7px', fontFamily: 'Montserrat, sans-serif' }}>DIAGNOSIS</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {r.diagnosis.map((d, idx) => {
                    const tagDef = DIAGNOSIS_TAGS.find(t => t.key === d.key);
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: s.tagBg, border: `1.5px solid ${s.tagBorder}`, color: s.tagText, fontSize: '11px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px' }}>
                          {tagDef?.label}
                          {(d.unit || d.pages) && (
                            <>
                              <span style={{ width: '1px', height: '12px', background: s.tagBorder, margin: '0 8px', flexShrink: 0, display: 'inline-block' }} />
                              <span style={{ fontSize: '11px', fontWeight: 700, color: s.tagText }}>
                                {d.unit && `${d.unit}단원`}{d.unit && d.pages ? ' · ' : ''}{d.pages && `${d.pages}p`}
                              </span>
                            </>
                          )}
                        </span>
                        {d.detail && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', paddingLeft: '4px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: s.tagBorder, flexShrink: 0 }} />
                            <p style={{ fontSize: '12px', fontWeight: 700, color: s.tagText, margin: 0, lineHeight: 1.4 }}>{d.detail}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 성장 단계 */}
            <div style={{ background: s.cardBg, borderRadius: '14px', padding: '12px 14px', marginBottom: '10px' }}>
              <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.12em', margin: '0 0 8px', fontFamily: 'Montserrat, sans-serif' }}>GROWTH STAGE</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 800, color: s.cardText, margin: 0 }}>{stageInfo.current.label} 단계 · {stageInfo.totalPoints}P</p>
                  {stageInfo.next && <p style={{ fontSize: '10px', color: s.cardSub, margin: '3px 0 0' }}>다음 {stageInfo.next.label}까지 {stageInfo.next.min - stageInfo.totalPoints}P</p>}
                </div>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `conic-gradient(${s.tagBorder} ${stageInfo.pct * 3.6}deg, rgba(0,0,0,0.08) 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: s.cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: s.cardText }}>{stageInfo.pct}%</div>
                </div>
              </div>
            </div>

            {/* 문제집 사진 */}
            {r.photoUrls?.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.12em', margin: '0 0 7px', fontFamily: 'Montserrat, sans-serif' }}>TODAY'S WORK</p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(r.photoUrls.length, 2)}, 1fr)`, gap: '6px' }}>
                  {r.photoUrls.map((url, i) => (
                    <img key={i} src={url} alt={`문제집 ${i+1}`} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '10px', border: `1px solid ${s.tagBorder}` }} />
                  ))}
                </div>
              </div>
            )}

            {/* 다음 수업 */}
            {r.nextPlan && (
              <div style={{ background: s.nextBg, borderRadius: '14px', padding: '12px 14px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, marginRight: '10px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.14em', margin: '0 0 6px', fontFamily: 'Montserrat, sans-serif' }}>NEXT CLASS</p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: r.nextPlanDetail ? '4px' : '0' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.55)', flexShrink: 0, marginTop: '5px' }} />
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.4 }}>{r.nextPlan}</p>
                  </div>
                  {r.nextPlanDetail && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.55)', flexShrink: 0, marginTop: '5px' }} />
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.4 }}>{r.nextPlanDetail}</p>
                    </div>
                  )}
                </div>
                <div style={{ width: '30px', height: '30px', background: 'rgba(255,255,255,0.15)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '15px', flexShrink: 0 }}>→</div>
              </div>
            )}

            {/* 푸터 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: `1px solid rgba(0,0,0,0.06)` }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: s.footerText, fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.12em' }}>교현학원</span>
              <span style={{ fontSize: '9px', fontWeight: 500, color: s.footerText, fontFamily: 'Montserrat, sans-serif' }}>031-707-0591</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
