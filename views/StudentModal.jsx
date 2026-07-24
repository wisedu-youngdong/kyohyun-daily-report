import { useState } from 'react';
import { UserPlus, Pencil, X, Plus, Check } from 'lucide-react';
import { formatPhone, isValidPhone } from '../phone.js';
import { C, RADIUS2, SHADOW } from '../tokens.jsx';
import { AVATARS, PRESET_SKINS, onKeyActivate } from './shared.jsx';
import { useEscapeClose } from '../hooks.js';

function FieldLabel({ children }) {
  return <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 5px' }}>{children}</p>;
}
const inputStyle = {
  width: '100%', padding: '9px 11px', fontSize: '16px',
  border: `1px solid #E5E7EB`, borderRadius: `${RADIUS2.input}px`,
  background: '#F9FAFB', outline: 'none',
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
  fontWeight: 500, color: '#1A1A1A', letterSpacing: '-0.02em', boxSizing: 'border-box',
};
const selectStyle = {
  ...inputStyle, cursor: 'pointer', appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '10px 6px',
  paddingRight: '32px',
};
const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)',
};
const modalStyle = {
  background: '#fff', borderRadius: `${RADIUS2.panel}px`, width: '100%', maxWidth: '500px',
  maxHeight: '90vh', overflow: 'auto', boxShadow: SHADOW[3],
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
};
const modalHeaderStyle = {
  padding: '18px 22px', borderBottom: `1px solid #E5E7EB`,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const miniAddButtonStyle = {
  background: C.primaryLight, color: C.primary, border: 'none', borderRadius: `${RADIUS2.chip}px`,
  padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '2px',
};

// 학생 등록/수정 모달 — student prop 유무로 모드 전환.
// 등록은 빠른 입력을 위해 필수 정보만, 수정은 아바타/스킨 커스터마이징까지 노출.
// (예전엔 StudentModal(등록)과 StudentEditModal(수정) 두 벌로 거의 같은 폼이 중복돼 있었음)
export function StudentModal({ student, onClose, onSubmit, teachers = [], classes = [], isDirector = false }) {
  useEscapeClose(onClose);
  const isEdit = !!student;
  const [name, setName] = useState(student?.name || '');
  const [school, setSchool] = useState(student?.school || '');
  const [parentPhone, setParentPhone] = useState(student?.parentPhone || '');
  const [memo, setMemo] = useState(student?.memo || '');
  const [textbooks, setTextbooks] = useState(
    student?.textbooks?.length > 0 ? student.textbooks : [{ id: Date.now(), name: '' }]
  );
  // studentType이 없던 시절 학생(레거시)은 빈 값으로 둠 — 'returning'으로 기본값을 주면
  // 다른 항목만 수정해도 재학생으로 확정돼, 리포트 수 기반 자동 판정 폴백이 영구히 꺼짐
  const [studentType, setStudentType] = useState(isEdit ? (student.studentType || '') : 'new');
  const [assignedTeacherId, setAssignedTeacherId] = useState(student?.assignedTeacherId || '');
  // 반이 삭제된 뒤 남은 고아 classId는 처음부터 "미배정"으로 취급 — 그대로 두면 select엔
  // 미배정으로 보이는데 state는 여전히 죽은 id를 들고 있어, 다른 항목만 고쳐 저장해도
  // effectiveTeacherId가 빈 값으로 계산돼 담당 강사가 조용히 사라지는 버그가 있었음
  const [classId, setClassId] = useState(
    student?.classId && classes.some(c => c.id === student.classId) ? student.classId : ''
  );
  // 요일 인덱스 배열(0=일...6=토). 비어있으면 "매일 대상"으로 취급(대시보드 판정 기준) — 이 배열 자체엔 기본값 없음
  const [scheduleDays, setScheduleDays] = useState(student?.scheduleDays || []);
  const toggleScheduleDay = (d) => setScheduleDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  // 아바타/스킨은 수정 모드 전용 — 등록은 필수 정보만 빠르게 채우고, 커스터마이징은 나중에 수정에서
  const [avatar, setAvatar] = useState(student?.avatar || '');
  const [skinColor, setSkinColor] = useState(student?.skinColor || '');
  const [useCustomSkin, setUseCustomSkin] = useState(!!student?.skinColor);
  const [saving, setSaving] = useState(false);

  const phoneOk = isValidPhone(parentPhone);
  const isValid = name.trim() && school.trim() && textbooks.some(t => t.name.trim()) && phoneOk;

  const addTextbook = () => setTextbooks(prev => [...prev, { id: Date.now(), name: '' }]);
  const updateTextbook = (id, value) => setTextbooks(prev => prev.map(t => t.id === id ? { ...t, name: value } : t));
  const removeTextbook = (id) => { if (textbooks.length > 1) setTextbooks(prev => prev.filter(t => t.id !== id)); };

  // 반이 선택되면 그 반의 담당 강사를 그대로 씀 — "반이 강사를 결정한다"를 제출 시점에 확정
  // (classId 바뀔 때마다 assignedTeacherId를 useEffect로 동기화하면 이전 상태가 잠깐
  // 남아있는 타이밍에 저장될 수 있어서, 제출 시점에 한 번만 계산)
  const selectedClass = classes.find(c => c.id === classId);
  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    const effectiveTeacherId = classId ? (selectedClass?.teacherId || '') : assignedTeacherId;
    const payload = {
      name: name.trim(), school: school.trim(), parentPhone: parentPhone.trim(),
      memo: memo.trim(), textbooks: textbooks.filter(t => t.name.trim()),
    };
    if (isEdit) {
      payload.avatar = avatar;
      payload.skinColor = useCustomSkin ? skinColor : '';
      payload.classId = classId || '';
      payload.assignedTeacherId = effectiveTeacherId || '';
      // 미선택(레거시 학생)이면 필드를 아예 보내지 않아 자동 판정 폴백을 유지
      if (studentType) payload.studentType = studentType;
      payload.scheduleDays = scheduleDays;
    } else {
      payload.studentType = studentType;
      if (classId) payload.classId = classId;
      if (effectiveTeacherId) payload.assignedTeacherId = effectiveTeacherId;
      if (scheduleDays.length) payload.scheduleDays = scheduleDays;
    }
    await onSubmit(payload);
    setSaving(false);
  };

  // 담당 강사 재배정은 원장만 — 강사가 다른 강사에게 학생을 재배정할 수 있으면 안 돼서
  // 등록/수정 모드 둘 다 isDirector로 통일 (예전엔 수정 모드만 원장/강사 구분 없이 노출되던 구멍이 있었음)
  const showClassPicker = classes.length > 0 && isDirector;
  // 반이 있으면 담당 강사는 반이 자동으로 결정 — 직접 고르는 건 반 없는 학생만
  const showTeacherPicker = teachers.length > 0 && isDirector && !classId;

  return (
    <div role="dialog" aria-modal="true" style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: C.primaryLight, padding: '7px', borderRadius: `${RADIUS2.iconBg}px` }}>
              {isEdit ? <Pencil size={16} style={{ color: C.primary }} /> : <UserPlus size={16} style={{ color: C.primary }} />}
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{isEdit ? '학생 정보 수정' : '새 학생 등록'}</h2>
              <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>
                {isEdit ? `${student.name} 학생` : '필수 정보만 채우면 바로 등록됩니다'}
              </p>
            </div>
          </div>
          <button onClick={onClose} title="닫기" style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 22px' }}>

          {/* 학생 유형 토글 */}
          <div style={{ marginBottom: '14px' }}>
            <FieldLabel>학생 구분</FieldLabel>
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
              {[
                { key: 'new', label: '신규생', desc: '처음 등록하는 학생' },
                { key: 'returning', label: '재학생', desc: '기존에 다니던 학생' },
              ].map(({ key, label, desc }) => (
                <button key={key} onClick={() => setStudentType(key)}
                  style={{
                    flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer',
                    background: studentType === key ? C.info : '#fff',
                    color: studentType === key ? '#fff' : '#6B7280',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                    borderRight: key === 'new' ? '1px solid #E5E7EB' : 'none',
                  }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 2px' }}>{label}</p>
                  <p style={{ fontSize: '10px', opacity: 0.7, margin: 0 }}>{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <FieldLabel>이름 <span style={{ color: C.danger }}>*</span></FieldLabel>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 박지호" style={inputStyle} autoFocus={!isEdit} />
            </div>
            <div>
              <FieldLabel>학교 / 학년 <span style={{ color: C.danger }}>*</span></FieldLabel>
              {/* placeholder 필수 — guessCourseKey가 이 문자열에서 학년/학교급을 파싱해
                  단원 추천을 만들기 때문에, 형식이 깨지면 추천이 조용히 죽음 */}
              <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="예: 교현초 5학년" style={inputStyle} />
            </div>
          </div>

          {/* 반 */}
          {showClassPicker && (
            <div style={{ marginBottom: '12px' }}>
              <FieldLabel>반</FieldLabel>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} style={selectStyle}>
                <option value="">미배정 (담당 강사 직접 선택)</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* 담당 강사 — 반이 있으면 반 설정에 따라 자동 배정(읽기 전용), 반이 없을 때만 직접 선택 */}
          {classId ? (
            <div style={{ marginBottom: '12px' }}>
              <FieldLabel>담당 강사</FieldLabel>
              <div style={{ ...inputStyle, background: '#F3F4F6', color: '#6B7280', cursor: 'default' }}>
                {teachers.find(t => t.id === selectedClass?.teacherId)?.name || '담당 강사 미지정'}
                <span style={{ marginLeft: '6px', fontSize: '11px', color: '#6C7586' }}>(반 설정에 따라 자동 배정)</span>
              </div>
            </div>
          ) : showTeacherPicker && (
            <div style={{ marginBottom: '12px' }}>
              <FieldLabel>담당 강사</FieldLabel>
              <select value={assignedTeacherId} onChange={(e) => setAssignedTeacherId(e.target.value)} style={selectStyle}>
                <option value="">미배정 (원장님 직접 관리)</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* 수업 요일 — 대시보드 "오늘 미작성" 판정이 이 값을 기준으로 오늘 수업 없는 학생을 걸러냄 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <FieldLabel>수업 요일 (선택)</FieldLabel>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => setScheduleDays([1, 3, 5])} style={miniAddButtonStyle}>월수금</button>
                <button onClick={() => setScheduleDays([2, 4, 6])} style={miniAddButtonStyle}>화목토</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['일', '월', '화', '수', '목', '금', '토'].map((label, d) => (
                <button key={d} onClick={() => toggleScheduleDay(d)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                    border: scheduleDays.includes(d) ? 'none' : '1px solid #E5E7EB',
                    background: scheduleDays.includes(d) ? C.info : '#fff',
                    color: scheduleDays.includes(d) ? '#fff' : '#6B7280',
                    fontSize: '12px', fontWeight: 700, transition: 'all 0.15s',
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: '#6C7586', margin: '5px 0 0' }}>설정 안 하면 매일 대상에 포함돼요</p>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <FieldLabel>교재 <span style={{ color: C.danger }}>*</span></FieldLabel>
              <button onClick={addTextbook} style={miniAddButtonStyle}><Plus size={11} /> 교재 추가</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {textbooks.map((t, idx) => (
                <div key={t.id} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <div style={{ background: C.primaryLight, color: C.primary, width: '22px', height: '22px', borderRadius: `${RADIUS2.iconBg}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{idx + 1}</div>
                  <input value={t.name} onChange={(e) => updateTextbook(t.id, e.target.value)} placeholder="예: 초등 수학 5-2" style={inputStyle} />
                  {textbooks.length > 1 && (
                    <button onClick={() => removeTextbook(t.id)} title="교재 삭제" style={{ background: 'none', border: 'none', color: '#6C7586', cursor: 'pointer', padding: '3px', flexShrink: 0 }}><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <FieldLabel>학부모 연락처 (선택)</FieldLabel>
            <input type="tel" value={parentPhone} onChange={(e) => setParentPhone(formatPhone(e.target.value))} placeholder="010-0000-0000"
              style={{ ...inputStyle, borderColor: phoneOk ? '#E5E7EB' : C.errorDark }} />
            {!phoneOk && <p style={{ fontSize: '11px', color: C.errorDark, margin: '4px 0 0' }}>휴대폰 번호 형식이 올바르지 않습니다 (예: 010-1234-5678)</p>}
          </div>

          <div style={{ marginBottom: isEdit ? '12px' : 0 }}>
            <FieldLabel>관리 메모 (선택, 학원 내부용)</FieldLabel>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 서술형 대비 필요, 어머님이 카톡 선호" rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>

          {/* 캐릭터 아바타 + 리포트 스킨 — 수정 모드에서만 */}
          {isEdit && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <FieldLabel>캐릭터 아바타</FieldLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {AVATARS.map(av => (
                    <div
                      key={av.key}
                      role="button" tabIndex={0} aria-pressed={avatar === av.key}
                      onClick={() => setAvatar(av.key)}
                      onKeyDown={onKeyActivate(() => setAvatar(av.key))}
                      style={{
                        border: avatar === av.key ? `2.5px solid ${C.info}` : '2px solid #E5E7EB',
                        borderRadius: '12px', padding: '8px 6px',
                        cursor: 'pointer', textAlign: 'center',
                        background: avatar === av.key ? C.infoBg : '#F9FAFB',
                        transition: 'all 0.15s',
                      }}
                    >
                      <img src={av.url} alt={av.label} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '4px' }} />
                      <p style={{ fontSize: '10px', fontWeight: 600, color: avatar === av.key ? C.infoDark : '#6B7280', margin: 0, lineHeight: 1.3 }}>{av.label}</p>
                      {avatar === av.key && (
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: C.info, margin: '4px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#fff', fontSize: '10px', fontWeight: 900 }}>✓</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <FieldLabel>리포트 스킨</FieldLabel>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>개별 설정</span>
                    <div
                      role="switch" tabIndex={0} aria-checked={useCustomSkin} aria-label="개별 설정"
                      onClick={() => setUseCustomSkin(!useCustomSkin)}
                      onKeyDown={onKeyActivate(() => setUseCustomSkin(!useCustomSkin))}
                      style={{ width: '36px', height: '20px', borderRadius: '20px', background: useCustomSkin ? C.info : '#D1D5DB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                    >
                      <div style={{ position: 'absolute', top: '2px', left: useCustomSkin ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}></div>
                    </div>
                  </div>
                </div>

                {!useCustomSkin && (
                  <div style={{ background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px', fontSize: '11px', color: '#6C7586', fontWeight: 500 }}>
                    학원 기본 스킨을 사용합니다
                  </div>
                )}

                {useCustomSkin && (
                  <div>
                    {/* 프리셋 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                      {PRESET_SKINS.map(sk => (
                        <div key={sk.key} role="button" tabIndex={0} aria-pressed={skinColor === sk.main} onClick={() => setSkinColor(sk.main)} onKeyDown={onKeyActivate(() => setSkinColor(sk.main))}
                          style={{ borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: skinColor === sk.main ? `2.5px solid ${C.info}` : '2px solid #E5E7EB' }}>
                          <div style={{ height: '24px', background: sk.main }}></div>
                          <div style={{ padding: '3px', background: '#F9FAFB', textAlign: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: skinColor === sk.main ? C.infoDark : '#6B7280' }}>{sk.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* 커스텀 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F9FAFB', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ position: 'relative', width: '36px', height: '36px', borderRadius: '10px', background: skinColor || C.primary, border: '2px solid rgba(0,0,0,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                        <input type="color" value={skinColor || C.primary} onChange={(e) => setSkinColor(e.target.value)}
                          style={{ position: 'absolute', inset: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', border: 'none', cursor: 'pointer', opacity: 0 }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '11px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>직접 색상 선택</p>
                        <p style={{ fontSize: '10px', color: '#6C7586', margin: '1px 0 0', fontFamily: 'monospace' }}>{skinColor || C.primary}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px', justifyContent: isEdit ? 'center' : 'flex-end', background: '#F9FAFB', borderRadius: '0 0 18px 18px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '9px', border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
          <button onClick={handleSubmit} disabled={!isValid || saving}
            style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '9px', border: 'none', background: isValid ? C.primary : '#E5E7EB', color: isValid ? '#fff' : '#6C7586', cursor: isValid ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit' }}>
            <Check size={14} /> {saving ? (isEdit ? '저장 중...' : '등록 중...') : (isEdit ? '저장' : '등록 완료')}
          </button>
        </div>
      </div>
    </div>
  );
}
