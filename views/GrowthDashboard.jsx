import React from 'react';
import { toPct } from '../growth.js';
import { DIAG_BADGE as DIAG_MAP, DIAG_LABELS as diagLabels } from '../diagnosis.js';
import { useMediaQuery } from '../hooks.js';

export default function GrowthDashboard({ reports, students }) {
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const [period, setPeriod] = React.useState('week');
  const [sortMode, setSortMode] = React.useState('decline');
  const [selId, setSelId] = React.useState(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [tooltip, setTooltip] = React.useState(null);
  const [storyPeriod, setStoryPeriod] = React.useState('all'); // 성장 스토리 열기 전 선택하는 기간
  const svgRef = React.useRef(null);

  const PERIODS = { week: 7, '2week': 14, month: 30, '3month': 90 };

  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로,
  // 이 컴포넌트 내 모든 계산이 일관되도록 조회 시점에 0~100(%) 기준으로 정규화한다.
  const getStudentReports = React.useCallback((studentId) => {
    const cutoff = Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000;
    return reports
      .filter(r => r.studentId === studentId && r.createdAt?.seconds * 1000 >= cutoff && r.conceptRating != null)
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
      // homeworkRating은 null(미입력)일 수 있는데 toPct(null)이 0을 돌려줘서 그대로 쓰면
      // "과제 0%"로 확정 표시되던 문제 — null은 그대로 보존
      .map(r => ({ ...r, conceptRating: toPct(r.conceptRating), homeworkRating: r.homeworkRating == null ? null : toPct(r.homeworkRating) }));
  }, [reports, period]);

  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;

  const getDecline = React.useCallback((sid) => {
    const rs = getStudentReports(sid);
    if (rs.length < 2) return null;
    return Math.round((rs[rs.length - 1].conceptRating - rs[0].conceptRating) * 10) / 10;
  }, [getStudentReports]);

  const getTrend = React.useCallback((sid) => {
    const rs = getStudentReports(sid);
    if (rs.length < 2) return null;
    return Math.round((rs[rs.length - 1].conceptRating - rs[rs.length - 2].conceptRating) * 10) / 10;
  }, [getStudentReports]);

  const getAvg = React.useCallback((sid) => avg(getStudentReports(sid).map(r => r.conceptRating)), [getStudentReports]);

  const getStatus = React.useCallback((sid) => {
    const rs = getStudentReports(sid);
    if (!rs.length) return { label: '데이터없음', color: '#6B7785', bg: '#F3F4F6', border: '#E5E7EB' };
    const a = avg(rs.map(r => r.conceptRating));
    const trend3 = rs.length >= 3 ? rs[rs.length - 1].conceptRating - rs[rs.length - 3].conceptRating
      : rs.length >= 2 ? rs[rs.length - 1].conceptRating - rs[rs.length - 2].conceptRating : 0;
    if (a >= 80 && trend3 >= 0) return { label: '안정', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' };
    if (trend3 <= -20 || a < 50) return { label: '경고', color: '#A32D2D', bg: '#FCEBEB', border: '#A32D2D' };
    if (trend3 < 0 || a < 70) return { label: '주의', color: '#8A5A00', bg: '#FAEEDA', border: '#EF9F27' };
    return { label: '안정', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' };
  }, [getStudentReports]);

  // 탭 전환 시 완전 초기화
  const handlePeriod = (p) => { setPeriod(p); setSelId(null); setDrawerOpen(false); };

  // 정렬 — 화면 표시(getTrend)와 정렬 기준 통일 + null → 맨 뒤
  const sortedStudents = React.useMemo(() => {
    const list = [...students];
    if (sortMode === 'decline') {
      return list.sort((a, b) => {
        const da = getTrend(a.id), db = getTrend(b.id);
        if (da === null && db === null) return 0;
        if (da === null) return 1;   // 데이터 없음 → 맨 뒤
        if (db === null) return -1;
        return da - db; // 하락 폭 큰 순 (음수가 클수록 위)
      });
    }
    if (sortMode === 'score') return list.sort((a, b) => getAvg(b.id) - getAvg(a.id));
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [students, period, sortMode, getTrend, getAvg]);

  // 전체 평균 데이터 포인트 생성
  const globalPoints = React.useMemo(() => {
    const allRs = reports.filter(r => {
      const cutoff = Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000;
      return r.createdAt?.seconds * 1000 >= cutoff && r.conceptRating != null;
    }).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    if (!allRs.length) return [];
    // 날짜별 그룹
    const byDay = {};
    allRs.forEach(r => {
      const d = new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR');
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(toPct(r.conceptRating));
    });
    return Object.entries(byDay).map(([date, vals]) => ({ date, avg: avg(vals) }));
  }, [reports, period]);

  // 기간 날짜 계산
  const periodLabel = React.useMemo(() => {
    const end = new Date();
    const start = new Date(Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000);
    const fmt = (d) => `${d.getMonth()+1}/${d.getDate()}`;
    return `${fmt(start)} ~ ${fmt(end)}`;
  }, [period]);
  const W = 540, H = 110, PL = 26, PR = 14, PT = 8, PB = 20;
  const cW = W - PL - PR, cH = H - PT - PB;

  const toXY = (i, v, len) => [
    PL + (i / Math.max(len - 1, 1)) * cW,
    PT + cH - (v / 100) * cH
  ];

  const selStudentRs = selId ? getStudentReports(selId) : [];
  const selStatus = selId ? getStatus(selId) : null;

  const atRisk = students.filter(s => getStatus(s.id).label === '경고').length;
  const caution = students.filter(s => getStatus(s.id).label === '주의').length;
  const overallAvg = avg(students.map(s => getAvg(s.id)).filter(v => v > 0));
  const bestStudent = students.length ? students.reduce((b, s) => getAvg(s.id) > getAvg(b.id) ? s : b) : null;

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* TOP 위젯 + 기간 필터 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', flex: 1, minWidth: '280px' }}>
          {[
            { label: '🚨 관심 필요', value: `${atRisk}명`, sub: `주의 ${caution}명 포함`, c: '#A32D2D', bg: '#FCEBEB', bd: '#A32D2D' },
            { label: '전체 평균', value: `${overallAvg}%`, sub: periodLabel, c: '#0D2D6B', bg: '#fff', bd: '#E8E6E0' },
            { label: '총 학생', value: `${students.length}명`, sub: '등록', c: '#1A1A1A', bg: '#fff', bd: '#E8E6E0' },
            { label: '최고 성취', value: bestStudent?.name || '-', sub: `${bestStudent ? getAvg(bestStudent.id) : 0}%`, c: bestStudent ? getStatus(bestStudent.id).color : '#6B7785', bg: '#fff', bd: '#E8E6E0' },
          ].map((w, i) => (
            <div key={i} style={{ background: w.bg, border: `1px solid ${w.bd}`, borderRadius: '10px', padding: '10px 12px' }}>
              <p style={{ fontSize: '10px', color: w.c, margin: '0 0 3px', fontWeight: 700 }}>{w.label}</p>
              <p style={{ fontSize: '18px', fontWeight: 800, color: w.c, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{w.value}</p>
              <p style={{ fontSize: '10px', color: '#6B7785', margin: '3px 0 0' }}>{w.sub}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
          {[['week','1주'],['2week','2주'],['month','1개월'],['3month','3개월']].map(([k, l]) => (
            <button key={k} onClick={() => handlePeriod(k)} style={{
              padding: '5px 11px', fontSize: '11px', borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${period === k ? '#0D2D6B' : '#E8E6E0'}`,
              background: period === k ? '#0D2D6B' : '#fff',
              color: period === k ? '#fff' : '#6B7280',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* 메인 그래프 — 전체 평균 단일선 */}
      <div style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>학급 평균 추이</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '18px', height: '2.5px', background: '#0D2D6B', borderRadius: '2px' }} />
            <span style={{ fontSize: '10px', color: '#6B7785' }}>전체 평균</span>
          </div>
          {selId && selStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={selStatus.color} strokeWidth="2" strokeDasharray="4,2" /></svg>
              <span style={{ fontSize: '10px', color: '#6B7785' }}>{students.find(s => s.id === selId)?.name}</span>
            </div>
          )}
          {!selId && <p style={{ fontSize: '10px', color: '#6B7785', margin: 0 }}>학생 클릭 시 비교선 추가</p>}
        </div>
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
            {[0,25,50,75,100].map(v => {
              const y = PT + cH - (v/100) * cH;
              return (
                <g key={v}>
                  <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#E8E6E0" strokeWidth="0.5" strokeDasharray="3,4" />
                  <text x={PL-4} y={y+4} fontSize="9" fill="#6B7785" textAnchor="end">{v}</text>
                </g>
              );
            })}
            {/* 전체 평균선 */}
            {globalPoints.length >= 2 && (
              <>
                <polyline
                  points={globalPoints.map((p, i) => toXY(i, p.avg, globalPoints.length).join(',')).join(' ')}
                  fill="none" stroke="#0D2D6B" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                />
                {globalPoints.map((p, i) => {
                  const [x, y] = toXY(i, p.avg, globalPoints.length);
                  return (
                    <circle key={i} cx={x} cy={y} r={i === globalPoints.length - 1 ? 4.5 : 8}
                      fill={i === globalPoints.length - 1 ? '#0D2D6B' : 'transparent'}
                      stroke="none"
                      onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: `${p.date} · 평균 ${p.avg}%` })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'crosshair' }}
                    />
                  );
                })}
                {(() => {
                  const last = globalPoints[globalPoints.length - 1];
                  const [lx, ly] = toXY(globalPoints.length - 1, last.avg, globalPoints.length);
                  return <text x={lx+7} y={ly+4} fontSize="10" fontWeight="700" fill="#0D2D6B">{last.avg}</text>;
                })()}
              </>
            )}
            {/* 선택 학생 비교선 */}
            {selId && selStudentRs.length >= 2 && selStatus && (() => {
              const pts = selStudentRs.map((r, i) => toXY(i, r.conceptRating, selStudentRs.length));
              const last = pts[pts.length - 1];
              return (
                <>
                  <polyline points={pts.map(p => p.join(',')).join(' ')}
                    fill="none" stroke={selStatus.color} strokeWidth="2" strokeDasharray="6,3"
                    strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={last[0]} cy={last[1]} r="4" fill={selStatus.color} />
                  <text x={last[0]+7} y={last[1]+4} fontSize="10" fontWeight="700" fill={selStatus.color}>
                    {selStudentRs[selStudentRs.length-1].conceptRating}
                  </text>
                </>
              );
            })()}
          </svg>
          {globalPoints.length === 0 && (
            <p style={{ textAlign: 'center', color: '#6B7785', fontSize: '12px', padding: '20px 0' }}>이 기간에 기록된 수업이 없습니다</p>
          )}
        </div>
      </div>

      {/* 정렬 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <p style={{ fontSize: '11px', color: '#6B7785', margin: 0 }}>정렬:</p>
        {[['decline','하락 폭 큰 순'],['score','점수 높은 순'],['name','이름순']].map(([m, l]) => (
          <button key={m} onClick={() => setSortMode(m)} style={{
            padding: '4px 10px', fontSize: '11px', borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
            border: `1.5px solid ${sortMode === m ? '#0D2D6B' : '#E8E6E0'}`,
            background: sortMode === m ? '#0D2D6B' : '#fff',
            color: sortMode === m ? '#fff' : '#6B7280',
          }}>{l}</button>
        ))}
      </div>

      {/* 학생 리스트 */}
      <div style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 50px 60px 55px' : '1fr 65px 80px 70px 55px', padding: '8px 14px', borderBottom: '0.5px solid #E8E6E0', background: '#FAFAFA' }}>
          {(isMobile ? ['학생', '현재', '변화량', '상태'] : ['학생', '현재', '변화량', '추이', '상태']).map((h, i) => (
            <p key={i} style={{ fontSize: '10px', color: '#6B7785', margin: 0, textAlign: i === 0 ? 'left' : 'center', letterSpacing: '0.06em' }}>{h}</p>
          ))}
        </div>
        {sortedStudents.map(s => {
          const rs = getStudentReports(s.id);
          const a = getAvg(s.id);
          const trend = getTrend(s.id);
          const decline = getDecline(s.id);
          const status = getStatus(s.id);
          const isSel = selId === s.id;

          const trendStr = trend === null ? '―' : trend > 0 ? `▲${Math.abs(trend)}` : trend < 0 ? `▼${Math.abs(trend)}` : '―';
          const trendColor = trend === null ? '#6B7785' : trend > 0 ? '#0F6E56' : trend < 0 ? '#A32D2D' : '#6B7785';

          // 스파크라인 — 상태 컬러 사용
          const sparkW = 56, sparkH = 22;
          const sparkPts = rs.map((r, i) => [
            4 + (i / Math.max(rs.length - 1, 1)) * (sparkW - 8),
            sparkH - 2 - (r.conceptRating / 100) * (sparkH - 6)
          ]);
          const sparkPath = sparkPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');

          // 주요 약점 태그
          const diagCount = {};
          rs.forEach(r => (r.diagnosis || []).forEach(d => {
            if (d.key !== 'perfect') diagCount[d.key] = (diagCount[d.key] || 0) + 1;
          }));
          const topWeak = Object.entries(diagCount).sort((a, b) => b[1] - a[1])[0];

          return (
            <div key={s.id}
              onClick={() => { setSelId(isSel ? null : s.id); setDrawerOpen(!isSel); }}
              style={{
                display: 'grid', gridTemplateColumns: isMobile ? '1fr 50px 60px 55px' : '1fr 65px 80px 70px 55px',
                padding: '10px 14px', borderBottom: '0.5px solid #F3F4F6', cursor: 'pointer',
                background: isSel ? '#EAF0F9' : '#fff', transition: 'background 0.12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status.border, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: isSel ? 700 : 400, color: '#1A1A1A' }}>{s.name}</span>
                {topWeak && (
                  <span style={{ fontSize: '10px', color: '#A32D2D', background: '#FCEBEB', padding: '1px 6px', borderRadius: '10px' }}>⚠</span>
                )}
              </div>
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: status.color, fontVariantNumeric: 'tabular-nums' }}>{a || '-'}</span>
              </div>
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: trendColor }}>{trendStr}</span>
              </div>
              {!isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {rs.length >= 2 ? (
                    <svg viewBox={`0 0 ${sparkW} ${sparkH}`} width={sparkW} height={sparkH} style={{ overflow: 'visible' }}>
                      <path d={sparkPath} fill="none" stroke={status.color} strokeWidth="1.8"
                        strokeLinejoin="round" strokeLinecap="round" />
                      {sparkPts.length > 0 && (
                        <circle cx={sparkPts[sparkPts.length-1][0]} cy={sparkPts[sparkPts.length-1][1]}
                          r="2.5" fill={status.color} />
                      )}
                    </svg>
                  ) : (
                    <span style={{ fontSize: '10px', color: '#6B7785' }}>데이터 없음</span>
                  )}
                </div>
              )}
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: status.color, background: status.bg, padding: '3px 8px', borderRadius: '20px', border: `1px solid ${status.border}` }}>
                  {status.label}
                </span>
              </div>
            </div>
          );
        })}
        {sortedStudents.length === 0 && (
          <p style={{ textAlign: 'center', color: '#6B7785', fontSize: '12px', padding: '32px 0' }}>등록된 학생이 없습니다</p>
        )}
      </div>

      {/* 사이드 드로어 */}
      {drawerOpen && selId && (() => {
        const s = students.find(x => x.id === selId);
        const rsAll = getStudentReports(selId);
        const rs = rsAll.slice(-10); // 최대 10개
        const status = getStatus(selId);
        const a = getAvg(selId);
        const trend = getTrend(selId);
        const trendStr = trend === null ? '―' : trend > 0 ? `▲${Math.abs(trend)}` : trend < 0 ? `▼${Math.abs(trend)}` : '―';
        const trendColor = trend === null ? '#6B7785' : trend > 0 ? '#0F6E56' : trend < 0 ? '#A32D2D' : '#6B7785';

        // 예전엔 "보기(공개 페이지)"/"편집" 버튼 2개로 나뉘어 있었는데, 사실 같은 페이지에
        // ?edit=1 하나 차이 — 편집 모드가 보기 모드를 완전히 포함하고(학부모에게는 원래도
        // ?edit=1이 안 보임), 학부모용 링크는 페이지 안 "링크 복사" 버튼이 항상 순수 URL을
        // 주기 때문에 굳이 나눌 이유가 없었음. 분양학원처럼 맥락 모르는 사용자에게 헷갈리는
        // 원인이라 하나로 통합.
        const openGrowthStory = () => {
          const query = storyPeriod === '3m' ? '&period=3m' : '';
          window.open(`/story/${s?.id}?edit=1${query}`, '_blank');
        };

        const closeDrawer = () => { setDrawerOpen(false); setSelId(null); setStoryPeriod('all'); };

        return (
          <>
            <div onClick={closeDrawer} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 199,
            }} />
            <div style={isMobile
              ? {
                  position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '85vh', width: '100%',
                  background: '#fff', borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
                  padding: '18px', paddingBottom: 'calc(18px + env(safe-area-inset-bottom))', overflowY: 'auto', zIndex: 200,
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
                }
              : {
                  position: 'fixed', top: 0, right: 0, bottom: 0, width: '290px',
                  background: '#fff', borderLeft: '0.5px solid #E8E6E0',
                  padding: '18px', overflowY: 'auto', zIndex: 200,
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                  boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
                }
            }>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{s?.name}</p>
              <button onClick={closeDrawer}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7785', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
            </div>

            {/* 상태 배지 */}
            <div style={{ background: status.bg, border: `1px solid ${status.border}`, borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: status.color }}>● {status.label}</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: status.color, fontVariantNumeric: 'tabular-nums' }}>
                {a}% <span style={{ fontSize: '12px', color: trendColor }}>{trendStr}</span>
              </span>
            </div>

            {/* 미니 바차트 + 진단 태그 연결 */}
            {/* 날짜별 수업 카드 */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {rs.slice().reverse().slice(0, 4).map((r, i) => {
                  const tags = (r.diagnosis || []).filter(d => d.key !== 'perfect');
                  const hasPerfect = (r.diagnosis || []).some(d => d.key === 'perfect');
                  const isWarning = r.conceptRating != null && r.conceptRating <= 40;
                  const dateStr = r.createdAt?.seconds
                    ? `${new Date(r.createdAt.seconds*1000).getMonth()+1}/${new Date(r.createdAt.seconds*1000).getDate()}`
                    : '';
                  const rawNote = r.teacherNote || '';
                  const cleanNote = rawNote.replace(/\[([^\]]+)\]\s*/g, '').trim();

                  return (
                    <div key={i} style={{
                      background: '#FAFAF8', border: '0.5px solid #E5E7EB', borderRadius: '8px', padding: '8px 10px',
                      borderLeft: isWarning ? '2px solid #DC2626' : hasPerfect ? '2px solid #0F6E56' : '2px solid transparent',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>{dateStr}</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {r.homeworkRating != null && <span style={{ fontSize: '10px', color: '#6B7280' }}>과제 <strong style={{ color: '#0D2D6B' }}>{r.homeworkRating}%</strong></span>}
                          {r.conceptRating != null && <span style={{ fontSize: '10px', color: '#6B7280' }}>개념 <strong style={{ color: '#0D2D6B' }}>{r.conceptRating}%</strong></span>}
                          {r.hasTest && r.testScore && <span style={{ fontSize: '10px', color: '#C9A227', fontWeight: 700 }}>시험 {r.testScore}점</span>}
                        </div>
                      </div>
                      {(r.textbook || r.unit) && (
                        <p style={{ fontSize: '10px', color: '#6C7586', margin: '0 0 4px' }}>
                          {[r.textbook, r.unit].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {(tags.length > 0 || hasPerfect) && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: cleanNote ? '4px' : 0 }}>
                          {hasPerfect && <span style={{ fontSize: '10px', background: '#F0FAF5', color: '#0F6E56', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>개념 완벽</span>}
                          {tags.map((d, ti) => (
                            <span key={ti} style={{ fontSize: '10px', background: '#FDF0F0', color: '#8A2020', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
                              {diagLabels[d.key] || d.key}
                            </span>
                          ))}
                        </div>
                      )}
                      {cleanNote && (
                        <p style={{ fontSize: '10px', color: '#6B7280', margin: 0, fontStyle: 'italic' }}>
                          "{cleanNote.length > 40 ? cleanNote.slice(0, 40) + '...' : cleanNote}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 성장 스토리 진입 — 기간 선택 후 학부모 공개 페이지로 이동 */}
            <div>
              <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
                {[['all', '전체'], ['3m', '최근 3개월']].map(([key, label]) => (
                  <button key={key} onClick={() => setStoryPeriod(key)}
                    style={{
                      flex: 1, padding: '6px 8px', fontSize: '11px', fontWeight: 700, borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit',
                      border: storyPeriod === key ? '1.5px solid #185FA5' : '1px solid #E5E7EB',
                      background: storyPeriod === key ? '#E6F1FB' : '#fff',
                      color: storyPeriod === key ? '#185FA5' : '#6B7280',
                    }}>{label}</button>
                ))}
              </div>
              <button onClick={openGrowthStory} style={{
                width: '100%', padding: '10px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '8px',
                border: 'none', background: 'linear-gradient(135deg, #185FA5, #0C447C)', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>📈 성장 스토리 보기·편집</button>
            </div>
          </div>
          </>
        );
      })()}

      {/* 툴팁 */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 32,
          background: '#1A1A1A', color: '#fff', fontSize: '11px', padding: '5px 9px',
          borderRadius: '6px', pointerEvents: 'none', zIndex: 300, fontFamily: 'inherit',
        }}>{tooltip.text}</div>
      )}
    </div>
  );
}
