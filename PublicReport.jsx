import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { SKINS, deriveColorsToSkin } from './DiagnosticReportInput';

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

const AVATAR_BASE = '/avatars';

export default function PublicReport() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [student, setStudent] = useState(null);
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
  const today = r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    : '';

  const skinColor = student?.skinColor;
  const s = skinColor ? deriveColorsToSkin(skinColor) : SKINS.navy;

  const homework = RATING_LEVELS.find(x => x.level === r.homeworkRating);
  const concept = RATING_LEVELS.find(x => x.level === r.conceptRating);

  // TODAY'S SUMMARY 자동 생성
  const summaryParts = [];
  if (r.attendance === '정시') summaryParts.push('정시 등원');
  else if (r.attendance === '지각') summaryParts.push('지각 등원');
  if (r.homeworkRating >= 4) summaryParts.push('과제 완벽');
  else if (r.homeworkRating === 3) summaryParts.push('과제 양호');
  else if (r.homeworkRating > 0 && r.homeworkRating < 3) summaryParts.push('과제 미흡');
  if (r.conceptRating >= 4) summaryParts.push('개념 이해 우수');
  else if (r.conceptRating === 3) summaryParts.push('개념 이해 보통');
  else if (r.conceptRating > 0 && r.conceptRating < 3) summaryParts.push('개념 보강 필요');
  if (r.diagnosis?.length > 0) {
    const label = DIAGNOSIS_LABELS[r.diagnosis[0].key];
    if (label) summaryParts.push(`${label} 확인`);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* 카드 */}
        <div style={{ background: s.bodyBg, borderRadius: '18px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }}>

          {/* 헤더 */}
          <div style={{ background: s.headerBg, padding: '20px 18px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '110px', height: '110px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.18em' }}>교현학원</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: '20px' }}>{today}</span>
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.2em', margin: '0 0 8px' }}>LEARNING REPORT</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                {student?.avatar && (
                  <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden', flexShrink: 0 }}>
                    <img src={`${AVATAR_BASE}/${student.avatar}.png`} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <p style={{ fontSize: '24px', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>{r.studentName}</p>
              </div>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', marginBottom: '10px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{student?.school || ''}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{r.teacherName}{/선생님?$/.test(r.teacherName || '') ? '' : ' 선생님'} 드림</span>
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
                <p style={{ fontSize: '13px', fontWeight: 700, color: s.commentText, margin: 0, lineHeight: 1.9 }}>{r.teacherNote}</p>
              </div>
            )}

            {/* 평가 그리드 — 숫자+텍스트 */}
            {(r.homeworkRating || r.conceptRating) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div style={{ background: s.cardDarkBg, borderRadius: '14px', padding: '12px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', margin: '0 0 5px', fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase' }}>과제 수행</p>
                  {homework ? <>
                    <p style={{ fontSize: '26px', fontWeight: 800, color: '#fff', margin: '2px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {r.homeworkRating}<span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '2px', opacity: 0.7 }}>/5</span>
                    </p>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{homework.label}</p>
                  </> : <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>미입력</p>}
                </div>
                <div style={{ background: s.cardBg, borderRadius: '14px', padding: '12px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.1em', margin: '0 0 5px', fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase' }}>개념 이해</p>
                  {concept ? <>
                    <p style={{ fontSize: '26px', fontWeight: 800, color: s.cardText, margin: '2px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {r.conceptRating}<span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '2px', opacity: 0.6 }}>/5</span>
                    </p>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardSub, margin: 0 }}>{concept.label}</p>
                  </> : <p style={{ fontSize: '12px', color: s.cardSub, margin: 0 }}>미입력</p>}
                </div>

                {/* 출결 */}
                <div style={{ background: s.cardBg, borderRadius: '14px', padding: '12px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.1em', margin: '0 0 5px', fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase' }}>출결</p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardText, margin: '0 0 2px' }}>{r.attendance}</p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardText, margin: 0 }}>{r.arrivalTime} 등원</p>
                </div>

                {/* 학습 범위 */}
                <div style={{ background: s.cardDarkBg, borderRadius: '14px', padding: '12px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', margin: '0 0 5px', fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase' }}>학습 범위</p>
                  <p style={{ fontSize: '12px', fontWeight: 800, color: '#fff', margin: '0 0 3px', wordBreak: 'keep-all' }}>{r.textbook || '미입력'}</p>
                  {r.unit && <p style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.75)', margin: 0 }}>{r.unit}</p>}
                  {r.pages && <p style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{r.pages}</p>}
                </div>
              </div>
            )}

            {/* 시험 */}
            {r.hasTest && r.testName && (
              <div style={{ background: '#FFFBEB', borderRadius: '14px', padding: '12px 14px', marginBottom: '10px', border: '1.5px solid #F5D76E' }}>
                <p style={{ fontSize: '9px', fontWeight: 800, color: '#B8860B', margin: '0 0 5px', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.1em' }}>TEST RESULT</p>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#7A5500', margin: '0 0 4px' }}>{r.testName}</p>
                {r.testScore && <p style={{ fontSize: '26px', fontWeight: 800, color: '#7A5500', margin: 0, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{r.testScore}<span style={{ fontSize: '13px', marginLeft: '2px' }}>점</span></p>}
              </div>
            )}

            {/* 진단 태그 */}
            {r.diagnosis?.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.12em', margin: '0 0 7px', fontFamily: 'Montserrat, sans-serif' }}>DIAGNOSIS</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {r.diagnosis.map((d, i) => (
                    <span key={i} style={{ background: s.tagBg, border: `1.5px solid ${s.tagBorder}`, color: s.tagText, fontSize: '11px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px' }}>
                      {DIAGNOSIS_LABELS[d.key] || d.key}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 다음 수업 */}
            {r.nextPlan && (
              <div style={{ background: s.nextBg, borderRadius: '14px', padding: '12px 14px', marginBottom: '10px' }}>
                <p style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.14em', margin: '0 0 6px', fontFamily: 'Montserrat, sans-serif' }}>NEXT CLASS</p>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.4 }}>{r.nextPlan}</p>
                {r.nextPlanDetail && <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff', margin: '4px 0 0', lineHeight: 1.4 }}>{r.nextPlanDetail}</p>}
              </div>
            )}

            {/* 문제집 사진 */}
            {r.photoUrls?.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.12em', margin: '0 0 7px', fontFamily: 'Montserrat, sans-serif' }}>TODAY'S WORK</p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(r.photoUrls.length, 2)}, 1fr)`, gap: '6px' }}>
                  {r.photoUrls.map((url, i) => (
                    <img key={i} src={url} alt={`문제집 ${i + 1}`} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '10px', border: `1px solid ${s.tagBorder}` }} />
                  ))}
                </div>
              </div>
            )}

            {/* 푸터 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: `1px solid rgba(0,0,0,0.06)` }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: s.footerText, fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.12em' }}>교현학원</span>
              <span style={{ fontSize: '9px', fontWeight: 500, color: s.footerText, fontFamily: 'Montserrat, sans-serif' }}>031-707-0591</span>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#9CA3AF', marginTop: '16px' }}>와이즈에듀 교현학원 학습 리포트</p>
      </div>
    </div>
  );
}
