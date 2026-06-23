/**
 * 교현학원 데일리 리포트 v4 (with 학생/강사 등록)
 *
 * 추가 사항:
 * - 학생 등록 모달 (이름/학교/교재/연락처/메모)
 * - 교재 동적 추가 (모달 내)
 * - 강사 등록 + 선택 기능
 * - 등록 후 자동 선택
 *
 * 사용법:
 * <DiagnosticReportInput
 *   students={학생배열}
 *   teachers={강사배열}
 *   onSaveStudent={(student) => {...}}
 *   onSaveTeacher={(teacher) => {...}}
 *   onSave={(reportData) => {...}}
 * />
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  User, Clock, Star, Target, MessageCircle, ArrowRight,
  FileText, Sparkles, Send, ChevronDown, Plus, X, Check,
  UserPlus, GraduationCap, Settings, Trash2, BookOpen
} from 'lucide-react';

// ============================================================
// 디자인 토큰
// ============================================================
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

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function DiagnosticReportInput({
  students: initialStudents = DEMO_STUDENTS,
  teachers: initialTeachers = DEMO_TEACHERS,
  onSaveStudent = (s) => console.log('학생 저장:', s),
  onSaveTeacher = (t) => console.log('강사 저장:', t),
  onSave = (data) => console.log('리포트 저장:', data),
}) {
  // 내부 상태 (실제 사용 시엔 부모에서 받은 students/teachers 사용)
  const [students, setStudents] = useState(initialStudents);
  const [teachers, setTeachers] = useState(initialTeachers);

  // 모달 상태
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showTeacherPanel, setShowTeacherPanel] = useState(false);

  // 리포트 작성 상태
  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState(teachers[0]?.id || '');

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

  // 파생 데이터
  const student = useMemo(() => students.find(s => s.id === studentId), [students, studentId]);
  const teacher = useMemo(() => teachers.find(t => t.id === teacherId), [teachers, teacherId]);
  const isValid = studentId && homeworkRating && conceptRating && teacherId;

  // 강사 1명 자동 선택
  useEffect(() => {
    if (teachers.length === 1 && !teacherId) {
      setTeacherId(teachers[0].id);
    }
  }, [teachers, teacherId]);

  // ----- 학생 등록 핸들러 -----
 const handleAddStudent = async (newStudent) => {
  await onSaveStudent(newStudent);
  setShowStudentModal(false);
  };

  // ----- 강사 등록 핸들러 -----
 const handleAddTeacher = async (name) => {
  await onSaveTeacher({ name });
  };

  const handleDeleteTeacher = (id) => {
    if (teachers.length <= 1) {
      alert('최소 1명의 강사는 등록되어 있어야 합니다.');
      return;
    }
    setTeachers(prev => prev.filter(t => t.id !== id));
    if (teacherId === id) setTeacherId(teachers[0].id);
  };

  // ----- 진단 태그 핸들러 -----
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

  const handleAIPolish = () => {
    if (!teacherNote.trim()) return;
    const demo = teacherNote
      .replace(/실수/g, '실수가 있었습니다')
      .replace(/못 풂/g, '풀이 시간이 부족했습니다')
      .replace(/잘함/g, '잘 수행했습니다');
    setAiPolishedNote(demo + ' (AI 다듬기 데모)');
  };

  const handleSubmit = () => {
    const reportData = {
      studentId, studentName: student?.name,
      teacherId, teacherName: teacher?.name,
      attendance, arrivalTime,
      homeworkRating, conceptRating,
      hasTest, testName: hasTest ? testName : null, testScore: hasTest ? testScore : null,
      textbook, unit, pages,
      diagnosis: selectedTags,
      teacherNote: aiPolishedNote || teacherNote,
      nextPlan, nextPlanDetail,
      createdAt: Date.now(),
    };
    onSave(reportData);
  };

  // ============================================================
  // 렌더링
  // ============================================================
  return (
    <div style={{
      fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
      letterSpacing: '-0.02em',
      background: TOKENS.bgSoft,
      minHeight: '100vh',
      padding: '24px',
      color: TOKENS.text,
    }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css" />

      <div style={{
        maxWidth: '1200px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1fr 380px',
        gap: '24px', alignItems: 'flex-start',
      }}>
        {/* ============ 좌측: 입력 폼 ============ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 헤더 + 강사 선택 */}
          <FormHeader
            teachers={teachers}
            teacherId={teacherId}
            onTeacherChange={setTeacherId}
            onOpenTeacherPanel={() => setShowTeacherPanel(true)}
          />

          {/* 1단계: 학생 선택 + 새 학생 추가 */}
          <FormSection number="1" title="대상 학생">
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              style={selectStyle}
            >
              <option value="">학생을 선택해주세요</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.school}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowStudentModal(true)}
              style={addStudentButtonStyle}
            >
              <UserPlus size={14} />
              새 학생 추가
            </button>
          </FormSection>

          {/* 2~8단계 (학생 선택 시에만 나타남) */}
          {studentId && (
            <>
              <FormSection number="2" title="등원">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {ATTENDANCE.map(a => (
                    <button key={a} onClick={() => setAttendance(a)} style={chipStyle(attendance === a)}>
                      {a}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Clock size={14} style={{ color: TOKENS.textMute }} />
                  <input
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    style={{ ...inputStyle, width: '120px' }}
                  />
                </div>
              </FormSection>

              <FormSection number="3" title="오늘의 평가">
                <RatingPicker label="과제 수행" value={homeworkRating} onChange={setHomeworkRating} />
                <div style={{ height: '12px' }} />
                <RatingPicker label="개념 이해" value={conceptRating} onChange={setConceptRating} />
              </FormSection>

              <FormSection number="4" title="테스트">
                <div style={{ display: 'flex', gap: '4px', background: TOKENS.borderLight, borderRadius: '10px', padding: '3px', marginBottom: hasTest ? '14px' : '0' }}>
                  <button onClick={() => setHasTest(true)}  style={toggleStyle(hasTest)}>진행함</button>
                  <button onClick={() => setHasTest(false)} style={toggleStyle(!hasTest)}>진행 안 함</button>
                </div>

                {hasTest && (
                  <>
                    <FieldLabel>테스트 명칭</FieldLabel>
                    <input
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      placeholder="예: 1학기 중간 대비 모의고사 2회차"
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0 14px' }}>
                      {['단원평가', '주간 테스트', '중간 대비', '기말 대비'].map(name => (
                        <button key={name} onClick={() => setTestName(name)} style={suggestionStyle}>
                          {name}
                        </button>
                      ))}
                    </div>
                    <FieldLabel>점수</FieldLabel>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={testScore}
                        onChange={(e) => setTestScore(e.target.value)}
                        placeholder="84"
                        style={{ ...inputStyle, width: '100px', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: '13px', color: TOKENS.textSub, fontWeight: 500 }}>점 / 100점</span>
                    </div>
                  </>
                )}
              </FormSection>

              <FormSection number="5" title="오늘 학습">
                <FieldLabel>교재</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                  {(student?.textbooks || []).map(t => (
                    <button key={t.id} onClick={() => setTextbook(t.name)} style={chipStyle(textbook === t.name)}>
                      {t.name}
                    </button>
                  ))}
                </div>

                <FieldLabel>단원</FieldLabel>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="예: 3단원 소수의 나눗셈"
                  style={inputStyle}
                />
                <div style={{ height: '10px' }} />

                <FieldLabel>학습 범위</FieldLabel>
                <input
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  placeholder="예: p.24 ~ p.32"
                  style={inputStyle}
                />
              </FormSection>

              <FormSection number="6" title="오늘의 진단" badge={`${selectedTags.length}개 선택`}>
                <FieldLabel>진단 태그</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                  {DIAGNOSIS_TAGS.map(tag => {
                    const active = selectedTags.some(t => t.key === tag.key);
                    return (
                      <button key={tag.key} onClick={() => toggleTag(tag.key)} style={tagStyle(tag.color, active)}>
                        {active && <Check size={12} style={{ marginRight: '3px', verticalAlign: '-2px' }} />}
                        {tag.label}
                      </button>
                    );
                  })}
                </div>

                {selectedTags.length > 0 && (
                  <div style={{ background: TOKENS.warnBg, borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={{ fontSize: '11px', color: TOKENS.warn, fontWeight: 700, margin: 0 }}>선택된 진단 상세 입력</p>
                    {selectedTags.map((tag, idx) => {
                      const tagDef = DIAGNOSIS_TAGS.find(t => t.key === tag.key);
                      return (
                        <div key={idx} style={{ background: '#fff', borderRadius: '10px', padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ ...tagStyle(tagDef.color, true), cursor: 'default' }}>{tagDef.label}</span>
                            <button onClick={() => toggleTag(tag.key)} style={{ background: 'none', border: 'none', color: TOKENS.textMute, cursor: 'pointer', padding: '2px' }}>
                              <X size={14} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                            <input value={tag.unit} onChange={(e) => updateTagDetail(idx, 'unit', e.target.value)} placeholder="단원" style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }} />
                            <input value={tag.pages} onChange={(e) => updateTagDetail(idx, 'pages', e.target.value)} placeholder="페이지 (예: p.28)" style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }} />
                          </div>
                          <input value={tag.detail} onChange={(e) => updateTagDetail(idx, 'detail', e.target.value)} placeholder="상세 설명 (예: 자릿수 표기 2회 실수)" style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </FormSection>

              <FormSection number="7" title="선생님 한 마디">
                <FieldLabel>강사 메모 (평소 카톡 톤으로 자유롭게)</FieldLabel>
                <textarea
                  value={teacherNote}
                  onChange={(e) => setTeacherNote(e.target.value)}
                  placeholder="예: 3단원 자릿수 실수 2번, 응용은 시간 부족으로 못 풂. 개념은 알고 있음"
                  rows={3}
                  style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                />
                <button onClick={handleAIPolish} disabled={!teacherNote.trim()} style={aiButtonStyle(!teacherNote.trim())}>
                  <Sparkles size={14} />
                  AI로 학부모 톤으로 다듬기
                </button>

                {aiPolishedNote && (
                  <div style={{ background: TOKENS.successBg, borderRadius: '12px', padding: '12px', marginTop: '12px' }}>
                    <p style={{ fontSize: '11px', color: TOKENS.success, fontWeight: 700, margin: '0 0 8px' }}>학부모 발송 버전 (수정 가능)</p>
                    <textarea
                      value={aiPolishedNote}
                      onChange={(e) => setAiPolishedNote(e.target.value)}
                      rows={3}
                      style={{ ...inputStyle, background: '#fff', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>
                )}
              </FormSection>

              <FormSection number="8" title="다음 수업 계획">
                <FieldLabel>계획 (한 줄 요약)</FieldLabel>
                <input
                  value={nextPlan}
                  onChange={(e) => setNextPlan(e.target.value)}
                  placeholder="예: 3단원 자릿수 보완 + 4단원 도입"
                  style={inputStyle}
                />
                <div style={{ height: '10px' }} />
                <FieldLabel>교재 범위 (선택)</FieldLabel>
                <input
                  value={nextPlanDetail}
                  onChange={(e) => setNextPlanDetail(e.target.value)}
                  placeholder="예: 초등 수학 개념 완성 · p.33~40"
                  style={inputStyle}
                />
              </FormSection>

              <button onClick={handleSubmit} disabled={!isValid} style={submitButtonStyle(isValid)}>
                <Send size={16} />
                리포트 저장 및 발송 준비
              </button>
            </>
          )}
        </div>

        {/* ============ 우측: 학부모 카드 미리보기 ============ */}
        <div style={{ position: 'sticky', top: '24px' }}>
          <p style={{ fontSize: '11px', color: TOKENS.textMute, fontWeight: 700, marginBottom: '10px', letterSpacing: '0.5px' }}>
            학부모 발송 미리보기
          </p>
          <ParentCardPreview
            student={student}
            teacher={teacher}
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

      {/* ============ 학생 등록 모달 ============ */}
      {showStudentModal && (
        <StudentRegistrationModal
          onClose={() => setShowStudentModal(false)}
          onSubmit={handleAddStudent}
        />
      )}

      {/* ============ 강사 관리 패널 ============ */}
      {showTeacherPanel && (
        <TeacherManagementPanel
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
function StudentRegistrationModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [memo, setMemo] = useState('');
  const [textbooks, setTextbooks] = useState([
    { id: Date.now(), name: '' },
  ]);

  const isValid = name.trim() && school.trim() && textbooks.some(t => t.name.trim());

  const addTextbook = () => {
    setTextbooks(prev => [...prev, { id: Date.now(), name: '' }]);
  };

  const updateTextbook = (id, value) => {
    setTextbooks(prev => prev.map(t => t.id === id ? { ...t, name: value } : t));
  };

  const removeTextbook = (id) => {
    if (textbooks.length <= 1) return;
    setTextbooks(prev => prev.filter(t => t.id !== id));
  };

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({
      name: name.trim(),
      school: school.trim(),
      parentPhone: parentPhone.trim(),
      memo: memo.trim(),
      textbooks: textbooks.filter(t => t.name.trim()),
    });
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* 모달 헤더 */}
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: TOKENS.brandLight, padding: '8px', borderRadius: '10px' }}>
              <UserPlus size={18} style={{ color: TOKENS.brand }} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
                새 학생 등록
              </h2>
              <p style={{ fontSize: '11px', color: TOKENS.textSub, margin: '2px 0 0', fontWeight: 500 }}>
                필수 정보만 채우면 바로 등록됩니다
              </p>
            </div>
          </div>
          <button onClick={onClose} style={modalCloseStyle}>
            <X size={20} />
          </button>
        </div>

        {/* 모달 본문 */}
        <div style={modalBodyStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <FieldLabel>이름 <span style={{ color: TOKENS.danger }}>*</span></FieldLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 박지호"
                style={inputStyle}
                autoFocus
              />
            </div>
            <div>
              <FieldLabel>학교 / 학년 <span style={{ color: TOKENS.danger }}>*</span></FieldLabel>
              <input
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="예: 교현초 5학년"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <FieldLabel>교재 <span style={{ color: TOKENS.danger }}>*</span> <span style={{ color: TOKENS.textMute, fontWeight: 500 }}>(1개 이상)</span></FieldLabel>
              <button onClick={addTextbook} style={miniAddButtonStyle}>
                <Plus size={12} /> 교재 추가
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {textbooks.map((t, idx) => (
                <div key={t.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <div style={{
                    background: TOKENS.brandLight,
                    color: TOKENS.brand,
                    width: '24px', height: '24px',
                    borderRadius: '6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700, flexShrink: 0,
                  }}>{idx + 1}</div>
                  <input
                    value={t.name}
                    onChange={(e) => updateTextbook(t.id, e.target.value)}
                    placeholder="예: 초등 수학 5-2"
                    style={inputStyle}
                  />
                  {textbooks.length > 1 && (
                    <button
                      onClick={() => removeTextbook(t.id)}
                      style={{
                        background: 'none', border: 'none', color: TOKENS.textMute,
                        cursor: 'pointer', padding: '4px', flexShrink: 0,
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '14px' }}>
            <FieldLabel>학부모 연락처 <span style={{ color: TOKENS.textMute, fontWeight: 500 }}>(선택)</span></FieldLabel>
            <input
              type="tel"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="010-0000-0000"
              style={inputStyle}
            />
          </div>

          <div style={{ marginTop: '14px' }}>
            <FieldLabel>관리 메모 <span style={{ color: TOKENS.textMute, fontWeight: 500 }}>(선택, 학원 내부용)</span></FieldLabel>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 서술형 대비 필요, 어머님이 카톡 선호"
              rows={2}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
        </div>

        {/* 모달 푸터 */}
        <div style={modalFooterStyle}>
          <button onClick={onClose} style={modalCancelStyle}>취소</button>
          <button onClick={handleSubmit} disabled={!isValid} style={modalSubmitStyle(isValid)}>
            <Check size={16} /> 등록 완료
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 강사 관리 패널
// ============================================================
function TeacherManagementPanel({ teachers, onAdd, onDelete, onClose }) {
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName('');
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: TOKENS.brandLight, padding: '8px', borderRadius: '10px' }}>
              <GraduationCap size={18} style={{ color: TOKENS.brand }} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>강사 관리</h2>
              <p style={{ fontSize: '11px', color: TOKENS.textSub, margin: '2px 0 0', fontWeight: 500 }}>
                리포트에 표시될 강사 이름을 관리합니다
              </p>
            </div>
          </div>
          <button onClick={onClose} style={modalCloseStyle}>
            <X size={20} />
          </button>
        </div>

        <div style={modalBodyStyle}>
          <FieldLabel>현재 등록된 강사</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {teachers.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: TOKENS.bgSoft, padding: '10px 12px', borderRadius: '10px',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{t.name}</span>
                {teachers.length > 1 && (
                  <button onClick={() => onDelete(t.id)} style={{
                    background: 'none', border: 'none', color: TOKENS.textMute, cursor: 'pointer', padding: '4px',
                  }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <FieldLabel>새 강사 추가</FieldLabel>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="예: 박선생님"
              style={inputStyle}
            />
            <button onClick={handleAdd} disabled={!newName.trim()} style={{
              ...modalSubmitStyle(!!newName.trim()),
              padding: '10px 14px',
              flexShrink: 0,
            }}>
              <Plus size={14} /> 추가
            </button>
          </div>
        </div>

        <div style={modalFooterStyle}>
          <button onClick={onClose} style={modalSubmitStyle(true)}>완료</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FormHeader (강사 선택 포함)
// ============================================================
function FormHeader({ teachers, teacherId, onTeacherChange, onOpenTeacherPanel }) {
  return (
    <div style={{
      background: TOKENS.bg, borderRadius: '16px',
      padding: '20px 24px', border: `1px solid ${TOKENS.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{
              width: '28px', height: '28px', background: TOKENS.brand, borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>K</span>
            </div>
            <span style={{ fontSize: '13px', color: TOKENS.brand, fontWeight: 700 }}>교현학원</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '8px 0 4px', letterSpacing: '-0.025em' }}>
            오늘의 학습 리포트 작성
          </h1>
          <p style={{ fontSize: '13px', color: TOKENS.textSub, margin: 0, fontWeight: 500 }}>
            한 단계씩 채우면 우측에 학부모 발송 화면이 실시간으로 만들어집니다
          </p>
        </div>
      </div>

      {/* 강사 선택 영역 */}
      <div style={{
        marginTop: '16px', paddingTop: '16px',
        borderTop: `1px dashed ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <GraduationCap size={14} style={{ color: TOKENS.textMute, flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: TOKENS.textSub, fontWeight: 600, flexShrink: 0 }}>
          작성 강사
        </span>
        {teachers.length === 1 ? (
          <span style={{ fontSize: '13px', fontWeight: 700, color: TOKENS.brandDark }}>
            {teachers[0].name}
          </span>
        ) : (
          <select
            value={teacherId}
            onChange={(e) => onTeacherChange(e.target.value)}
            style={{ ...selectStyle, padding: '6px 28px 6px 10px', fontSize: '12px', width: 'auto' }}
          >
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <button onClick={onOpenTeacherPanel} style={{
          marginLeft: 'auto', background: 'none', border: 'none',
          color: TOKENS.brand, fontSize: '11px', fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          fontFamily: 'inherit',
        }}>
          <Settings size={12} /> 강사 관리
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 서브 컴포넌트 (이전과 동일)
// ============================================================
function FormSection({ number, title, badge, children }) {
  return (
    <div style={{
      background: TOKENS.bg, borderRadius: '16px',
      padding: '18px 20px', border: `1px solid ${TOKENS.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <span style={{
          background: TOKENS.brand, color: '#fff',
          width: '22px', height: '22px', borderRadius: '6px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 700,
        }}>{number}</span>
        <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
        {badge && (
          <span style={{
            marginLeft: 'auto', fontSize: '11px', color: TOKENS.brand, fontWeight: 600,
            background: TOKENS.brandLight, padding: '2px 8px', borderRadius: '8px',
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <p style={{ fontSize: '11px', color: TOKENS.textSub, fontWeight: 700, margin: '0 0 6px' }}>
      {children}
    </p>
  );
}

function RatingPicker({ label, value, onChange }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
        {RATING_LEVELS.map(r => {
          const active = value === r.level;
          return (
            <button
              key={r.level}
              onClick={() => onChange(r.level)}
              style={{
                background: active ? TOKENS.brandLight : TOKENS.bgSoft,
                border: `1.5px solid ${active ? TOKENS.brand : 'transparent'}`,
                borderRadius: '12px', padding: '10px 4px',
                cursor: 'pointer', transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: '24px', lineHeight: 1, marginBottom: '4px' }}>{r.emoji}</div>
              <div style={{
                fontSize: '10px', fontWeight: active ? 700 : 500,
                color: active ? TOKENS.brandDark : TOKENS.textSub,
              }}>{r.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 학부모 카드 미리보기 (강사명 반영)
// ============================================================
function ParentCardPreview({
  student, teacher, attendance, arrivalTime,
  homeworkRating, conceptRating,
  hasTest, testName, testScore,
  textbook, unit, pages,
  diagnosis, teacherNote, nextPlan, nextPlanDetail,
}) {
  const today = new Date();
  const dateStr = `${String(today.getMonth() + 1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')} (${'일월화수목금토'[today.getDay()]})`;
  const homework = RATING_LEVELS.find(r => r.level === homeworkRating);
  const concept  = RATING_LEVELS.find(r => r.level === conceptRating);

  if (!student) {
    return (
      <div style={{
        background: TOKENS.bg, border: `1px dashed ${TOKENS.border}`,
        borderRadius: '20px', padding: '60px 20px', textAlign: 'center',
      }}>
        <User size={32} style={{ color: TOKENS.textMute, marginBottom: '12px' }} />
        <p style={{ fontSize: '13px', color: TOKENS.textMute, fontWeight: 500, margin: 0 }}>
          학생을 선택하면<br />학부모 카드가 여기에 만들어집니다
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: TOKENS.bg, borderRadius: '20px',
      border: `1px solid ${TOKENS.border}`, overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(24, 95, 165, 0.06)',
    }}>
      <div style={{
        padding: '12px 18px', borderBottom: `1px solid ${TOKENS.brandLight}`,
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <div style={{
          width: '22px', height: '22px', background: TOKENS.brand, borderRadius: '5px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>K</span>
        </div>
        <span style={{ fontSize: '12px', color: TOKENS.brand, fontWeight: 700 }}>교현학원</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: TOKENS.textMute, fontWeight: 400 }}>{dateStr}</span>
      </div>

      <div style={{
        padding: '18px', textAlign: 'center',
        background: `linear-gradient(to bottom, ${TOKENS.brandBg}, #fff)`,
      }}>
        <p style={{ fontSize: '11px', color: TOKENS.brand, margin: '0 0 6px', fontWeight: 700 }}>
          오늘의 학습 리포트
        </p>
        <p style={{ fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
          {student.name} 학생
        </p>
        <p style={{ fontSize: '11px', color: TOKENS.textSub, margin: '4px 0 0', fontWeight: 500 }}>
          {student.school} · {teacher?.name || '선생님'} 드림
        </p>
      </div>

      {(homeworkRating || conceptRating) && (
        <div style={{ padding: '14px 18px', borderTop: `1px solid ${TOKENS.border}` }}>
          {attendance && (
            <p style={{ fontSize: '11px', color: TOKENS.textSub, margin: '0 0 10px', textAlign: 'center', fontWeight: 500 }}>
              <Clock size={11} style={{ verticalAlign: '-2px', marginRight: '3px' }} />
              {arrivalTime} {attendance}
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'center' }}>
            <RatingCell label="과제 수행" rating={homework} />
            <div style={{ borderLeft: `1px solid ${TOKENS.border}` }}>
              <RatingCell label="개념 이해" rating={concept} />
            </div>
          </div>
        </div>
      )}

      {hasTest && testName && (
        <div style={{ padding: '12px 18px', background: TOKENS.warnBg, borderTop: `1px solid ${TOKENS.border}` }}>
          <p style={{ fontSize: '11px', color: TOKENS.warn, margin: '0 0 5px', fontWeight: 700 }}>
            <FileText size={12} style={{ verticalAlign: '-2px', marginRight: '3px' }} /> {testName}
          </p>
          {testScore && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: TOKENS.warnText, letterSpacing: '-0.02em' }}>
                {testScore}<span style={{ fontSize: '12px', opacity: 0.7, fontWeight: 500 }}>점</span>
              </span>
              <span style={{ fontSize: '11px', color: TOKENS.warnBorder, fontWeight: 500 }}>/ 100점</span>
            </div>
          )}
        </div>
      )}

      {(textbook || unit) && (
        <div style={{ padding: '14px 18px', borderTop: `1px solid ${TOKENS.border}` }}>
          <p style={{ fontSize: '11px', color: TOKENS.textSub, margin: '0 0 5px', fontWeight: 700 }}>오늘 학습</p>
          {textbook && <p style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 3px' }}>{textbook}</p>}
          {(unit || pages) && (
            <p style={{ fontSize: '12px', color: TOKENS.textSub, margin: 0, fontWeight: 500 }}>
              {unit}{unit && pages ? ' · ' : ''}{pages}
            </p>
          )}
        </div>
      )}

      {diagnosis.length > 0 && (
        <div style={{ padding: '14px 18px', background: TOKENS.warnBg, borderTop: `1px solid ${TOKENS.border}` }}>
          <p style={{ fontSize: '11px', color: TOKENS.warn, margin: '0 0 8px', fontWeight: 700 }}>
            <Target size={12} style={{ verticalAlign: '-2px', marginRight: '3px' }} /> 오늘의 진단
          </p>
          {diagnosis.map((d, idx) => {
            const tagDef = DIAGNOSIS_TAGS.find(t => t.key === d.key);
            const isLast = idx === diagnosis.length - 1;
            return (
              <div key={idx} style={{ marginBottom: isLast ? 0 : '8px' }}>
                <span style={{
                  display: 'inline-block', background: '#fff',
                  border: `1px solid ${TOKENS.warnBorder}`, color: TOKENS.warn,
                  fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                  fontWeight: 600, marginBottom: '4px',
                }}>
                  {tagDef?.label}{d.unit && ` · ${d.unit}`}{d.pages && ` ${d.pages}`}
                </span>
                {d.detail && (
                  <p style={{ fontSize: '12px', color: TOKENS.warnText, margin: 0, lineHeight: 1.6, fontWeight: 500 }}>{d.detail}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {teacherNote && (
        <div style={{ padding: '14px 18px', borderTop: `1px solid ${TOKENS.border}` }}>
          <p style={{ fontSize: '11px', color: TOKENS.textSub, margin: '0 0 6px', fontWeight: 700 }}>
            <MessageCircle size={12} style={{ verticalAlign: '-2px', marginRight: '3px' }} /> 선생님 한 마디
          </p>
          <p style={{ fontSize: '12px', color: TOKENS.text, margin: 0, lineHeight: 1.7, fontWeight: 500, whiteSpace: 'pre-wrap' }}>
            {teacherNote}
          </p>
        </div>
      )}

      {nextPlan && (
        <div style={{ padding: '12px 18px', background: TOKENS.successBg, borderTop: `1px solid ${TOKENS.border}` }}>
          <p style={{ fontSize: '11px', color: TOKENS.success, margin: '0 0 4px', fontWeight: 700 }}>
            <ArrowRight size={12} style={{ verticalAlign: '-2px', marginRight: '3px' }} /> 다음 수업 계획
          </p>
          <p style={{ fontSize: '13px', fontWeight: 600, color: TOKENS.successDark, margin: 0 }}>{nextPlan}</p>
          {nextPlanDetail && (
            <p style={{ fontSize: '11px', color: TOKENS.success, margin: '3px 0 0', fontWeight: 500 }}>{nextPlanDetail}</p>
          )}
        </div>
      )}

      <div style={{
        padding: '8px 18px', background: TOKENS.bgSoft,
        textAlign: 'center', borderTop: `1px solid ${TOKENS.border}`,
      }}>
        <p style={{ fontSize: '10px', color: TOKENS.textMute, margin: 0, fontWeight: 400 }}>
          교현학원 · 031-707-0591
        </p>
      </div>
    </div>
  );
}

function RatingCell({ label, rating }) {
  return (
    <div>
      <p style={{ fontSize: '11px', color: TOKENS.textSub, margin: '0 0 6px', fontWeight: 700 }}>{label}</p>
      {rating ? (
        <>
          <div style={{ fontSize: '28px', lineHeight: 1, marginBottom: '4px' }}>{rating.emoji}</div>
          <p style={{ fontSize: '11px', color: TOKENS.text, margin: 0, fontWeight: 600 }}>{rating.label}</p>
        </>
      ) : (
        <div style={{ fontSize: '13px', color: TOKENS.textMute, padding: '8px 0', fontWeight: 500 }}>미입력</div>
      )}
    </div>
  );
}

// ============================================================
// 스타일 헬퍼
// ============================================================
const inputStyle = {
  width: '100%', padding: '10px 12px', fontSize: '13px',
  border: `1px solid ${TOKENS.border}`, borderRadius: '10px',
  background: TOKENS.bgSoft, outline: 'none',
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
  fontWeight: 500, color: TOKENS.text,
  letterSpacing: '-0.02em', boxSizing: 'border-box',
};

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer', appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  paddingRight: '32px',
};

const chipStyle = (active) => ({
  padding: '7px 14px', fontSize: '12px',
  fontWeight: active ? 700 : 500, borderRadius: '10px',
  border: `1px solid ${active ? TOKENS.brand : TOKENS.border}`,
  background: active ? TOKENS.brandLight : TOKENS.bg,
  color: active ? TOKENS.brandDark : TOKENS.textSub,
  cursor: 'pointer', fontFamily: 'inherit',
  letterSpacing: '-0.02em', transition: 'all 0.15s',
});

const tagStyle = (color, active) => {
  const colors = {
    warn:    { bg: TOKENS.warnBg,    border: TOKENS.warnBorder,   text: TOKENS.warn    },
    danger:  { bg: TOKENS.dangerBg,  border: TOKENS.dangerBorder, text: TOKENS.danger  },
    success: { bg: TOKENS.successBg, border: TOKENS.success,      text: TOKENS.success },
  };
  const c = colors[color] || colors.warn;
  return {
    padding: '5px 10px', fontSize: '12px',
    fontWeight: 600, borderRadius: '8px',
    border: `1px solid ${active ? c.border : TOKENS.border}`,
    background: active ? c.bg : TOKENS.bg,
    color: active ? c.text : TOKENS.textSub,
    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.02em',
  };
};

const toggleStyle = (active) => ({
  flex: 1, padding: '8px', fontSize: '12px',
  fontWeight: active ? 700 : 500, border: 'none', borderRadius: '8px',
  background: active ? '#fff' : 'transparent',
  color: active ? TOKENS.brandDark : TOKENS.textSub,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
  letterSpacing: '-0.02em',
});

const suggestionStyle = {
  padding: '4px 10px', fontSize: '11px', fontWeight: 500,
  borderRadius: '6px', border: 'none',
  background: TOKENS.brandLight, color: TOKENS.brand,
  cursor: 'pointer', fontFamily: 'inherit',
};

const aiButtonStyle = (disabled) => ({
  marginTop: '10px', width: '100%', padding: '10px',
  fontSize: '12px', fontWeight: 700, borderRadius: '10px',
  border: `1px solid ${disabled ? TOKENS.border : TOKENS.success}`,
  background: disabled ? TOKENS.bgSoft : '#fff',
  color: disabled ? TOKENS.textMute : TOKENS.success,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  fontFamily: 'inherit', letterSpacing: '-0.02em',
});

const submitButtonStyle = (valid) => ({
  padding: '16px', fontSize: '14px',
  fontWeight: 700, borderRadius: '14px', border: 'none',
  background: valid ? TOKENS.brand : TOKENS.border,
  color: '#fff', cursor: valid ? 'pointer' : 'not-allowed',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  fontFamily: 'inherit', letterSpacing: '-0.02em',
  boxShadow: valid ? '0 4px 16px rgba(24, 95, 165, 0.25)' : 'none',
});

const addStudentButtonStyle = {
  marginTop: '10px', width: '100%', padding: '11px',
  fontSize: '13px', fontWeight: 700, borderRadius: '10px',
  border: `1px dashed ${TOKENS.brand}`,
  background: TOKENS.brandLight, color: TOKENS.brand,
  cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', gap: '6px',
  fontFamily: 'inherit', letterSpacing: '-0.02em',
};

// 모달 스타일
const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: '20px',
  backdropFilter: 'blur(4px)',
};

const modalStyle = {
  background: TOKENS.bg, borderRadius: '20px',
  width: '100%', maxWidth: '520px',
  maxHeight: '90vh', overflow: 'auto',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
  letterSpacing: '-0.02em',
};

const modalHeaderStyle = {
  padding: '20px 24px', borderBottom: `1px solid ${TOKENS.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

const modalCloseStyle = {
  background: 'none', border: 'none', color: TOKENS.textSub,
  cursor: 'pointer', padding: '4px', borderRadius: '6px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modalBodyStyle = { padding: '20px 24px' };

const modalFooterStyle = {
  padding: '14px 24px', borderTop: `1px solid ${TOKENS.border}`,
  display: 'flex', gap: '8px', justifyContent: 'flex-end',
  background: TOKENS.bgSoft, borderRadius: '0 0 20px 20px',
};

const modalCancelStyle = {
  padding: '10px 20px', fontSize: '13px', fontWeight: 600,
  borderRadius: '10px', border: `1px solid ${TOKENS.border}`,
  background: '#fff', color: TOKENS.textSub,
  cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.02em',
};

const modalSubmitStyle = (valid) => ({
  padding: '10px 20px', fontSize: '13px', fontWeight: 700,
  borderRadius: '10px', border: 'none',
  background: valid ? TOKENS.brand : TOKENS.border,
  color: '#fff', cursor: valid ? 'pointer' : 'not-allowed',
  display: 'flex', alignItems: 'center', gap: '6px',
  fontFamily: 'inherit', letterSpacing: '-0.02em',
});

const miniAddButtonStyle = {
  background: TOKENS.brandLight, color: TOKENS.brand,
  border: 'none', borderRadius: '6px',
  padding: '4px 10px', fontSize: '11px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: '3px',
};

// ============================================================
// 데모 데이터
// ============================================================
const DEMO_STUDENTS = [
  {
    id: 'demo-1', name: '이수민', school: '교현초 6학년',
    parentPhone: '010-1234-5678',
    textbooks: [
      { id: 1, name: '초등 수학 개념 완성' },
      { id: 2, name: '수학 심화 6-1' },
    ],
  },
  {
    id: 'demo-2', name: '김태현', school: '교현중 1학년',
    parentPhone: '010-9876-5432',
    textbooks: [
      { id: 3, name: '중학 수학 기본서 1-1' },
    ],
  },
];

const DEMO_TEACHERS = [
  { id: 'teacher-1', name: '김선생님' },
];
