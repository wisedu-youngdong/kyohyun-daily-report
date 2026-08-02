import React from 'react';
import { toPct } from '../growth.js';
import { useMediaQuery } from '../hooks.js';
import { C } from '../tokens.jsx';
import { onKeyActivate } from './shared.jsx';
import { StudentDetailPanel } from './StudentProfileModal.jsx';

// period는 이제 DirectorView가 소유(재설계 1단계 — 기간 컨트롤 통합, 오늘/1주/1개월/3개월
// 세그먼트 하나가 이 컴포넌트를 렌더할지 말지까지 결정). 이 컴포넌트는 더 이상 자체 기간
// 토글을 그리지 않고 prop으로 받은 값만 따른다.
export default function GrowthDashboard({ reports, students, period, reviews, onToast, academyName, onEditReviewNote }) {
  // App.jsx의 isPc(900px)와 기준 통일 — 앱 전체에서 PC/모바일 판정 기준이 화면마다
  // 제각각(768 vs 900)이면 중간 폭에서 레이아웃이 서로 어긋나는 문제가 생기기 쉬움
  const isMobile = !useMediaQuery('(min-width: 900px)');
  const [sortMode, setSortMode] = React.useState('decline');
  const [selId, setSelId] = React.useState(null);
  const [tooltip, setTooltip] = React.useState(null);
  const svgRef = React.useRef(null);
  const tableRef = React.useRef(null);

  // 기간이 바뀌면(부모의 세그먼트 클릭) 이전 선택 학생은 초기화 — 예전엔 버튼 onClick
  // 안에서 직접 했는데, 이제 버튼 자체가 이 컴포넌트에 없어서 effect로 옮김
  React.useEffect(() => { setSelId(null); }, [period]);

  const PERIODS = { week: 7, month: 30, '3month': 90 };

  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로,
  // 이 컴포넌트 내 모든 계산이 일관되도록 조회 시점에 0~100(%) 기준으로 정규화한다.
  const getStudentReports = React.useCallback((studentId) => {
    const cutoff = Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000;
    return reports
      // 초안(isDraft)은 아직 발송 전 미완성 리포트라 성장 추이/평균에서 제외(AnalysisView와 동일 기준)
      .filter(r => r.studentId === studentId && !r.isDraft && r.createdAt?.seconds * 1000 >= cutoff && r.conceptRating != null)
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
    if (a >= 80 && trend3 >= 0) return { label: '안정', color: C.successDark, bg: C.successBg, border: C.successDark };
    if (trend3 <= -20 || a < 50) return { label: '경고', color: C.errorDark, bg: '#FCEBEB', border: C.errorDark };
    if (trend3 < 0 || a < 70) return { label: '주의', color: C.warningText, bg: '#FAEEDA', border: '#EF9F27' };
    return { label: '안정', color: C.successDark, bg: C.successBg, border: C.successDark };
  }, [getStudentReports]);

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

  // 지난 기간 대비 — "개념 이해 평균" KPI 부제용. 같은 길이의 직전 구간(예: 이번 주 대비 지난 주)
  // 평균과 비교한다. 직전 구간에 데이터가 아예 없으면(신규 학원 등) 0에서 급증한 것처럼 보이는
  // 허위 비교가 되므로 델타 자체를 안 보여준다(있는 척 안 함).
  const periodMs = PERIODS[period] * 24 * 60 * 60 * 1000;
  const getAvgInRange = (sid, startMs, endMs) => avg(
    reports
      .filter(r => r.studentId === sid && !r.isDraft && r.createdAt?.seconds * 1000 >= startMs && r.createdAt.seconds * 1000 < endMs && r.conceptRating != null)
      .map(r => toPct(r.conceptRating))
  );
  const prevOverallAvg = avg(students.map(s => getAvgInRange(s.id, Date.now() - periodMs * 2, Date.now() - periodMs)).filter(v => v > 0));
  const avgDelta = prevOverallAvg > 0 ? Math.round((overallAvg - prevOverallAvg) * 10) / 10 : null;

  return (
    // DirectorView와 같은 스크롤 안에 이어 붙어 렌더링되는 화면(App.jsx 원장분석 › 원장 보고서
    // 서브탭) — maxWidth가 DirectorView(880px)와 달라서 두 화면이 폭 다른 덩어리로 어긋나 보이던
    // 문제. DirectorView 쪽에 맞춤(반대가 아닌 이유: DirectorView가 먼저 렌더되는 주 화면)
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* TOP 위젯 — 기간 필터는 이제 DirectorView의 통합 세그먼트가 담당(더 이상 여기서 안 그림).
          재설계 3단계(KPI 정리): "최고 성취"는 클릭해도 아무 동작 없는 순수 정보 카드라 제거,
          "관심 필요"는 경고+주의 합으로(예전엔 경고만 세고 주의는 부제에만 있어서 실제 챙길
          인원수와 카드 숫자가 달랐음) 바꾸고 클릭하면 학생 표가 하락폭 큰 순으로 정렬되며
          스크롤됨, "전체 평균"은 무엇의 평균인지 불명확해 "개념 이해 평균"으로 개명하고
          지난 기간 대비 델타를 부제에 추가(과제 수행률은 안 섞임 — 실제로 개념만의 평균이므로) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '12px' }}>
        {[
          {
            label: '🚨 관심 필요', value: `${atRisk + caution}명`, sub: `경고 ${atRisk} · 주의 ${caution}`, c: C.errorDark, bg: '#FCEBEB', bd: C.errorDark,
            onClick: () => { setSortMode('decline'); tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
          },
          {
            label: '개념 이해 평균', value: `${overallAvg}%`,
            sub: avgDelta === null ? periodLabel : `지난 기간 ${prevOverallAvg}% · ${avgDelta > 0 ? '▲' : avgDelta < 0 ? '▼' : '—'}${Math.abs(avgDelta)}`,
            c: '#0D2D6B', bg: '#fff', bd: '#E8E6E0',
          },
          { label: '총 학생', value: `${students.length}명`, sub: '등록', c: '#1A1A1A', bg: '#fff', bd: '#E8E6E0' },
        ].map((w, i) => (
          <div key={i} onClick={w.onClick}
            style={{ background: w.bg, border: `1px solid ${w.bd}`, borderRadius: '10px', padding: '10px 12px', cursor: w.onClick ? 'pointer' : 'default' }}>
            <p style={{ fontSize: '10px', color: w.c, margin: '0 0 3px', fontWeight: 700 }}>{w.label}</p>
            <p style={{ fontSize: '18px', fontWeight: 800, color: w.c, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{w.value}</p>
            <p style={{ fontSize: '10px', color: '#6B7785', margin: '3px 0 0' }}>{w.sub}{w.onClick ? ' · 목록 보기' : ''}</p>
          </div>
        ))}
      </div>

      {/* 메인 그래프 — 전체 평균 단일선 */}
      <div style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '14px', padding: '14px', marginBottom: '10px' }}>
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
      <div ref={tableRef} style={{ background: '#fff', border: '0.5px solid #E8E6E0', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 50px 60px 55px' : '1fr 65px 80px 70px 55px', padding: '8px 14px', borderBottom: '0.5px solid #E8E6E0', background: '#FAFAFA' }}>
          {(isMobile ? ['학생', '현재', '변화량', '상태'] : ['학생', '현재', '변화량', '추이', '상태']).map((h, i) => (
            <p key={i} title={h === '변화량' ? '직전 수업 대비' : undefined}
              style={{ fontSize: '10px', color: '#6B7785', margin: 0, textAlign: i === 0 ? 'left' : 'center', letterSpacing: '0.06em', cursor: h === '변화량' ? 'help' : 'default' }}>{h}</p>
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
          const trendColor = trend === null ? '#6B7785' : trend > 0 ? C.successDark : trend < 0 ? C.errorDark : '#6B7785';

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
            <div key={s.id} role="button" tabIndex={0} aria-pressed={isSel}
              onClick={() => setSelId(isSel ? null : s.id)}
              onKeyDown={onKeyActivate(() => setSelId(isSel ? null : s.id))}
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
                  <span style={{ fontSize: '10px', color: C.errorDark, background: '#FCEBEB', padding: '1px 6px', borderRadius: '10px' }}>⚠</span>
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

      {/* 학생 상세 패널 — 재설계 4단계: 예전엔 여기 자체 미니 드로어가 있었는데, StudentsView/
          DirectorView가 쓰는 풀 기능 StudentProfileContent를 420px 오버레이에 그대로 담는
          공용 StudentDetailPanel로 교체(중복 UI 제거). 이전/다음 이동은 지금 정렬된 학생 표
          순서(sortedStudents)를 그대로 따른다. */}
      {selId && (
        <StudentDetailPanel
          studentList={sortedStudents}
          currentId={selId}
          onSelect={setSelId}
          onClose={() => setSelId(null)}
          reports={reports.filter(r => r.studentId === selId)}
          reviews={(reviews || []).filter(rv => rv.studentId === selId)}
          onToast={onToast}
          academyName={academyName}
          onEditReviewNote={onEditReviewNote}
          directorActions
          statusInfo={{ status: getStatus(selId), avg: getAvg(selId), trend: getTrend(selId) }}
        />
      )}

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
