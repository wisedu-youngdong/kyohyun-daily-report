import React, { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { toPct } from '../growth.js';
import { findUnitKey } from '../curriculum.js';
import { C } from '../tokens.jsx';

// ============================================================
// 학생 종합 프로필 모달 — 상담용
// ============================================================
export function StudentProfileModal({ student, reports, onClose, DIAG_MAP, onToast, academyName }) {
  const [showWeekly, setShowWeekly] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const last = [...reports].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
    const d = last?.createdAt?.seconds ? new Date(last.createdAt.seconds * 1000) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // 모바일 뒤로가기 지원 — SPA history 보호
  useEffect(() => {
    // 현재 페이지를 history에 한 번 더 쌓아서 뒤로가기가 앱 밖으로 안 나가게
    history.pushState(null, '', window.location.href);
    history.pushState({ modal: 'profile' }, '', window.location.href);
    const handlePop = (e) => {
      // 모달 닫고 앱 내 페이지로 복귀
      history.pushState(null, '', window.location.href);
      onClose();
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로 0~100(%) 기준으로 정규화
  // null(미입력)은 보존 — 평균 계산에서 제외해 미입력이 평균을 끌어내리지 않도록
  const sorted = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({ ...r, conceptRating: r.conceptRating == null ? null : toPct(r.conceptRating), homeworkRating: r.homeworkRating == null ? null : toPct(r.homeworkRating) }));
  const recent = sorted.slice(-10); // 최근 10회

  const conceptRated = sorted.filter(r => r.conceptRating != null);
  const homeworkRated = sorted.filter(r => r.homeworkRating != null);
  const avgConcept = conceptRated.length ? Math.round(conceptRated.reduce((s, r) => s + r.conceptRating, 0) / conceptRated.length) : 0;
  const avgHomework = homeworkRated.length ? Math.round(homeworkRated.reduce((s, r) => s + r.homeworkRating, 0) / homeworkRated.length) : 0;
  const attendanceRate = sorted.length ? Math.round(sorted.filter(r => r.attendance === '정시').length / sorted.length * 100) : 0;

  // 약점 집계
  const diagCount = {};
  sorted.forEach(r => (r.diagnosis || []).forEach(d => {
    if (d.key !== 'perfect') diagCount[d.key] = (diagCount[d.key] || 0) + 1;
  }));
  const weakTop3 = Object.entries(diagCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 최근 학습 단원 목록
  const unitHistory = [...new Set(sorted.map(r => [r.textbook, r.unit].filter(Boolean).join(' · ')).filter(Boolean))].slice(-5).reverse();

  const fmtDate = (r) => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    : '';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '620px', maxHeight: '88vh', overflow: 'auto', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}
        onClick={e => e.stopPropagation()}>

        {/* 모달 헤더 */}
        <div style={{ background: '#0D2D6B', padding: '18px 22px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '4px', height: '18px', background: '#C9A227', borderRadius: '0', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em' }}>{academyName || '데일리 리포트 시스템'} · 학생 종합 프로필</span>
          </div>
          <p style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{student.name}</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', margin: 0 }}>총 {sorted.length}회 수업 누적</p>
          <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '18px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '22px', cursor: 'pointer', lineHeight: 1, width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
        </div>

        <div style={{ padding: '20px 22px' }}>

          {/* 핵심 지표 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: '개념 이해 평균', value: `${avgConcept}%`, color: avgConcept >= 80 ? '#0F6E56' : avgConcept >= 60 ? '#8A5A00' : '#A32D2D' },
              { label: '과제 수행 평균', value: `${avgHomework}%`, color: avgHomework >= 80 ? '#0F6E56' : '#8A5A00' },
              { label: '정시 출석률', value: `${attendanceRate}%`, color: attendanceRate >= 90 ? '#0F6E56' : attendanceRate >= 70 ? '#8A5A00' : '#A32D2D' },
            ].map((item, i) => (
              <div key={i} style={{ border: '0.5px solid #E8E6E0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 4px', letterSpacing: '0.06em' }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 800, color: item.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* 출결 캘린더 */}
          {(() => {
            const ATTEND_COLORS = { '정시': '#0F6E56', '지각': '#C9A227', '결석': '#A32D2D', '조퇴': '#8A5A00' };
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
            return (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#1A1A1A' }}>출결 캘린더</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx - 1, 1))}
                      style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '14px', padding: '4px', width: '28px', height: '28px' }}>‹</button>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>{calYear}년 {calMonthIdx + 1}월</span>
                    <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx + 1, 1))}
                      style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '14px', padding: '4px', width: '28px', height: '28px' }}>›</button>
                  </div>
                </div>
                <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                  {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                    <p key={d} style={{ textAlign: 'center', fontSize: '10px', color: '#9CA3AF', margin: 0, fontWeight: 600 }}>{d}</p>
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
                        borderRadius: '8px', background: att ? `${ATTEND_COLORS[att] || '#8A5A00'}12` : 'transparent',
                        border: isToday ? `1.5px solid ${C.info}` : '1px solid transparent',
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: att ? 700 : 400, color: att ? (ATTEND_COLORS[att] || '#374151') : '#C0C0C0' }}>{day}</span>
                        {att && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: ATTEND_COLORS[att] || '#8A5A00', marginTop: '2px' }} />}
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
              </div>
            );
          })()}

          {/* 날짜별 수업 카드 리스트 */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>수업 기록</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {[...sorted].reverse().slice(0, 5).map((r, i) => {
                const diagLabels = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
                const diagColors = {
                  calc: { bg: '#FFF8EC', color: '#8A5A00' },
                  concept: { bg: '#FDF0F0', color: '#8A2020' },
                  apply: { bg: '#FDF0F0', color: '#8A2020' },
                  time: { bg: '#F3F0FA', color: '#4A3080' },
                  perfect: { bg: '#F0FAF5', color: '#0F6E56' },
                };
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
                    borderLeft: isWarning ? '2px solid #DC2626' : hasPerfect ? '2px solid #0F6E56' : '2px solid #E5E7EB',
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
                      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 5px' }}>
                        {[r.textbook, r.unit, r.pages && `${r.pages}쪽`].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {/* 진단 태그 */}
                    {(tags.length > 0 || hasPerfect) && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: cleanNote ? '5px' : 0 }}>
                        {hasPerfect && (
                          <span style={{ fontSize: '10px', background: '#F0FAF5', color: '#0F6E56', padding: '1px 7px', borderRadius: '8px', fontWeight: 600 }}>개념 완벽</span>
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
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '8px 0 0', textAlign: 'center' }}>
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
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: tag.bg, color: '#fff', fontSize: '11px', fontWeight: 800, width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ background: tag.bg, color: '#fff', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{tag.prefix} {tag.label}</span>
                      <div style={{ flex: 1, height: '5px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${(count / (weakTop3[0][1])) * 100}%`, height: '100%', background: tag.bg, borderRadius: '4px' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: tag.bg, flexShrink: 0 }}>{count}회</span>
                    </div>
                  );
                })}
              </div>
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
                    <p style={{ fontSize: '10px', color: '#98A1AC', margin: '0 0 3px' }}>{fmtDate(r)}</p>
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
                  <p style={{ fontSize: '10px', color: '#8A5A00', margin: '0 0 3px' }}>{fmtDate(r)}</p>
                  <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0, lineHeight: 1.6 }}>{r.directorMemo}</p>
                </div>
              ))}
              {sorted.filter(r => r.directorMemo).length === 0 && (
                <p style={{ fontSize: '12px', color: '#98A1AC', margin: 0 }}>저장된 상담 메모가 없습니다.</p>
              )}
            </div>
          </div>

          {/* 성장 스토리 공유 */}
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #EEECEA' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>성장 스토리 공유</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '14px' }} />

            {/* 링크 생성 */}
            {(() => {
              const baseUrl = `${window.location.origin}/story/${student.id}`;
              const kakaoUrl = `${baseUrl}?src=kakao`;
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

                  {/* 퀵 링크 */}
                  <a href={`/story/${student.id}?src=direct`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: '8px', textDecoration: 'none', marginTop: '4px' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8h12M8 2v12" stroke="#0D2D6B" strokeWidth="1.5" strokeLinecap="round"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#0D2D6B" strokeWidth="1.2"/></svg>
                    <span style={{ fontSize: '12px', color: '#0D2D6B', fontWeight: 600 }}>성장 스토리 보기</span>
                  </a>

                  {/* AI 서사 편집 모드 */}
                  <a href={`/story/${student.id}?edit=1`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#FFF9EC', border: '1px solid #C9A227', borderRadius: '8px', textDecoration: 'none', marginTop: '4px' }}>
                    <Pencil size={12} style={{ color: '#8A6500' }} />
                    <span style={{ fontSize: '12px', color: '#8A6500', fontWeight: 700 }}>AI 서사 편집 모드로 열기</span>
                  </a>

                  {/* 주간 요약 카드 */}
                  <button onClick={() => setShowWeekly(true)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#0D2D6B', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="2" width="12" height="10" rx="2" stroke="#fff" strokeWidth="1.2"/><path d="M4 5h6M4 7.5h4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>이번 주 요약 카드</span>
                  </button>

                  {/* 주간 요약 카드 모달 */}
                  {showWeekly && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '20px' }}
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
    </div>
  );
}

// ── 주간 요약 카드 — StudentProfileModal 안에서만 씀
function WeeklySummaryCard({ student, reports, teachers, academyName }) {
  const [copied, setCopied] = useState(false);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (d) => `${d.getMonth()+1}/${d.getDate()}`;
  const weekNum = Math.ceil((now.getDate() - now.getDay() + 1) / 7);
  const weekLabel = `${now.getMonth()+1}월 ${weekNum}주차`;

  const weekReports = reports
    .filter(r => r.studentId === student?.id && r.createdAt?.seconds * 1000 >= weekStart.getTime())
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
  const DIAG = { calc: { label: '계산 실수', color: '#7A4F00', bg: '#FFF8EC' }, concept: { label: '개념 누락', color: '#0D2D6B', bg: '#EAF1FB' }, apply: { label: '응용 부족', color: '#8A2020', bg: '#FDF0F0' }, time: { label: '시간 부족', color: '#4A3080', bg: '#F3F0FA' } };
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
        <div style={{ padding: '40px 22px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
          이번 주 수업 기록이 없습니다
        </div>
      ) : (
        <>
          {/* 핵심 수치 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '0.5px solid #E5E7EB' }}>
            {[
              { label: '수업 횟수', value: `${weekReports.length}회`, color: '#0D2D6B' },
              { label: '과제 평균', value: `${avg('homeworkRating')}%`, color: '#0D2D6B' },
              { label: '출석률', value: `${attendRate}%`, color: attendRate === 100 ? '#0F6E56' : '#7A4F00' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '14px 12px', textAlign: 'center', borderRight: i < 2 ? '0.5px solid #E5E7EB' : 'none' }}>
                <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 4px', fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: '20px', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* 이번 주 학습 단원 */}
          {units.length > 0 && (
            <div style={{ padding: '16px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 10px' }}>이번 주 학습 단원</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {units.map((u, i) => {
                  const avgScore = u.scores.length ? Math.round(u.scores.reduce((a,b)=>a+b,0)/u.scores.length) : null;
                  const achieved = avgScore && avgScore >= 80;
                  const barColor = achieved ? '#0F6E56' : avgScore ? '#7A4F00' : '#0D2D6B';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '3px', height: '34px', background: barColor, borderRadius: '2px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A', margin: '0 0 1px' }}>{u.name}</p>
                        {avgScore && <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>{avgScore}점</p>}
                      </div>
                      {avgScore && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: achieved ? '#F0FAF5' : '#FFF8EC', color: achieved ? '#0F6E56' : '#7A4F00', flexShrink: 0 }}>
                          {achieved ? '✓ 목표달성' : '점검 필요'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 집중 포인트 */}
          {diagList.length > 0 && (
            <div style={{ padding: '14px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 8px' }}>이번 주 집중 포인트</p>
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
              <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 8px' }}>선생님 한마디</p>
              <p style={{ fontSize: '12px', color: '#1A1A1A', lineHeight: 1.8, margin: 0 }}>
                {lastNote}
              </p>
              {teacherName && <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '8px 0 0', textAlign: 'right' }}>— {teacherName}</p>}
            </div>
          )}

          {/* 다음 주 예고 */}
          {nextPlan && (
            <div style={{ padding: '12px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 4px' }}>다음 주 학습 예정</p>
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
