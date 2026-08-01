import React, { useState } from 'react';
import { Pencil, Trash2, AlertTriangle, Link as LinkIcon, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { toPct, fmtPages } from '../growth.js';
import { DIAG_LABELS, DIAG_SOFT as DIAG_COLORS, WRONG_TAG_LABELS } from '../diagnosis.js';
import { useMediaQuery, useEscapeClose, useFocusTrap } from '../hooks.js';
import { C } from '../tokens.jsx';
import { onKeyActivate } from './shared.jsx';

export default function HistoryView({ reports, students, classes = [], reportViews = [], onDelete, onEdit, onBulkDelete }) {
  const [selectedId, setSelectedId] = useState(null);
  const [deleteConfirmReport, setDeleteConfirmReport] = useState(null);
  const [studentFilter, setStudentFilter] = useState('');
  const [classFilter, setClassFilter] = useState(''); // '' | '__unassigned__' | classId
  const [searchText, setSearchText] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  // 'all' | 'draft' | 'viewed' — 모바일의 "작성 중만" 토글과 PC의 상태 탭(전체/작성 중/열람 완료)이 공유
  const [statusTab, setStatusTab] = useState('all');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [trendTooltip, setTrendTooltip] = useState(null); // { x, y, text }
  const [noteOpen, setNoteOpen] = useState(false); // 선생님 코멘트 "원문 보기" 접기/펼침
  const [trendOpen, setTrendOpen] = useState(true); // 모바일 M2 — "최근 평가 추이" 접이식 섹션, 기본 펼침
  const [filterOpen, setFilterOpen] = useState(false); // PC 좌측 목록 — 필터 셀렉트 접기/펼침
  const [pcViewMode, setPcViewMode] = useState('date'); // PC 좌측 목록 — '날짜순' 기본(승인된 결정 ①)
  const [collapsedStudents, setCollapsedStudents] = useState(new Set()); // PC 학생순 보기에서 접힌 학생 studentId

  // 다른 리포트를 선택하면 이전 리포트의 펼침 상태가 새 리포트에 그대로 남지 않게 초기화
  React.useEffect(() => { setNoteOpen(false); }, [selectedId]);

  // 모달 Escape 닫기 — 3개 오버레이(일괄삭제 확인/모바일 바텀시트/삭제 확인, PC·모바일 공용)
  useEscapeClose(() => setBulkDeleteConfirm(false), bulkDeleteConfirm);
  useEscapeClose(() => setSelectedId(null), !!selectedId);
  useEscapeClose(() => setDeleteConfirmReport(null), !!deleteConfirmReport);
  // 포커스 트랩 — deleteConfirmRef는 모바일/PC 두 위치에서 재사용(동시에 마운트 안 되니 안전)
  const bulkDeleteRef = React.useRef(null);
  const bottomSheetRef = React.useRef(null);
  const deleteConfirmRef = React.useRef(null);
  useFocusTrap(bulkDeleteRef, bulkDeleteConfirm);
  useFocusTrap(bottomSheetRef, !!selectedId);
  useFocusTrap(deleteConfirmRef, !!deleteConfirmReport);

  const draftCount = reports.filter(r => r.isDraft).length;
  // 미작성 배너용 — 승인된 결정 ③: 전체 기간 대상, 가장 오래된 미작성 날짜도 함께 표시
  const oldestDraft = reports.filter(r => r.isDraft).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))[0];

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
      if (statusTab === 'draft' && !r.isDraft) return false;
      if (statusTab === 'viewed' && !(!r.isDraft && r.attendance !== '결석' && reportViews.some(v => v.reportId === r.id))) return false;
      if (statusTab === 'absent' && r.attendance !== '결석') return false;
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

  // 방치된 draft 정리 UI — 모바일 레이아웃에서 재사용(PC는 상태 탭 + 미작성 배너로 대체)
  const renderDraftCleanupBar = () => {
    if (draftCount === 0) return null;
    const draftOnly = statusTab === 'draft';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button onClick={() => setStatusTab(v => v === 'draft' ? 'all' : 'draft')}
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
            style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Trash2 size={11} /> 방치된 초안 {draftIdsInView.length}건 삭제
          </button>
        )}
      </div>
    );
  };

  // 일괄 삭제 확인 모달 — 데스크톱/모바일 공용
  const renderBulkDeleteConfirm = () => bulkDeleteConfirm && (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div ref={bulkDeleteRef} style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '340px' }}>
        <div style={{ width: '44px', height: '44px', background: C.warningBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={20} color={C.warningText} />
        </div>
        <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px', textAlign: 'center' }}>
          방치된 초안 {draftIdsInView.length}건을 삭제할까요?
        </p>
        <p style={{ fontSize: '12px', color: '#6C7586', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.6 }}>
          선생님이 쓰다가 저장하지 않고 나간 자동저장본이에요. 학부모에게 나간 적 없는 내용이라 삭제해도 안전합니다. 삭제 후 복구는 불가능합니다.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting}
            style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>취소</button>
          <button onClick={handleBulkDeleteDrafts} disabled={bulkDeleting}
            style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: bulkDeleting ? '#E5E7EB' : C.danger, color: bulkDeleting ? '#6C7586' : '#fff', cursor: bulkDeleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {bulkDeleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );

  // PC: 스플릿 뷰 / 모바일: 카드 리스트. App.jsx의 isPc(900px)와 기준을 맞춘다 — 예전엔 768px을
  // 썼는데, 768~899px 구간에서 App은 여전히 모바일 헤더+하단 탭을 그리면서 여기는 PC 스플릿뷰를
  // 그려서 하단 탭 위에 겹치고 108px 오프셋도 안 맞아 이중 스크롤이 생기던 버그가 있었음
  const isMobile = !useMediaQuery('(min-width: 900px)');
  // 3분할(목록·본문·분석) 기준 — 목록 392 + 분석 360이 고정으로 들어가서 이보다 좁으면
  // 본문 읽을 폭이 안 나옴. 1280 미만에선 분석 패널이 본문 옆/아래로 wrap되는 기존 동작 유지.
  const isUltraWide = useMediaQuery('(min-width: 1280px)');

  // 모바일 카드 요약 줄 — [태그] 제거 후 첫 문단, 없으면 상태에 맞는 안내 문구
  const noteSummary = (r) => {
    const clean = (r.teacherNote || '').replace(/\[([^\]]+)\]\s*/g, '').trim();
    if (clean) return clean.split('\n')[0];
    if (r.attendance === '결석') return '결석으로 수업이 진행되지 않았습니다.';
    if (r.isDraft) return '평가·코멘트가 아직 비어 있습니다. 이어서 작성하세요.';
    return '';
  };

  if (isMobile) {
    const mobileTabs = [['all', '전체'], ['draft', '작성 중'], ['viewed', '열람 완료'], ['absent', '결석']];
    let lastMobileDate = null;
    return (
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#171719' }}>기록 보관소</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>{filtered.length} / {reports.length}건</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="학생 · 교재 · 코멘트 검색"
            style={{ flex: 1, minWidth: 0, border: '1px solid #DCDFE4', borderRadius: '8px', padding: '11px 12px', fontSize: '16px', fontFamily: 'inherit', color: '#171719', background: '#fff' }} />
          <button onClick={() => setFilterOpen(v => !v)}
            style={{ border: '1px solid #DCDFE4', borderRadius: '8px', background: filterOpen ? '#EFF3FA' : '#fff', color: '#0D2D6B', fontSize: '13px', fontWeight: 700, padding: '0 16px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit' }}>
            필터
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', marginBottom: '10px' }}>
          {mobileTabs.map(([key, label]) => (
            <button key={key} onClick={() => setStatusTab(key)}
              style={{
                border: `1px solid ${statusTab === key ? C.primary : '#DCDFE4'}`, borderRadius: '16px',
                background: statusTab === key ? C.primary : '#fff', color: statusTab === key ? '#fff' : '#4B4D52',
                fontSize: '12px', fontWeight: 700, padding: '8px 14px', whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {label}
            </button>
          ))}
        </div>

        {filterOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '8px', marginBottom: '10px' }}>
            <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)}
              style={{ width: '100%', border: '1px solid #DCDFE4', borderRadius: '8px', padding: '10px', fontSize: '16px', fontWeight: 600, color: '#171719', background: '#fff', boxSizing: 'border-box' }}>
              <option value="">전체 학생</option>
              {(students||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
              style={{ width: '100%', border: '1px solid #DCDFE4', borderRadius: '8px', padding: '10px', fontSize: '16px', fontWeight: 600, color: '#171719', background: '#fff', boxSizing: 'border-box' }}>
              <option value="all">전체 기간</option>
              <option value="week">이번 주</option>
              <option value="month">이번 달</option>
            </select>
            {classes.length > 0 && (
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                style={{ width: '100%', gridColumn: '1 / -1', border: '1px solid #DCDFE4', borderRadius: '8px', padding: '10px', fontSize: '16px', fontWeight: 600, color: '#171719', background: '#fff', boxSizing: 'border-box' }}>
                <option value="">전체 반</option>
                <option value="__unassigned__">미배정</option>
                {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
              </select>
            )}
          </div>
        )}

        {/* 미작성 배너 — 전체 기간 대상 + 가장 오래된 미작성 날짜 */}
        {draftCount > 0 && (
          <button onClick={() => setStatusTab('draft')}
            style={{ width: '100%', border: '1px solid #EFE0B8', borderRadius: '8px', background: '#FDF6E3', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '10px' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#8A6A22' }}>코멘트 미작성 {draftCount}건</span>
              {oldestDraft && <span style={{ fontSize: '10px', fontWeight: 600, color: '#8A6A22', opacity: 0.85 }}>가장 오래된 건 {fmtDate(oldestDraft)}</span>}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#8A6A22', whiteSpace: 'nowrap' }}>이어서 작성 →</span>
          </button>
        )}
        {statusTab === 'draft' && draftIdsInView.length > 0 && (
          <button onClick={() => setBulkDeleteConfirm(true)}
            style={{ marginBottom: '10px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Trash2 size={11} /> 방치된 초안 {draftIdsInView.length}건 삭제
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#6C7586', fontSize: '13px' }}>
              {searchText.trim() || studentFilter ? '검색 결과가 없습니다' : '작성된 리포트가 없습니다'}
            </div>
          )}
          {filtered.map(r => {
            const badge = statusBadge(r);
            const d = fmtDate(r);
            const showDate = d !== lastMobileDate;
            lastMobileDate = d;
            const hw = r.homeworkRating != null ? toPct(r.homeworkRating) : null;
            const cc = r.conceptRating != null ? toPct(r.conceptRating) : null;
            const summary = noteSummary(r);
            return (
              <React.Fragment key={r.id}>
                {showDate && (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)', padding: '6px 2px 0' }}>{d}</span>
                )}
                <div role="button" tabIndex={0} onClick={() => setSelectedId(r.id)} onKeyDown={onKeyActivate(() => setSelectedId(r.id))}
                  style={{ background: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #E4E6EB', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#171719' }}>{r.studentName}</span>
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.textbook}</span>
                    </span>
                    <span style={{ background: badge.bg, color: badge.color, fontSize: '10px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>{badge.label}</span>
                  </div>
                  {summary && <span style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1.6, color: 'rgba(55,56,60,0.75)' }}>{summary}</span>}
                  {(hw != null || cc != null) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>과제</span>
                        <span style={{ flex: 1, minWidth: 0, height: '5px', borderRadius: '3px', background: '#E7EAF2', overflow: 'hidden', display: 'flex' }}>
                          <span style={{ width: `${hw ?? 0}%`, background: '#0D2D6B', display: 'block' }} />
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#0D2D6B', whiteSpace: 'nowrap' }}>{hw != null ? `${hw}%` : '—'}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>개념</span>
                        <span style={{ flex: 1, minWidth: 0, height: '5px', borderRadius: '3px', background: '#E7EAF2', overflow: 'hidden', display: 'flex' }}>
                          <span style={{ width: `${cc ?? 0}%`, background: '#2E5C9E', display: 'block' }} />
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#2E5C9E', whiteSpace: 'nowrap' }}>{cc != null ? `${cc}%` : '—'}</span>
                      </span>
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* 모바일 바텀시트(M2) — 헤더/액션은 고정, 중간만 스크롤 */}
        {selectedId && selected && (
          <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999 }} onClick={() => setSelectedId(null)}>
            <div ref={bottomSheetRef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

              <div style={{ padding: '10px 0 0', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#DCDFE4', display: 'block' }} />
              </div>

              <div style={{ padding: '12px 20px 14px', borderBottom: '1px solid #EEF0F3', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexShrink: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.3px', color: '#171719' }}>{selected.studentName}</span>
                    <span style={{ background: statusBadge(selected).bg, color: statusBadge(selected).color, fontSize: '10px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>{statusBadge(selected).label}</span>
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(55,56,60,0.75)' }}>{fmtDate(selected)} · {selected.teacherName}</span>
                </div>
                <button onClick={() => setSelectedId(null)}
                  style={{ width: '44px', height: '44px', border: 'none', borderRadius: '8px', background: '#F1F2F5', color: '#4B4D52', fontSize: '16px', fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
              </div>

              {/* 스크롤 본문 */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

                {selected.attendance === '결석' && (
                  <div style={{ background: C.errorBg, border: `1px solid ${C.error}40`, borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px', lineHeight: 1 }}>🚫</span>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: C.errorDark, margin: 0 }}>결석 처리된 날이에요</p>
                      <p style={{ fontSize: '11px', color: C.errorDark, opacity: 0.75, margin: '2px 0 0' }}>수업이 없어 평가·코멘트가 기록되지 않았어요</p>
                    </div>
                  </div>
                )}

                {/* 평가 지표 — 막대 2개 + 단원평가 캡션(PC 중앙 상세와 동일 구조) */}
                {selected.attendance !== '결석' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {[
                      { label: '과제 수행', value: selected.homeworkRating, color: '#0D2D6B' },
                      { label: '개념 이해', value: selected.conceptRating, color: '#2E5C9E' },
                    ].map((m, i) => {
                      const pct = m.value != null ? toPct(m.value) : null;
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#171719' }}>{m.label}</span>
                            <span style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1, color: m.color }}>{pct != null ? pct : '-'}<span style={{ fontSize: '11px', fontWeight: 600 }}>%</span></span>
                          </div>
                          <div style={{ height: '8px', borderRadius: '6px', background: '#E7EAF2', overflow: 'hidden', display: 'flex' }}>
                            <div style={{ width: `${pct ?? 0}%`, background: m.color }} />
                          </div>
                        </div>
                      );
                    })}
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)' }}>
                      {selected.hasTest && selected.testScore ? `단원평가 ${selected.testScore}점` : '단원평가 미실시'}
                    </span>
                  </div>
                )}

                {selected.diagnosis?.length > 0 && (
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {selected.diagnosis.map((d, i) => (
                      <span key={i} style={{ fontSize: '11px', background: d.key === 'perfect' ? C.successBg : '#FDF0F0', color: d.key === 'perfect' ? C.successDark : C.errorDark, padding: '3px 9px', borderRadius: '8px', fontWeight: 600 }}>{DIAG_LABELS[d.key] || d.key}</span>
                    ))}
                  </div>
                )}

                {/* 선생님 코멘트 — 결론 → 눈에 띈 문항 → 원문 접기(PC 중앙 상세와 동일 구조) */}
                {selected.attendance !== '결석' && (() => {
                  const raw = selected.teacherNote || '';
                  const tagPattern = /\[([^\]]+)\]/g;
                  const tagSet = new Set();
                  let match;
                  while ((match = tagPattern.exec(raw)) !== null) tagSet.add(match[1]);
                  const primaryTag = [...tagSet][0];
                  const cleanNote = raw.replace(/\[([^\]]+)\]\s*/g, '').trim();
                  const noteParagraphs = (cleanNote || raw).split('\n').filter(Boolean);
                  const noteLead = noteParagraphs[0] || '';
                  const noteRest = noteParagraphs.slice(1);
                  const noteCollapsible = noteRest.join(' ').length > 200;
                  const noteRestVisible = noteCollapsible ? noteOpen : true;
                  const hasWrongItems = selected.wrongItems?.length > 0;
                  const TAG_COLORS = {
                    '연산 실수 주의': { bg: C.warningBg, color: C.warningText },
                    '응용 연습 필요': { bg: '#FDF0F0', color: C.errorDark },
                    '개념 완성':      { bg: C.successBg, color: C.successDark },
                    '집중력 우수':    { bg: '#EAF1FB', color: '#0D2D6B' },
                    '과제 완성도 높음':{ bg: C.successBg, color: C.successDark },
                    '복습 권장':      { bg: '#F3F0FA', color: '#4A3080' },
                  };

                  if (!noteLead && !hasWrongItems) {
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#171719' }}>선생님 코멘트</span>
                        <span style={{ fontSize: '13px', color: '#6C7586', fontStyle: 'italic' }}>아직 작성된 코멘트가 없습니다</span>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#171719' }}>선생님 코멘트</span>
                        {primaryTag && (
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', ...(TAG_COLORS[primaryTag] || { bg: '#F3F4F6', color: '#374151' }) }}>{primaryTag}</span>
                        )}
                      </div>
                      {noteLead && <span style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.6, color: '#171719' }}>{noteLead}</span>}

                      {hasWrongItems && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)' }}>눈에 띈 문항</span>
                          {selected.wrongItems.map((w, i) => {
                            const extra = w.memo?.trim() || (w.tags?.length ? w.tags.map(t => WRONG_TAG_LABELS[t]).filter(Boolean).join(', ') : '');
                            return (
                              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                                <span style={{ minWidth: '34px', fontSize: '12px', fontWeight: 700, color: '#0D2D6B', flexShrink: 0 }}>{w.number}번</span>
                                <span style={{ fontSize: '12.5px', fontWeight: 500, lineHeight: 1.6, color: '#171719' }}>{w.type}{extra ? ` — ${extra}` : ''}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {noteRestVisible && noteRest.length > 0 && (
                        <div style={{ background: '#F7F8FA', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)' }}>학부모에게 전달된 원문</span>
                          {noteRest.map((p, i) => <p key={i} style={{ fontSize: '12.5px', fontWeight: 500, lineHeight: 1.8, color: '#171719', margin: 0 }}>{p}</p>)}
                        </div>
                      )}

                      {noteCollapsible && (
                        <button onClick={() => setNoteOpen(v => !v)}
                          style={{ alignSelf: 'flex-start', border: '1px solid #DCDFE4', borderRadius: '18px', background: '#fff', color: '#0D2D6B', fontSize: '12px', fontWeight: 700, padding: '9px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {noteOpen ? '접기' : '학부모에게 전달된 원문 보기'}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* 학습 범위 / 다음 수업 계획 — 모바일은 폭이 좁아 세로로 쌓음(PC는 2열 카드) */}
                {(selected.textbook || selected.unit || selected.pages) && (
                  <div style={{ border: '1px solid #E4E6EB', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ height: '3px', background: '#0D2D6B' }} />
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0 }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', color: 'rgba(55,56,60,0.75)' }}>학습 범위</span>
                        {selected.textbook && <span style={{ fontSize: '15px', fontWeight: 700, color: '#171719' }}>{selected.textbook}</span>}
                        {selected.unit && <span style={{ alignSelf: 'flex-start', background: '#EFF3FA', color: '#0D2D6B', fontSize: '11px', fontWeight: 700, padding: '4px 9px', borderRadius: '6px' }}>{selected.unit}</span>}
                      </div>
                      {selected.pages && <span style={{ fontSize: '19px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.4px', color: '#0D2D6B', flexShrink: 0 }}>{fmtPages(selected.pages)}</span>}
                    </div>
                  </div>
                )}
                {selected.nextPlan && (
                  <div style={{ border: '1px solid #E4E6EB', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', color: 'rgba(55,56,60,0.75)' }}>다음 수업 계획</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.5, color: '#171719' }}>{selected.nextPlan}</span>
                  </div>
                )}

                {selected.photoUrls?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#171719' }}>수업 사진 {selected.photoUrls.length}장</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px' }}>
                      {selected.photoUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`수업 사진 ${i + 1}`} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '10px', display: 'block' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 최근 평가 추이 + 반복 진단 — PC 오른쪽 레일 내용을 접이식 섹션으로 흡수 */}
                {(() => {
                  const hist = reports.filter(r => r.studentId === selected.studentId).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                  const recentAsc = [...hist].slice(0, 6).reverse();
                  const diagCountMap = {};
                  hist.forEach(r => (r.diagnosis || []).forEach(d => { if (d.key !== 'perfect') diagCountMap[d.key] = (diagCountMap[d.key] || 0) + 1; }));
                  const topDiag = Object.entries(diagCountMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
                  if (recentAsc.length < 2 && topDiag.length === 0) return null;

                  const chartW = 220, TOP = 4, BOT = 84;
                  const xOf = (i) => (i / Math.max(1, recentAsc.length - 1)) * chartW;
                  const yOf = (v) => BOT - (v / 100) * (BOT - TOP);
                  const shortDate = (r) => r.createdAt?.seconds
                    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
                    : '';
                  const buildSegments = (key) => {
                    const out = [];
                    let cur = [];
                    recentAsc.forEach((r, i) => {
                      const v = r[key] != null ? toPct(r[key]) : null;
                      if (v == null) { if (cur.length > 1) out.push([...cur]); cur = []; return; }
                      cur.push(`${xOf(i)},${yOf(v)}`);
                    });
                    if (cur.length > 1) out.push(cur);
                    return out.map(pts => pts.join(' '));
                  };
                  const absenceXs = recentAsc.map((r, i) => r.attendance === '결석' ? xOf(i) : null).filter(x => x != null);

                  return (
                    <div style={{ border: '1px solid #E4E6EB', borderRadius: '12px', overflow: 'hidden' }}>
                      <button onClick={() => setTrendOpen(v => !v)}
                        style={{ width: '100%', border: 'none', background: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#171719' }}>최근 평가 추이</span>
                          <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)' }}>최근 {recentAsc.length}회 · 반복 진단</span>
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)' }}>{trendOpen ? '접기 ▴' : '열기 ▾'}</span>
                      </button>
                      {trendOpen && (
                        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ height: '1px', background: '#EEF0F3' }} />
                          {recentAsc.length >= 2 && (
                            <>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                {[['과제', '#0D2D6B'], ['개념', '#2E5C9E'], ['결석 · 기록 없음', '#C9CCD1']].map(([label, color]) => (
                                  <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                                    {label}
                                  </span>
                                ))}
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: `${BOT - TOP}px`, paddingBottom: '14px' }}>
                                  {['100', '50', '0'].map(t => <span key={t} style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(55,56,60,0.75)', lineHeight: 1 }}>{t}</span>)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <svg viewBox={`0 0 ${chartW} ${BOT + 8}`} width="100%" height={BOT + 8} style={{ overflow: 'visible', display: 'block' }}>
                                    <line x1="0" y1={TOP} x2={chartW} y2={TOP} stroke="#EEF0F3" strokeWidth="1" />
                                    <line x1="0" y1={(TOP + BOT) / 2} x2={chartW} y2={(TOP + BOT) / 2} stroke="#EEF0F3" strokeWidth="1" />
                                    <line x1="0" y1={BOT} x2={chartW} y2={BOT} stroke="#EEF0F3" strokeWidth="1" />
                                    {buildSegments('homeworkRating').map((pts, i) => <polyline key={`hw-${i}`} points={pts} fill="none" stroke="#0D2D6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
                                    {buildSegments('conceptRating').map((pts, i) => <polyline key={`cc-${i}`} points={pts} fill="none" stroke="#2E5C9E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
                                    {absenceXs.map(x => (
                                      <g key={x}>
                                        <line x1={x} y1={TOP} x2={x} y2={BOT} stroke="#DCDFE4" strokeWidth="1" strokeDasharray="2 3" />
                                        <circle cx={x} cy={BOT + 4} r="2.5" fill="#C9CCD1" />
                                      </g>
                                    ))}
                                    {recentAsc.map((r, i) => {
                                      const isCurrent = r.id === selected.id;
                                      const hw = r.homeworkRating != null ? toPct(r.homeworkRating) : null;
                                      const cc = r.conceptRating != null ? toPct(r.conceptRating) : null;
                                      return (
                                        <g key={r.id}>
                                          {hw != null && <circle cx={xOf(i)} cy={yOf(hw)} r={isCurrent ? 4.5 : 3} fill={isCurrent ? '#C9A227' : '#0D2D6B'} stroke="#fff" strokeWidth={isCurrent ? 1.5 : 1} />}
                                          {cc != null && <circle cx={xOf(i)} cy={yOf(cc)} r={isCurrent ? 4.5 : 3} fill={isCurrent ? '#C9A227' : '#2E5C9E'} stroke="#fff" strokeWidth={isCurrent ? 1.5 : 1} />}
                                        </g>
                                      );
                                    })}
                                  </svg>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    {recentAsc.map((r, i) => (
                                      <span key={r.id} style={{ fontSize: '9px', fontWeight: 600, color: r.id === selected.id ? '#0D2D6B' : 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>{shortDate(r)}</span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                          {topDiag.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {topDiag.map(([key, count]) => (
                                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#171719' }}>{DIAG_LABELS[key] || key}</span>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#0D2D6B' }}>{count}회</span>
                                  </div>
                                  <div style={{ height: '5px', borderRadius: '3px', background: '#E7EAF2', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ width: `${Math.round((count / topDiag[0][1]) * 100)}%`, background: '#0D2D6B' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 하단 고정 액션 — 최소 48px 터치 타겟 */}
              <div style={{ borderTop: '1px solid #E4E6EB', background: '#fff', padding: '12px 20px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => { onEdit(selected); setSelectedId(null); }}
                  style={{ flex: 1, height: '48px', border: '1px solid #E5E7EB', borderRadius: '10px', background: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: '#374151', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Pencil size={14} /> 수정
                </button>
                {/* 초안은 아직 학부모에게 보낼 상태가 아니라 링크 복사를 막음(DirectorView와 동일 기준) */}
                {!selected.isDraft && (
                  <button onClick={() => handleCopyLink(selected.id)}
                    style={{ flex: 1.4, height: '48px', border: 'none', borderRadius: '10px', background: C.primary, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <LinkIcon size={14} /> {copied ? '✓ 복사됨' : '링크 복사'}
                  </button>
                )}
                <button onClick={() => setDeleteConfirmReport(selected.id)}
                  style={{ width: '48px', height: '48px', border: `1px solid ${C.dangerBorder}`, borderRadius: '10px', background: '#fff', color: C.danger, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 모달 */}
        {deleteConfirmReport && deleteTarget && (
          <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div ref={deleteConfirmRef} style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px' }}>
              <div style={{ width: '44px', height: '44px', background: '#FEE2E2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Trash2 size={20} color={C.danger} />
              </div>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px', textAlign: 'center' }}>리포트를 삭제할까요?</p>
              <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: '8px', padding: '12px', margin: '0 0 16px' }}>
                <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 4px', textAlign: 'center' }}><strong>{fmtDate(deleteTarget)}</strong></p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: C.danger, margin: 0, textAlign: 'center' }}>{deleteTarget.studentName} 학생 리포트</p>
              </div>
              <p style={{ fontSize: '12px', color: '#6C7586', textAlign: 'center', margin: '0 0 20px' }}>삭제 후 복구가 불가능합니다.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setDeleteConfirmReport(null)}
                  style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>취소</button>
                <button onClick={() => { setDeleteConfirmReport(null); setSelectedId(null); onDelete(deleteConfirmReport); }}
                  style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: C.danger, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
              </div>
            </div>
          </div>
        )}
        {renderBulkDeleteConfirm()}
      </div>
    );
  }

  // PC 좌측 목록 — 날짜순/학생순 두 가지 그룹핑을 header/row 공통 형태로 만들어 한 리스트로 렌더
  const pcRows = (() => {
    const rows = [];
    if (pcViewMode === 'date') {
      const perDate = {};
      filtered.forEach(r => { const d = fmtDate(r); perDate[d] = (perDate[d] || 0) + 1; });
      let lastDate = null;
      filtered.forEach(r => {
        const d = fmtDate(r);
        if (d !== lastDate) { lastDate = d; rows.push({ type: 'header', key: `h-${d}`, label: d, meta: `${perDate[d]}건` }); }
        rows.push({ type: 'row', key: r.id, report: r });
      });
    } else {
      const order = [];
      filtered.forEach(r => { if (!order.includes(r.studentId)) order.push(r.studentId); });
      order.forEach(sid => {
        const mine = filtered.filter(r => r.studentId === sid);
        const open = !collapsedStudents.has(sid);
        const hasDraft = mine.some(r => r.isDraft);
        rows.push({
          type: 'header', key: `h-${sid}`, label: mine[0].studentName,
          meta: `${mine.length}건 · 최근 ${fmtDate(mine[0])}${hasDraft ? ' · 작성 중' : ''}`,
          open,
          toggle: () => setCollapsedStudents(prev => {
            const next = new Set(prev);
            next.has(sid) ? next.delete(sid) : next.add(sid);
            return next;
          }),
        });
        if (open) mine.forEach(r => rows.push({ type: 'row', key: r.id, report: r }));
      });
    }
    return rows;
  })();

  // 행에는 숫자만("50 · 60") — 라벨(과제·개념 순)은 상단에 한 번만 안내(승인된 결정 ②)
  const scoreOf = (r) => {
    if (r.homeworkRating == null && r.conceptRating == null) return '—';
    return `${r.homeworkRating != null ? toPct(r.homeworkRating) : '-'} · ${r.conceptRating != null ? toPct(r.conceptRating) : '-'}`;
  };

  const pcFilterSummary = [
    studentFilter ? (students.find(s => s.id === studentFilter)?.name || '학생') : '전체 학생',
    periodFilter === 'week' ? '이번 주' : periodFilter === 'month' ? '이번 달' : '전체 기간',
    classes.length > 0 ? (classFilter ? (classFilter === '__unassigned__' ? '미배정' : (classes.find(c => c.id === classFilter)?.name || '반')) : '전체 반') : null,
  ].filter(Boolean).join(' · ');

  // PC: 스플릿 뷰
  return (
    <>
    {/* 108px = 이 그리드 위에 쌓인 것들의 높이(헤더 65 + 서브탭 라벨 영역). 헤더를 한 줄로
        합치면서 상단 크롬이 72px 줄어 180 → 108로 재조정함. 값이 실제보다 크면 화면 아래가
        비고, 작으면 뷰포트 밖으로 넘쳐 스크롤이 이중으로 생기므로 헤더 구조가 바뀌면 다시 잴 것 */}
    <div style={{ display: 'grid', gridTemplateColumns: (isUltraWide && selected) ? '392px 1fr 360px' : '392px 1fr', height: 'calc(100dvh - 108px)', overflow: 'hidden' }}>

      {/* 좌측 목록 */}
      <div style={{ borderRight: '1px solid #E4E6EB', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>

        {/* 상단 고정 영역 — 검색·상태탭·필터·보기토글·미작성배너 */}
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid #E4E6EB', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#171719' }}>기록 보관소</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>{filtered.length} / {reports.length}건</span>
          </div>

          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="학생 · 교재 · 코멘트 검색"
            style={{ width: '100%', padding: '7px 10px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '8px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#FAFAFA' }} />

          {/* 상태 탭 */}
          <div style={{ display: 'flex', gap: '4px', background: '#F1F2F5', borderRadius: '8px', padding: '4px' }}>
            {[['all', '전체'], ['draft', '작성 중'], ['viewed', '열람 완료']].map(([key, label]) => (
              <button key={key} onClick={() => setStatusTab(key)}
                style={{ flex: 1, minWidth: 0, border: 'none', borderRadius: '6px', background: statusTab === key ? '#fff' : 'transparent', color: statusTab === key ? C.primary : 'rgba(55,56,60,0.75)', fontSize: '12px', fontWeight: 700, padding: '7px 4px', cursor: 'pointer', fontFamily: 'inherit' }}>
                {label}
              </button>
            ))}
          </div>

          {/* 필터 요약 — 클릭하면 셀렉트 3개 펼침 */}
          <button onClick={() => setFilterOpen(v => !v)}
            style={{ width: '100%', border: '1px solid #DCDFE4', borderRadius: '8px', background: '#fff', padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#171719' }}>{filterOpen ? '필터 접기' : pcFilterSummary}</span>
            {filterOpen ? <ChevronUp size={16} color="rgba(55,56,60,0.75)" /> : <ChevronDown size={16} color="rgba(55,56,60,0.75)" />}
          </button>
          {filterOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '7px', fontFamily: 'inherit', background: '#fff', color: '#374151', boxSizing: 'border-box' }}>
                <option value="">전체 학생</option>
                {(students||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '7px', fontFamily: 'inherit', background: '#fff', color: '#374151', boxSizing: 'border-box' }}>
                <option value="all">전체 기간</option>
                <option value="week">이번 주</option>
                <option value="month">이번 달</option>
              </select>
              {classes.length > 0 && (
                <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '7px', fontFamily: 'inherit', background: '#fff', color: '#374151', boxSizing: 'border-box' }}>
                  <option value="">전체 반</option>
                  <option value="__unassigned__">미배정</option>
                  {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* 보기 토글 — 날짜순 기본(승인된 결정 ①) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>보기</span>
            <div style={{ flex: 1, display: 'flex', gap: '4px', background: '#F1F2F5', borderRadius: '8px', padding: '4px' }}>
              {[['date', '날짜순'], ['student', '학생순']].map(([key, label]) => (
                <button key={key} onClick={() => setPcViewMode(key)}
                  style={{ flex: 1, minWidth: 0, border: 'none', borderRadius: '6px', background: pcViewMode === key ? '#fff' : 'transparent', color: pcViewMode === key ? C.primary : 'rgba(55,56,60,0.75)', fontSize: '12px', fontWeight: 700, padding: '7px 4px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* 점수 라벨 안내 — 행에는 숫자만 나오므로 순서를 한 번만 알려줌(승인된 결정 ②) */}
          <p style={{ fontSize: '10px', color: 'rgba(55,56,60,0.75)', margin: 0, textAlign: 'right' }}>점수는 과제 · 개념 순으로 표시돼요</p>

          {/* 미작성 배너 — 전체 기간 대상 + 가장 오래된 미작성 날짜(승인된 결정 ③) */}
          {draftCount > 0 && (
            <button onClick={() => setStatusTab('draft')}
              style={{ width: '100%', border: '1px solid #EFE0B8', borderRadius: '8px', background: '#FDF6E3', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#8A6A22' }}>코멘트 미작성 {draftCount}건</span>
                {oldestDraft && <span style={{ fontSize: '10px', fontWeight: 600, color: '#8A6A22', opacity: 0.85 }}>가장 오래된 건 {fmtDate(oldestDraft)}</span>}
              </span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#8A6A22', whiteSpace: 'nowrap' }}>이어서 작성 →</span>
            </button>
          )}
          {statusTab === 'draft' && draftIdsInView.length > 0 && (
            <button onClick={() => setBulkDeleteConfirm(true)}
              style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px', border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Trash2 size={11} /> 방치된 초안 {draftIdsInView.length}건 삭제
            </button>
          )}
        </div>

        {/* 리스트 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6C7586', fontSize: '13px', padding: '40px 20px' }}>리포트가 없습니다</p>
          ) : pcRows.map(row => {
            if (row.type === 'header') {
              const isStudentMode = pcViewMode === 'student';
              return (
                <button key={row.key} onClick={row.toggle} disabled={!row.toggle}
                  style={{
                    width: '100%', border: 'none', borderRadius: '8px', background: isStudentMode ? '#F7F8FA' : '#fff',
                    padding: '10px 8px 7px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    textAlign: 'left', position: 'sticky', top: 0, zIndex: 1, boxShadow: '0 1px 0 #EEF0F3',
                    cursor: row.toggle ? 'pointer' : 'default', fontFamily: 'inherit', marginTop: isStudentMode ? '4px' : 0,
                  }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: isStudentMode ? '14px' : '11px', fontWeight: 700, color: isStudentMode ? '#171719' : 'rgba(55,56,60,0.75)' }}>{row.label}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>{row.meta}</span>
                  </span>
                  {row.toggle && (row.open ? <ChevronUp size={16} color="rgba(55,56,60,0.75)" /> : <ChevronDown size={16} color="rgba(55,56,60,0.75)" />)}
                </button>
              );
            }
            const r = row.report;
            const isSelected = (selected?.id === r.id);
            const badge = statusBadge(r);
            const isAbsent = r.attendance === '결석';
            return (
              <div key={row.key} role="button" tabIndex={0} aria-current={isSelected ? 'true' : undefined} onClick={() => setSelectedId(r.id)} onKeyDown={onKeyActivate(() => setSelectedId(r.id))}
                style={{
                  padding: '10px 12px', margin: '1px 0', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.1s',
                  background: isSelected ? '#EFF3FA' : 'transparent',
                  borderLeft: `3px solid ${isSelected ? C.primary : 'transparent'}`,
                  opacity: isAbsent ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F9FAFB'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#171719' }}>{pcViewMode === 'student' ? fmtDate(r) : r.studentName}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ background: badge.bg, color: badge.color, fontSize: '10px', fontWeight: 700, padding: '3px 7px', borderRadius: '6px', whiteSpace: 'nowrap' }}>{badge.label}</span>
                    {/* 목록 행에서 바로 삭제 — 기존엔 상세 패널을 먼저 열어야만 삭제 버튼이 나와서
                        지우기만 할 때도 동선이 불필요하게 길었음(실사용 피드백). 확인 모달은
                        기존 것 그대로 재사용(deleteConfirmReport는 selected와 무관하게 id로
                        조회되므로 선택 안 된 항목도 바로 삭제 요청 가능) */}
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmReport(r.id); }}
                      title="삭제" aria-label="리포트 삭제"
                      style={{ width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '5px', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.dangerBg; e.currentTarget.style.color = C.danger; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; }}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pcViewMode === 'student' ? [r.textbook, r.subject].filter(Boolean).join(' · ') : `${fmtDate(r)} · ${[r.textbook, r.subject].filter(Boolean).join(' · ')}`}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: (r.homeworkRating != null || r.conceptRating != null) ? C.primary : 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>
                    {scoreOf(r)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 우측 상세 — 본문(폭 제한) + 학생 맥락 사이드 패널.
          ≥1280px에선 아래 두 겹(스크롤 컨테이너 · flex 행)을 display:contents로 걷어내서
          본문과 분석 패널이 각각 바깥 그리드의 컬럼이 되게 한다 — 코드를 옮기지 않고도 3분할이
          되고, 각 패널이 독립적으로 스크롤됨(긴 본문을 내려도 분석은 그대로 보임).
          1280 미만에선 기존 "한 덩어리로 스크롤 + 사이드 패널 wrap" 동작이 그대로 유지된다. */}
      {selected ? (
        <div style={isUltraWide ? { display: 'contents' } : { overflowY: 'auto', padding: '24px 28px', background: '#FAFAFA' }}>
          <div style={isUltraWide ? { display: 'contents' } : { display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={isUltraWide
            ? { overflowY: 'auto', padding: '24px 28px', background: '#FAFAFA', minWidth: 0 }
            : { flex: '1 1 460px', maxWidth: '720px', minWidth: 0 }}>

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
                style={{ height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>
                수정
              </button>
              {/* 작성 중(draft) 리포트는 링크 복사 차단 — 모바일 바텀시트·DirectorView와 동일 기준 */}
              {!selected.isDraft && (
                <button onClick={() => handleCopyLink(selected.id)}
                  style={{ height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 600, border: `1px solid ${C.primary}`, borderRadius: '8px', background: copied ? C.primary : '#fff', cursor: 'pointer', color: copied ? '#fff' : C.primary, fontFamily: 'inherit' }}>
                  {copied ? '✓ 복사됨' : '링크 복사'}
                </button>
              )}
              {deleteConfirmReport === selected.id ? null : (
                <button onClick={() => setDeleteConfirmReport(selected.id)}
                  style={{ height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 600, border: `1px solid ${C.dangerBorder}`, borderRadius: '8px', background: C.dangerBg, cursor: 'pointer', color: C.danger, fontFamily: 'inherit' }}>
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

          {/* 평가 지표 — 주간형은 한 주 안에 출결/평가가 세션마다 달라 대표값이 없으므로
              (섞인 한 주를 억지로 단일 %로 보여주면 오해의 소지) 이 카드 대신 세션별 목록을 보여줌.
              단원평가는 값 없을 때 3번째 카드로 "—"를 보여주는 대신 캡션으로 격하 */}
          {selected.attendance !== '결석' && selected.reportType !== 'weekly' && (
          <div style={{ background: '#fff', border: '1px solid #E4E6EB', borderRadius: '14px', padding: '20px 24px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#171719' }}>오늘의 평가</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>
                {selected.hasTest && selected.testScore ? `단원평가 ${selected.testScore}점` : '단원평가 미실시'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '32px' }}>
              {[
                { label: '과제 수행', value: selected.homeworkRating, color: '#0D2D6B' },
                { label: '개념 이해', value: selected.conceptRating, color: '#2E5C9E' },
              ].map((m, i) => {
                const pct = m.value != null ? toPct(m.value) : null;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#171719' }}>{m.label}</span>
                      <span style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1, color: m.color }}>
                        {pct != null ? pct : '-'}<span style={{ fontSize: '12px', fontWeight: 600 }}>%</span>
                      </span>
                    </div>
                    <div style={{ height: '8px', borderRadius: '6px', background: '#E7EAF2', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${pct ?? 0}%`, background: m.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* 주간형 — 세션별 기록. 발송 전(작성 중)엔 위 요약 필드가 전부 비어있는 게 정상이라
              여기가 유일한 정보원, 발송 후에도 "어느 날 뭘 했는지" 상세로 계속 유용함 */}
          {selected.reportType === 'weekly' && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '11px', color: '#6C7586', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>
                이번 주 세션 기록 {selected.sessions?.length > 0 && `· ${selected.sessions.length}회`}
              </p>
              {!selected.sessions || selected.sessions.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0 }}>아직 기록된 세션이 없어요.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selected.sessions.map((s, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A' }}>{s.date}</span>
                        {s.attendance && <span style={{ fontSize: '11px', color: s.attendance === '결석' ? C.error : '#6B7280' }}>{s.attendance}</span>}
                      </div>
                      {s.attendance !== '결석' && (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: '#374151', marginBottom: s.teacherNote ? '6px' : 0 }}>
                          {s.homeworkRating != null && <span>과제 <b style={{ color: C.primary }}>{toPct(s.homeworkRating)}%</b></span>}
                          {s.conceptRating != null && <span>개념 <b style={{ color: C.primary }}>{toPct(s.conceptRating)}%</b></span>}
                          {s.hasTest && s.testScore && <span>시험 <b>{s.testScore}점</b></span>}
                        </div>
                      )}
                      {s.teacherNote?.trim() && (
                        <p style={{ fontSize: '12px', color: '#6B7280', margin: 0, lineHeight: 1.6 }}>{s.teacherNote}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 진단 태그 */}
          {selected.diagnosis?.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '11px', color: '#6C7586', margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.06em' }}>진단 태그</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {selected.diagnosis.map(d => {
                  const c = DIAG_COLORS[d.key] || { bg: '#F3F4F6', color: '#374151', border: '#E5E7EB' };
                  return <span key={d.key} style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '10px', background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontWeight: 600 }}>{DIAG_LABELS[d.key] || d.key}</span>;
                })}
              </div>
            </div>
          )}

          {/* 선생님 코멘트 — 결론 1문장 → 눈에 띈 문항(wrongItems) → 원문은 200자 넘으면 접기.
              PublicReport.jsx 선생님 노트 섹션과 같은 구조(결론/문항/접기) — 학부모가 보는 것과
              직원이 보는 것의 정보 위계를 맞춤 */}
          {selected.attendance !== '결석' && (() => {
            const raw = selected.teacherNote || '';
            // [태그] 패턴 추출 — 같은 태그가 여러 번 찍혀도 칩은 1개만(중복 노출 버그 수정)
            const tagPattern = /\[([^\]]+)\]/g;
            const tagSet = new Set();
            let match;
            while ((match = tagPattern.exec(raw)) !== null) tagSet.add(match[1]);
            const primaryTag = [...tagSet][0];
            // 본문에서 태그 제거 후 문단 분리 — 첫 문단이 결론, 나머지는 200자 넘으면 접기
            const cleanNote = raw.replace(/\[([^\]]+)\]\s*/g, '').trim();
            const noteParagraphs = (cleanNote || raw).split('\n').filter(Boolean);
            const noteLead = noteParagraphs[0] || '';
            const noteRest = noteParagraphs.slice(1);
            const noteCollapsible = noteRest.join(' ').length > 200;
            const noteRestVisible = noteCollapsible ? noteOpen : true;
            const hasWrongItems = selected.wrongItems?.length > 0;

            const TAG_COLORS = {
              '연산 실수 주의': { bg: C.warningBg, color: C.warningText },
              '응용 연습 필요': { bg: '#FDF0F0', color: C.errorDark },
              '개념 완성':      { bg: C.successBg, color: C.successDark },
              '집중력 우수':    { bg: '#EAF1FB', color: '#0D2D6B' },
              '과제 완성도 높음':{ bg: C.successBg, color: C.successDark },
              '복습 권장':      { bg: '#F3F0FA', color: '#4A3080' },
            };

            if (!noteLead && !hasWrongItems) {
              return (
                <div style={{ background: '#fff', border: '1px solid #E4E6EB', borderRadius: '14px', padding: '14px 16px', marginBottom: '18px' }}>
                  <p style={{ fontSize: '11px', color: '#6C7586', margin: '0 0 6px', fontWeight: 600, letterSpacing: '0.06em' }}>선생님 코멘트</p>
                  <p style={{ fontSize: '13px', color: '#6C7586', lineHeight: 1.9, margin: 0, fontStyle: 'italic' }}>아직 작성된 코멘트가 없습니다</p>
                </div>
              );
            }

            return (
              <div style={{ background: '#fff', border: '1px solid #E4E6EB', borderRadius: '14px', padding: '20px 24px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#171719' }}>선생님 코멘트</span>
                  {primaryTag && (
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', ...(TAG_COLORS[primaryTag] || { bg: '#F3F4F6', color: '#374151' }) }}>
                      {primaryTag}
                    </span>
                  )}
                </div>

                {noteLead && <span style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.6, letterSpacing: '-0.2px', color: '#171719' }}>{noteLead}</span>}

                {hasWrongItems && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #EEF0F3', paddingTop: '14px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)' }}>눈에 띈 문항</span>
                    {selected.wrongItems.map((w, i) => {
                      const extra = w.memo?.trim() || (w.tags?.length ? w.tags.map(t => WRONG_TAG_LABELS[t]).filter(Boolean).join(', ') : '');
                      return (
                        <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
                          <span style={{ minWidth: '36px', fontSize: '12px', fontWeight: 700, color: '#0D2D6B', flexShrink: 0 }}>{w.number}번</span>
                          <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.6, color: '#171719' }}>{w.type}{extra ? ` — ${extra}` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {noteRestVisible && noteRest.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #EEF0F3', paddingTop: '14px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(55,56,60,0.75)' }}>학부모에게 전달된 원문</span>
                    {noteRest.map((p, i) => <p key={i} style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.8, color: '#171719', margin: 0 }}>{p}</p>)}
                  </div>
                )}

                {noteCollapsible && (
                  <button onClick={() => setNoteOpen(v => !v)}
                    style={{ alignSelf: 'flex-start', border: '1px solid #DCDFE4', borderRadius: '20px', background: '#fff', color: '#0D2D6B', fontSize: '12px', fontWeight: 700, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {noteOpen ? '접기' : '학부모에게 전달된 원문 보기'}
                  </button>
                )}
              </div>
            );
          })()}

          {/* 학습 범위 / 다음 수업 계획 — 2열 카드로 승격(따로 흩어져 있던 텍스트 줄을 카드화) */}
          {(selected.textbook || selected.unit || selected.pages || selected.nextPlan) && (
            <div style={{ display: 'grid', gridTemplateColumns: (selected.textbook || selected.unit || selected.pages) && selected.nextPlan ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: '16px', marginBottom: '18px' }}>
              {(selected.textbook || selected.unit || selected.pages) && (
                <div style={{ background: '#fff', border: '1px solid #E4E6EB', borderRadius: '14px', overflow: 'hidden' }}>
                  <div style={{ height: '4px', background: '#0D2D6B' }} />
                  <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', color: 'rgba(55,56,60,0.75)' }}>학습 범위</span>
                      {selected.textbook && <span style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.3px', color: '#171719' }}>{selected.textbook}</span>}
                      {selected.unit && <span style={{ alignSelf: 'flex-start', background: '#EFF3FA', color: '#0D2D6B', fontSize: '12px', fontWeight: 700, padding: '5px 10px', borderRadius: '6px' }}>{selected.unit}</span>}
                    </div>
                    {selected.pages && <span style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.5px', color: '#0D2D6B', flexShrink: 0 }}>{fmtPages(selected.pages)}</span>}
                  </div>
                </div>
              )}
              {selected.nextPlan && (
                <div style={{ background: '#fff', border: '1px solid #E4E6EB', borderRadius: '14px', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', color: 'rgba(55,56,60,0.75)' }}>다음 수업 계획</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.6, color: '#171719' }}>{selected.nextPlan}</span>
                  </div>
                  <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0D2D6B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ChevronRight size={16} color="#fff" />
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 수업 사진 — 문항이 특정 사진에 연결돼 있으면(photoIndex) 그 문항 번호를 캡션으로 표시 */}
          {selected.photoUrls?.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #E4E6EB', borderRadius: '14px', padding: '20px 24px' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#171719', margin: '0 0 12px' }}>수업 사진 {selected.photoUrls.length}장</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                {selected.photoUrls.map((url, i) => {
                  const itemsForPhoto = (selected.wrongItems || []).filter(w => w.photoIndex === i);
                  const caption = itemsForPhoto.map(w => `${w.number}번`).join(' · ');
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`수업 사진 ${i + 1}`}
                          style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: '10px', border: '1px solid #E5E7EB', cursor: 'pointer', display: 'block' }} />
                      </a>
                      {caption && <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)' }}>{caption}</span>}
                    </div>
                  );
                })}
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
            const cardStyle = { background: '#fff', border: '1px solid #E4E6EB', borderRadius: '14px', padding: '16px' };
            const cardTitle = { fontSize: '13px', color: '#171719', margin: 0, fontWeight: 700 };
            // 추이 차트 — y축 0/50/100 고정, x축은 날짜, 결석 회차는 값(0%)으로 찍지 않고
            // 점선 수직선 + 축 아래 회색 틱으로만 표시(0%로 오해하지 않도록, 승인된 결정)
            const chartW = 220, TOP = 4, BOT = 84;
            const xOf = (i) => (i / Math.max(1, recentAsc.length - 1)) * chartW;
            const yOf = (v) => BOT - (v / 100) * (BOT - TOP);
            const shortDate = (r) => r.createdAt?.seconds
              ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
              : '';
            const buildSegments = (key) => {
              const out = [];
              let cur = [];
              recentAsc.forEach((r, i) => {
                const v = r[key] != null ? toPct(r[key]) : null;
                if (v == null) { if (cur.length > 1) out.push([...cur]); cur = []; return; }
                cur.push(`${xOf(i)},${yOf(v)}`);
              });
              if (cur.length > 1) out.push(cur);
              return out.map(pts => pts.join(' '));
            };
            const absenceXs = recentAsc.map((r, i) => r.attendance === '결석' ? xOf(i) : null).filter(x => x != null);
            return (
              <aside style={isUltraWide
                ? { overflowY: 'auto', padding: '24px 20px', background: '#FAFAFA', borderLeft: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '12px' }
                : { flex: '0 1 340px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 최근 평가 추이 */}
                {recentAsc.length >= 2 && (
                  <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                      <p style={cardTitle}>최근 평가 추이</p>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>최근 {recentAsc.length}회</span>
                    </div>

                    {/* 범례 — 선만 있던 상태 해소 */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                      {[['과제', '#0D2D6B'], ['개념', '#2E5C9E'], ['결석 · 기록 없음', '#C9CCD1']].map(([label, color]) => (
                        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {label}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: `${BOT - TOP}px`, paddingBottom: '14px' }}>
                        {['100', '50', '0'].map(t => <span key={t} style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(55,56,60,0.75)', lineHeight: 1 }}>{t}</span>)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <svg viewBox={`0 0 ${chartW} ${BOT + 8}`} width="100%" height={BOT + 8} style={{ overflow: 'visible', display: 'block' }}>
                          <line x1="0" y1={TOP} x2={chartW} y2={TOP} stroke="#EEF0F3" strokeWidth="1" />
                          <line x1="0" y1={(TOP + BOT) / 2} x2={chartW} y2={(TOP + BOT) / 2} stroke="#EEF0F3" strokeWidth="1" />
                          <line x1="0" y1={BOT} x2={chartW} y2={BOT} stroke="#EEF0F3" strokeWidth="1" />
                          {buildSegments('homeworkRating').map((pts, i) => <polyline key={`hw-${i}`} points={pts} fill="none" stroke="#0D2D6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
                          {buildSegments('conceptRating').map((pts, i) => <polyline key={`cc-${i}`} points={pts} fill="none" stroke="#2E5C9E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
                          {absenceXs.map(x => (
                            <g key={x}>
                              <line x1={x} y1={TOP} x2={x} y2={BOT} stroke="#DCDFE4" strokeWidth="1" strokeDasharray="2 3" />
                              <circle cx={x} cy={BOT + 4} r="2.5" fill="#C9CCD1" />
                            </g>
                          ))}
                          {recentAsc.map((r, i) => {
                            const isCurrent = r.id === selected.id;
                            const hw = r.homeworkRating != null ? toPct(r.homeworkRating) : null;
                            const cc = r.conceptRating != null ? toPct(r.conceptRating) : null;
                            const content = [r.unit, r.textbook].filter(Boolean)[0] || '내용 없음';
                            const colW = chartW / Math.max(1, recentAsc.length - 1 || 1);
                            const onHover = (e) => setTrendTooltip({
                              x: e.clientX, y: e.clientY,
                              text: r.attendance === '결석'
                                ? `${fmtDate(r)} · 결석`
                                : `${fmtDate(r)} · 과제 ${hw != null ? `${hw}%` : '미입력'} · 개념 ${cc != null ? `${cc}%` : '미입력'} · ${content}`,
                            });
                            return (
                              <g key={r.id}>
                                {hw != null && <circle cx={xOf(i)} cy={yOf(hw)} r={isCurrent ? 4.5 : 3} fill={isCurrent ? '#C9A227' : '#0D2D6B'} stroke="#fff" strokeWidth={isCurrent ? 1.5 : 1} style={{ pointerEvents: 'none' }} />}
                                {cc != null && <circle cx={xOf(i)} cy={yOf(cc)} r={isCurrent ? 4.5 : 3} fill={isCurrent ? '#C9A227' : '#2E5C9E'} stroke="#fff" strokeWidth={isCurrent ? 1.5 : 1} style={{ pointerEvents: 'none' }} />}
                                <rect x={xOf(i) - colW / 2} y="0" width={colW} height={BOT + 8} fill="transparent" style={{ cursor: 'pointer' }}
                                  onMouseEnter={onHover} onMouseMove={onHover} onMouseLeave={() => setTrendTooltip(null)} />
                              </g>
                            );
                          })}
                        </svg>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          {recentAsc.map((r, i) => (
                            <span key={r.id} style={{ fontSize: '9px', fontWeight: 600, color: r.id === selected.id ? '#0D2D6B' : 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>{shortDate(r)}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p style={{ fontSize: '10px', color: '#757575', margin: '8px 0 0' }}>금색 = 현재 보는 리포트 · 점에 마우스를 올리면 상세가 보여요</p>
                  </div>
                )}

                {/* 이전 리포트 바로가기 */}
                {others.length > 0 && (
                  <div style={cardStyle}>
                    <p style={{ ...cardTitle, marginBottom: '10px' }}>이 학생의 다른 리포트</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                      {others.map(r => (
                        <button key={r.id} onClick={() => setSelectedId(r.id)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '8px', background: '#F9FAFB', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
                          <span style={{ fontSize: '11px', color: '#374151', fontWeight: 600 }}>{fmtDate(r)}</span>
                          <span style={{ fontSize: '10px', color: '#6C7586', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.unit || r.textbook || ''}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => window.open(`/story/${selected.studentId}?edit=1`, '_blank')}
                      style={{ width: '100%', border: '1px solid #DCDFE4', borderRadius: '8px', background: '#fff', color: '#0D2D6B', fontSize: '12px', fontWeight: 700, padding: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      월간 성장 포트폴리오
                    </button>
                  </div>
                )}

                {/* 반복 진단 — 빨강/초록 칩 대신 횟수 막대(의미색 충돌 제거) */}
                {topDiag.length > 0 && (
                  <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                      <p style={cardTitle}>반복되는 진단</p>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(55,56,60,0.75)' }}>최근 {hist.length}회</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {topDiag.map(([key, count]) => (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#171719' }}>{DIAG_LABELS[key] || key}</span>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D2D6B' }}>{count}회</span>
                          </div>
                          <div style={{ height: '6px', borderRadius: '4px', background: '#E7EAF2', overflow: 'hidden', display: 'flex' }}>
                            <div style={{ width: `${Math.round((count / topDiag[0][1]) * 100)}%`, background: '#0D2D6B' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.6, color: 'rgba(55,56,60,0.75)', margin: '10px 0 0' }}>다음 수업 계획을 세울 때 참고하세요. 학부모 화면에는 표시되지 않습니다.</p>
                  </div>
                )}
              </aside>
            );
          })()}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6C7586', fontSize: '13px', background: '#FAFAFA' }}>
          좌측에서 리포트를 선택하세요
        </div>
      )}

    </div>

      {/* PC 삭제 확인 모달 */}
      {deleteConfirmReport && deleteTarget && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div ref={deleteConfirmRef} style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ width: '44px', height: '44px', background: '#FEE2E2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={20} color={C.danger} />
            </div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px', textAlign: 'center' }}>리포트를 삭제할까요?</p>
            <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: '8px', padding: '12px', margin: '0 0 16px' }}>
              <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 4px', textAlign: 'center' }}><strong>{fmtDate(deleteTarget)}</strong></p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: C.danger, margin: 0, textAlign: 'center' }}>{deleteTarget.studentName} 학생 리포트</p>
            </div>
            <p style={{ fontSize: '12px', color: '#6C7586', textAlign: 'center', margin: '0 0 20px' }}>삭제 후 복구가 불가능합니다.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteConfirmReport(null)}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>취소</button>
              <button onClick={() => { setDeleteConfirmReport(null); setSelectedId(null); onDelete(deleteConfirmReport); }}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: C.danger, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
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
