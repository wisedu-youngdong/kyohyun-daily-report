import React, { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList
} from 'recharts';
import { toPct } from '../growth.js';
import { findUnitKey } from '../curriculum.js';
import { DIAG_LABELS as TAG_LABELS, DIAG_SOFT as DIAG_SOFT_COLORS } from '../diagnosis.js';
import { C } from '../tokens.jsx';
import { StatCard } from './shared.jsx';

// ── 과제/개념/시험 추이 차트 — AnalysisView 전용
function HomeworkTestChart({ reports }) {
  const data = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({
      date: r.createdAt?.seconds
        ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
        : '',
      과제: toPct(r.homeworkRating),
      개념: toPct(r.conceptRating),
      시험: r.hasTest && r.testScore ? Number(r.testScore) : null, // 과제/개념도 100점 척도로 통일되어 별도 환산 불필요
    }));

  if (data.length === 0) return null;

  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>과제 · 개념 · 시험 추이</h3>
      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 10px' }}>막대가 높을수록 그날 점수가 좋았다는 뜻입니다 (100점 만점 기준).</p>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="과제" fill="#185FA5" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="과제" position="top" style={{ fontSize: '10px', fill: '#185FA5', fontWeight: 700 }} />
            </Bar>
            <Bar dataKey="개념" fill="#9B6FD4" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="개념" position="top" style={{ fontSize: '10px', fill: '#9B6FD4', fontWeight: 700 }} />
            </Bar>
            <Bar dataKey="시험" fill="#0F6E56" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="시험" position="top" style={{ fontSize: '10px', fill: '#0F6E56', fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 데이터 기반 인사이트 문장 생성 (AI 호출 없이 계산만으로, 즉시·무료) — AnalysisView 전용

function buildInsights(reports) {
  if (!reports || reports.length === 0) return null;
  const sorted = [...reports].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const avgOf = (arr, key) => arr.length ? arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length : 0;
  // 미입력(null)은 분모에서 제외
  const avgPctOf = (arr, key) => {
    const rated = arr.filter(r => r[key] != null);
    return rated.length ? rated.reduce((s, r) => s + toPct(r[key]), 0) / rated.length : 0;
  };
  const overallHw = avgPctOf(sorted, 'homeworkRating');
  const overallCc = avgPctOf(sorted, 'conceptRating');

  // 최근 절반 vs 이전 절반 비교로 추세 판단 (최소 4건부터 의미있는 비교)
  let trendText = null;
  if (sorted.length >= 4) {
    const mid = Math.floor(sorted.length / 2);
    const prevHalf = sorted.slice(0, mid);
    const recentHalf = sorted.slice(mid);
    const hwDelta = avgPctOf(recentHalf, 'homeworkRating') - avgPctOf(prevHalf, 'homeworkRating');
    const ccDelta = avgPctOf(recentHalf, 'conceptRating') - avgPctOf(prevHalf, 'conceptRating');
    const parts = [];
    if (Math.abs(hwDelta) >= 10) parts.push(`과제 수행이 최근 ${hwDelta > 0 ? '상승' : '하락'}세(${hwDelta > 0 ? '+' : ''}${Math.round(hwDelta)}%p)`);
    if (Math.abs(ccDelta) >= 10) parts.push(`개념 이해가 최근 ${ccDelta > 0 ? '상승' : '하락'}세(${ccDelta > 0 ? '+' : ''}${Math.round(ccDelta)}%p)`);
    if (parts.length > 0) trendText = parts.join(', ') + '입니다.';
  }

  // 진단 태그 최빈값
  const tagCount = {};
  sorted.forEach(r => (r.diagnosis || []).forEach(d => { tagCount[d.key] = (tagCount[d.key] || 0) + 1; }));
  const tagEntries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  const topTag = tagEntries[0];

  // 시험 평균/추세
  const testReports = sorted.filter(r => r.hasTest && r.testScore);
  const testAvg = testReports.length ? avgOf(testReports, 'testScore') : null;
  const testTrend = testReports.length >= 2
    ? Number(testReports[testReports.length - 1].testScore) - Number(testReports[0].testScore)
    : null;

  // 강점/보완 bullet
  const strengths = [];
  const weaknesses = [];
  if (overallHw >= 80) strengths.push(`과제 수행 평균 ${Math.round(overallHw)}% — 꾸준히 성실하게 임하고 있습니다.`);
  if (overallCc >= 80) strengths.push(`개념 이해 평균 ${Math.round(overallCc)}% — 새 단원 적응력이 좋습니다.`);
  if (tagEntries.find(([k]) => k === 'perfect')) strengths.push(`'개념 완벽' 진단이 ${tagCount.perfect}회 기록됐습니다.`);
  if (testTrend !== null && testTrend > 0) strengths.push(`시험 점수가 최근 ${testTrend > 0 ? '+' : ''}${testTrend}점 상승했습니다.`);

  if (topTag && topTag[0] !== 'perfect') weaknesses.push(`'${TAG_LABELS[topTag[0]]}' 패턴이 ${topTag[1]}회로 가장 빈번합니다 — 이 부분 집중 보강을 권장합니다.`);
  if (overallHw < 70 && overallHw > 0) weaknesses.push(`과제 수행 평균이 ${Math.round(overallHw)}%로 다소 낮습니다.`);
  if (overallCc < 70 && overallCc > 0) weaknesses.push(`개념 이해 평균이 ${Math.round(overallCc)}%로 보강이 필요합니다.`);

  // 한 줄 종합 요약
  let summary = `최근 ${sorted.length}회 리포트 기준, 과제 평균 ${Math.round(overallHw)}% · 개념 평균 ${Math.round(overallCc)}%입니다.`;
  if (testAvg !== null) summary += ` 시험 평균은 ${Math.round(testAvg)}점입니다.`;
  if (trendText) summary += ` ${trendText}`;

  return { summary, strengths, weaknesses, testAvg, testTrend, sampleSize: sorted.length };
}

// ── 인사이트 요약 카드 — AnalysisView 전용
function InsightCard({ reports }) {
  const insight = buildInsights(reports);
  if (!insight) return null;
  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>📊 인사이트 요약</h3>
      <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#1A1A1A', margin: '0 0 12px', fontWeight: 500 }}>{insight.summary}</p>

      {insight.strengths.length > 0 && (
        <div style={{ background: '#E1F5EE', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F6E56', margin: '0 0 6px' }}>✅ 강점</p>
          {insight.strengths.map((s, i) => (
            <p key={i} style={{ fontSize: '12px', color: '#085041', margin: i > 0 ? '4px 0 0' : 0, lineHeight: 1.5 }}>{s}</p>
          ))}
        </div>
      )}
      {insight.weaknesses.length > 0 && (
        <div style={{ background: '#FAEEDA', borderRadius: '10px', padding: '10px 12px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#854F0B', margin: '0 0 6px' }}>🔧 보완 포인트</p>
          {insight.weaknesses.map((s, i) => (
            <p key={i} style={{ fontSize: '12px', color: '#633806', margin: i > 0 ? '4px 0 0' : 0, lineHeight: 1.5 }}>{s}</p>
          ))}
        </div>
      )}
      {insight.sampleSize < 4 && (
        <p style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '8px' }}>* 리포트가 더 쌓이면(4건 이상) 추세 분석이 추가됩니다.</p>
      )}
    </div>
  );
}

export default function AnalysisView({ students, reports }) {
  const [selectedId, setSelectedId] = useState('');
  const studentReports = reports.filter(r => r.studentId === selectedId);
  const avg = (key) => studentReports.length ? Math.round(studentReports.reduce((a, r) => a + (r[key] || 0), 0) / studentReports.length * 10) / 10 : 0;

  // ── 기간 설정 (월간 고정 버튼 + 커스텀 기간) ──
  const [periodMode, setPeriodMode] = useState('all'); // all | thisMonth | lastMonth | custom
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const getPeriodRange = () => {
    const now = new Date();
    if (periodMode === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { start, end, label: `${now.getFullYear()}년 ${now.getMonth() + 1}월` };
    }
    if (periodMode === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end, label: `${start.getFullYear()}년 ${start.getMonth() + 1}월` };
    }
    if (periodMode === 'custom' && customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd + 'T23:59:59');
      return { start, end, label: `${customStart} ~ ${customEnd}` };
    }
    return { start: null, end: null, label: '전체 기간' };
  };
  const { start: periodStart, end: periodEnd, label: periodLabel } = getPeriodRange();

  const periodReports = (periodStart && periodEnd)
    ? studentReports.filter(r => {
        const ts = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : 0;
        return ts >= periodStart.getTime() && ts <= periodEnd.getTime();
      })
    : studentReports;

  const periodAvg = (key) => {
    const rated = periodReports.filter(r => r[key] != null);
    return rated.length ? Math.round(rated.reduce((a, r) => a + toPct(r[key]), 0) / rated.length) : 0;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', boxSizing: 'border-box' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>종합 분석</h2>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: `1px solid #E5E7EB`, marginBottom: '16px' }}>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '16px', fontWeight: 500, border: `1px solid #E5E7EB`, borderRadius: '10px', background: '#F9FAFB', outline: 'none', fontFamily: 'inherit' }}>
          <option value="">학생을 선택하세요</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.school}</option>)}
        </select>
      </div>
      {selectedId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 기간 선택 */}
          <div style={{ background: '#fff', borderRadius: '16px', padding: '14px 16px', border: `1px solid #E5E7EB` }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: periodMode === 'custom' ? '10px' : 0 }}>
              {[['all', '전체'], ['thisMonth', '이번달'], ['lastMonth', '지난달'], ['custom', '기간 지정']].map(([key, label]) => (
                <button key={key} onClick={() => setPeriodMode(key)}
                  style={{
                    padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
                    border: periodMode === key ? `1.5px solid ${C.info}` : '1px solid #E5E7EB',
                    background: periodMode === key ? C.infoBg : '#fff',
                    color: periodMode === key ? C.infoDark : '#6B7280',
                  }}>{label}</button>
              ))}
            </div>
            {periodMode === 'custom' && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }} />
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>~</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }} />
              </div>
            )}
          </div>

          {periodReports.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '32px 16px', border: '1px solid #E5E7EB', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              {periodLabel}에 기록된 리포트가 없습니다
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <StatCard label={`리포트 (${periodLabel})`} value={periodReports.length} unit="건" />
                <StatCard label="과제 평균" value={periodAvg('homeworkRating')} unit="%" />
                <StatCard label="개념 평균" value={periodAvg('conceptRating')} unit="%" />
                <StatCard label="정시 출석" value={Math.round(periodReports.filter(r => r.attendance === '정시').length / periodReports.length * 100)} unit="%" />
              </div>
              <HomeworkTestChart reports={periodReports} />
              <InsightCard reports={periodReports} />
            </>
          )}

          {/* 단원별 오답 + 진단 태그 — 2단 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

            {/* 단원별 정답률 */}
            {(() => {
              const TARGET = 80;
              const unitMap = {};
              periodReports.forEach(r => {
                const label = [r.unit, r.textbook].filter(Boolean).join(' ');
                if (!label) return;
                // unitKey(표준 단원 정규화) 우선 그룹핑 — 강사마다 표기가 달라도 같은 단원이면 하나로 묶임
                const key = r.unitKey || findUnitKey(r.subject || '수학', r.unit || '') || label;
                if (!unitMap[key]) unitMap[key] = { name: label, correct: 0, total: 0 };
                if (r.hasTest && r.testScore) {
                  unitMap[key].correct += Number(r.testScore);
                  unitMap[key].total += 100;
                }
              });
              const units = Object.values(unitMap)
                .filter(u => u.total > 0)
                .map(u => ({ ...u, pct: Math.round(u.correct / u.total * 100) }))
                .sort((a, b) => a.pct - b.pct);
              if (units.length === 0) return null;
              return (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E5E7EB' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>단원별 정답률</p>
                    <span style={{ fontSize: '9px', color: '#9CA3AF' }}>목표 {TARGET}%</span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${TARGET}%`, width: '1px', background: C.primary, opacity: 0.12 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {units.map((u, i) => {
                        const isWorst = i === 0;
                        const barColor = isWorst ? C.error : C.primary;
                        return (
                          <div key={u.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '11px', color: '#1A1A1A', fontWeight: isWorst ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{u.name}</span>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: barColor, flexShrink: 0 }}>{u.pct}%{u.pct >= TARGET ? ' ✓' : ''}</span>
                            </div>
                            <div style={{ height: '6px', background: isWorst ? C.errorBg : '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${u.pct}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
                            </div>
                            {isWorst && <span style={{ fontSize: '9px', color: C.errorDark, fontWeight: 700 }}>즉시 점검</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 오답 유형 */}
            {(() => {
              const DIAG_COLORS = DIAG_SOFT_COLORS;

              // 오답 유형별 집계 + 단원 매핑 — unitKey 기준으로 그룹핑, 표시는 라벨 텍스트 사용
              const diagMap = {};
              periodReports.forEach(r => {
                const unitLabel = [r.unit, r.textbook].filter(Boolean).join(' ') || '';
                const unitGroupKey = unitLabel ? (r.unitKey || findUnitKey(r.subject || '수학', r.unit || '') || unitLabel) : '';
                (r.diagnosis || []).forEach(d => {
                  if (!diagMap[d.key]) diagMap[d.key] = { count: 0, units: {} };
                  diagMap[d.key].count++;
                  if (unitGroupKey) {
                    if (!diagMap[d.key].units[unitGroupKey]) diagMap[d.key].units[unitGroupKey] = { label: unitLabel, count: 0 };
                    diagMap[d.key].units[unitGroupKey].count++;
                  }
                });
              });

              const diagList = Object.entries(diagMap)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 4);
              const maxCount = diagList[0]?.[1].count || 1;
              if (diagList.length === 0) return null;

              return (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 12px' }}>반복 오답 유형</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {diagList.map(([key, val], i) => {
                      const info = DIAG_COLORS[key] || { label: key, color: '#4A4A4A' };
                      // 단원별 TOP 2
                      const topUnits = Object.entries(val.units)
                        .sort((a, b) => b[1].count - a[1].count)
                        .slice(0, 2);
                      return (
                        <div key={key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: info.color, color: '#fff', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                              <span style={{ fontSize: '11px', color: '#1A1A1A', fontWeight: 600 }}>{info.label}</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{val.count}회</span>
                          </div>
                          <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                            <div style={{ width: `${Math.round(val.count / maxCount * 100)}%`, height: '100%', background: info.color, borderRadius: '3px' }} />
                          </div>
                          {/* 단원 서브 태그 */}
                          {topUnits.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {topUnits.map(([uKey, uVal]) => (
                                <span key={uKey} style={{
                                  fontSize: '9px', padding: '2px 7px', borderRadius: '10px',
                                  background: `${info.color}12`,
                                  border: `0.5px solid ${info.color}40`,
                                  color: info.color, fontWeight: 600,
                                }}>{uVal.label} {uVal.count}회</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
