import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { toPct, fmtPages } from '../growth.js';
import { findUnitKey, extractUnitNumbers } from '../curriculum.js';
import { DIAG_LABELS as diagLabels, DIAG_BADGE as DIAG_MAP, DIAG_SOFT } from '../diagnosis.js';
import { C } from '../tokens.jsx';
import { useEscapeClose } from '../hooks.js';

// ============================================================
// 학생 종합 프로필 — 내용 본체(모달 크롬 없음)
// PC 학생 관리의 마스터-디테일 오른쪽 패널에 그대로 인라인으로 꽂아 쓰기 위해 모달 오버레이/
// 뒤로가기 히스토리 처리와 분리해둠. onClose가 있으면(모바일 모달) ×버튼을 보여주고,
// 없으면(PC 인라인) 안 보여줌.
// ============================================================
export function StudentProfileContent({ student, reports, reviews = [], onClose, onToast, academyName }) {
  const [showWeekly, setShowWeekly] = useState(false);
  useEscapeClose(() => setShowWeekly(false), showWeekly);
  const [expandedWeak, setExpandedWeak] = useState(null); // 반복 약점 패턴 중 "자세히 보기"로 펼친 key
  // 캘린더가 기본으로 펼쳐져 있으면 그 아래 내용(수업 기록/약점 패턴 등) 보려고 매번 스크롤을 많이 해야 해서, 기본은 요약만 접어서 보여줌
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const last = [...reports].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
    const d = last?.createdAt?.seconds ? new Date(last.createdAt.seconds * 1000) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로 0~100(%) 기준으로 정규화
  // null(미입력)은 보존 — 평균 계산에서 제외해 미입력이 평균을 끌어내리지 않도록
  const sorted = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({ ...r, conceptRating: r.conceptRating == null ? null : toPct(r.conceptRating), homeworkRating: r.homeworkRating == null ? null : toPct(r.homeworkRating) }));

  const conceptRated = sorted.filter(r => r.conceptRating != null);
  const homeworkRated = sorted.filter(r => r.homeworkRating != null);
  const avgConcept = conceptRated.length ? Math.round(conceptRated.reduce((s, r) => s + r.conceptRating, 0) / conceptRated.length) : 0;
  const avgHomework = homeworkRated.length ? Math.round(homeworkRated.reduce((s, r) => s + r.homeworkRating, 0) / homeworkRated.length) : 0;
  const attendanceRated = sorted.filter(r => r.attendance != null);
  const attendanceRate = attendanceRated.length ? Math.round(attendanceRated.filter(r => r.attendance === '정시').length / attendanceRated.length * 100) : 0;

  // 진단 태그의 단원 입력칸(DiagnosticReportInput.jsx)은 "4"만 적어도 되고 "4단원"까지
  // 다 적어도 되는데, 기존 표시 관례(`${d.unit}단원`)가 무조건 "단원"을 덧붙이다 보니
  // 이미 "단원"까지 적은 태그는 "4단원단원"으로 겹쳐 보이던 버그. 순수 숫자만 "N단원"으로
  // 통일하고, 숫자가 아닌 서술형 입력("소수의 나눗셈" 등)은 원문 그대로 둔다.
  const normalizeTagUnit = (raw) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;
    const stripped = trimmed.replace(/단원$/, '').trim();
    return /^\d+$/.test(stripped) ? `${stripped}단원` : trimmed;
  };

  // 약점 집계 — 어느 교재/단원에서 반복됐는지도 함께 모아둠("자세히 보기"에서 펼쳐 보여줌).
  // 교재 언급이 없으면 "몇 학년 몇 학기"인지 알 수 없어 정보가 부족하다는 피드백으로
  // 리포트의 textbook을 라벨에 함께 붙임. 단원을 안 적었으면(과거 리포트 등) '단원 미기재'로 묶임.
  const diagCount = {};
  const diagUnitCount = {}; // { [key]: { [unitLabel]: count } }
  sorted.forEach(r => (r.diagnosis || []).forEach(d => {
    if (d.key === 'perfect') return;
    diagCount[d.key] = (diagCount[d.key] || 0) + 1;
    const normalizedUnit = normalizeTagUnit(d.unit);
    const unitLabel = normalizedUnit
      ? (r.textbook?.trim() ? `${r.textbook.trim()} · ${normalizedUnit}` : normalizedUnit)
      : '단원 미기재';
    if (!diagUnitCount[d.key]) diagUnitCount[d.key] = {};
    diagUnitCount[d.key][unitLabel] = (diagUnitCount[d.key][unitLabel] || 0) + 1;
  }));
  const weakTop3 = Object.entries(diagCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 최근 학습 단원 목록
  const unitHistory = [...new Set(sorted.map(r => [r.textbook, r.unit].filter(Boolean).join(' · ')).filter(Boolean))].slice(-5).reverse();

  // 단원별 이해도 히트맵 — unitKey(표준 단원 정규화)로 묶어 개념 이해 평균을 계산.
  // AnalysisView.jsx의 "단원별 정답률"은 시험 점수(hasTest)만 쓰지만, 시험이 매번 있는 게
  // 아니라 데이터가 성겨서(sparse) — 상담용 히트맵은 거의 매 리포트에 있는 conceptRating으로
  // 계산해 단원 커버리지를 넓힘.
  //
  // "2~3단원", "4단원,5단원"처럼 번호만 적고 이름은 안 적은 리포트는 findUnitKey가 이름
  // 기준이라 전혀 못 잡아서 원문 그대로 따로 쪼개지는 카드가 생겼음(예: "4단원,5단원" 카드가
  // "4단원"/"5단원" 카드와 별개로 존재). 번호가 뽑히면 언급된 단원 전부에 각각 반영 —
  // 그 시간에 실제로 다 다뤘을 테니 하나만 대표로 고르기보다 전부 반영하는 쪽을 택함.
  // 번호가 없는 순수 단원명 텍스트("소수의 나눗셈" 등)는 기존처럼 이름 기준 정규화 유지.
  const unitAccuracy = (() => {
    const map = {};
    sorted.forEach(r => {
      if (r.conceptRating == null) return;
      const label = [r.textbook, r.unit].filter(Boolean).join(' · ');
      // 이름 매칭을 먼저 시도 — "3단원 소수의 나눗셈"처럼 번호+이름이 같이 있어도 이름으로
      // 정상 매칭되는 케이스가 숫자 경로에 가로채여 별도 카드로 갈라지는 것을 방지
      // (extractUnitNumbers 주석이 원래 의도한 순서: 이름 매칭 실패할 때만 번호 경로)
      const nameKey = r.unitKey || findUnitKey(r.subject || '수학', r.unit || '');
      if (nameKey) {
        if (!label) return;
        if (!map[nameKey]) map[nameKey] = { name: label, sum: 0, count: 0 };
        map[nameKey].sum += r.conceptRating;
        map[nameKey].count += 1;
        return;
      }
      const unitNumbers = extractUnitNumbers(r.unit || '');
      if (unitNumbers.length > 0) {
        unitNumbers.forEach(num => {
          const key = `num|${r.subject || '수학'}|${r.textbook || ''}|${num}`;
          const name = `${r.textbook ? r.textbook + ' · ' : ''}${num}단원`;
          if (!map[key]) map[key] = { name, sum: 0, count: 0 };
          map[key].sum += r.conceptRating;
          map[key].count += 1;
        });
        return;
      }
      if (!label) return;
      if (!map[label]) map[label] = { name: label, sum: 0, count: 0 };
      map[label].sum += r.conceptRating;
      map[label].count += 1;
    });
    return Object.values(map)
      .map(u => ({ ...u, pct: Math.round(u.sum / u.count) }))
      .sort((a, b) => a.pct - b.pct);
  })();
  const heatTier = (pct) => pct >= 80
    ? { bg: C.successBg, color: C.successDark, border: `${C.successDark}30` }
    : pct >= 60
      ? { bg: C.warningBg, color: C.warningText, border: `${C.accent}30` }
      : { bg: '#FDF0F0', color: '#A32D2D', border: '#A32D2D30' };

  // 완료된 복습 이력 — 최신순. "완료" 자체보다 그때 실제로 뭘 했는지(note/testScore)를 보여주는 게 목적
  const completedReviews = [...reviews]
    .filter(rv => rv.status === 'done')
    .sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));

  const fmtDate = (r) => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    : '';

  return (
    <div style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

        {/* 헤더 — onClose가 있을 때만(모바일 모달) ×버튼 표시. PC 인라인 패널에선 안 보임 */}
        <div style={{ background: '#0D2D6B', padding: '18px 22px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '4px', height: '18px', background: '#C9A227', borderRadius: '0', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em' }}>{academyName || '데일리 리포트 시스템'} · 학생 종합 프로필</span>
          </div>
          <p style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{student.name}</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', margin: 0 }}>총 {sorted.length}회 수업 누적</p>
          {onClose && (
            <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '18px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '22px', cursor: 'pointer', lineHeight: 1, width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
          )}
        </div>

        <div style={{ padding: '20px 22px' }}>

          {/* 핵심 지표 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: '개념 이해 평균', value: `${avgConcept}%`, color: avgConcept >= 80 ? C.successDark : avgConcept >= 60 ? C.warningText : '#A32D2D' },
              { label: '과제 수행 평균', value: `${avgHomework}%`, color: avgHomework >= 80 ? C.successDark : C.warningText },
              { label: '정시 출석률', value: `${attendanceRate}%`, color: attendanceRate >= 90 ? C.successDark : attendanceRate >= 70 ? C.warningText : '#A32D2D' },
            ].map((item, i) => (
              <div key={i} style={{ border: '0.5px solid #E8E6E0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: '#6B7785', margin: '0 0 4px', letterSpacing: '0.06em' }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 800, color: item.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* 출결 캘린더 */}
          {(() => {
            const ATTEND_COLORS = { '정시': C.successDark, '지각': '#C9A227', '결석': '#A32D2D', '조퇴': C.warningText };
            const attendanceByDate = {};
            sorted.forEach(r => {
              if (!r.createdAt?.seconds) return;
              const d = new Date(r.createdAt.seconds * 1000);
              attendanceByDate[`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`] = r.attendance;
            });
            const calYear = calMonth.getFullYear();
            const calMonthIdx = calMonth.getMonth();
            const firstDayOfWeek = new Date(calYear, calMonthIdx, 1).getDay();
            const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
            const today = new Date();
            const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

            // 접혀있을 때 한 줄로 보여줄 이번 달 출결 요약
            const monthCounts = {};
            Object.entries(attendanceByDate).forEach(([key, att]) => {
              const [y, m] = key.split('-').map(Number);
              if (y === calYear && m === calMonthIdx) monthCounts[att] = (monthCounts[att] || 0) + 1;
            });

            return (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#1A1A1A' }}>출결 캘린더</p>
                  {calendarOpen ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx - 1, 1))}
                        style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '14px', padding: '4px', width: '28px', height: '28px' }}>‹</button>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>{calYear}년 {calMonthIdx + 1}월</span>
                      <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx + 1, 1))}
                        style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '14px', padding: '4px', width: '28px', height: '28px' }}>›</button>
                      <button onClick={() => setCalendarOpen(false)}
                        style={{ fontSize: '11px', fontWeight: 700, color: '#6B7280', background: '#F3F4F6', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        접기
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setCalendarOpen(true)}
                      style={{ fontSize: '11px', fontWeight: 700, color: '#0D2D6B', background: '#EAF1FB', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      펼쳐보기
                    </button>
                  )}
                </div>
                <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />

                {!calendarOpen ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '11px 13px', background: '#FAFAF8', border: '0.5px solid #E5E7EB', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', color: '#6C7586', fontWeight: 700 }}>{calYear}년 {calMonthIdx + 1}월</span>
                    {Object.entries(ATTEND_COLORS).map(([label, color]) => (
                      monthCounts[label] ? (
                        <span key={label} style={{ fontSize: '11px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {label} {monthCounts[label]}일
                        </span>
                      ) : null
                    ))}
                    {Object.keys(monthCounts).length === 0 && <span style={{ fontSize: '11px', color: '#B0B0B0' }}>이번 달 출결 기록이 없어요</span>}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                      {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                        <p key={d} style={{ textAlign: 'center', fontSize: '10px', color: '#6C7586', margin: 0, fontWeight: 600 }}>{d}</p>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const key = `${calYear}-${calMonthIdx}-${day}`;
                        const att = attendanceByDate[key];
                        const isToday = key === todayKey;
                        return (
                          <div key={day} style={{
                            aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '8px', background: att ? `${ATTEND_COLORS[att] || C.warningText}12` : 'transparent',
                            border: isToday ? `1.5px solid ${C.info}` : '1px solid transparent',
                          }}>
                            <span style={{ fontSize: '11px', fontWeight: att ? 700 : 400, color: att ? (ATTEND_COLORS[att] || '#374151') : '#C0C0C0' }}>{day}</span>
                            {att && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: ATTEND_COLORS[att] || C.warningText, marginTop: '2px' }} />}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                      {Object.entries(ATTEND_COLORS).map(([label, color]) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                          <span style={{ fontSize: '10px', color: '#6B7280' }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* 날짜별 수업 카드 리스트 */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>수업 기록</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {[...sorted].reverse().slice(0, 5).map((r, i) => {
                const diagColors = DIAG_SOFT;
                const tags = (r.diagnosis || []).filter(d => d.key !== 'perfect');
                const hasPerfect = (r.diagnosis || []).some(d => d.key === 'perfect');
                const isWarning = r.conceptRating != null && r.conceptRating <= 40;
                const rawNote = r.teacherNote || '';
                const cleanNote = rawNote.replace(/\[([^\]]+)\]\s*/g, '').trim();

                return (
                  <div key={i} style={{
                    background: '#FAFAF8',
                    border: '0.5px solid #E5E7EB',
                    borderRadius: '8px',
                    padding: '9px 10px',
                    borderLeft: isWarning ? `2px solid ${C.danger}` : hasPerfect ? `2px solid ${C.successDark}` : '2px solid #E5E7EB',
                  }}>
                    {/* 날짜 + 평점 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>{fmtDate(r)}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {r.homeworkRating != null && (
                          <span style={{ fontSize: '10px', color: '#6B7280' }}>
                            과제 <strong style={{ color: '#0D2D6B' }}>{r.homeworkRating}%</strong>
                          </span>
                        )}
                        {r.conceptRating != null && (
                          <span style={{ fontSize: '10px', color: '#6B7280' }}>
                            개념 <strong style={{ color: '#0D2D6B' }}>{r.conceptRating}%</strong>
                          </span>
                        )}
                        {r.hasTest && r.testScore && (
                          <span style={{ fontSize: '10px', color: '#C9A227', fontWeight: 700 }}>
                            시험 {r.testScore}점
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 교재 + 단원 */}
                    {(r.textbook || r.unit) && (
                      <p style={{ fontSize: '10px', color: '#6C7586', margin: '0 0 5px' }}>
                        {[r.textbook, r.unit, r.pages && fmtPages(r.pages)].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {/* 진단 태그 */}
                    {(tags.length > 0 || hasPerfect) && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: cleanNote ? '5px' : 0 }}>
                        {hasPerfect && (
                          <span style={{ fontSize: '10px', background: C.successBg, color: C.successDark, padding: '1px 7px', borderRadius: '8px', fontWeight: 600 }}>개념 완벽</span>
                        )}
                        {tags.map((d, ti) => {
                          const c = diagColors[d.key] || { bg: '#F3F4F6', color: '#374151' };
                          return (
                            <span key={ti} style={{ fontSize: '10px', background: c.bg, color: c.color, padding: '1px 7px', borderRadius: '8px', fontWeight: 600 }}>
                              {diagLabels[d.key] || d.key}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* 코멘트 미리보기 */}
                    {cleanNote && (
                      <p style={{ fontSize: '10px', color: '#6B7280', margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
                        "{cleanNote.length > 45 ? cleanNote.slice(0, 45) + '...' : cleanNote}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {sorted.length > 5 && (
              <p style={{ fontSize: '11px', color: '#6C7586', margin: '8px 0 0', textAlign: 'center' }}>
                최근 5회 표시 · 전체 {sorted.length}회
              </p>
            )}
          </div>

          {/* 반복 약점 TOP3 */}
          {weakTop3.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>반복 약점 패턴</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {weakTop3.map(([key, count], i) => {
                  const tag = DIAG_MAP[key];
                  if (!tag) return null;
                  const isOpen = expandedWeak === key;
                  const unitBreakdown = Object.entries(diagUnitCount[key] || {}).sort((a, b) => b[1] - a[1]);
                  return (
                    <div key={i}>
                      <div onClick={() => setExpandedWeak(isOpen ? null : key)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <div style={{ background: tag.bg, color: '#fff', fontSize: '11px', fontWeight: 800, width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                        <span style={{ background: tag.bg, color: '#fff', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{tag.prefix} {tag.label}</span>
                        <div style={{ flex: 1, height: '5px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${(count / (weakTop3[0][1])) * 100}%`, height: '100%', background: tag.bg, borderRadius: '4px' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: tag.bg, flexShrink: 0 }}>{count}회</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="#8A8A8A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {isOpen && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px', paddingLeft: '30px' }}>
                          {unitBreakdown.map(([unitLabel, unitCount]) => (
                            <span key={unitLabel} style={{ fontSize: '11px', fontWeight: 600, color: '#374151', background: '#F3F4F6', padding: '3px 9px', borderRadius: '12px' }}>
                              {unitLabel} {unitCount}회
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 단원별 이해도 히트맵 */}
          {unitAccuracy.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>단원별 이해도</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '6px' }}>
                {unitAccuracy.map((u) => {
                  const tier = heatTier(u.pct);
                  return (
                    <div key={u.name} title={u.name}
                      style={{ background: tier.bg, border: `1px solid ${tier.border}`, borderRadius: '8px', padding: '8px 8px 7px', minHeight: '54px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <p style={{ fontSize: '10px', color: tier.color, fontWeight: 600, margin: 0, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{u.name}</p>
                      <p style={{ fontSize: '15px', color: tier.color, fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{u.pct}%</p>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: '10px', color: '#6B7785', margin: '8px 0 0' }}>개념 이해 평가 평균 · 낮은 순 정렬 · 빨강/주황일수록 보강이 필요해요</p>
            </div>
          )}

          {/* 복습 이력 — 대시보드에서 "복습 완료" 처리할 때 남긴 조치 메모/재시험 점수.
              대시보드엔 처리 즉시 목록에서 사라지므로, "그때 뭘 했는지" 다시 확인할 수 있는 유일한 곳 */}
          {completedReviews.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>복습 이력</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {completedReviews.slice(0, 5).map((rv) => (
                  <div key={rv.id} style={{ background: '#FAFAF8', border: '0.5px solid #E5E7EB', borderRadius: '8px', padding: '9px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#1A1A1A' }}>
                        {rv.round}차 복습
                        {rv.weakTypes?.length > 0 && <span style={{ fontWeight: 500, color: '#6B7280' }}> · {rv.weakTypes.map(w => w.label).join(', ')}</span>}
                      </span>
                      <span style={{ fontSize: '10px', color: '#6C7586' }}>
                        {rv.completedAt?.seconds ? new Date(rv.completedAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}
                      </span>
                    </div>
                    {(rv.textbook || rv.unit) && (
                      <p style={{ fontSize: '10px', color: '#6C7586', margin: '0 0 4px' }}>{[rv.textbook, rv.unit].filter(Boolean).join(' · ')}</p>
                    )}
                    {rv.testScore != null && rv.testScore !== '' && (
                      <p style={{ fontSize: '10px', color: '#C9A227', fontWeight: 700, margin: '0 0 4px' }}>재시험 {rv.testScore}점</p>
                    )}
                    {rv.note && (
                      <p style={{ fontSize: '11px', color: '#5A6472', margin: 0, lineHeight: 1.6 }}>{rv.note}</p>
                    )}
                  </div>
                ))}
              </div>
              {completedReviews.length > 5 && (
                <p style={{ fontSize: '11px', color: '#6C7586', margin: '8px 0 0', textAlign: 'center' }}>
                  최근 5건 표시 · 전체 {completedReviews.length}건
                </p>
              )}
            </div>
          )}

          {/* 최근 학습 단원 */}
          {unitHistory.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>최근 학습 단원</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {unitHistory.map((unit, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === 0 ? '#0D2D6B' : '#D8DDE4', flexShrink: 0 }} />
                    <p style={{ fontSize: '12px', color: i === 0 ? '#0D2D6B' : '#5A6472', fontWeight: i === 0 ? 700 : 400, margin: 0 }}>{unit}</p>
                    {i === 0 && <span style={{ fontSize: '10px', background: '#EAF0F9', color: '#1A5CB8', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>최근</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 최근 선생님 코멘트 */}
          {sorted.filter(r => r.teacherNote).length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>최근 선생님 코멘트</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sorted.filter(r => r.teacherNote).slice(-3).reverse().map((r, i) => (
                  <div key={i} style={{ borderLeft: '2px solid #C9A227', paddingLeft: '12px' }}>
                    <p style={{ fontSize: '10px', color: '#6B7785', margin: '0 0 3px' }}>{fmtDate(r)}</p>
                    <p style={{ fontSize: '12px', color: '#5A6472', margin: 0, lineHeight: 1.7, fontStyle: 'italic' }}>"{r.teacherNote}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 원장님 상담 메모 */}
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>원장님 상담 메모</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sorted.filter(r => r.directorMemo).slice(-3).reverse().map((r, i) => (
                <div key={i} style={{ background: '#FFFDF0', border: '0.5px solid #F5D76E', borderRadius: '8px', padding: '10px 12px' }}>
                  <p style={{ fontSize: '10px', color: C.warningText, margin: '0 0 3px' }}>{fmtDate(r)}</p>
                  <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0, lineHeight: 1.6 }}>{r.directorMemo}</p>
                </div>
              ))}
              {sorted.filter(r => r.directorMemo).length === 0 && (
                <p style={{ fontSize: '12px', color: '#6B7785', margin: 0 }}>저장된 상담 메모가 없습니다.</p>
              )}
            </div>
          </div>

          {/* 성장 포트폴리오 공유 */}
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #EEECEA' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>성장 포트폴리오 공유</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '14px' }} />

            {/* 링크 생성 */}
            {(() => {
              const baseUrl = `${window.location.origin}/story/${student.id}`;
              const copyUrl = `${baseUrl}?src=copy`;

              const handleCopy = () => {
                navigator.clipboard.writeText(copyUrl).then(() => {
                  onToast?.('링크 복사됐어요! 카톡에 붙여넣기 하세요.');
                });
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                  {/* 카카오톡 공유 */}
                  <button onClick={handleCopy}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', background: '#FEE500', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M11 2C6.03 2 2 5.36 2 9.5c0 2.67 1.63 5.02 4.07 6.44l-.88 3.25 3.8-1.98A10.8 10.8 0 0011 17c4.97 0 9-3.36 9-7.5S15.97 2 11 2z" fill="#3A1D1D"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#3A1D1D', margin: '0 0 2px' }}>카카오톡으로 공유</p>
                      <p style={{ fontSize: '11px', color: '#5A3D3D', margin: 0 }}>링크 복사 → 카카오톡 붙여넣기</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M6 3l5 5-5 5" stroke="#3A1D1D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* 링크 복사 */}
                  <button onClick={() => navigator.clipboard.writeText(copyUrl).then(() => onToast?.('링크 복사됐어요! 카톡에 붙여넣기 하세요.'))}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', background: '#F7F5F1', border: '0.5px solid #E5E5E5', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M12 3h5v5M10 10L17 3" stroke="#4A4A4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#2C2C2C', margin: '0 0 2px' }}>링크 복사</p>
                      <p style={{ fontSize: '11px', color: '#8A8A8A', margin: 0 }}>/story/{student.id.slice(0, 8)}...</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <rect x="5" y="5" width="8" height="8" rx="1" stroke="#8A8A8A" strokeWidth="1.2"/>
                      <path d="M3 11V3h8" stroke="#8A8A8A" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>

                  {/* 성장 포트폴리오 열기 — "보기(공개페이지)"/"편집" 2개 링크로 나뉘어 있던 걸 통합.
                      같은 페이지에 ?edit=1 하나 차이고, 편집 모드가 보기 모드를 포함(학부모에게는
                      원래도 이 파라미터가 안 보임), 학부모용 링크는 위 "링크 복사"가 항상 순수
                      URL을 주므로 굳이 나눌 이유가 없었음. */}
                  <a href={`/story/${student.id}?edit=1`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#FFF9EC', border: '1px solid #C9A227', borderRadius: '8px', textDecoration: 'none', marginTop: '4px' }}>
                    <Pencil size={12} style={{ color: '#8A6500' }} />
                    <span style={{ fontSize: '12px', color: '#8A6500', fontWeight: 700 }}>성장 포트폴리오 보기·편집</span>
                  </a>

                  {/* 주간 요약 카드 */}
                  <button onClick={() => setShowWeekly(true)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#0D2D6B', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="2" width="12" height="10" rx="2" stroke="#fff" strokeWidth="1.2"/><path d="M4 5h6M4 7.5h4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>이번 주 요약 카드</span>
                  </button>

                  {/* 주간 요약 카드 모달 */}
                  {showWeekly && (
                    <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '20px' }}
                      onClick={() => setShowWeekly(false)}>
                      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px' }}>
                        <WeeklySummaryCard student={student} reports={reports} academyName={academyName} />
                        <button onClick={() => setShowWeekly(false)}
                          style={{ width: '100%', marginTop: '8px', padding: '12px', background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                          닫기
                        </button>
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: '10px', color: '#B0B0B0', margin: '4px 0 0', textAlign: 'center' }}>
                    링크 열람 시 ?src 파라미터로 유입 경로 추적 가능
                  </p>
                </div>
              );
            })()}
          </div>

        </div>
    </div>
  );
}

// ============================================================
// 모바일 모달 크롬 — 오버레이/배경 클릭 닫기 + 뒤로가기 히스토리 처리.
// 실제 내용은 StudentProfileContent를 그대로 씀(PC 인라인 패널과 동일 소스).
// ============================================================
export function StudentProfileModal({ student, reports, reviews = [], onClose, onToast, academyName }) {
  useEscapeClose(onClose);
  // 모바일 뒤로가기 지원 — SPA history 보호
  useEffect(() => {
    // 현재 페이지를 history에 한 번 더 쌓아서 뒤로가기가 앱 밖으로 안 나가게
    history.pushState(null, '', window.location.href);
    history.pushState({ modal: 'profile' }, '', window.location.href);
    const handlePop = () => {
      // 모달 닫고 앱 내 페이지로 복귀
      history.pushState(null, '', window.location.href);
      onClose();
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '620px', maxHeight: '88vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <StudentProfileContent student={student} reports={reports} reviews={reviews} onClose={onClose} onToast={onToast} academyName={academyName} />
      </div>
    </div>
  );
}

// ── 주간 요약 카드 — StudentProfileModal 안에서만 씀
function WeeklySummaryCard({ student, reports, academyName }) {
  const [copied, setCopied] = useState(false);

  const now = new Date();
  // 일요일엔 getDay()===0이라 "-getDay()+1"이 +1(내일)이 돼서 weekStart가 미래로 감 —
  // 일요일만 예외로 -6(지난 월요일)을 쓰도록 보정 (DirectorView.jsx와 동일 패턴)
  const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (d) => `${d.getMonth()+1}/${d.getDate()}`;
  const weekNum = Math.ceil((now.getDate() + mondayOffset) / 7);
  const weekLabel = `${now.getMonth()+1}월 ${weekNum}주차`;

  // 주간형 리포트(reportType==='weekly')는 리포트 문서 1개에 세션이 여러 개 들어있어서,
  // "리포트 문서 1개 = 세션 1개"를 전제로 한 이 카드의 집계가 그대로는 안 맞음(수업 횟수/출석률이
  // 실제보다 훨씬 낮게 나옴) — 주간 리포트만 sessions[]를 이번 주 범위로 골라 세션 단위 행으로
  // 펼쳐서 나머지 집계 로직(avg/attendRate/단원/오답유형)이 평소 리포트처럼 그대로 처리하게 함
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const weekReports = reports
    .filter(r => r.studentId === student?.id && (
      r.reportType === 'weekly'
        ? (r.sessions || []).some(s => s.date >= weekStartStr && s.date <= weekEndStr)
        : r.createdAt?.seconds * 1000 >= weekStart.getTime()
    ))
    .flatMap(r => r.reportType === 'weekly'
      ? (r.sessions || [])
          .filter(s => s.date >= weekStartStr && s.date <= weekEndStr)
          .map(s => ({
            ...s,
            studentId: r.studentId,
            teacherName: r.teacherName,
            createdAt: { seconds: Math.floor(new Date(`${s.date}T00:00:00+09:00`).getTime() / 1000) },
            id: `${r.id}-${s.date}`,
          }))
      : [r]
    )
    .sort((a, b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));

  const avg = (key) => {
    const rated = weekReports.filter(r => r[key] != null);
    return rated.length
      ? Math.round(rated.reduce((s, r) => s + toPct(r[key]), 0) / rated.length)
      : '—';
  };

  const attendRate = weekReports.length
    ? Math.round(weekReports.filter(r => r.attendance === '정시').length / weekReports.length * 100)
    : 0;

  // 단원별 집계 — unitKey(표준 단원 정규화) 우선
  const unitMap = {};
  weekReports.forEach(r => {
    const label = [r.unit, r.textbook].filter(Boolean).join(' · ');
    if (!label) return;
    const key = r.unitKey || findUnitKey(r.subject || '수학', r.unit || '') || label;
    if (!unitMap[key]) unitMap[key] = { name: label, scores: [], teacher: r.teacherName };
    if (r.hasTest && r.testScore) unitMap[key].scores.push(Number(r.testScore));
  });
  const units = Object.values(unitMap);

  // 오답 유형 집계
  const diagMap = {};
  weekReports.forEach(r => (r.diagnosis||[]).forEach(d => {
    if (d.key === 'perfect') return;
    if (!diagMap[d.key]) diagMap[d.key] = { key: d.key, count: 0 };
    diagMap[d.key].count++;
  }));
  const DIAG = DIAG_SOFT;
  const diagList = Object.values(diagMap).sort((a,b) => b.count - a.count).slice(0, 3);

  // 선생님 코멘트 — 가장 최근
  const lastNote = [...weekReports].reverse().find(r => r.teacherNote)?.teacherNote || '';
  const teacherName = weekReports[weekReports.length-1]?.teacherName || '';

  // 다음 주 계획
  const nextPlan = [...weekReports].reverse().find(r => r.nextPlan)?.nextPlan || '';

  const handleCopy = () => {
    const url = `${window.location.origin}/story/${student?.id}?src=weekly`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!student) return null;

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden', maxWidth: '420px', margin: '0 auto', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* 헤더 */}
      <div style={{ background: '#0D2D6B', padding: '20px 22px 18px' }}>
        <div style={{ width: '32px', height: '3px', background: '#C9A227', borderRadius: '2px', marginBottom: '12px' }} />
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', margin: '0 0 3px' }}>
          {weekLabel} · {fmt(weekStart)} ~ {fmt(weekEnd)}
        </p>
        <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>{student.name} 학생 주간 리포트</p>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', margin: '4px 0 0' }}>{academyName || '데일리 리포트 시스템'}</p>
      </div>

      {weekReports.length === 0 ? (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: '#6C7586', fontSize: '13px' }}>
          이번 주 수업 기록이 없습니다
        </div>
      ) : (
        <>
          {/* 핵심 수치 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '0.5px solid #E5E7EB' }}>
            {[
              { label: '수업 횟수', value: `${weekReports.length}회`, color: '#0D2D6B' },
              { label: '과제 평균', value: `${avg('homeworkRating')}%`, color: '#0D2D6B' },
              { label: '출석률', value: `${attendRate}%`, color: attendRate === 100 ? C.successDark : C.warningText },
            ].map((s, i) => (
              <div key={i} style={{ padding: '14px 12px', textAlign: 'center', borderRight: i < 2 ? '0.5px solid #E5E7EB' : 'none' }}>
                <p style={{ fontSize: '10px', color: '#6C7586', margin: '0 0 4px', fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: '20px', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* 이번 주 학습 단원 */}
          {units.length > 0 && (
            <div style={{ padding: '16px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#6C7586', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 10px' }}>이번 주 학습 단원</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {units.map((u, i) => {
                  const avgScore = u.scores.length ? Math.round(u.scores.reduce((a,b)=>a+b,0)/u.scores.length) : null;
                  const achieved = avgScore && avgScore >= 80;
                  const barColor = achieved ? C.successDark : avgScore ? C.warningText : '#0D2D6B';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '3px', height: '34px', background: barColor, borderRadius: '2px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A', margin: '0 0 1px' }}>{u.name}</p>
                        {avgScore && <p style={{ fontSize: '11px', color: '#6C7586', margin: 0 }}>{avgScore}점</p>}
                      </div>
                      {avgScore && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: achieved ? C.successBg : C.warningBg, color: achieved ? C.successDark : C.warningText, flexShrink: 0 }}>
                          {achieved ? '✓ 목표달성' : '점검 필요'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* 배지만 봐서는 "뭘 점검하라는 건지" 알 수 없다는 피드백 — 기준(80점)을
                  한 줄로 밝혀줌. 이 카드는 카카오톡/링크로 학부모에게도 공유되므로 문구를
                  쉽게 풀어씀. */}
              <p style={{ fontSize: '10px', color: '#6B7785', margin: '10px 0 0', lineHeight: 1.5 }}>
                이번 주 평균 80점을 기준으로 그 이상이면 "목표달성", 미만이면 "점검 필요"로 표시돼요
              </p>
            </div>
          )}

          {/* 집중 포인트 */}
          {diagList.length > 0 && (
            <div style={{ padding: '14px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#6C7586', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 8px' }}>이번 주 집중 포인트</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {diagList.map(d => {
                  const info = DIAG[d.key] || { label: d.key, color: '#4A4A4A', bg: '#F3F4F6' };
                  return (
                    <span key={d.key} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', background: info.bg, color: info.color }}>
                      {info.label} {d.count}회
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 선생님 한마디 */}
          {lastNote && (
            <div style={{ padding: '16px 22px', borderBottom: '0.5px solid #E5E7EB', background: '#FAFAF8' }}>
              <p style={{ fontSize: '10px', color: '#6C7586', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 8px' }}>선생님 한마디</p>
              <p style={{ fontSize: '12px', color: '#1A1A1A', lineHeight: 1.8, margin: 0 }}>
                {lastNote}
              </p>
              {teacherName && <p style={{ fontSize: '10px', color: '#6C7586', margin: '8px 0 0', textAlign: 'right' }}>— {teacherName}</p>}
            </div>
          )}

          {/* 다음 주 예고 */}
          {nextPlan && (
            <div style={{ padding: '12px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#6C7586', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 4px' }}>다음 주 학습 예정</p>
              <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0 }}>{nextPlan}</p>
            </div>
          )}

          {/* 공유 버튼 */}
          <div style={{ padding: '14px 22px', display: 'flex', gap: '8px' }}>
            <button onClick={handleCopy}
              style={{ flex: 1, background: '#FEE500', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '12px', fontWeight: 700, color: '#3A1D1D', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1C3.96 1 1.5 3.13 1.5 5.75c0 1.64.91 3.09 2.33 4.01l-.52 1.94 2.3-1.2c.42.08.85.12 1.39.12 3.04 0 5.5-2.13 5.5-4.75S10.04 1 7 1z" fill="#3A1D1D"/></svg>
              {copied ? '복사 완료!' : '카카오톡 공유'}
            </button>
            <button onClick={handleCopy}
              style={{ flex: 1, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: '8px', padding: '11px', fontSize: '12px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              링크 복사
            </button>
          </div>
        </>
      )}
    </div>
  );
}
