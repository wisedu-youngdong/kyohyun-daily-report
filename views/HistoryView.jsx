import React, { useState } from 'react';
import { Pencil, Trash2, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import { toPct } from '../growth.js';
import { DIAG_LABELS, DIAG_SOFT as DIAG_COLORS } from '../diagnosis.js';
import { useMediaQuery } from '../hooks.js';
import { C } from '../tokens.jsx';

export default function HistoryView({ reports, students, classes = [], reportViews = [], onDelete, onEdit, onBulkDelete }) {
  const [selectedId, setSelectedId] = useState(null);
  const [deleteConfirmReport, setDeleteConfirmReport] = useState(null);
  const [studentFilter, setStudentFilter] = useState('');
  const [classFilter, setClassFilter] = useState(''); // '' | '__unassigned__' | classId
  const [searchText, setSearchText] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [draftOnly, setDraftOnly] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [trendTooltip, setTrendTooltip] = useState(null); // { x, y, text }

  const draftCount = reports.filter(r => r.isDraft).length;

  // 삭제된 리포트가 selectedId면 자동 초기화
  React.useEffect(() => {
    if (selectedId && !reports.find(r => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [reports, selectedId]);

  const now = Date.now() / 1000;
  // 삭제된 반을 가리키는 고아 classId는 미배정으로 취급 — groupByClassId/리포트 작성 화면과 동일 기준
  const classIds = new Set(classes.map(c => c.id));
  const filtered = reports
    .filter(r => {
      if (draftOnly && !r.isDraft) return false;
      if (studentFilter && r.studentId !== studentFilter) return false;
      if (classFilter) {
        const st = students.find(s => s.id === r.studentId);
        const stClassId = st?.classId && classIds.has(st.classId) ? st.classId : null;
        if (classFilter === '__unassigned__') { if (stClassId) return false; }
        else if (stClassId !== classFilter) return false;
      }
      if (periodFilter !== 'all') {
        const ts = r.createdAt?.seconds || 0;
        const cutoff = periodFilter === 'week' ? 7 * 86400 : 30 * 86400;
        if (now - ts > cutoff) return false;
      }
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const hay = `${r.studentName||''} ${r.textbook||''} ${r.unit||''} ${r.teacherNote||''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

  const selected = filtered.find(r => r.id === selectedId) || filtered[0];
  // 삭제 확인 모달 전용 — selected는 selectedId가 없을 때 filtered[0]로 폴백하는데, 모달이 열려
  // 있는 사이 새 리포트가 실시간 구독으로 도착해 filtered[0]이 바뀌면 확인 대상이 조용히
  // 바뀌어버림. 모달을 연 시점의 id로 고정해서 조회.
  const deleteTarget = reports.find(r => r.id === deleteConfirmReport);

  const fmtDate = (r) => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '날짜 없음';

  const statusBadge = (r) => {
    // 결석 처리된 날은 리포트 내용이 없는 게 정상 — 작성/열람 배지보다 우선 표시
    if (r.attendance === '결석') return { label: '결석', bg: C.errorBg, color: C.errorDark };
    // 자동저장 draft — 선생님이 아직 최종 저장을 안 눌러 학부모에게 안 나간 상태
    if (r.isDraft) return { label: '작성 중', bg: C.warningBg, color: C.warningText };
    const isViewed = reportViews.some(v => v.reportId === r.id);
    if (isViewed) return { label: '열람 완료', bg: C.successBg, color: C.successDark };
    return { label: '작성 완료', bg: C.primaryLight, color: C.primary };
  };

  const handleCopyLink = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/report/${id}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // 방치된 draft 일괄 삭제 — 현재 필터에 걸린(=화면에 보이는) draft만 지움
  const draftIdsInView = filtered.filter(r => r.isDraft).map(r => r.id);
  const handleBulkDeleteDrafts = async () => {
    setBulkDeleting(true);
    await onBulkDelete?.(draftIdsInView);
    setBulkDeleting(false);
    setBulkDeleteConfirm(false);
    if (selectedId && draftIdsInView.includes(selectedId)) setSelectedId(null);
  };

  // 방치된 draft 정리 UI — 데스크톱/모바일 레이아웃 양쪽에서 재사용
  const renderDraftCleanupBar = () => {
    if (draftCount === 0) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button onClick={() => setDraftOnly(v => !v)}
          style={{
            padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
            border: draftOnly ? `1.5px solid ${C.warning}` : '1px solid #E5E7EB',
            background: draftOnly ? C.warningBg : '#fff',
            color: draftOnly ? C.warningText : '#6B7280',
          }}>
          작성 중만 ({draftCount})
        </button>
        {draftOnly && draftIdsInView.length > 0 && (
          <button onClick={() => setBulkDeleteConfirm(true)}
            style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', border: '1px solid #FECACA', background: '#FFF5F5', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Trash2 size={11} /> 방치된 초안 {draftIdsInView.length}건 삭제
          </button>
        )}
      </div>
    );
  };

  // 일괄 삭제 확인 모달 — 데스크톱/모바일 공용
  const renderBulkDeleteConfirm = () => bulkDeleteConfirm && (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '340px' }}>
        <div style={{ width: '44px', height: '44px', background: C.warningBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={20} color={C.warningText} />
        </div>
        <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px', textAlign: 'center' }}>
          방치된 초안 {draftIdsInView.length}건을 삭제할까요?
        </p>
        <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.6 }}>
          선생님이 쓰다가 저장하지 않고 나간 자동저장본이에요. 학부모에게 나간 적 없는 내용이라 삭제해도 안전합니다. 삭제 후 복구는 불가능합니다.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting}
            style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>취소</button>
          <button onClick={handleBulkDeleteDrafts} disabled={bulkDeleting}
            style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: bulkDeleting ? '#E5E7EB' : '#DC2626', color: bulkDeleting ? '#9CA3AF' : '#fff', cursor: bulkDeleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {bulkDeleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );

  // PC: 스플릿 뷰 / 모바일: 카드 리스트
  const isMobile = !useMediaQuery('(min-width: 768px)');

  if (isMobile) {
    return (
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7EB', borderRadius: '10px', background: '#fff', marginBottom: '12px' }}>
          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="학생명·교재·코멘트 검색"
            style={{ flex: 1, minWidth: 0, padding: '9px 12px', fontSize: '16px', border: 'none', outline: 'none', fontFamily: 'inherit', background: 'transparent' }} />
          <div style={{ width: '1px', height: '20px', background: '#E5E7EB', flexShrink: 0 }} />
          <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)}
            style={{ flexShrink: 0, maxWidth: '84px', padding: '9px 8px', fontSize: '14px', border: 'none', outline: 'none', fontFamily: 'inherit', background: 'transparent', color: '#374151' }}>
            <option value="">전체</option>
            {(students||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {classes.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
              style={{ width: '100%', padding: '9px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', background: '#fff' }}>
              <option value="">전체 반</option>
              <option value="__unassigned__">미배정</option>
              {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </select>
          </div>
        )}
        {renderDraftCleanupBar()}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              {searchText.trim() || studentFilter ? '검색 결과가 없습니다' : '작성된 리포트가 없습니다'}
            </div>
          )}
          {filtered.map(r => {
            const badge = statusBadge(r);
            return (
              <div key={r.id} onClick={() => setSelectedId(r.id)}
                style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>{r.studentName}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, background: badge.bg, color: badge.color, padding: '1px 7px', borderRadius: '8px' }}>{badge.label}</span>
                </div>
                <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>{fmtDate(r)} · {r.textbook}</p>
                {r.teacherNote && <p style={{ fontSize: '12px', color: '#374151', margin: '6px 0 0', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.teacherNote}</p>}
              </div>
            );
          })}
        </div>

        {/* 모바일 바텀시트 */}
        {selectedId && selected && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999 }} onClick={() => setSelectedId(null)}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '85vh', overflowY: 'auto', padding: '20px' }} onClick={e => e.stopPropagation()}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <p style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{selected.studentName}</p>
                    <span style={{ fontSize: '10px', fontWeight: 600, background: statusBadge(selected).bg, color: statusBadge(selected).color, padding: '1px 7px', borderRadius: '8px' }}>{statusBadge(selected).label}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>{fmtDate(selected)} · {selected.teacherName}</p>
                </div>
                <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
              </div>

              {(selected.textbook || selected.unit) && (
                <p style={{ fontSize: '13px', color: '#374151', marginBottom: '10px', fontWeight: 500 }}>
                  {[selected.textbook, selected.unit, selected.pages && `${selected.pages}쪽`].filter(Boolean).join(' · ')}
                </p>
              )}

              {(selected.homeworkRating != null || selected.conceptRating != null || selected.testScore) && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {selected.homeworkRating != null && <span style={{ fontSize: '12px', background: C.primaryLight, color: C.primary, padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>과제 {toPct(selected.homeworkRating)}%</span>}
                  {selected.conceptRating != null && <span style={{ fontSize: '12px', background: C.primaryLight, color: C.primary, padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>개념 {toPct(selected.conceptRating)}%</span>}
                  {selected.hasTest && selected.testScore && <span style={{ fontSize: '12px', background: '#FFF8EC', color: '#7A4F00', padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>시험 {selected.testScore}점</span>}
                </div>
              )}

              {selected.diagnosis?.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {selected.diagnosis.map((d, i) => (
                    <span key={i} style={{ fontSize: '11px', background: d.key === 'perfect' ? '#F0FAF5' : '#FDF0F0', color: d.key === 'perfect' ? '#0F6E56' : '#8A2020', padding: '3px 9px', borderRadius: '8px', fontWeight: 600 }}>{DIAG_LABELS[d.key] || d.key}</span>
                  ))}
                </div>
              )}

              {selected.teacherNote ? (
                <div style={{ background: '#F9FAFB', borderRadius: '8px', padding: '12px', marginBottom: '12px', borderLeft: `3px solid ${C.primary}` }}>
                  <p style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: 1.8, margin: 0 }}>{selected.teacherNote}</p>
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '12px', fontStyle: 'italic' }}>아직 작성된 코멘트가 없습니다</p>
              )}

              {selected.photoUrls?.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
                  {selected.photoUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`사진 ${i+1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '6px' }} />
                    </a>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: selected.isDraft ? '1fr 1fr' : '1fr 1fr 1fr', gap: '8px' }}>
                <button onClick={() => { onEdit(selected); setSelectedId(null); }}
                  style={{ padding: '11px', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <Pencil size={12} /> 수정
                </button>
                {/* 초안은 아직 학부모에게 보낼 상태가 아니라 링크 복사를 막음(DirectorView와 동일 기준) */}
                {!selected.isDraft && (
                  <button onClick={() => handleCopyLink(selected.id)}
                    style={{ padding: '11px', border: `1px solid ${C.primary}`, borderRadius: '8px', background: copied ? C.primary : '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: copied ? '#fff' : C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <LinkIcon size={12} /> {copied ? '✓ 복사됨' : '링크 복사'}
                  </button>
                )}
                <button onClick={() => setDeleteConfirmReport(selected.id)}
                  style={{ padding: '11px', border: '1px solid #FECACA', borderRadius: '8px', background: '#FFF5F5', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#DC2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <Trash2 size={12} /> 삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 모달 */}
        {deleteConfirmReport && deleteTarget && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px' }}>
              <div style={{ width: '44px', height: '44px', background: '#FEE2E2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Trash2 size={20} color="#DC2626" />
              </div>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px', textAlign: 'center' }}>리포트를 삭제할까요?</p>
              <div style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px', margin: '0 0 16px' }}>
                <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 4px', textAlign: 'center' }}><strong>{fmtDate(deleteTarget)}</strong></p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#DC2626', margin: 0, textAlign: 'center' }}>{deleteTarget.studentName} 학생 리포트</p>
              </div>
              <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center', margin: '0 0 20px' }}>삭제 후 복구가 불가능합니다.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setDeleteConfirmReport(null)}
                  style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>취소</button>
                <button onClick={() => { setDeleteConfirmReport(null); setSelectedId(null); onDelete(deleteConfirmReport); }}
                  style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: '#DC2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
              </div>
            </div>
          </div>
        )}
        {renderBulkDeleteConfirm()}
      </div>
    );
  }

  // PC: 스플릿 뷰
  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: 'calc(100dvh - 120px)', overflow: 'hidden' }}>

      {/* 좌측 목록 */}
      <div style={{ borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 필터 */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="검색..."
            style={{ width: '100%', padding: '7px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '8px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#FAFAFA' }} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '7px', fontFamily: 'inherit', background: '#fff', color: '#374151' }}>
              <option value="">전체 학생</option>
              {(students||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '7px', fontFamily: 'inherit', background: '#fff', color: '#374151' }}>
              <option value="all">전체 기간</option>
              <option value="week">이번 주</option>
              <option value="month">이번 달</option>
            </select>
          </div>
          {classes.length > 0 && (
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '7px', fontFamily: 'inherit', background: '#fff', color: '#374151', boxSizing: 'border-box' }}>
              <option value="">전체 반</option>
              <option value="__unassigned__">미배정</option>
              {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </select>
          )}
          <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>{filtered.length}건</p>
        </div>

        {draftCount > 0 && (
          <div style={{ padding: '10px 14px 0' }}>
            {renderDraftCleanupBar()}
          </div>
        )}

        {/* 리스트 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '13px', padding: '40px 20px' }}>리포트가 없습니다</p>
          ) : filtered.map(r => {
            const isSelected = (selected?.id === r.id);
            const badge = statusBadge(r);
            return (
              <div key={r.id} onClick={() => setSelectedId(r.id)}
                style={{
                  padding: '11px 14px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', transition: 'background 0.1s',
                  background: isSelected ? C.infoBg : 'transparent',
                  borderLeft: isSelected ? `2px solid ${C.info}` : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F9FAFB'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isSelected ? C.info : '#E5E7EB', color: isSelected ? '#fff' : '#374151', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {r.studentName?.[0]}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>{r.studentName}</span>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 600, background: badge.bg, color: badge.color, padding: '1px 6px', borderRadius: '8px', flexShrink: 0 }}>{badge.label}</span>
                </div>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 2px', paddingLeft: '28px' }}>{fmtDate(r)}</p>
                <p style={{ fontSize: '11px', color: '#6B7280', margin: 0, paddingLeft: '28px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[r.textbook, r.subject].filter(Boolean).join(' · ')}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 우측 상세 — 본문(폭 제한) + 학생 맥락 사이드 패널 */}
      {selected ? (
        <div style={{ overflowY: 'auto', padding: '24px 28px', background: '#FAFAFA' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 460px', maxWidth: '720px', minWidth: 0 }}>

          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #E5E7EB' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{selected.studentName}</h3>
                <span style={{ fontSize: '11px', fontWeight: 600, background: statusBadge(selected).bg, color: statusBadge(selected).color, padding: '2px 9px', borderRadius: '10px' }}>{statusBadge(selected).label}</span>
                {selected.photoUrls?.length > 0 && <span style={{ fontSize: '11px', color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: '8px' }}>사진 {selected.photoUrls.length}장</span>}
              </div>
              <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>{fmtDate(selected)} · {selected.teacherName} · {[selected.textbook, selected.subject].filter(Boolean).join(' · ')}</p>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button onClick={() => onEdit(selected)}
                style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>
                수정
              </button>
              <button onClick={() => handleCopyLink(selected.id)}
                style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, border: `1px solid ${C.primary}`, borderRadius: '8px', background: copied ? C.primary : '#fff', cursor: 'pointer', color: copied ? '#fff' : C.primary, fontFamily: 'inherit' }}>
                {copied ? '✓ 복사됨' : '링크 복사'}
              </button>
              {deleteConfirmReport === selected.id ? null : (
                <button onClick={() => setDeleteConfirmReport(selected.id)}
                  style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid #FECACA', borderRadius: '8px', background: '#FFF5F5', cursor: 'pointer', color: '#DC2626', fontFamily: 'inherit' }}>
                  삭제
                </button>
              )}
            </div>
          </div>

          {/* 결석 처리된 날 — 평가/코멘트가 원래 비어있는 게 정상이라, 빈 칸 대신 안내 카드로 표시 */}
          {selected.attendance === '결석' && (
            <div style={{ marginBottom: '20px', background: C.errorBg, border: `1px solid ${C.error}40`, borderRadius: '10px', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', lineHeight: 1 }}>🚫</span>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 700, color: C.errorDark, margin: 0 }}>결석 처리된 날이에요</p>
                <p style={{ fontSize: '12px', color: C.errorDark, opacity: 0.75, margin: '2px 0 0' }}>수업이 없어 평가·코멘트가 기록되지 않았어요</p>
              </div>
            </div>
          )}

          {/* 평가 지표 */}
          {selected.attendance !== '결석' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: '과제 평가', value: selected.homeworkRating != null ? `${toPct(selected.homeworkRating)}%` : '—', color: C.primary },
              { label: '개념 평가', value: selected.conceptRating != null ? `${toPct(selected.conceptRating)}%` : '—', color: C.primary },
              { label: '단원평가', value: selected.hasTest && selected.testScore ? `${selected.testScore}점` : '—', color: '#1A1A1A' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '14px 16px' }}>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 6px', fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>
          )}

          {/* 진단 태그 */}
          {selected.diagnosis?.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>진단 태그</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {selected.diagnosis.map(d => {
                  const c = DIAG_COLORS[d.key] || { bg: '#F3F4F6', color: '#374151', border: '#E5E7EB' };
                  return <span key={d.key} style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '10px', background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontWeight: 600 }}>{DIAG_LABELS[d.key] || d.key}</span>;
                })}
              </div>
            </div>
          )}

          {/* 선생님 코멘트 — 퀵 태그 파싱 */}
          {selected.attendance !== '결석' && (() => {
            const raw = selected.teacherNote || '';
            // [태그] 패턴 추출
            const tagPattern = /\[([^\]]+)\]/g;
            const tags = [];
            let match;
            while ((match = tagPattern.exec(raw)) !== null) {
              tags.push(match[1]);
            }
            // 본문에서 태그 제거
            const cleanNote = raw.replace(/\[([^\]]+)\]\s*/g, '').trim();

            const TAG_COLORS = {
              '연산 실수 주의': { bg: '#FFF8EC', color: '#8A5A00' },
              '응용 연습 필요': { bg: '#FDF0F0', color: '#8A2020' },
              '개념 완성':      { bg: '#F0FAF5', color: '#0F6E56' },
              '집중력 우수':    { bg: '#EAF1FB', color: '#0D2D6B' },
              '과제 완성도 높음':{ bg: '#F0FAF5', color: '#0F6E56' },
              '복습 권장':      { bg: '#F3F0FA', color: '#4A3080' },
            };

            return (
              <div style={{ marginBottom: '18px' }}>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>선생님 코멘트</p>

                {/* 퀵 태그 칩 */}
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {tags.map((tag, i) => {
                      const c = TAG_COLORS[tag] || { bg: '#F3F4F6', color: '#374151' };
                      return (
                        <span key={i} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '10px', background: c.bg, color: c.color }}>
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* 본문 */}
                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '14px 16px', borderLeft: `3px solid ${C.primary}` }}>
                  {cleanNote ? (
                    <p style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: 1.9, margin: 0 }}>{cleanNote}</p>
                  ) : raw ? (
                    <p style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: 1.9, margin: 0 }}>{raw}</p>
                  ) : (
                    <p style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: 1.9, margin: 0, fontStyle: 'italic' }}>아직 작성된 코멘트가 없습니다</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 학습 범위 */}
          {(selected.textbook || selected.unit || selected.pages) && (
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>학습 범위</p>
              <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>
                {[selected.textbook, selected.unit, selected.pages && `${selected.pages}쪽`].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}

          {/* 다음 계획 */}
          {selected.nextPlan && (
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>다음 수업 계획</p>
              <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>{selected.nextPlan}</p>
            </div>
          )}

          {/* 수업 사진 */}
          {selected.photoUrls?.length > 0 && (
            <div>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>수업 사진 ({selected.photoUrls.length}장)</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                {selected.photoUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`수업 사진 ${i + 1}`}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E5E7EB', cursor: 'pointer', display: 'block' }} />
                  </a>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* 학생 맥락 사이드 패널 — 넓은 화면의 우측 여백 활용 */}
          {(() => {
            const hist = reports
              .filter(r => r.studentId === selected.studentId)
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            const others = hist.filter(r => r.id !== selected.id).slice(0, 5);
            const recentAsc = [...hist].slice(0, 6).reverse();
            const diagCountMap = {};
            hist.forEach(r => (r.diagnosis || []).forEach(d => {
              if (d.key !== 'perfect') diagCountMap[d.key] = (diagCountMap[d.key] || 0) + 1;
            }));
            const topDiag = Object.entries(diagCountMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
            const cardStyle = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '14px 16px' };
            const cardTitle = { fontSize: '11px', color: '#9CA3AF', margin: '0 0 10px', fontWeight: 600, letterSpacing: '0.06em' };
            const chartW = 260, chartH = 40, padX = 8;
            const xOf = (i) => padX + (i / Math.max(1, recentAsc.length - 1)) * (chartW - padX * 2);
            const yOf = (v) => chartH - 4 - (v / 100) * (chartH - 10);
            return (
              <aside style={{ flex: '0 1 340px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 최근 평가 추이 */}
                {recentAsc.length >= 2 && (
                  <div style={cardStyle}>
                    <p style={cardTitle}>최근 평가 추이 (최근 {recentAsc.length}회)</p>
                    {[['과제', 'homeworkRating', '#0D2D6B'], ['개념', 'conceptRating', '#0F6E56']].map(([label, key, color]) => {
                      const pts = recentAsc.map((r, i) => ({ r, i, v: r[key] != null ? toPct(r[key]) : null }));
                      const withVal = pts.filter(p => p.v != null);
                      const linePath = withVal.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.i)},${yOf(p.v)}`).join(' ');
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '10px', color: '#6B7280', width: '26px', flexShrink: 0, fontWeight: 600 }}>{label}</span>
                          <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH} style={{ overflow: 'visible', flex: 1 }}>
                            <line x1={padX} y1={chartH - 4} x2={chartW - padX} y2={chartH - 4} stroke="#F0F0F0" strokeWidth="1" />
                            {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
                            {pts.map((p, idx) => {
                              const isCurrent = p.r.id === selected.id;
                              const cy = p.v != null ? yOf(p.v) : chartH - 4;
                              const content = [p.r.unit, p.r.textbook].filter(Boolean)[0] || '내용 없음';
                              const colW = (chartW - padX * 2) / Math.max(1, pts.length - 1 || 1);
                              const onHover = (e) => setTrendTooltip({
                                x: e.clientX, y: e.clientY,
                                text: `${fmtDate(p.r)} · ${label} ${p.v != null ? `${p.v}%` : '미입력'} · ${content}`,
                              });
                              return (
                                <g key={idx}>
                                  <circle cx={xOf(p.i)} cy={cy}
                                    r={isCurrent ? 4.5 : p.v != null ? 3 : 2}
                                    fill={isCurrent ? '#C9A227' : p.v != null ? color : '#E5E7EB'}
                                    stroke="#fff" strokeWidth={isCurrent ? 1.5 : 1}
                                    style={{ pointerEvents: 'none' }}
                                  />
                                  {/* 넓은 히트 영역 — 실제 점은 작지만 마우스 인식 범위는 열 전체로 */}
                                  <rect x={xOf(p.i) - colW / 2} y={0} width={colW} height={chartH}
                                    fill="transparent" style={{ cursor: 'pointer' }}
                                    onMouseEnter={onHover}
                                    onMouseMove={onHover}
                                    onMouseLeave={() => setTrendTooltip(null)}
                                  />
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      );
                    })}
                    <p style={{ fontSize: '9px', color: '#B0B0B0', margin: 0 }}>금색 = 현재 보는 리포트 · 점에 마우스를 올리면 상세가 보여요</p>
                  </div>
                )}

                {/* 이전 리포트 바로가기 */}
                {others.length > 0 && (
                  <div style={cardStyle}>
                    <p style={cardTitle}>이 학생의 다른 리포트</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {others.map(r => (
                        <button key={r.id} onClick={() => setSelectedId(r.id)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '8px', background: '#F9FAFB', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
                          <span style={{ fontSize: '11px', color: '#374151', fontWeight: 600 }}>{fmtDate(r)}</span>
                          <span style={{ fontSize: '10px', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.unit || r.textbook || ''}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 반복 진단 */}
                {topDiag.length > 0 && (
                  <div style={cardStyle}>
                    <p style={cardTitle}>반복 진단 TOP {topDiag.length}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {topDiag.map(([key, count]) => (
                        <span key={key} style={{ fontSize: '11px', fontWeight: 600, background: DIAG_COLORS[key]?.bg || '#F3F4F6', color: DIAG_COLORS[key]?.color || '#374151', border: `1px solid ${DIAG_COLORS[key]?.border || '#E5E7EB'}`, padding: '4px 10px', borderRadius: '12px' }}>
                          {DIAG_LABELS[key] || key} ×{count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            );
          })()}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '13px', background: '#FAFAFA' }}>
          좌측에서 리포트를 선택하세요
        </div>
      )}

    </div>

      {/* PC 삭제 확인 모달 */}
      {deleteConfirmReport && deleteTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ width: '44px', height: '44px', background: '#FEE2E2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={20} color="#DC2626" />
            </div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px', textAlign: 'center' }}>리포트를 삭제할까요?</p>
            <div style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px', margin: '0 0 16px' }}>
              <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 4px', textAlign: 'center' }}><strong>{fmtDate(deleteTarget)}</strong></p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#DC2626', margin: 0, textAlign: 'center' }}>{deleteTarget.studentName} 학생 리포트</p>
            </div>
            <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center', margin: '0 0 20px' }}>삭제 후 복구가 불가능합니다.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteConfirmReport(null)}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>취소</button>
              <button onClick={() => { setDeleteConfirmReport(null); setSelectedId(null); onDelete(deleteConfirmReport); }}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: '#DC2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {trendTooltip && (
        <div style={{
          position: 'fixed', left: trendTooltip.x + 14, top: trendTooltip.y - 12,
          background: '#1A1A1A', color: '#fff', fontSize: '11px', padding: '6px 10px',
          borderRadius: '7px', pointerEvents: 'none', zIndex: 10001, fontFamily: 'inherit',
          whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>{trendTooltip.text}</div>
      )}
      {renderBulkDeleteConfirm()}
    </>
  );
}
