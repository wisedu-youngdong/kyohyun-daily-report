import React, { useState, useMemo, useEffect } from 'react';
import {
  User, Clock, Target, MessageCircle, ArrowRight,
  FileText, Sparkles, Send, Plus, X, Check,
  UserPlus, GraduationCap, Settings, Trash2
} from 'lucide-react';

const TOKENS = {
  brand: '#185FA5', brandDark: '#0C447C', brandLight: '#E6F1FB', brandBg: '#F0F7FC',
  warn: '#854F0B', warnBg: '#FAEEDA', warnBorder: '#BA7517', warnText: '#633806',
  success: '#0F6E56', successBg: '#E1F5EE', successDark: '#085041',
  danger: '#791F1F', dangerBg: '#FCEBEB', dangerBorder: '#A32D2D',
  text: '#1A1A1A', textSub: '#6B7280', textMute: '#9CA3AF',
  border: '#E5E7EB', borderLight: '#F3F4F6', bg: '#FFFFFF', bgSoft: '#F9FAFB',
};

const RATING_LEVELS = [
  { level: 5, emoji: '🌟', label: '아주 잘함' },
  { level: 4, emoji: '😊', label: '잘함' },
  { level: 3, emoji: '🙂', label: '보통' },
  { level: 2, emoji: '😐', label: '아쉬움' },
  { level: 1, emoji: '😟', label: '노력 필요' },
];

const DIAGNOSIS_TAGS = [
  { key: 'calc',    label: '계산 실수',  color: 'warn'    },
  { key: 'concept', label: '개념 누락',  color: 'warn'    },
  { key: 'apply',   label: '응용 부족',  color: 'danger'  },
  { key: 'time',    label: '시간 부족',  color: 'danger'  },
  { key: 'perfect', label: '개념 완벽',  color: 'success' },
];

const ATTENDANCE = ['정시', '지각', '결석', '조퇴', '보강', '자율학습'];

export default function DiagnosticReportInput({
  students = [],
  teachers = [],
  onSaveStudent = async () => {},
  onSaveTeacher = async () => {},
  onDeleteTeacher = async () => {},
  onSave = async () => {},
}) {
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showTeacherPanel, setShowTeacherPanel] = useState(false);

  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const [attendance, setAttendance] = useState('정시');
  const [arrivalTime, setArrivalTime] = useState('15:30');
  const [homeworkRating, setHomeworkRating] = useState(0);
  const [conceptRating, setConceptRating] = useState(0);
  const [hasTest, setHasTest] = useState(false);
  const [testName, setTestName] = useState('');
  const [testScore, setTestScore] = useState('');
  const [textbook, setTextbook] = useState('');
  const [unit, setUnit] = useState('');
  const [pages, setPages] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [teacherNote, setTeacherNote] = useState('');
  const [aiPolishedNote, setAiPolishedNote] = useState('');
  const [nextPlan, setNextPlan] = useState('');
  const [nextPlanDetail, setNextPlanDetail] = useState('');
  const [saving, setSaving] = useState(false);

  // 강사 1명이면 자동 선택
  useEffect(() => {
    if (teachers.length === 1 && !teacherId) {
      setTeacherId(teachers[0].id);
    }
  }, [teachers]);

  const student = useMemo(() => students.find(s => s.id === studentId), [students, studentId]);
  const teacher = useMemo(() => teachers.find(t => t.id === teacherId), [teachers, teacherId]);
  const isValid = studentId && homeworkRating && conceptRating && teacherId;

  // 학생 등록 — Firebase에 저장
  const handleAddStudent = async (newStudent) => {
    try {
      await onSaveStudent(newStudent);
      setShowStudentModal(false);
    } catch (e) {
      console.error('학생 저장 오류:', e);
      alert('학생 저장 중 오류가 발생했습니다.');
    }
  };

  // 강사 등록 — Firebase에 저장
  const handleAddTeacher = async (name) => {
    try {
      await onSaveTeacher({ name });
    } catch (e) {
      console.error('강사 저장 오류:', e);
      alert('강사 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteTeacher = async (id) => {
    if (teachers.length <= 1) {
      alert('최소 1명의 강사는 등록되어 있어야 합니다.');
      return;
    }
    try {
      await onDeleteTeacher(id);
      if (teacherId === id) setTeacherId('');
    } catch (e) {
      console.error('강사 삭제 오류:', e);
    }
  };

  const toggleTag = (tagKey) => {
    const exists = selectedTags.findIndex(t => t.key === tagKey);
    if (exists >= 0) {
      setSelectedTags(prev => prev.filter((_, i) => i !== exists));
    } else {
      setSelectedTags(prev => [...prev, { key: tagKey, unit: '', pages: '', detail: '' }]);
    }
  };

  const updateTagDetail = (idx, field, value) => {
    setSelectedTags(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const handleAIPolish = async () => {
  if (!teacherNote.trim()) return;
  setAiPolishedNote('✨ AI가 다듬는 중...');
  try {
    const response = await fetch('/api/polish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ note: teacherNote }),
});
const data = await response.json();
setAiPolishedNote(data.result);
  } catch (e) {
    console.error('AI 오류:', e);
    setAiPolishedNote('');
    alert('AI 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
};
      // 리포트 저장 후 초기화
      setStudentId(''); setHomeworkRating(0); setConceptRating(0);
      setHasTest(false); setTestName(''); setTestScore('');
      setTextbook(''); setUnit(''); setPages('');
      setSelectedTags([]); setTeacherNote(''); setAiPolishedNote('');
      setNextPlan(''); setNextPlanDetail('');
      alert('리포트가 저장됐습니다!');
    } catch (e) {
      console.error('리포트 저장 오류:', e);
      alert('저장 중 오류가 발생했습니다.');
    }
    setSaving(false);
  };

  return (
    <div style={{
      fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
      letterSpacing: '-0.02em',
      background: TOKENS.bgSoft,
      minHeight: '100vh',
      padding: '20px',
      color: TOKENS.text,
    }}>
      <div style={{
        maxWidth: '1100px', margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: window.innerWidth > 900 ? '1fr 360px' : '1fr',
        gap: '20px', alignItems: 'flex-start',
      }}>
        {/* 좌측 입력 폼 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* 헤더 + 강사 */}
          <div style={{ background: TOKENS.bg, borderRadius: '16px', padding: '18px 20px', border: `1px solid ${TOKENS.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '26px', height: '26px', background: TOKENS.brand, borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700 }}>K</span>
              </div>
              <span style={{ fontSize: '13px', color: TOKENS.brand, fontWeight: 700 }}>교현학원</span>
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.025em' }}>오늘의 학습 리포트 작성</h1>
            <p style={{ fontSize: '12px', color: TOKENS.textSub, margin: '0 0 14px', fontWeight: 500 }}>한 단계씩 채우면 우측에 학부모 발송 화면이 실시간으로 만들어집니다</p>

            <div style={{ paddingTop: '12px', borderTop: `1px dashed ${TOKENS.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GraduationCap size={13} style={{ color: TOKENS.textMute, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: TOKENS.textSub, fontWeight: 600, flexShrink: 0 }}>작성 강사</span>
              {teachers.length === 0 ? (
                <span style={{ fontSize: '12px', color: TOKENS.textMute }}>강사 없음</span>
              ) : teachers.length === 1 ? (
                <span style={{ fontSize: '13px', fontWeight: 700, color: TOKENS.brandDark }}>{teachers[0].name}</span>
              ) : (
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}
                  style={{ ...inputStyle, padding: '5px 10px', fontSize: '12px', width: 'auto' }}>
                  <option value="">선택</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <button onClick={() => setShowTeacherPanel(true)} style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                color: TOKENS.brand, fontSize: '11px', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'inherit',
              }}>
                <Settings size={11} /> 강사 관리
              </button>
            </div>
          </div>

          {/* 1. 학생 선택 */}
          <FormSection number="1" title="대상 학생">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={selectStyle}>
              <option value="">학생을 선택해주세요</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.school}</option>)}
            </select>
            <button onClick={() => setShowStudentModal(true)} style={addStudentButtonStyle}>
              <UserPlus size={13} /> 새 학생 추가
            </button>
          </FormSection>

          {studentId && (
            <>
              {/* 2. 등원 */}
              <FormSection number="2" title="등원">
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {ATTENDANCE.map(a => (
                    <button key={a} onClick={() => setAttendance(a)} style={chipStyle(attendance === a)}>{a}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Clock size={13} style={{ color: TOKENS.textMute }} />
                  <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)}
                    style={{ ...inputStyle, width: '120px' }} />
                </div>
              </FormSection>

              {/* 3. 평가 */}
              <FormSection number="3" title="오늘의 평가">
                <RatingPicker label="과제 수행" value={homeworkRating} onChange={setHomeworkRating} />
                <div style={{ height: '10px' }} />
                <RatingPicker label="개념 이해" value={conceptRating} onChange={setConceptRating} />
              </FormSection>

              {/* 4. 테스트 */}
              <FormSection number="4" title="테스트">
                <div style={{ display: 'flex', gap: '3px', background: TOKENS.borderLight, borderRadius: '10px', padding: '3px', marginBottom: hasTest ? '12px' : '0' }}>
                  <button onClick={() => setHasTest(true)}  style={toggleStyle(hasTest)}>진행함</button>
                  <button onClick={() => setHasTest(false)} style={toggleStyle(!hasTest)}>진행 안 함</button>
                </div>
                {hasTest && (
                  <>
                    <FieldLabel>테스트 명칭</FieldLabel>
                    <input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="예: 1학기 중간 대비 모의고사 2회차" style={inputStyle} />
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', margin: '6px 0 12px' }}>
                      {['단원평가', '주간 테스트', '중간 대비', '기말 대비'].map(n => (
                        <button key={n} onClick={() => setTestName(n)} style={suggestionStyle}>{n}</button>
                      ))}
                    </div>
                    <FieldLabel>점수</FieldLabel>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="number" value={testScore} onChange={(e) => setTestScore(e.target.value)} placeholder="84"
                        style={{ ...inputStyle, width: '90px', textAlign: 'center' }} />
                      <span style={{ fontSize: '12px', color: TOKENS.textSub, fontWeight: 500 }}>점 / 100점</span>
                    </div>
                  </>
                )}
              </FormSection>

              {/* 5. 오늘 학습 */}
              <FormSection number="5" title="오늘 학습">
                <FieldLabel>교재</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
                  {(student?.textbooks || []).map(t => (
                    <button key={t.id} onClick={() => setTextbook(t.name)} style={chipStyle(textbook === t.name)}>{t.name}</button>
                  ))}
                </div>
                <FieldLabel>단원</FieldLabel>
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="예: 3단원 소수의 나눗셈" style={inputStyle} />
                <div style={{ height: '8px' }} />
                <FieldLabel>학습 범위</FieldLabel>
                <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="예: p.24 ~ p.32" style={inputStyle} />
              </FormSection>

              {/* 6. 진단 */}
              <FormSection number="6" title="오늘의 진단" badge={`${selectedTags.length}개 선택`}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
                  {DIAGNOSIS_TAGS.map(tag => {
                    const active = selectedTags.some(t => t.key === tag.key);
                    return (
                      <button key={tag.key} onClick={() => toggleTag(tag.key)} style={tagStyle(tag.color, active)}>
                        {active && <Check size={11} style={{ marginRight: '2px', verticalAlign: '-2px' }} />}
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
                {selectedTags.length > 0 && (
                  <div style={{ background: TOKENS.warnBg, borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ fontSize: '11px', color: TOKENS.warn, fontWeight: 700, margin: 0 }}>선택된 진단 상세 입력</p>
                    {selectedTags.map((tag, idx) => {
                      const tagDef = DIAGNOSIS_TAGS.find(t => t.key === tag.key);
                      return (
                        <div key={idx} style={{ background: '#fff', borderRadius: '10px', padding: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={tagStyle(tagDef.color, true)}>{tagDef.label}</span>
                            <button onClick={() => toggleTag(tag.key)} style={{ background: 'none', border: 'none', color: TOKENS.textMute, cursor: 'pointer' }}><X size={13} /></button>
                          </div>
                          <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                            <input value={tag.unit} onChange={(e) => updateTagDetail(idx, 'unit', e.target.value)} placeholder="단원" style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }} />
                            <input value={tag.pages} onChange={(e) => updateTagDetail(idx, 'pages', e.target.value)} placeholder="페이지 (예: p.28)" style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }} />
                          </div>
                          <input value={tag.detail} onChange={(e) => updateTagDetail(idx, 'detail', e.target.value)} placeholder="상세 설명 (예: 자릿수 표기 2회 실수)" style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </FormSection>

              {/* 7. 선생님 한 마디 */}
              <FormSection number="7" title="선생님 한 마디">
                <FieldLabel>강사 메모 (평소 카톡 톤으로 자유롭게)</FieldLabel>
                <textarea value={teacherNote} onChange={(e) => setTeacherNote(e.target.value)}
                  placeholder="예: 3단원 자릿수 실수 2번, 응용은 시간 부족으로 못 풂. 개념은 알고 있음"
                  rows={3} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
                <button onClick={handleAIPolish} disabled={!teacherNote.trim()} style={aiButtonStyle(!teacherNote.trim())}>
                  <Sparkles size={13} /> AI로 학부모 톤으로 다듬기
                </button>
                {aiPolishedNote && (
                  <div style={{ background: TOKENS.successBg, borderRadius: '12px', padding: '10px', marginTop: '10px' }}>
                    <p style={{ fontSize: '11px', color: TOKENS.success, fontWeight: 700, margin: '0 0 6px' }}>학부모 발송 버전 (수정 가능)</p>
                    <textarea value={aiPolishedNote} onChange={(e) => setAiPolishedNote(e.target.value)}
                      rows={3} style={{ ...inputStyle, background: '#fff', fontFamily: 'inherit', resize: 'vertical' }} />
                  </div>
                )}
              </FormSection>

              {/* 8. 다음 수업 계획 */}
              <FormSection number="8" title="다음 수업 계획">
                <FieldLabel>계획 (한 줄 요약)</FieldLabel>
                <input value={nextPlan} onChange={(e) => setNextPlan(e.target.value)} placeholder="예: 3단원 자릿수 보완 + 4단원 도입" style={inputStyle} />
                <div style={{ height: '8px' }} />
                <FieldLabel>교재 범위 (선택)</FieldLabel>
                <input value={nextPlanDetail} onChange={(e) => setNextPlanDetail(e.target.value)} placeholder="예: 초등 수학 개념 완성 · p.33~40" style={inputStyle} />
              </FormSection>

              {/* 저장 버튼 */}
              <button onClick={handleSubmit} disabled={!isValid || saving} style={submitButtonStyle(isValid && !saving)}>
                <Send size={15} /> {saving ? '저장 중...' : '리포트 저장 및 발송 준비'}
              </button>
            </>
          )}
        </div>

        {/* 우측 미리보기 */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <p style={{ fontSize: '11px', color: TOKENS.textMute, fontWeight: 700, marginBottom: '8px' }}>학부모 발송 미리보기</p>
          <ParentCard
            student={student} teacher={teacher}
            attendance={attendance} arrivalTime={arrivalTime}
            homeworkRating={homeworkRating} conceptRating={conceptRating}
            hasTest={hasTest} testName={testName} testScore={testScore}
            textbook={textbook} unit={unit} pages={pages}
            diagnosis={selectedTags}
            teacherNote={aiPolishedNote || teacherNote}
            nextPlan={nextPlan} nextPlanDetail={nextPlanDetail}
          />
        </div>
      </div>

      {/* 학생 등록 모달 */}
      {showStudentModal && (
        <StudentModal onClose={() => setShowStudentModal(false)} onSubmit={handleAddStudent} />
      )}

      {/* 강사 관리 패널 */}
      {showTeacherPanel && (
        <TeacherPanel
          teachers={teachers}
          onAdd={handleAddTeacher}
          onDelete={handleDeleteTeacher}
          onClose={() => setShowTeacherPanel(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// 학생 등록 모달
// ============================================================
function StudentModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [memo, setMemo] = useState('');
  const [textbooks, setTextbooks] = useState([{ id: Date.now(), name: '' }]);
  const [saving, setSaving] = useState(false);

  const isValid = name.trim() && school.trim() && textbooks.some(t => t.name.trim());

  const addTextbook = () => setTextbooks(prev => [...prev, { id: Date.now(), name: '' }]);
  const updateTextbook = (id, value) => setTextbooks(prev => prev.map(t => t.id === id ? { ...t, name: value } : t));
  const removeTextbook = (id) => { if (textbooks.length > 1) setTextbooks(prev => prev.filter(t => t.id !== id)); };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      school: school.trim(),
      parentPhone: parentPhone.trim(),
      memo: memo.trim(),
      textbooks: textbooks.filter(t => t.name.trim()),
    });
    setSaving(false);
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#E6F1FB', padding: '7px', borderRadius: '9px' }}>
              <UserPlus size={16} style={{ color: '#185FA5' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>새 학생 등록</h2>
              <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>필수 정보만 채우면 바로 등록됩니다</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <FieldLabel>이름 <span style={{ color: '#DC2626' }}>*</span></FieldLabel>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 박지호" style={inputStyle} autoFocus />
            </div>
            <div>
              <FieldLabel>학교 / 학년 <span style={{ color: '#DC2626' }}>*</span></FieldLabel>
              <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="예: 교현초 5학년" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <FieldLabel>교재 <span style={{ color: '#DC2626' }}>*</span></FieldLabel>
              <button onClick={addTextbook} style={miniAddButtonStyle}><Plus size={11} /> 교재 추가</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {textbooks.map((t, idx) => (
                <div key={t.id} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <div style={{ background: '#E6F1FB', color: '#185FA5', width: '22px', height: '22px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{idx + 1}</div>
                  <input value={t.name} onChange={(e) => updateTextbook(t.id, e.target.value)} placeholder="예: 초등 수학 5-2" style={inputStyle} />
                  {textbooks.length > 1 && (
                    <button onClick={() => removeTextbook(t.id)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '3px', flexShrink: 0 }}><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <FieldLabel>학부모 연락처 (선택)</FieldLabel>
            <input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="010-0000-0000" style={inputStyle} />
          </div>

          <div>
            <FieldLabel>관리 메모 (선택, 학원 내부용)</FieldLabel>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 서술형 대비 필요, 어머님이 카톡 선호" rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ padding: '12px 22px', borderTop: `1px solid #E5E7EB`, display: 'flex', gap: '8px', justifyContent: 'flex-end', background: '#F9FAFB', borderRadius: '0 0 18px 18px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '9px', border: `1px solid #E5E7EB`, background: '#fff', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
          <button onClick={handleSubmit} disabled={!isValid || saving} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '9px', border: 'none', background: isValid ? '#185FA5' : '#E5E7EB', color: '#fff', cursor: isValid ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit' }}>
            <Check size={14} /> {saving ? '등록 중...' : '등록 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 강사 관리 패널
// ============================================================
function TeacherPanel({ teachers, onAdd, onDelete, onClose }) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await onAdd(newName.trim());
    setNewName('');
    setSaving(false);
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#E6F1FB', padding: '7px', borderRadius: '9px' }}>
              <GraduationCap size={16} style={{ color: '#185FA5' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>강사 관리</h2>
              <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0', fontWeight: 500 }}>리포트에 표시될 강사 이름을 관리합니다</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <FieldLabel>현재 등록된 강사</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
            {teachers.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0 }}>등록된 강사가 없습니다</p>
            ) : teachers.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB', padding: '9px 12px', borderRadius: '9px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{t.name}</span>
                {teachers.length > 1 && (
                  <button onClick={() => onDelete(t.id)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '3px' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <FieldLabel>새 강사 추가</FieldLabel>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="예: 박선생님" style={inputStyle} />
            <button onClick={handleAdd} disabled={!newName.trim() || saving} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '9px', border: 'none', background: newName.trim() ? '#185FA5' : '#E5E7EB', color: '#fff', cursor: newName.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', flexShrink: 0 }}>
              <Plus size={13} /> {saving ? '...' : '추가'}
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 22px', borderTop: `1px solid #E5E7EB`, display: 'flex', justifyContent: 'flex-end', background: '#F9FAFB', borderRadius: '0 0 18px 18px' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', fontSize: '13px', fontWeight: 700, borderRadius: '9px', border: 'none', background: '#185FA5', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>완료</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 학부모 카드 미리보기
// ============================================================
function ParentCard({ student, teacher, attendance, arrivalTime, homeworkRating, conceptRating, hasTest, testName, testScore, textbook, unit, pages, diagnosis, teacherNote, nextPlan, nextPlanDetail }) {
  const today = new Date();
  const dateStr = `${String(today.getMonth() + 1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')} (${'일월화수목금토'[today.getDay()]})`;
  const homework = RATING_LEVELS.find(r => r.level === homeworkRating);
  const concept  = RATING_LEVELS.find(r => r.level === conceptRating);

  if (!student) return (
    <div style={{ background: '#fff', border: `1px dashed #E5E7EB`, borderRadius: '18px', padding: '50px 20px', textAlign: 'center' }}>
      <User size={28} style={{ color: '#D1D5DB', marginBottom: '10px' }} />
      <p style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500, margin: 0 }}>학생을 선택하면<br />학부모 카드가 여기에 만들어집니다</p>
    </div>
  );

  return (
    <div style={{ background: '#fff', borderRadius: '18px', border: `1px solid #E5E7EB`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(24,95,165,0.06)' }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid #E6F1FB', display: 'flex', alignItems: 'center', gap: '7px' }}>
        <div style={{ width: '20px', height: '20px', background: '#185FA5', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#fff', fontSize: '10px', fontWeight: 700 }}>K</span>
        </div>
        <span style={{ fontSize: '11px', color: '#185FA5', fontWeight: 700 }}>교현학원</span>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#9CA3AF' }}>{dateStr}</span>
      </div>

      <div style={{ padding: '16px', textAlign: 'center', background: 'linear-gradient(to bottom, #F0F7FC, #fff)' }}>
        <p style={{ fontSize: '10px', color: '#185FA5', margin: '0 0 5px', fontWeight: 700 }}>오늘의 학습 리포트</p>
        <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>{student.name} 학생</p>
        <p style={{ fontSize: '10px', color: '#6B7280', margin: '3px 0 0', fontWeight: 500 }}>{student.school} · {teacher?.name || '선생님'} 드림</p>
      </div>

      {(homeworkRating || conceptRating) && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E7EB' }}>
          <p style={{ fontSize: '10px', color: '#6B7280', textAlign: 'center', margin: '0 0 8px', fontWeight: 500 }}>
            <Clock size={10} style={{ verticalAlign: '-1px', marginRight: '2px' }} />{arrivalTime} {attendance}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: '10px', color: '#6B7280', margin: '0 0 5px', fontWeight: 700 }}>과제 수행</p>
              {homework ? <><div style={{ fontSize: '24px', lineHeight: 1, marginBottom: '3px' }}>{homework.emoji}</div><p style={{ fontSize: '10px', color: '#1A1A1A', margin: 0, fontWeight: 600 }}>{homework.label}</p></> : <p style={{ fontSize: '11px', color: '#D1D5DB', margin: 0 }}>미입력</p>}
            </div>
            <div style={{ borderLeft: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: '#6B7280', margin: '0 0 5px', fontWeight: 700 }}>개념 이해</p>
              {concept ? <><div style={{ fontSize: '24px', lineHeight: 1, marginBottom: '3px' }}>{concept.emoji}</div><p style={{ fontSize: '10px', color: '#1A1A1A', margin: 0, fontWeight: 600 }}>{concept.label}</p></> : <p style={{ fontSize: '11px', color: '#D1D5DB', margin: 0 }}>미입력</p>}
            </div>
          </div>
        </div>
      )}

      {hasTest && testName && (
        <div style={{ padding: '11px 16px', background: '#FAEEDA', borderTop: '1px solid #E5E7EB' }}>
          <p style={{ fontSize: '10px', color: '#854F0B', margin: '0 0 4px', fontWeight: 700 }}><FileText size={11} style={{ verticalAlign: '-2px', marginRight: '2px' }} />{testName}</p>
          {testScore && <p style={{ fontSize: '20px', fontWeight: 700, color: '#633806', margin: 0, letterSpacing: '-0.02em' }}>{testScore}<span style={{ fontSize: '11px', opacity: 0.7, fontWeight: 500 }}>점</span> <span style={{ fontSize: '10px', color: '#BA7517', fontWeight: 500 }}>/ 100점</span></p>}
        </div>
      )}

      {(textbook || unit) && (
        <div style={{ padding: '11px 16px', borderTop: '1px solid #E5E7EB' }}>
          <p style={{ fontSize: '10px', color: '#6B7280', margin: '0 0 4px', fontWeight: 700 }}>오늘 학습</p>
          {textbook && <p style={{ fontSize: '12px', fontWeight: 600, margin: '0 0 2px' }}>{textbook}</p>}
          {(unit || pages) && <p style={{ fontSize: '11px', color: '#6B7280', margin: 0, fontWeight: 500 }}>{unit}{unit && pages ? ' · ' : ''}{pages}</p>}
        </div>
      )}

      {diagnosis.length > 0 && (
        <div style={{ padding: '11px 16px', background: '#FAEEDA', borderTop: '1px solid #E5E7EB' }}>
          <p style={{ fontSize: '10px', color: '#854F0B', margin: '0 0 6px', fontWeight: 700 }}><Target size={11} style={{ verticalAlign: '-2px', marginRight: '2px' }} />오늘의 진단</p>
          {diagnosis.map((d, idx) => {
            const tagDef = DIAGNOSIS_TAGS.find(t => t.key === d.key);
            return (
              <div key={idx} style={{ marginBottom: idx < diagnosis.length - 1 ? '6px' : 0 }}>
                <span style={{ display: 'inline-block', background: '#fff', border: '1px solid #BA7517', color: '#854F0B', fontSize: '10px', padding: '2px 7px', borderRadius: '5px', fontWeight: 600, marginBottom: '2px' }}>
                  {tagDef?.label}{d.unit && ` · ${d.unit}`}{d.pages && ` ${d.pages}`}
                </span>
                {d.detail && <p style={{ fontSize: '11px', color: '#633806', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>{d.detail}</p>}
              </div>
            );
          })}
        </div>
      )}

      {teacherNote && (
        <div style={{ padding: '11px 16px', borderTop: '1px solid #E5E7EB' }}>
          <p style={{ fontSize: '10px', color: '#6B7280', margin: '0 0 5px', fontWeight: 700 }}><MessageCircle size={11} style={{ verticalAlign: '-2px', marginRight: '2px' }} />선생님 한 마디</p>
          <p style={{ fontSize: '11px', color: '#1A1A1A', margin: 0, lineHeight: 1.6, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{teacherNote}</p>
        </div>
      )}

      {nextPlan && (
        <div style={{ padding: '11px 16px', background: '#E1F5EE', borderTop: '1px solid #E5E7EB' }}>
          <p style={{ fontSize: '10px', color: '#0F6E56', margin: '0 0 3px', fontWeight: 700 }}><ArrowRight size={11} style={{ verticalAlign: '-2px', marginRight: '2px' }} />다음 수업 계획</p>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#085041', margin: 0 }}>{nextPlan}</p>
          {nextPlanDetail && <p style={{ fontSize: '10px', color: '#0F6E56', margin: '2px 0 0', fontWeight: 500 }}>{nextPlanDetail}</p>}
        </div>
      )}

      <div style={{ padding: '7px 16px', background: '#F9FAFB', textAlign: 'center', borderTop: '1px solid #E5E7EB' }}>
        <p style={{ fontSize: '9px', color: '#9CA3AF', margin: 0 }}>교현학원 · 031-707-0591</p>
      </div>
    </div>
  );
}

// ============================================================
// 서브 컴포넌트 & 스타일
// ============================================================
function FormSection({ number, title, badge, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: `1px solid #E5E7EB` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '12px' }}>
        <span style={{ background: '#185FA5', color: '#fff', width: '20px', height: '20px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{number}</span>
        <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
        {badge && <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#185FA5', fontWeight: 600, background: '#E6F1FB', padding: '2px 8px', borderRadius: '7px' }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 5px' }}>{children}</p>;
}

function RatingPicker({ label, value, onChange }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
        {RATING_LEVELS.map(r => {
          const active = value === r.level;
          return (
            <button key={r.level} onClick={() => onChange(r.level)} style={{ background: active ? '#E6F1FB' : '#F9FAFB', border: `1.5px solid ${active ? '#185FA5' : 'transparent'}`, borderRadius: '10px', padding: '8px 3px', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: '22px', lineHeight: 1, marginBottom: '3px' }}>{r.emoji}</div>
              <div style={{ fontSize: '9px', fontWeight: active ? 700 : 500, color: active ? '#0C447C' : '#6B7280' }}>{r.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 11px', fontSize: '13px',
  border: `1px solid #E5E7EB`, borderRadius: '9px',
  background: '#F9FAFB', outline: 'none',
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
  fontWeight: 500, color: '#1A1A1A', letterSpacing: '-0.02em', boxSizing: 'border-box',
};
const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'none' };
const chipStyle = (active) => ({
  padding: '6px 12px', fontSize: '12px', fontWeight: active ? 700 : 500,
  borderRadius: '9px', border: `1px solid ${active ? '#185FA5' : '#E5E7EB'}`,
  background: active ? '#E6F1FB' : '#fff', color: active ? '#0C447C' : '#6B7280',
  cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.02em',
});
const tagStyle = (color, active) => {
  const c = { warn: { bg: '#FAEEDA', border: '#BA7517', text: '#854F0B' }, danger: { bg: '#FCEBEB', border: '#A32D2D', text: '#791F1F' }, success: { bg: '#E1F5EE', border: '#0F6E56', text: '#0F6E56' } }[color] || {};
  return { padding: '4px 9px', fontSize: '12px', fontWeight: 600, borderRadius: '7px', border: `1px solid ${active ? c.border : '#E5E7EB'}`, background: active ? c.bg : '#fff', color: active ? c.text : '#6B7280', cursor: 'pointer', fontFamily: 'inherit' };
};
const toggleStyle = (active) => ({
  flex: 1, padding: '7px', fontSize: '12px', fontWeight: active ? 700 : 500,
  border: 'none', borderRadius: '8px', background: active ? '#fff' : 'transparent',
  color: active ? '#0C447C' : '#6B7280', cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
});
const suggestionStyle = { padding: '3px 9px', fontSize: '10px', fontWeight: 500, borderRadius: '5px', border: 'none', background: '#E6F1FB', color: '#185FA5', cursor: 'pointer', fontFamily: 'inherit' };
const aiButtonStyle = (disabled) => ({
  marginTop: '8px', width: '100%', padding: '9px', fontSize: '12px', fontWeight: 700,
  borderRadius: '9px', border: `1px solid ${disabled ? '#E5E7EB' : '#0F6E56'}`,
  background: disabled ? '#F9FAFB' : '#fff', color: disabled ? '#9CA3AF' : '#0F6E56',
  cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: '5px', fontFamily: 'inherit',
});
const submitButtonStyle = (valid) => ({
  padding: '14px', fontSize: '14px', fontWeight: 700, borderRadius: '12px', border: 'none',
  background: valid ? '#185FA5' : '#E5E7EB', color: '#fff', cursor: valid ? 'pointer' : 'not-allowed',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
  fontFamily: 'inherit', boxShadow: valid ? '0 4px 14px rgba(24,95,165,0.25)' : 'none',
});
const addStudentButtonStyle = {
  marginTop: '8px', width: '100%', padding: '10px', fontSize: '13px', fontWeight: 700,
  borderRadius: '9px', border: `1px dashed #185FA5`, background: '#E6F1FB', color: '#185FA5',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: '5px', fontFamily: 'inherit',
};
const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)',
};
const modalStyle = {
  background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '500px',
  maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
};
const modalHeaderStyle = {
  padding: '18px 22px', borderBottom: `1px solid #E5E7EB`,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const miniAddButtonStyle = {
  background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '5px',
  padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '2px',
};
