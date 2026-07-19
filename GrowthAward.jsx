import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import { collection, getDoc, getDocs, query, where, doc, limit } from 'firebase/firestore';
import { useMediaQuery } from './hooks.js';
import { toPct, fetchAcademyBranding } from './growth.js';
import { R } from './tokens.jsx';

export default function GrowthAward() {
  const { studentId } = useParams();
  const isNarrow = !useMediaQuery('(min-width: 600px)');
  const [student, setStudent] = useState(null);
  const [reports, setReports] = useState([]);
  const [academyName, setAcademyName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // 'network' | null
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    async function load() {
      try {
        // studentIndex에서 academyId를 먼저 찾은 뒤 실제 학원 서브컬렉션을 조회 (멀티테넌시 전환)
        const indexSnap = await getDoc(doc(db, 'studentIndex', studentId));
        if (!indexSnap.exists()) { setLoading(false); return; }
        const { academyId } = indexSnap.data();
        fetchAcademyBranding(academyId).then(b => setAcademyName(b.academyName || null));
        const stuSnap = await getDoc(doc(db, 'academies', academyId, 'students', studentId));
        if (stuSnap.exists()) setStudent({ id: stuSnap.id, ...stuSnap.data() });
        const rSnap = await getDocs(query(collection(db, 'academies', academyId, 'reports'), where('studentId', '==', studentId), limit(200)));
        // isDraft !== true — 필드 자체가 없는 예전 리포트까지 제외되는 걸 막기 위해 클라이언트에서 거름
        // (Firestore where('isDraft','==',false)는 필드 없는 문서를 통째로 제외해버림)
        const rList = rSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r => r.isDraft !== true)
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        setReports(rList);
      } catch (e) {
        console.error(e);
        setLoadError('network');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studentId, retryKey]);

  const fmtDate = (r) => {
    if (!r?.createdAt?.seconds) return '';
    const d = new Date(r.createdAt.seconds * 1000);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로 0~100(%) 기준으로 정규화
  const sorted = reports.map(r => ({ ...r, conceptRating: r.conceptRating == null ? null : toPct(r.conceptRating), homeworkRating: r.homeworkRating == null ? null : toPct(r.homeworkRating) }));
  const allScores = sorted.filter(r => r.hasTest && r.testScore).map(r => Number(r.testScore));
  const maxScore = allScores.length > 0 ? Math.max(...allScores) : null;
  const minScore = allScores.length > 0 ? Math.min(...allScores) : null;
  const hwRated = sorted.filter(r => r.homeworkRating != null);
  const hwAvg = hwRated.length > 0
    ? Math.round(hwRated.reduce((s, r) => s + r.homeworkRating, 0) / hwRated.length)
    : null;
  const allAttended = sorted.length > 0 && sorted.every(r => r.attendance === '출석');
  const bestReport = [...sorted].sort((a, b) => (b.conceptRating || 0) - (a.conceptRating || 0))[0];
  const rawTeacherName = sorted[sorted.length - 1]?.teacherName || '';
  const teacherName = rawTeacherName ? rawTeacherName.replace(/선생님?$/, '').trim() + ' 선생님' : '담당 교사';

  // 마일스톤
  const milestones = [];
  if (sorted.length > 0) milestones.push({ label: '태도 형성', date: fmtDate(sorted[0]), done: true });
  if (sorted.find(r => r.conceptRating >= 100)) milestones.push({ label: '개념 흡수', date: fmtDate(sorted.find(r => r.conceptRating >= 100)), done: true });
  if (sorted.find(r => r.hasTest && Number(r.testScore) >= 70)) milestones.push({ label: '판단 기준', date: fmtDate(sorted.find(r => r.hasTest && Number(r.testScore) >= 70)), done: true });
  if (bestReport) milestones.push({ label: '전략 완성', date: fmtDate(bestReport), done: true, active: true });
  milestones.push({ label: '전략 고도화', date: '다음 목표', done: false });

  const periodLabel = sorted.length > 0
    ? `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])} · ${sorted.length}회`
    : '';

  if (loading) return (
    <div style={{ height: '100dvh', background: '#060E1F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: R.body }}>
      <style>{`@keyframes awardPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.85; } }`}</style>
      <div style={{ width: '100%', maxWidth: '500px', padding: '0 32px', textAlign: 'center' }}>
        <div style={{ width: '60%', height: '16px', background: 'rgba(201,162,39,0.2)', borderRadius: '4px', margin: '0 auto 24px', animation: 'awardPulse 1.4s ease-in-out infinite' }} />
        <div style={{ width: '40%', height: '40px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', margin: '0 auto 32px', animation: 'awardPulse 1.4s ease-in-out infinite' }} />
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', animation: 'awardPulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      </div>
    </div>
  );

  if (loadError) return (
    <div style={{ height: '100dvh', background: '#060E1F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#8A8A8A', fontSize: '14px', fontFamily: R.body }}>
      <p style={{ margin: 0 }}>정보를 불러오지 못했습니다.</p>
      <button onClick={() => setRetryKey(k => k + 1)} style={{ padding: '9px 20px', background: R.gold, color: '#1A1A1A', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>다시 시도</button>
    </div>
  );

  if (!student) return (
    <div style={{ height: '100dvh', background: '#060E1F', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8A8A', fontSize: '14px' }}>
      학생 정보를 찾을 수 없습니다.
    </div>
  );

  return (
    <div style={{
      minHeight: '100dvh', background: '#060E1F',
      fontFamily: R.body,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'clamp(20px, 6vw, 40px) clamp(16px, 5vw, 32px)', position: 'relative', overflow: 'hidden'
    }}>
      {/* 배경 글로우 */}
      <div style={{ position: 'fixed', top: '-100px', left: '-100px', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(13,45,107,0.4) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-100px', right: '-100px', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(201,162,39,0.12) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: '1100px', position: 'relative', zIndex: 1 }}>

        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, color: R.gold, letterSpacing: '0.2em', border: '1px solid rgba(201,162,39,0.4)', padding: '5px 16px', borderRadius: '2px', marginBottom: '20px' }}>
            GROWTH AWARD · {new Date().getFullYear()}
          </div>
          <p style={{ fontSize: 'clamp(48px, 7vw, 76px)', fontWeight: 800, color: '#fff', letterSpacing: '-2px', marginBottom: '8px', textShadow: '0 0 40px rgba(201,162,39,0.3)' }}>
            {student.name}
          </p>
          <p style={{ fontSize: 'clamp(15px, 2vw, 20px)', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>
            {periodLabel}의 성장 여정
          </p>
        </div>

        {/* 마일스톤 타임라인 */}
        <div style={isNarrow
          ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', marginBottom: '48px', paddingLeft: '8px' }
          : { display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '48px' }
        }>
          {milestones.map((m, i) => (
            <React.Fragment key={i}>
              <div style={isNarrow
                ? { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px' }
                : { display: 'flex', flexDirection: 'column', alignItems: 'center' }
              }>
                <div style={{
                  width: 'clamp(52px, 6vw, 68px)', height: 'clamp(52px, 6vw, 68px)',
                  flexShrink: 0,
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'clamp(10px, 1.4vw, 13px)', fontWeight: 700,
                  background: m.active ? 'linear-gradient(135deg, #C9A227, #E8C547)' : m.done ? 'rgba(13,45,107,0.6)' : 'transparent',
                  border: `2px solid ${m.active ? R.gold : m.done ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                  color: m.active ? '#fff' : m.done ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                  boxShadow: m.active ? '0 0 0 6px rgba(201,162,39,0.2), 0 0 30px rgba(201,162,39,0.4)' : 'none',
                }}>
                  {m.active
                    ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10l4 4 8-8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : m.label}
                </div>
                <p style={{ fontSize: 'clamp(9px, 1.2vw, 12px)', color: m.active ? R.gold : 'rgba(255,255,255,0.5)', marginTop: isNarrow ? 0 : '8px', fontWeight: m.active ? 700 : 400, textAlign: isNarrow ? 'left' : 'center' }}>
                  {isNarrow ? `${m.label} · ${m.date}` : m.date}
                </p>
              </div>
              {i < milestones.length - 1 && (
                isNarrow
                  ? <div style={{ width: '2px', height: '20px', marginLeft: 'clamp(26px, 3vw, 34px)', background: m.done ? 'linear-gradient(180deg, rgba(13,45,107,0.8), rgba(201,162,39,0.4))' : 'rgba(255,255,255,0.06)' }} />
                  : <div style={{ flex: 1, height: '2px', minWidth: '20px', maxWidth: '80px', background: m.done ? 'linear-gradient(90deg, rgba(13,45,107,0.8), rgba(201,162,39,0.4))' : 'rgba(255,255,255,0.06)', margin: '0 4px', marginBottom: '28px' }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* 수치 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '48px' }}>
          {[
            { label: '최고 단원평가', value: maxScore ? `${maxScore}점` : '—', note: '100점 만점' },
            { label: '과제 수행 평균', value: hwAvg ? `${hwAvg}%` : '—', note: '100% 만점' },
            { label: '총 수업 횟수', value: `${sorted.length}회`, note: allAttended ? '전 회 출석' : '출석 기록' },
            { label: '최저 → 최고', value: allScores.length >= 2 ? `${minScore}→${maxScore}` : maxScore ? `${maxScore}점` : '—', note: '단원평가 변화' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(20,24,38,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '20px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 'clamp(9px, 1.1vw, 11px)', color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '10px' }}>{s.label}</p>
              <p style={{ fontSize: 'clamp(20px, 3.5vw, 36px)', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 'clamp(9px, 1.1vw, 11px)', color: 'rgba(255,255,255,0.45)', marginTop: '6px' }}>{s.note}</p>
            </div>
          ))}
        </div>

        {/* 인용구 */}
        <div style={{ textAlign: 'center', marginBottom: '48px', padding: '0 20px' }}>
          <p style={{ fontSize: 'clamp(16px, 2.5vw, 26px)', color: '#fff', lineHeight: 1.8, fontWeight: 500, wordBreak: 'keep-all', position: 'relative', display: 'inline-block' }}>
            <span style={{ position: 'absolute', top: '-20px', left: '-20px', fontSize: '60px', color: 'rgba(201,162,39,0.12)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>"</span>
            {student.name}이(가) 바뀐 건 점수가 아닙니다.<br />
            <span style={{ color: R.gold, fontWeight: 700 }}>문제를 스스로 바라보는 시선</span>이 바뀌었습니다.
          </p>
          <p style={{ fontSize: 'clamp(11px, 1.5vw, 14px)', color: 'rgba(255,255,255,0.5)', marginTop: '16px', letterSpacing: '0.06em' }}>— {teacherName}</p>
        </div>

        {/* 푸터 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 'clamp(12px, 1.6vw, 16px)', color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.1em' }}>{academyName || '데일리 리포트 시스템'}</span>
          <div style={{ width: '40px', height: '2px', background: R.gold }} />
          <span style={{ fontSize: 'clamp(11px, 1.4vw, 14px)', color: 'rgba(255,255,255,0.4)' }}>{new Date().getFullYear()}년 {new Date().getMonth() + 1}월</span>
        </div>

      </div>
    </div>
  );
}
