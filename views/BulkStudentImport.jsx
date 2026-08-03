import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, X, AlertTriangle, Check } from 'lucide-react';
import { formatPhone, isValidPhone } from '../phone.js';
import { C, T, RADIUS2, SHADOW } from '../tokens.jsx';
import { useEscapeClose, useFocusTrap } from '../hooks.js';

// 학생 일괄 등록 — 엑셀 양식(고정 컬럼)을 다운로드 → 채워서 업로드 → 미리보기 확인 → 등록.
// "업로드하는 사람이 아무 양식이나 올려도 알아서 인식"이 아니라 "우리가 정한 양식 그대로"만
// 받는 방식(2026-08-01 결정) — 컬럼명 오타/순서 뒤바뀜으로 파싱이 깨지는 걸 원천 차단.
const COLUMNS = ['이름', '학교/학년', '학부모 연락처', '교재', '반', '담당강사', '수업요일', '학생구분', '리포트방식'];
const EXAMPLE_ROW = ['박지호', '교현초 5학년', '010-1234-5678', '디딤돌 기본+응용 5-2, 최상위 연산', '월수금반', '이영동', '월,수,금', '신규', '매일형'];
const DAY_INDEX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS, EXAMPLE_ROW]);
  ws['!cols'] = COLUMNS.map(c => ({ wch: Math.max(c.length * 1.6, 12) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '학생등록');
  XLSX.writeFile(wb, '학생등록양식.xlsx');
}

// 엑셀 한 행을 학생 등록 payload(+검증 결과)로 변환. classes/teachers는 이름으로 매칭하되
// 못 찾아도 등록 자체는 막지 않음(미배정으로 두고 경고만 — 반/강사 이름 오타는 나중에
// 학생 수정 화면에서 고치면 되는 사소한 문제라, 그것 때문에 전체 행을 막을 이유는 없음)
function parseRow(row, classes, teachers, students) {
  const get = (key) => String(row[key] ?? '').trim();
  const errors = [];
  const warnings = [];

  const name = get('이름');
  if (!name) errors.push('이름 없음');
  const school = get('학교/학년');
  if (!school) errors.push('학교/학년 없음');
  const textbooks = get('교재').split(',').map(s => s.trim()).filter(Boolean).map(n => ({ id: Math.random(), name: n }));
  if (textbooks.length === 0) errors.push('교재 없음');

  // 재원 중인 학생과 이름+학교가 같으면 중복 등록일 가능성이 높음 — 막지는 않고(동명이인일
  // 수도 있어서) 미리보기에서 눈에 띄게 경고만
  if (name && school && students.some(s => !s.archived && s.name?.trim() === name && s.school?.trim() === school)) {
    warnings.push('이미 등록된 학생과 이름+학교가 같음 → 중복 등록일 수 있음');
  }

  const parentPhoneRaw = get('학부모 연락처');
  const parentPhone = parentPhoneRaw ? formatPhone(parentPhoneRaw) : '';
  if (parentPhoneRaw && !isValidPhone(parentPhone)) {
    // 엑셀이 전화번호 셀을 숫자로 인식하면 맨 앞 0이 사라짐(01012345678 → 1012345678) —
    // "형식 오류"만으로는 원인을 몰라 같은 실수를 반복하기 쉬워 구체적으로 안내
    if (/^\d{9,10}$/.test(parentPhoneRaw) && !parentPhoneRaw.startsWith('0')) {
      errors.push('연락처 앞자리 0 없음 (엑셀 셀 서식을 "텍스트"로 바꾼 뒤 다시 입력해주세요)');
    } else {
      errors.push('연락처 형식 오류');
    }
  }

  const className = get('반');
  const matchedClass = className ? classes.find(c => c.name.trim() === className) : null;
  if (className && !matchedClass) warnings.push(`반 "${className}" 못 찾음 → 미배정`);

  const teacherName = get('담당강사');
  const matchedTeacher = teacherName ? teachers.find(t => t.name.trim() === teacherName) : null;
  if (!matchedClass && teacherName && !matchedTeacher) warnings.push(`강사 "${teacherName}" 못 찾음 → 미배정`);

  const scheduleDaysRaw = get('수업요일').split(',').map(s => s.trim()).filter(Boolean);
  const scheduleDays = scheduleDaysRaw.map(d => DAY_INDEX[d]).filter(d => d != null).sort();
  const invalidDays = scheduleDaysRaw.filter(d => DAY_INDEX[d] == null);
  if (invalidDays.length > 0) warnings.push(`수업요일 "${invalidDays.join(', ')}" 인식 못 함 → 무시됨`);

  const studentTypeRaw = get('학생구분');
  if (studentTypeRaw && studentTypeRaw !== '재학생' && studentTypeRaw !== '신규') {
    warnings.push(`학생구분 "${studentTypeRaw}" 인식 못 함 → 신규로 등록`);
  }
  const studentType = studentTypeRaw === '재학생' ? 'returning' : 'new';

  const reportModeRaw = get('리포트방식');
  if (reportModeRaw && reportModeRaw !== '주간형' && reportModeRaw !== '매일형') {
    warnings.push(`리포트방식 "${reportModeRaw}" 인식 못 함 → 학원 기본값 적용`);
  }
  const reportMode = reportModeRaw === '주간형' ? 'weekly' : reportModeRaw === '매일형' ? 'daily' : '';

  const payload = {
    name, school, parentPhone, textbooks, studentType,
    ...(matchedClass ? { classId: matchedClass.id } : {}),
    ...(matchedClass ? { assignedTeacherId: matchedClass.teacherId || '' } : matchedTeacher ? { assignedTeacherId: matchedTeacher.id } : {}),
    ...(scheduleDays.length ? { scheduleDays } : {}),
    ...(reportMode ? { reportMode } : {}),
  };

  return { name: name || '(이름 없음)', school, className: matchedClass?.name || (className ? '미배정' : ''), errors, warnings, payload };
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)',
};
const modalStyle = {
  background: '#fff', borderRadius: `${RADIUS2.panel}px`, width: '100%', maxWidth: '720px',
  maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: SHADOW[3],
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
};

export default function BulkStudentImport({ onClose, onSave, classes = [], teachers = [], students = [], onToast }) {
  const [importing, setImporting] = useState(false);
  // 등록 진행 중엔 닫으면 안 됨 — for 루프가 언마운트와 무관하게 백그라운드로 계속 돌기 때문에,
  // 닫고 같은 파일을 다시 열어 업로드하면 두 임포트가 동시에 돌며 중복 등록될 수 있음
  useEscapeClose(onClose, !importing);
  const modalPanelRef = useRef(null);
  useFocusTrap(modalPanelRef, true);
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState(null); // 파싱 결과 — null이면 아직 업로드 전
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const handleFile = async (file) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (json.length === 0) {
        onToast?.('빈 파일이에요. 양식에 데이터를 채운 뒤 올려주세요.', 'error');
        return;
      }
      // 헤더명이 양식과 다르면(오타/컬럼 누락 등) 그 컬럼의 값이 아무 경고 없이 빈 값으로
      // 파싱되던 문제 — 실제 헤더를 정해진 컬럼과 대조해 하나라도 없으면 파일 전체를 막는다
      const actualHeaders = Object.keys(json[0]);
      const missingHeaders = COLUMNS.filter(c => !actualHeaders.includes(c));
      if (missingHeaders.length > 0) {
        onToast?.(`양식과 다른 파일이에요 — "${missingHeaders.join('", "')}" 컬럼을 찾을 수 없어요. 양식을 다시 내려받아 사용해주세요.`, 'error');
        return;
      }
      const parsed = json.map(r => parseRow(r, classes, teachers, students));
      // 같은 파일 안에 이름+학교가 같은 행이 여러 개면(복붙 실수, 재업로드 등) 중복 등록되기
      // 쉬워 경고 — 기존 학생과의 중복 체크(parseRow)와 별개로 파일 내부끼리도 대조
      const dupKeyCount = new Map();
      parsed.forEach(r => {
        const key = `${r.name}|${r.school}`;
        dupKeyCount.set(key, (dupKeyCount.get(key) || 0) + 1);
      });
      parsed.forEach(r => {
        if (dupKeyCount.get(`${r.name}|${r.school}`) > 1) {
          r.warnings.push('파일 안에 이름+학교가 같은 행이 여러 개 있음 → 중복 확인 필요');
        }
      });
      setRows(parsed);
    } catch (e) {
      console.error('엑셀 파싱 실패:', e);
      onToast?.('파일을 읽지 못했어요. 양식 그대로인지 확인해주세요.', 'error');
    }
  };

  const validRows = rows?.filter(r => r.errors.length === 0) || [];

  const handleImport = async () => {
    setImporting(true);
    // 한 행이라도 실패(네트워크/규칙 거부 등)하면 예외가 루프 밖으로 빠져나가 setImporting(false)가
    // 영원히 안 불려서 "등록 중..." 스피너에 멈춰있던 문제 — 행별로 감싸서 실패해도 나머지
    // 행은 계속 진행하고, 끝나면 실패 건수를 알려준다
    let failCount = 0;
    for (let i = 0; i < validRows.length; i++) {
      try {
        await onSave(validRows[i].payload);
      } catch (e) {
        console.error('학생 등록 실패:', validRows[i].payload?.name, e);
        failCount++;
      }
      setProgress(i + 1);
    }
    setImporting(false);
    setDone(true);
    if (failCount > 0) {
      onToast?.(`${failCount}명 등록에 실패했어요. 다시 시도해주세요.`, 'error');
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={overlayStyle} onClick={importing ? undefined : onClose}>
      <div ref={modalPanelRef} style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>학생 일괄 등록</h2>
            <p style={{ fontSize: '11px', color: T.textSub, margin: '2px 0 0', fontWeight: 500 }}>엑셀 양식을 내려받아 채운 뒤 업로드하세요</p>
          </div>
          {!importing && (
            <button onClick={onClose} title="닫기" style={{ background: 'none', border: 'none', color: T.textSub, cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
          )}
        </div>

        <div style={{ padding: '18px 22px', overflow: 'auto', flex: 1 }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ width: '48px', height: '48px', background: C.successBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Check size={22} color={C.successDark} />
              </div>
              <p style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px' }}>{validRows.length}명 등록 완료</p>
              <p style={{ fontSize: '12px', color: T.textMute, margin: 0 }}>학생 관리 목록에서 바로 확인할 수 있어요</p>
            </div>
          ) : (
            <>
              {/* 1. 템플릿 다운로드 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: T.bgSoft, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>1. 양식 파일을 먼저 내려받아 채워주세요</span>
                <button onClick={downloadTemplate}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', fontSize: '12px', fontWeight: 700, border: `1px solid ${C.primary}`, borderRadius: '8px', background: '#fff', color: C.primary, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  <Download size={13} /> 양식 다운로드
                </button>
              </div>

              {/* 2. 업로드 */}
              <div style={{ marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '8px' }}>2. 채운 파일을 업로드하세요</span>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px', border: '1.5px dashed #D1D5DB', borderRadius: '10px', background: '#FAFAFA', color: T.textSub, cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600 }}>
                  <Upload size={16} /> {fileName || '엑셀 파일 선택'}
                </button>
              </div>

              {/* 3. 미리보기 */}
              {rows && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>3. 등록될 내용을 확인하세요</span>
                    <span style={{ fontSize: '11px', color: T.textMute }}>총 {rows.length}건 · 등록 가능 {validRows.length}건{rows.length !== validRows.length ? ` · 오류 제외 ${rows.length - validRows.length}건` : ''}</span>
                  </div>
                  <div style={{ border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                    {rows.map((r, i) => {
                      const bad = r.errors.length > 0;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderTop: i > 0 ? '1px solid #F1F1F4' : 'none', background: bad ? C.dangerBg : '#fff', opacity: bad ? 0.85 : 1 }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#171719', minWidth: '64px' }}>{r.name}</span>
                          <span style={{ fontSize: '11px', color: T.textMute, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.school}{r.className ? ` · ${r.className}` : ''}</span>
                          {bad && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, color: C.danger, background: '#fff', border: `1px solid ${C.dangerBorder}`, borderRadius: '6px', padding: '2px 7px', flexShrink: 0 }}>
                              <AlertTriangle size={10} /> {r.errors.join(', ')}
                            </span>
                          )}
                          {!bad && r.warnings.length > 0 && (
                            <span style={{ fontSize: '10px', fontWeight: 600, color: '#92600A', background: '#FEF3E2', borderRadius: '6px', padding: '2px 7px', flexShrink: 0 }}>{r.warnings.join(', ')}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!done && (
          <div style={{ padding: '12px 22px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '8px', justifyContent: 'flex-end', background: T.bgSoft, flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '9px', border: `1px solid ${T.border}`, background: '#fff', color: T.textSub, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
            <button onClick={handleImport} disabled={!validRows.length || importing}
              style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '9px', border: 'none', background: validRows.length ? C.primary : T.border, color: validRows.length ? '#fff' : T.textMute, cursor: validRows.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit' }}>
              <Check size={14} /> {importing ? `등록 중... ${progress}/${validRows.length}` : `${validRows.length}명 등록`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
