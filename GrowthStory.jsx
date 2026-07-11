import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

const FONT_STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif; 
  }
  * { word-break: keep-all; }
`;

// ── AI 서사 생성 — Vercel Serverless Function 경유 ──
async function generateNarrative(studentName, milestones, unitScores, teacherNotes) {
  try {
    const response = await fetch('/api/narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, milestones, unitScores, teacherNotes })
    });
    if (!response.ok) throw new Error('서버 오류');
    return await response.json();
  } catch (e) {
    console.error('서사 생성 오류:', e);
    return null;
  }
}

export default function GrowthStory() {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [reports, setReports] = useState([]);
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [narLoading, setNarLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');

  const startEdit = (field) => { setEditing(field); setEditText(narrative[field] || ''); };
  const saveEdit = () => { setNarrative(prev => ({ ...prev, [editing]: editText })); setEditing(null); };
  const cancelEdit = () => setEditing(null);

  useEffect(() => {
    async function load() {
      try {
        // 학생 정보
        const stuSnap = await getDocs(query(collection(db, 'students'), where('__name__', '==', studentId)));
        if (!stuSnap.empty) setStudent({ id: stuSnap.docs[0].id, ...stuSnap.docs[0].data() });

        // 리포트 (최근 90일)
        const since = new Date(); since.setDate(since.getDate() - 90);
        const rSnap = await getDocs(query(
          collection(db, 'reports'),
          where('studentId', '==', studentId)
        ));
        const rList = rSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        setReports(rList);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studentId]);

  // 데이터 가공
  const sorted = [...reports].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const fmtDate = (r) => {
    if (!r?.createdAt?.seconds) return '';
    const d = new Date(r.createdAt.seconds * 1000);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  // 단원별 차수 점수 집계
  const unitScoreMap = {};
  sorted.forEach(r => {
    if (!r.hasTest || !r.testScore) return;
    // unit → testName → textbook → '단원평가' 순으로 fallback
    const unit = (r.unit && r.unit.trim()) || (r.testName && r.testName.trim()) || (r.textbook && r.textbook.trim()) || '단원평가';
    const round = r.testRound || '';
    const score = Number(r.testScore);
    if (!unitScoreMap[unit]) unitScoreMap[unit] = [];
    unitScoreMap[unit].push({ round, score, date: fmtDate(r) });
  });
  const unitScores = Object.entries(unitScoreMap).map(([unit, scores]) => ({ unit, scores }));

  // 전체 평균 추이 (차수별)
  const allScores = sorted.filter(r => r.hasTest && r.testScore).map(r => Number(r.testScore));
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;
  const maxScore = allScores.length > 0 ? Math.max(...allScores) : null;
  const minScore = allScores.length > 0 ? Math.min(...allScores) : null;

  // 최고 이해도 수업
  const bestReport = [...sorted].sort((a, b) => (b.conceptRating || 0) - (a.conceptRating || 0))[0];
  // 과제 평균
  const hwAvg = sorted.length > 0
    ? (sorted.reduce((s, r) => s + (r.homeworkRating || 0), 0) / sorted.length).toFixed(1)
    : null;
  // 개근 여부
  const allAttended = sorted.length > 0 && sorted.every(r => r.attendance === '출석');

  // PHASE 마일스톤 자동 생성
  const milestones = [];
  if (sorted.length > 0) {
    milestones.push({
      phase: 'PHASE 1 · 태도 형성',
      date: fmtDate(sorted[0]),
      title: '첫 수업 시작 및 학습 리듬 안착',
      desc: '낯선 개념 앞에서도 스스로 해결의 실마리를 찾으려는 의지로 시작했습니다.',
      badge: '문제 상황 인지 단계 진입',
      active: false,
    });
  }
  const firstPerfect = sorted.find(r => r.homeworkRating >= 5);
  if (firstPerfect) {
    milestones.push({
      phase: 'PHASE 2 · 개념 흡수',
      date: fmtDate(firstPerfect),
      title: '첫 만점 과제 달성',
      desc: '단순 암기를 넘어 개념의 구조를 이해하기 시작한 첫 번째 신호였습니다.',
      badge: '개념 내면화 시작',
      active: false,
    });
  }
  const over70 = sorted.find(r => r.hasTest && Number(r.testScore) >= 70);
  if (over70) {
    milestones.push({
      phase: 'PHASE 3 · 판단 기준 수립',
      date: fmtDate(over70),
      title: `단원평가 ${over70.testScore}점 달성 · 응용 문항 자력 해결 시작`,
      desc: '풀이 방향을 스스로 결정하는 과정에서 자신만의 판단 기준을 세우기 시작했습니다.',
      badge: '판단 기준 형성 확인',
      active: false,
    });
  }
  // PHASE 4 — PHASE 1,2,3과 다른 날짜의 리포트 중 최고 이해도
  const phase4Report = [...sorted]
    .filter(r => {
      const d = fmtDate(r);
      return !milestones.some(m => m.date === d) || r === bestReport;
    })
    .sort((a, b) => (b.conceptRating || 0) - (a.conceptRating || 0))[0] || bestReport;
  if (phase4Report) {
    milestones.push({
      phase: 'PHASE 4 · 전략 완성',
      date: fmtDate(phase4Report),
      title: '역대 최고 이해도 기록' + (maxScore ? ` · 단원평가 최고 ${maxScore}점` : ''),
      desc: '왜 이 방법을 써야 하는가를 스스로 말하기 시작했습니다.',
      badge: '해결 전략 완성 단계',
      active: true,
    });
  }

  // 기간 표시
  const periodLabel = sorted.length > 0
    ? `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])} · ${sorted.length}회 수업`
    : '';

  // AI 서사 생성
  const handleGenNarrative = async () => {
    setNarLoading(true);
    const teacherNotes = sorted
      .filter(r => r.teacherNote)
      .map(r => r.teacherNote);
    try {
      const response = await fetch('/api/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          studentName: student?.name || '학생', 
          milestones, 
          unitScores, 
          teacherNotes 
        })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(`오류: ${JSON.stringify(data)}`);
      } else {
        setNarrative(data);
      }
    } catch (e) {
      alert(`오류: ${e.message}`);
    }
    setNarLoading(false);
  };

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif", color: '#0D2D6B', fontSize: '14px', fontWeight: 600 }}>
      성장 기록을 불러오는 중...
    </div>
  );

  if (!student) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif", color: '#8A8A8A', fontSize: '14px' }}>
      학생 정보를 찾을 수 없습니다.
    </div>
  );

  const teacherName = sorted[sorted.length - 1]?.teacherName || '';
  const teacherDisplay = teacherName.replace(/선생님?$/, '').trim() + ' 선생님';

  const S = {
    wrap: { maxWidth: '420px', margin: '0 auto', fontFamily: "'Noto Sans KR', 'Pretendard Variable', Pretendard, sans-serif", background: '#F5F5F0', minHeight: '100vh' },
    header: { background: '#0D2D6B', padding: '32px 24px 28px', position: 'relative', overflow: 'hidden' },
    section: { background: '#fff', padding: '22px', borderBottom: '1px solid #EEECEA' },
    label: { fontSize: '9px', fontWeight: 700, color: '#0D2D6B', letterSpacing: '0.14em', marginBottom: '16px' },
  };

  return (
    <div style={S.wrap}>
      <style>{FONT_STYLE}</style>

      {/* 헤더 */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ width: '3px', height: '16px', background: '#C9A227', borderRadius: '1px' }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.16em' }}>와이즈에듀 교현학원</span>
        </div>
        <div style={{ height: '1px', background: 'rgba(201,162,39,0.2)', marginBottom: '20px' }} />
        <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.18em', fontWeight: 600, marginBottom: '6px' }}>GROWTH STORY</p>
        <p style={{ fontSize: '26px', fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: '4px' }}>{student.name}의 성장 이야기</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{periodLabel}</p>
      </div>

      {/* GROWTH MILESTONE */}
      <div style={S.section}>
        <p style={S.label}>GROWTH MILESTONE</p>
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
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#C9A227', letterSpacing: '0.14em', marginBottom: '3px' }}>{m.phase}</p>
              <p style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 500, marginBottom: '4px' }}>{m.date}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B', margin: 0 }}>{m.title}</p>
                {narrative && chapterField && (
                  <button onClick={() => startEdit(chapterField)}
                    style={{ background: '#F0EDE8', border: 'none', color: '#8A8A8A', fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '5px', cursor: 'pointer' }}>
                    ✏️ 편집
                  </button>
                )}
              </div>

              {/* 편집 모드 */}
              {editing === chapterField ? (
                <div style={{ marginBottom: '6px' }}>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)}
                    style={{ width: '100%', minHeight: '80px', padding: '10px', border: '1px solid #E5E5E5', borderRadius: '8px', fontSize: '12px', lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: '#2C2C2C' }} />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button onClick={saveEdit} style={{ flex: 1, padding: '7px', background: '#0D2D6B', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
                    <button onClick={cancelEdit} style={{ flex: 1, padding: '7px', background: '#F3F4F6', border: 'none', borderRadius: '6px', color: '#6B7280', fontSize: '11px', cursor: 'pointer' }}>취소</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#4A4A4A', lineHeight: 1.8, wordBreak: 'keep-all', marginBottom: '6px' }}>
                  {chapterText}
                </p>
              )}

              <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: 700, color: m.active ? '#8A6500' : '#0D2D6B', background: m.active ? 'rgba(201,162,39,0.12)' : '#EAF0F9', padding: '3px 9px', borderRadius: '3px' }}>{m.badge}</span>
            </div>
            );
          })}
        </div>
      </div>

      {/* 단원별 평가 추이 */}
      {unitScores.length > 0 && (
        <div style={S.section}>
          <p style={S.label}>단원별 평가 추이 — 진솔한 성장의 기록</p>
          {unitScores.map((u, ui) => {
            const maxS = Math.max(...u.scores.map(s => s.score), 1);
            return (
              <div key={ui} style={{ marginBottom: ui < unitScores.length - 1 ? '16px' : 0 }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#2C2C2C', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {u.unit}
                  <span style={{ fontSize: '9px', color: '#0D2D6B', background: '#EAF0F9', padding: '2px 7px', borderRadius: '3px', fontWeight: 600 }}>
                    {u.scores.length}회 평가
                  </span>
                </p>
                {u.scores.map((s, si) => {
                  const isMax = s.score === Math.max(...u.scores.map(x => x.score));
                  const pct = Math.round((s.score / 100) * 100);
                  const barColor = pct < 60 ? '#C0C0C0' : pct < 75 ? '#7BA4D4' : isMax ? 'linear-gradient(90deg, #0D2D6B, #C9A227)' : '#0D2D6B';
                  const prev = si > 0 ? u.scores[si - 1].score : null;
                  const delta = prev !== null ? s.score - prev : null;
                  return (
                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, width: '24px', flexShrink: 0 }}>{s.round || `${si + 1}차`}</span>
                      <div style={{ flex: 1, height: '6px', background: '#F3F4F6', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '6px', background: barColor }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: isMax ? '#0D2D6B' : '#2C2C2C', width: '36px', textAlign: 'right', flexShrink: 0 }}>{s.score}점</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, width: '36px', flexShrink: 0, color: delta > 0 ? '#0F6E56' : delta < 0 ? '#A32D2D' : '#B0B0B0', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        {delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`}
                        {isMax && <span style={{ fontSize: '9px', background: '#C9A227', color: '#fff', padding: '2px 5px', borderRadius: '3px', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>최고</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {/* 전체 요약 — 2회 이상 평가 시만 표시 */}
          {allScores.length >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: '2px solid #C9A227', marginTop: '12px' }}>
              <span style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, flexShrink: 0 }}>전체 범위</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#2C2C2C' }}>{minScore}점</span>
                <span style={{ fontSize: '12px', color: '#C9A227' }}>→</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#0D2D6B' }}>{maxScore}점</span>
              </div>
              <span style={{ fontSize: '10px', color: '#8A8A8A' }}>100점 만점</span>
            </div>
          )}
          {allScores.length === 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#F7F5F1', borderRadius: '4px', borderLeft: '2px solid #C9A227', marginTop: '12px' }}>
              <span style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600 }}>이번 평가</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#0D2D6B', marginLeft: 'auto' }}>{maxScore}점</span>
              <span style={{ fontSize: '10px', color: '#8A8A8A' }}>/ 100점 만점</span>
            </div>
          )}
        </div>
      )}

      {/* 핵심 지표 */}
      <div style={S.section}>
        <p style={S.label}>KEY METRICS</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {maxScore && (
            <div style={{ background: '#F7F5F1', borderRadius: '6px', padding: '14px', borderLeft: '2px solid #C9A227' }}>
              <p style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, marginBottom: '6px' }}>최고 단원평가</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#0D2D6B' }}>{maxScore}<span style={{ fontSize: '11px', color: '#8A8A8A' }}>점</span></p>
              <p style={{ fontSize: '9px', color: '#B0B0B0', marginTop: '2px' }}>100점 만점</p>
            </div>
          )}
          {hwAvg && (
            <div style={{ background: '#F7F5F1', borderRadius: '6px', padding: '14px', borderLeft: '2px solid #C9A227' }}>
              <p style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, marginBottom: '6px' }}>과제 수행 평균</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#0D2D6B' }}>{hwAvg}<span style={{ fontSize: '11px', color: '#8A8A8A' }}>점</span></p>
              <p style={{ fontSize: '9px', color: '#B0B0B0', marginTop: '2px' }}>5점 만점 · 담당교사 관찰</p>
            </div>
          )}
          <div style={{ background: '#F7F5F1', borderRadius: '6px', padding: '14px', borderLeft: '2px solid #C9A227' }}>
            <p style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, marginBottom: '6px' }}>총 수업 횟수</p>
            <p style={{ fontSize: '22px', fontWeight: 800, color: '#0D2D6B' }}>{sorted.length}<span style={{ fontSize: '11px', color: '#8A8A8A' }}>회</span></p>
            <p style={{ fontSize: '9px', color: '#B0B0B0', marginTop: '2px' }}>{allAttended ? '전 회 출석' : '출석 기록'}</p>
          </div>
          {avgScore && (
            <div style={{ background: '#F7F5F1', borderRadius: '6px', padding: '14px', borderLeft: '2px solid #C9A227' }}>
              <p style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, marginBottom: '6px' }}>평균 점수</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#0D2D6B' }}>{avgScore}<span style={{ fontSize: '11px', color: '#8A8A8A' }}>점</span></p>
              <p style={{ fontSize: '9px', color: '#B0B0B0', marginTop: '2px' }}>100점 만점</p>
            </div>
          )}
        </div>
      </div>

      {/* 선생님 한마디 */}
      <div style={{ background: '#0D2D6B', padding: '24px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.14em', fontWeight: 600 }}>TEACHER'S WORD</p>
          {narrative && (
            <button onClick={() => startEdit('teacherWord')}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>
              ✏️ 편집
            </button>
          )}
        </div>
        {editing === 'teacherWord' ? (
          <div>
            <textarea value={editText} onChange={e => setEditText(e.target.value)}
              style={{ width: '100%', minHeight: '100px', padding: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', color: '#fff', fontSize: '13px', lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
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
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
          {teacherDisplay}
        </p>
      </div>

      {/* 다음 목표 */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <p style={S.label}>NEXT CHAPTER</p>
          {narrative && (
            <button onClick={() => startEdit('nextChapter')}
              style={{ background: '#F0EDE8', border: 'none', color: '#8A8A8A', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>
              ✏️ 편집
            </button>
          )}
        </div>
        {editing === 'nextChapter' ? (
          <div style={{ marginBottom: '14px' }}>
            <textarea value={editText} onChange={e => setEditText(e.target.value)}
              style={{ width: '100%', minHeight: '80px', padding: '12px', border: '1px solid #E5E5E5', borderRadius: '8px', color: '#2C2C2C', fontSize: '12px', lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
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
          <p style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, marginBottom: '3px' }}>다음 목표 단계</p>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D2D6B' }}>PHASE 5 · 전략 고도화</p>
        </div>
      </div>

      {/* AI 서사 생성 버튼 */}
      <div style={{ padding: '16px 22px', background: '#F7F5F1', borderBottom: '1px solid #EEECEA' }}>
        <button onClick={handleGenNarrative} disabled={narLoading}
          style={{ width: '100%', padding: '13px', background: narLoading ? '#E5E7EB' : '#0D2D6B', color: narLoading ? '#9CA3AF' : '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: narLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {narLoading ? 'AI 서사 생성 중...' : narrative ? '🔄 서사 재생성' : '✨ AI 서사 자동 생성'}
        </button>
        <p style={{ fontSize: '10px', color: '#B0B0B0', textAlign: 'center', marginTop: '8px' }}>
          {narrative ? '생성된 서사를 직접 편집하거나 재생성할 수 있습니다' : 'Gemini AI가 데이터 기반 성장 서사를 자동으로 작성합니다'}
        </p>
      </div>

      {/* 푸터 */}
      <div style={{ padding: '16px 22px', background: '#F7F5F1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 600, letterSpacing: '0.08em' }}>교현학원</span>
        <span style={{ fontSize: '10px', color: '#8A8A8A' }}>{new Date().getFullYear()}년 {new Date().getMonth() + 1}월</span>
      </div>

    </div>
  );
}
