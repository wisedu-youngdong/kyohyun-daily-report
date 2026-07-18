import imageCompression from 'browser-image-compression';

// heic2any lazy import — 초기 번들에서 제외
let heic2anyLib = null;
const getHeic2any = async () => {
  if (!heic2anyLib) {
    const mod = await import('heic2any');
    heic2anyLib = mod.default;
  }
  return heic2anyLib;
};
import React, { useState, useMemo, useEffect } from 'react';
import { useMediaQuery } from './hooks.js';
import {
  User, Clock, Target, MessageCircle, ArrowRight,
  FileText, Sparkles, Send, Plus, X, Check,
  UserPlus, GraduationCap, Info, Star, AlertTriangle, Palette
} from 'lucide-react';
import { C, RADIUS2, TYPE, SHADOW } from './tokens.jsx';
import { calculateReportPoints, toPct, ratingLabel } from './growth.js';
import { findUnitKey, getUnits, getCourses } from './curriculum.js';
import { formatPhone, isValidPhone } from './phone.js';
import { storage } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { StudentModal } from './views/StudentModal.jsx';

// 빠른 썸네일 생성 (canvas, 미리보기 전용 — imageCompression 생략으로 속도 2배)
function makeThumbnail(file, maxPx = 300) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > h && w > maxPx) { h = Math.round(h * maxPx / w); w = maxPx; }
      else if (h > maxPx) { w = Math.round(w * maxPx / h); h = maxPx; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// browser-image-compression 기반 이미지 처리 (HEIC 자동변환 포함)
async function compressImage(file) {
  try {
    // HEIC/HEIF → JPEG 자동 변환
    let processFile = file;
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
      || file.name?.toLowerCase().endsWith('.heic')
      || file.name?.toLowerCase().endsWith('.heif');

    if (isHeic) {
      const heic2any = await getHeic2any();
      const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
      processFile = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
    }

    // AI용 압축(1800px, 0.88품질) + 썸네일(canvas) 병렬 처리
    const [aiFile, thumbDataUrl] = await Promise.all([
      imageCompression(processFile, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1800,
        fileType: 'image/jpeg',
        useWebWorker: false,
        initialQuality: 0.88,
      }),
      makeThumbnail(processFile, 300),
    ]);

    const aiDataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onerror = rej;
      r.onload = e => res(e.target.result);
      r.readAsDataURL(aiFile);
    });

    return {
      aiBase64: aiDataUrl.split(',')[1],
      mimeType: 'image/jpeg',
      blob: aiFile,
      preview: thumbDataUrl || aiDataUrl,
    };
  } catch (e) {
    console.warn('compressImage 실패, 폴백:', e);
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onerror = rej;
      r.onload = ev => res(ev.target.result);
      r.readAsDataURL(file);
    });
    return { aiBase64: dataUrl.split(',')[1], mimeType: 'image/jpeg', blob: file, preview: dataUrl };
  }
}

// 전역 토큰(tokens.jsx의 C)을 이 화면의 기존 이름 체계로 매핑.
// brand = Primary(헤더/메인 액션 전용), info = 선택된 토글/탭 "활성" 표시 전용.
const TOKENS = {
  brand: C.primary, brandDark: C.primaryDark, brandLight: C.primaryLight, brandBg: '#F3F5FA',
  info: C.info, infoBg: C.infoBg, infoDark: C.infoDark,
  warn: C.warningText, warnBg: C.warningBg, warnBorder: C.warning, warnText: C.warningText,
  success: C.success, successBg: C.successBg, successDark: C.successDark,
  danger: C.errorDark, dangerBg: C.errorBg, dangerBorder: C.error,
  midGray: C.midGray,
  text: '#1A1A1A', textSub: '#6B7280', textMute: '#9CA3AF',
  border: '#E5E7EB', borderLight: '#F3F4F6', bg: '#FFFFFF', bgSoft: '#F9FAFB',
};

const DIAGNOSIS_TAGS = [
  { key: 'calc',    label: '계산 실수',  color: 'warn'    },
  { key: 'concept', label: '개념 누락',  color: 'warn'    },
  { key: 'apply',   label: '응용 부족',  color: 'danger'  },
  { key: 'time',    label: '시간 부족',  color: 'danger'  },
  { key: 'perfect', label: '개념 완벽',  color: 'success' },
];

const ATTENDANCE = ['정시', '지각', '결석', '조퇴', '보강', '자율학습'];

// ============================================================
// 스킨 팔레트
// ============================================================
// 메인 컬러 → SKIN 객체 자동 생성
function buildSkin(key, name, mainHex, accentHex) {
  const r = parseInt(mainHex.slice(1,3),16);
  const g = parseInt(mainHex.slice(3,5),16);
  const b = parseInt(mainHex.slice(5,7),16);
  const toHex = (r,g,b) => '#'+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
  const pale  = toHex(r+140,g+140,b+140);
  const dark  = toHex(Math.max(0,r-30),Math.max(0,g-30),Math.max(0,b-30));
  const sub   = toHex(Math.max(0,r-30),Math.max(0,g-30),Math.max(0,b-30));
  const text  = toHex(Math.max(0,r-80),Math.max(0,g-80),Math.max(0,b-80));
  const foot  = toHex(r+80,g+80,b+80);
  const accent = accentHex || pale;
  return {
    key, name,
    headerBg:      `linear-gradient(155deg, ${dark}, ${mainHex}, ${toHex(r+20,g+20,b+20)})`,
    headerText:    '#ffffff',
    headerSub:     'rgba(255,255,255,0.85)',
    bodyBg:        '#F7F5F2',
    cardBg:        pale,
    cardDarkBg:    mainHex,
    cardText:      text,
    cardDarkText:  '#ffffff',
    cardSub:       sub,
    cardDarkSub:   'rgba(255,255,255,0.75)',
    accentBg:      mainHex,
    accentText:    '#ffffff',
    tagBg:         pale,
    tagText:       text,
    tagBorder:     foot,
    commentBg:     pale,
    commentBorder: mainHex,
    commentText:   text,
    nextBg:        mainHex,
    nextText:      '#ffffff',
    footerText:    foot,
    dots:          [mainHex, accent, '#ffffff'],
  };
}

export const SKINS = {
  navy:   buildSkin('navy',   '네이비 + 크림',  '#1A2540', '#EDEBE6'),
  purple: buildSkin('purple', '보라 + 화이트',  '#6B3FA0', '#F0E8FF'),
  violet: buildSkin('violet', '보라 + 노랑',    '#7B5EA7', '#F5D76E'),
  blue:   buildSkin('blue',   '딥블루 + 민트',  '#0F3460', '#00C9A7'),
  dark:   buildSkin('dark',   '다크 + 골드',    '#1A1714', '#D4AF37'),
  green:  buildSkin('green',  '그린 + 화이트',  '#2E7D32', '#E8F5E9'),
  red:    buildSkin('red',    '레드 + 화이트',  '#C0392B', '#FEE8E8'),
  indigo: buildSkin('indigo', '인디고 + 피치',  '#3949AB', '#FFCCBC'),
};

// 공통 중앙 알림 모달
function AlertModal({ message, onClose }) {
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.45)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '32px 24px',
        width: '100%', maxWidth: '320px', textAlign: 'center',
        boxShadow: SHADOW[3],
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%',
          background: '#FFF3E0', border: '2px solid #F59E0B',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: '24px',
        }}>!</div>
        <p style={{ fontSize: '17px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 8px' }}>알림</p>
        <p style={{ fontSize: '14px', color: '#4B5563', margin: '0 0 24px', lineHeight: 1.6 }}>{message}</p>
        <button onClick={onClose} style={{
          width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700,
          border: 'none', borderRadius: `${RADIUS2.input}px`, background: C.primary,
          color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
        }}>확인</button>
      </div>
    </div>
  );
}

// 학생의 학교 문자열("교현초 5학년")과 현재 월로 커리큘럼 코스 키 추정 ('초5-1' 등)
// 고등/영어는 학년만으로 코스를 특정할 수 없어 null 반환 — 강사가 코스 칩으로 직접 선택
function guessCourseKey(subject, school) {
  if (subject !== '수학' || !school) return null;
  const gradeMatch = school.match(/(\d)\s*학년/);
  const grade = gradeMatch ? parseInt(gradeMatch[1], 10) : null;
  // 학교급은 학교명에서 마지막에 나오는 급 글자로 판별 — "초당중"(중), "중앙초"(초) 오분류 방지
  const namePart = school.split(/\d/)[0]; // 학년 숫자 앞부분만
  const lastCho = namePart.lastIndexOf('초');
  const lastJung = namePart.lastIndexOf('중');
  const lastGo = namePart.lastIndexOf('고');
  const maxIdx = Math.max(lastCho, lastJung, lastGo);
  const level = maxIdx < 0 ? null : maxIdx === lastGo ? null : maxIdx === lastJung ? '중' : '초';
  if (!grade || !level) return null;
  const month = new Date().getMonth() + 1;
  const semester = (month >= 3 && month <= 8) ? 1 : 2;
  return `${level}${grade}-${semester}`;
}

export default function DiagnosticReportInput({
  students = [],
  teachers = [],
  classes = [],
  reports = [],
  onSaveStudent = async () => {},
  onSaveTeacher = async () => {},
  onDeleteTeacher = async () => {},
  onSave = async () => {},
  editingReport = null,
  onEditDone = () => {},
  commentTemplates = [],
  onSaveCommentTemplate = async () => {},
  onDeleteCommentTemplate = async () => {},
  currentTeacherId = null,
  isDirector = false,
}) {
  const isWide = useMediaQuery('(min-width: 901px)');
  const [showStudentModal, setShowStudentModal] = useState(false);
  // 스킨 기본값 — 관리>설정의 "학원 기본 스킨" 색상을 따름 (없으면 navy)
  const globalSkin = React.useMemo(() => {
    const c = localStorage.getItem('globalSkinColor');
    return c ? { ...deriveColorsToSkin(c), key: 'global', name: '학원 기본', dots: [c] } : null;
  }, []);
  const [selectedSkin, setSelectedSkin] = useState(globalSkin ? 'global' : 'navy');
  const autoSaveTimer = React.useRef(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [autoSaveError, setAutoSaveError] = useState(false);

  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [curriculumCourseOverride, setCurriculumCourseOverride] = useState(null);
  const [showAllCourses, setShowAllCourses] = useState(false);
  // null = 자동(최근 이력 없을 때만 펼침), true/false = 사용자가 직접 토글한 값
  const [showCoursePicker, setShowCoursePicker] = useState(null);

  const [attendance, setAttendance] = useState('정시');
  const [arrivalTime, setArrivalTime] = useState('15:30');
  const [homeworkRating, setHomeworkRating] = useState(null);
  const [conceptRating, setConceptRating] = useState(null);
  const [hasTest, setHasTest] = useState(false);
  const [testName, setTestName] = useState('');
  const [testScore, setTestScore] = useState('');
  const [testRound, setTestRound] = useState('');
  const [subject, setSubject] = useState('수학'); // 과목 선택
  const [textbook, setTextbook] = useState('');
  const [unit, setUnit] = useState('');
  const [pages, setPages] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [teacherNote, setTeacherNote] = useState('');
  const [aiPolishedNote, setAiPolishedNote] = useState('');
  const [polishing, setPolishing] = useState(false);
  const [generatingComment, setGeneratingComment] = useState(false);
  const [nextPlan, setNextPlan] = useState('');
  const [nextPlanDetail, setNextPlanDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { done, total }
  const [toast, setToast] = useState(null);
  // 자동저장이 만든 draft 문서 id — 30초마다 새 문서가 쌓이지 않도록 재사용
  const draftIdRef = React.useRef(null);
  // 학생 선택 변경 시 헤더에 알림
  React.useEffect(() => {
    if (!studentId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleAutoSave();
    }, 30000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [studentId, teacherNote, homeworkRating, conceptRating, selectedTags, textbook, unit, pages, subject, attendance, arrivalTime, hasTest, testName, testScore, testRound, nextPlan, nextPlanDetail]);

  const handleAutoSave = async () => {
    if (!studentId || saving) return;
    try {
      const existingId = editingReport?.id || draftIdRef.current;
      const reportPayload = {
        ...(existingId ? { id: existingId } : {}),
        studentId, studentName: student?.name,
        teacherId: teacherId || '', teacherName: teacher?.name || '',
        attendance, arrivalTime,
        // null = 미입력 규약 유지 — 0으로 강제 변환하면 학부모 화면에 "0%"로 표시됨
        homeworkRating: homeworkRating ?? null,
        conceptRating: conceptRating ?? null,
        hasTest,
        testName: hasTest ? testName : null,
        testScore: hasTest ? testScore : null,
        testRound: hasTest ? testRound : null,
        textbook, subject, unit, pages,
        unitKey: findUnitKey(subject, unit, curriculumCourseOverride || guessCourseKey(subject, student?.school)),
        diagnosis: selectedTags,
        teacherNote: teacherNote || '',
        nextPlan, nextPlanDetail,
        photoAnalysis: photoAnalysis || null,
        isDraft: true, // 자동저장본 — 복습 일정 생성은 최종 저장 때만
        // photoUrls는 수정 모드에서 기존 사진을 지우지 않도록 신규 draft일 때만 포함
        ...(existingId ? {} : { photoUrls: [] }),
      };
      const savedId = await onSave(reportPayload);
      if (!editingReport && savedId && !draftIdRef.current) {
        draftIdRef.current = savedId;
      }
      setLastSaved(new Date());
      setAutoSaveError(false);
    } catch (e) {
      console.error('자동저장 오류:', e);
      setAutoSaveError(true);
    }
  };

  const toastTimerRef = React.useRef(null);
  const showToast = (msg, type = 'success', reportId = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type, reportId });
    toastTimerRef.current = setTimeout(() => setToast(null), type === 'success' ? 5000 : 3000);
  };

  // 사진 분석 (다중 업로드 — 최대 10장)
  const [photos, setPhotos] = useState([]); // [{ preview, blob }]
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [photoAnalysis, setPhotoAnalysis] = useState(null);
  const [wrongItems, setWrongItems] = useState([]);
  const [alertMessage, setAlertMessage] = useState('');
  const [photoError, setPhotoError] = useState('');
  const MAX_PHOTOS = 5;
  const photosRef = React.useRef([]);

  // 사진 분석 대기 중 단계 문구 로테이션 (15~40초 소요되는 작업이라 진행감을 줌)
  const ANALYZE_PHASES = ['사진을 읽는 중...', '채점 표시(O/△/빗금)를 확인하는 중...', '문항 유형을 분류하는 중...', '거의 다 됐어요...'];
  const [analyzePhase, setAnalyzePhase] = useState(0);
  useEffect(() => {
    if (!analyzingPhoto) { setAnalyzePhase(0); return; }
    const timer = setInterval(() => setAnalyzePhase(p => Math.min(p + 1, ANALYZE_PHASES.length - 1)), 4000);
    return () => clearInterval(timer);
  }, [analyzingPhoto]);

  // ── 수정 모드: editingReport가 들어오면 폼 pre-fill ──
  useEffect(() => {
    if (!editingReport) return;
    setStudentId(editingReport.studentId || '');
    setTeacherId(editingReport.teacherId || '');
    setAttendance(editingReport.attendance || '정시');
    setArrivalTime(editingReport.arrivalTime || '15:30');
    // null(미입력)은 그대로 유지 — toPct(null)=0으로 변환되면 미입력이 0%로 확정 저장됨
    setHomeworkRating(editingReport.homeworkRating == null ? null : toPct(editingReport.homeworkRating));
    setConceptRating(editingReport.conceptRating == null ? null : toPct(editingReport.conceptRating));
    setHasTest(editingReport.hasTest || false);
    setTestName(editingReport.testName || '');
    setTestScore(editingReport.testScore || '');
    setTestRound(editingReport.testRound || '');
    setTextbook(editingReport.textbook || '');
    setSubject(editingReport.subject || '수학');
    setCurriculumCourseOverride(null); setShowAllCourses(false); setShowCoursePicker(null);
    setUnit(editingReport.unit || '');
    setPages(editingReport.pages || '');
    setSelectedTags(editingReport.diagnosis || []);
    setTeacherNote(editingReport.teacherNote || '');
    setAiPolishedNote('');
    setNextPlan(editingReport.nextPlan || '');
    setNextPlanDetail(editingReport.nextPlanDetail || '');
    setPhotoAnalysis(editingReport.photoAnalysis || null);

    // 기존 사진 유지 — photoUrls → photos 변환
    // photosRef도 함께 동기화해야 함 — MAX_PHOTOS 체크가 ref 기준이라, 안 하면
    // 수정 모드에서 기존 사진 개수를 무시하고 5장을 더 추가할 수 있게 됨
    if (editingReport.photoUrls?.length > 0) {
      const existingPhotos = editingReport.photoUrls.map(url => ({
        preview: url,
        blob: null,      // 기존 사진은 blob 없음 (이미 Storage에 있음)
        existingUrl: url // 기존 URL 표시
      }));
      setPhotos(existingPhotos);
      photosRef.current = existingPhotos;
    } else {
      setPhotos([]);
      photosRef.current = [];
    }
  }, [editingReport]);

  // 강사 1명이면 자동 선택
  useEffect(() => {
    if (teachers.length === 1 && !teacherId) {
      setTeacherId(teachers[0].id);
    }
  }, [teachers]);

  // 작성 중 이탈 방지 — 데이터 입력 시작 후 탭 닫기/뒤로가기 경고
  const isDirty = !!(studentId || teacherNote || homeworkRating != null || conceptRating != null || selectedTags.length);
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const student = useMemo(() => students.find(s => s.id === studentId), [students, studentId]);
  const teacher = useMemo(() => teachers.find(t => t.id === teacherId), [teachers, teacherId]);

  // 이 학생의 최근 교재+단원 이력(최대 3개) — 단원 추천 칩과 "표준 단원표" 자동펼침 여부에 공용으로 사용
  const recentUnits = useMemo(() => {
    const list = [];
    const seen = new Set();
    const studentReports = [...reports]
      .filter(r => r.studentId === studentId && r.textbook && r.unit)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    for (const r of studentReports) {
      const key = `${r.textbook}|||${r.unit}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ textbook: r.textbook, unit: r.unit });
        if (list.length >= 3) break;
      }
    }
    return list;
  }, [reports, studentId]);
  const isValid = studentId && homeworkRating != null && conceptRating != null && teacherId;

  // 학생 등록 — Firebase에 저장
  const handleAddStudent = async (newStudent) => {
    try {
      // 담당 강사 배정 — 강사는 자기 담당 학생만 보이므로, 배정 없이 저장하면
      // 방금 등록한 학생이 즉시 목록에서 사라져 리포트를 쓸 수 없게 됨
      const assignedTeacherId = newStudent.assignedTeacherId || (isDirector ? '' : currentTeacherId || '');
      await onSaveStudent({ ...newStudent, assignedTeacherId });
      setShowStudentModal(false);
    } catch (e) {
      console.error('학생 저장 오류:', e);
      setAlertMessage('학생 저장 중 오류가 발생했습니다.');
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
    if (!teacherNote.trim() || polishing) return;
    // 입력한 단원과 사진에서 읽은 단원이 어긋난 채로 코멘트를 생성하면, AI가 두 단원을
    // 억지로 이어붙인 어색한 문장을 만들어냄. API 호출(비용) 전에 미리 막아 헛돈 쓰는 것도 방지.
    if (photoAnalysis?.unit && unit.trim() && !unit.includes(photoAnalysis.unit) && !photoAnalysis.unit.includes(unit)) {
      if (!window.confirm(`사진에서 읽은 단원("${photoAnalysis.unit}")이 입력한 단원("${unit}")과 달라요.\n그래도 이대로 코멘트를 생성할까요?`)) return;
    }
    setPolishing(true);
    try {
      const diagLabels = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
      const tagNames = selectedTags.map(t => diagLabels[t.key] || t.key).join(', ');

      // 사진 분석 결과 추출 — rawObservations는 사람이 읽는 설명 문자열이라 .mark/.num이 없어
      // 항상 undefined로 걸러지던 버그가 있었음(오답 필터가 사실상 전부 통과, wrongNums는
      // "undefined번"으로 깨짐). 그 결과 실제로는 안 걸러지는 draftComment(자유 서술, 정확도
      // 보장 안 됨)에 코멘트가 의존하게 돼서, 정답인 문항을 오답처럼 언급하는 사고로 이어졌음.
      // 대신 구조화돼 있고 신뢰할 수 있는 wrongItems(및 concept/모의고사 섹션의 약점 목록)를 사용.
      let photoContext = '';
      if (photoAnalysis) {
        const fromSections = (photoAnalysis.sections || []).flatMap(s =>
          (s.problemTypes || []).filter(p => p.result === '약점').concat(s.weakDetail || [])
        );
        const seen = new Set();
        const allWrong = [...(photoAnalysis.wrongItems || []), ...fromSections].filter(w => {
          if (!w.number || seen.has(w.number)) return false;
          seen.add(w.number);
          return true;
        });
        photoContext = [
          photoAnalysis.unit && `분석 단원: ${photoAnalysis.unit}`,
          allWrong.length > 0 && `오답 문제: ${allWrong.map(w => `${w.number}번(${w.type || ''})`).join(', ')}`,
        ].filter(Boolean).join('\n');
      }

      const response = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: teacherNote,
          studentName: student?.name || '',
          textbook: textbook || '',
          unit: unit || '',
          diagTags: tagNames || '',
          photoContext: photoContext || '',
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`서버 오류 (${response.status})`);
      const data = await response.json();
      if (!data.result) throw new Error('응답에 결과가 없습니다.');
      setAiPolishedNote(data.result);
    } catch (e) {
      console.error('AI 오류:', e);
      showToast(e.name === 'TimeoutError' ? '응답 시간이 초과됐습니다. 다시 시도해주세요.' : 'AI 연결에 실패했습니다.', 'error');
    } finally {
      setPolishing(false);
    }
  };

  // 사진 선택 → 미리보기 (여러 장 동시 선택 가능, 기존 목록에 추가됨)
  const handlePhotoSelect = async (fileList) => {
    const newFiles = Array.from(fileList || []);
    const currentCount = photosRef.current.length;
    const remaining = MAX_PHOTOS - currentCount;
    if (newFiles.length === 0 || remaining <= 0) return;
    const filesToProcess = newFiles.slice(0, remaining);
    setPhotoAnalysis(null);
    setPhotoError('');
    // 파일 선택 즉시 모든 파일을 ArrayBuffer로 병렬 변환
    // 모바일에서 File 객체가 타임아웃으로 무효화되는 것을 방지
    showToast(`사진 ${filesToProcess.length}장 불러오는 중...`, 'info');
    const bufferedFiles = await Promise.all(
      filesToProcess.map(async (file) => {
        try {
          const buffer = await file.arrayBuffer();
          const blob = new Blob([buffer], { type: file.type || 'image/jpeg' });
          return new File([blob], file.name || 'photo.jpg', { type: file.type || 'image/jpeg' });
        } catch (e) {
          console.warn('파일 버퍼링 실패, 원본 사용:', e);
          return file;
        }
      })
    );
    showToast(`사진 ${bufferedFiles.length}장 압축 중...`, 'info');

    for (const file of bufferedFiles) {
      try {
        if (file.size > 50 * 1024 * 1024) {
          throw new Error(`파일이 너무 큽니다 (${(file.size/1024/1024).toFixed(1)}MB)`);
        }
        const result = await compressImage(file);
        if (!result.preview) continue;
        const newPhoto = {
          preview: result.preview,
          base64: result.aiBase64,
          mimeType: result.mimeType,
          blob: result.blob,
        };
        photosRef.current = [...photosRef.current, newPhoto];
        setPhotos(prev => [...prev, newPhoto]);
      } catch (e) {
        const msg = e?.message || e?.toString() || '알 수 없는 오류';
        console.error('사진 처리 오류:', msg, e);
        setPhotoError(`사진 처리 실패: ${msg}`);
        showToast(`사진 처리 실패: ${msg}`, 'error');
      }
    }
    showToast(`사진 준비 완료!`, 'success');
  };

  const removeOnePhoto = (idx) => {
    setPhotos(prev => {
      const removed = prev[idx];
      if (removed?.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(removed.preview);
      }
      const next = prev.filter((_, i) => i !== idx);
      photosRef.current = next;
      return next;
    });
    setPhotoAnalysis(null);
    setWrongItems([]);
  };

  // Gemini Vision 분석 요청 (mode: 'auto'|'calculation'|'concept'|'mock_exam' — 재지정 시 override로 재호출)
  // 여러 장을 한 번에 보내 페이지 간 연산 집계를 누적한다.
  const handleAnalyzePhoto = async (modeOverride) => {
    if (photos.length === 0) return;
    // 수정 모드에서 불러온 기존 사진은 base64가 없음(이미 Storage에 있는 URL만 보유) —
    // 그대로 보내면 빈 이미지가 전송돼 분석이 깨지므로 분석 가능한 사진만 골라 보냄
    const analyzable = photos.filter(p => p.base64);
    if (analyzable.length === 0) {
      setPhotoError('기존에 저장된 사진은 재분석할 수 없어요. 새 사진을 추가한 뒤 분석해주세요.');
      return;
    }
    setAnalyzingPhoto(true);
    setPhotoError('');
    try {
      const images = analyzable.map(p => ({ imageBase64: p.base64, mimeType: p.mimeType || 'image/jpeg' }));
      const response = await fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          hintTextbook: textbook, hintUnit: unit, hintSubject: subject,
          mode: modeOverride || 'auto',
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`서버 오류 (${response.status})`);
      const data = await response.json();
      if (data.error) {
        setPhotoError(data.error);
      } else {
        setPhotoAnalysis(data);
        if (data.wrongItems?.length > 0) {
          setWrongItems(data.wrongItems.map(item => ({ ...item, tags: [], memo: '' })));
        } else {
          setWrongItems([]);
        }
      }
    } catch (e) {
      console.error('사진 분석 오류:', e);
      setPhotoError(e.name === 'TimeoutError' ? '분석 시간이 초과됐습니다. 사진 수를 줄여 다시 시도해주세요.' : 'AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    setAnalyzingPhoto(false);
  };

  const removeAllPhotos = () => {
    setPhotos([]);
    photosRef.current = [];
    setPhotoAnalysis(null); setPhotoError('');
    setWrongItems([]);
  };

  const handleSubmit = async () => {
    // 단계별 검증
    if (!studentId) return setAlertMessage('학생을 먼저 선택해주세요.');
    if (!teacherId) return setAlertMessage('담당 강사를 선택해주세요.');
    if (homeworkRating == null || conceptRating == null) return setAlertMessage('과제 수행과 개념 이해 평가를 입력해주세요.');
    if (polishing) return setAlertMessage('AI가 코멘트를 다듬는 중입니다. 완료 후 다시 저장해주세요.');
    if (!teacherNote.trim() && !aiPolishedNote.trim()) return setAlertMessage('선생님 코멘트를 입력해주세요.\n학부모에게 전달되는 핵심 내용입니다.');

    setSaving(true);
    try {
      let photoUrls = [];
      if (photos.length > 0) {
        setUploadProgress({ done: 0, total: photos.length });
        photoUrls = await Promise.all(photos.map(async (p, i) => {
          // 기존 사진 (blob 없음) → URL 그대로 유지
          if (!p.blob && p.existingUrl) {
            setUploadProgress(prev => prev && ({ ...prev, done: prev.done + 1 }));
            return p.existingUrl;
          }
          // 새로 추가한 사진 → Storage 업로드
          const path = `students/${studentId}/photos/${Date.now()}_${i}.jpg`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, p.blob);
          const url = await getDownloadURL(storageRef);
          setUploadProgress(prev => prev && ({ ...prev, done: prev.done + 1 }));
          return url;
        }));
        setUploadProgress(null);
      }

      const reportPayload = {
        // 자동저장이 만든 draft가 있으면 그 문서를 확정본으로 업데이트 (중복 문서 방지)
        ...(editingReport ? { id: editingReport.id } : draftIdRef.current ? { id: draftIdRef.current } : {}),
        studentId, studentName: student?.name,
        teacherId, teacherName: teacher?.name,
        attendance, arrivalTime,
        homeworkRating, conceptRating,
        hasTest,
        testName: hasTest ? testName : null,
        testScore: hasTest ? testScore : null,
        testRound: hasTest ? testRound : null,
        textbook, subject, unit, pages,
        unitKey: findUnitKey(subject, unit, curriculumCourseOverride || guessCourseKey(subject, student?.school)),
        diagnosis: selectedTags,
        teacherNote: aiPolishedNote || teacherNote,
        nextPlan, nextPlanDetail,
        photoUrls,
        photoAnalysis: photoAnalysis || null,
        wrongItems: wrongItems.length > 0 ? wrongItems : null,
        isDraft: false, // 최종 저장 — 이 시점에 복습 일정 생성
      };
      reportPayload.points = calculateReportPoints(reportPayload);
      const savedId = await onSave(reportPayload);
      draftIdRef.current = null;
      setStudentId(''); setHomeworkRating(null); setConceptRating(null);
      setHasTest(false); setTestName(''); setTestScore(''); setTestRound('');
      setTextbook(''); setSubject('수학'); setUnit(''); setPages('');
      setCurriculumCourseOverride(null); setShowAllCourses(false); setShowCoursePicker(null);
      setSelectedTags([]); setTeacherNote(''); setAiPolishedNote('');
      setNextPlan(''); setNextPlanDetail('');
      removeAllPhotos();
      setLastSaved(null);
      if (editingReport) {
        onEditDone();
        showToast('리포트가 수정됐습니다!', 'success');
      } else {
        setStudentId(''); // 완료 후 학생 선택 초기화
        setAttendance('정시'); setArrivalTime('15:30');
        showToast('저장 완료! 링크를 복사해서 카카오톡으로 전송하세요.', 'success', savedId);
      }
    } catch (e) {
      console.error('리포트 저장 오류:', e);
      showToast('저장 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
    }
    setUploadProgress(null);
    setSaving(false);
  };

  // 토스트 색상
  const toastColors = {
    success: { bg: '#0F6E56', icon: '✓' },
    error:   { bg: '#8B2020', icon: '✕' },
    warn:    { bg: '#8A5A00', icon: '!' },
    info:    { bg: C.primary, icon: 'i' },
  };

  return (
    <>
      {/* 중앙 알림 모달 */}
      <AlertModal message={alertMessage} onClose={() => setAlertMessage('')} />

      {/* 토스트 알림 */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          background: toastColors[toast.type]?.bg || '#0F6E56',
          color: '#fff', padding: '12px 20px', borderRadius: '10px',
          fontSize: '13px', fontWeight: 600, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          maxWidth: '360px', wordBreak: 'keep-all',
          animation: 'fadeInUp 0.2s ease',
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        }}>
          <span style={{ fontSize: '14px', fontWeight: 800, flexShrink: 0 }}>{toastColors[toast.type]?.icon}</span>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          {toast.reportId && (
            <button onClick={() => {
              const url = `${window.location.origin}/report/${toast.reportId}`;
              navigator.clipboard.writeText(url).then(() => {
                setToast(prev => prev ? { ...prev, msg: '링크 복사 완료! 카카오톡에 붙여넣기 하세요.' } : null);
              });
            }} style={{
              background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff',
              fontSize: '11px', fontWeight: 700, padding: '5px 10px', borderRadius: '6px',
              cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit'
            }}>
              링크 복사
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <div style={{
      fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
      letterSpacing: '-0.02em',
      background: TOKENS.bgSoft,
      minHeight: '100dvh',
      padding: '20px',
      color: TOKENS.text,
    }}>
      {/* 수정 모드 배너 */}
      {editingReport && (
        <div style={{
          maxWidth: '1100px', margin: '0 auto 16px',
          background: '#FFF8E7', border: '1.5px solid #F5A623', borderRadius: '10px',
          padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '10px'
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 800, color: '#7A5200', margin: 0, wordBreak: 'keep-all' }}>
              수정 모드 — {editingReport.studentName} 리포트를 수정 중입니다
            </p>
            <p style={{ fontSize: '11px', color: '#9A6800', margin: '2px 0 0' }}>
              내용을 수정한 뒤 저장하면 기존 리포트가 업데이트됩니다.
            </p>
          </div>
          <button onClick={() => { onEditDone(); setStudentId(''); }}
            style={{ background: 'none', border: '1px solid #F5A623', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontWeight: 700, color: '#7A5200', cursor: 'pointer', flexShrink: 0 }}>
            취소
          </button>
        </div>
      )}
      <div style={{
        maxWidth: '1100px', margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: isWide ? '1fr 360px' : '1fr',
        gap: '20px', alignItems: 'flex-start',
      }}>
        {/* 좌측 입력 폼 — 섹션 간 여백 20px(스펙 섹션 5 "섹션 상단 여백") */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* 헤더 + 강사 */}
          <div style={{ background: TOKENS.bg, borderRadius: '16px', padding: '18px 20px', border: `1px solid ${TOKENS.border}`, boxShadow: SHADOW[1] }}>
            {/* 로그인 화면과 동일한 레터헤드 톤 — 색 배지 없이 텍스트만. 실제 로고 업로드 기능은
                이 화면에 연동되어 있지 않으므로(하드코딩 "K"), 로고 확정 시 별도로 연동 필요 */}
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: TOKENS.textMute, margin: '0 0 14px' }}>교현학원</p>
            <h1 style={{ fontSize: `${TYPE.h2.fontSize}px`, fontWeight: TYPE.h2.fontWeight, lineHeight: TYPE.h2.lineHeight, margin: '0 0 4px', letterSpacing: '-0.025em' }}>오늘의 학습 리포트 작성</h1>
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
                  style={{ ...inputStyle, padding: '5px 10px', fontSize: '16px', width: 'auto' }}>
                  <option value="">선택</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <span style={{ marginLeft: 'auto', fontSize: `${TYPE.small.fontSize}px`, fontWeight: TYPE.small.fontWeight, color: TOKENS.textSub }}>
                강사 추가/수정은 관리 › 설정에서
              </span>
            </div>
          </div>

          {/* 1. 학생 선택 */}
          <FormSection number="1" title="대상 학생">
            <select value={studentId} onChange={async (e) => {
              const newId = e.target.value;

              // 이미 학생이 선택된 상태에서 전환 시 → 자동저장 먼저
              if (studentId && newId !== studentId && !editingReport) {
                if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
                await handleAutoSave();
              }

              setStudentId(newId);

              // 새 학생 전환 시 입력 초기화
              if (newId && !editingReport) {
                draftIdRef.current = null; // 이전 학생 draft에 이어쓰지 않도록
                setHomeworkRating(null); setConceptRating(null);
                setHasTest(false); setTestScore(''); setTestName(''); setTestRound('');
                setTextbook(''); setSubject('수학'); setUnit(''); setPages('');
                setCurriculumCourseOverride(null); setShowAllCourses(false); setShowCoursePicker(null);
                setTeacherNote(''); setSelectedTags([]);
                setAiPolishedNote('');
                setNextPlan(''); setNextPlanDetail('');
                setPhotos([]); setPhotoAnalysis(null);
                setWrongItems([]);
                setLastSaved(null);
                setAutoSaveError(false);

                // 최근 리포트 자동 불러오기 — 초기화 이후에 덮어써야 실제로 반영됨
                const lastReport = [...reports]
                  .filter(r => r.studentId === newId)
                  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
                if (lastReport) {
                  if (lastReport.textbook) setTextbook(lastReport.textbook);
                  if (lastReport.subject) setSubject(lastReport.subject);
                  if (lastReport.unit) setUnit(lastReport.unit);
                }
              }
            }} style={selectStyle}>
              <option value="">학생을 선택해주세요</option>
              {classes.map(cls => {
                const inClass = students.filter(s => s.classId === cls.id);
                if (inClass.length === 0) return null;
                return (
                  <optgroup key={cls.id} label={cls.name}>
                    {inClass.map(s => <option key={s.id} value={s.id}>{s.name} · {s.school}</option>)}
                  </optgroup>
                );
              })}
              {(() => {
                const classIds = new Set(classes.map(cls => cls.id));
                const unassigned = students.filter(s => !s.classId || !classIds.has(s.classId));
                if (unassigned.length === 0) return null;
                return (
                  <optgroup label="미배정">
                    {unassigned.map(s => <option key={s.id} value={s.id}>{s.name} · {s.school}</option>)}
                  </optgroup>
                );
              })()}
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
                  <Clock size={13} style={{ color: TOKENS.textMute, flexShrink: 0 }} />
                  <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)}
                    style={{ ...inputStyle, width: '160px', minWidth: '160px' }} />
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
                    <FieldLabel>차수</FieldLabel>
                    <div style={{ display: 'flex', gap: '5px', marginBottom: '12px' }}>
                      {['1차', '2차', '3차'].map(r => (
                        <button key={r} onClick={() => setTestRound(prev => prev === r ? '' : r)}
                          style={{ ...suggestionStyle, background: testRound === r ? TOKENS.info : undefined, color: testRound === r ? '#fff' : undefined, borderColor: testRound === r ? TOKENS.info : undefined }}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <FieldLabel>점수</FieldLabel>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="number" value={testScore} onChange={(e) => setTestScore(e.target.value)} placeholder="84"
                        style={{ ...inputStyle, width: '90px', textAlign: 'center' }} />
                      <span style={{ fontSize: '12px', color: TOKENS.textSub, fontWeight: 500 }}>점 / 100점</span>
                      {testRound && <span style={{ fontSize: '11px', fontWeight: 700, color: TOKENS.infoDark, background: TOKENS.infoBg, padding: '3px 8px', borderRadius: '4px' }}>{testRound}</span>}
                    </div>
                  </>
                )}
              </FormSection>

              {/* 5. 오늘 학습 */}
              <FormSection number="5" title="오늘 학습">

                {/* 과목 선택 */}
                <FieldLabel>과목</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                  {[
                    // 국어/사회/과학/역사는 현재 교현학원에서 운영하지 않는 과목이라 선택지에서 제외.
                    // 해당 과목 수업을 시작하면 여기에 다시 추가 + curriculum.js에 단원표 추가.
                    { label: '수학', color: TOKENS.info },
                    { label: '영어', color: TOKENS.success },
                    { label: '기타', color: TOKENS.midGray },
                  ].map(({ label, color }) => (
                    <button key={label} onClick={() => { setSubject(label); setCurriculumCourseOverride(null); setShowAllCourses(false); setShowCoursePicker(null); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 0,
                        padding: 0, border: `1px solid ${subject === label ? color : '#E5E7EB'}`,
                        borderRadius: `${RADIUS2.chip}px`, cursor: 'pointer', overflow: 'hidden',
                        background: subject === label ? color : '#fff',
                        fontFamily: 'inherit', transition: 'all 0.15s'
                      }}>
                      <span style={{
                        width: '4px', minHeight: '34px', display: 'block', flexShrink: 0,
                        background: subject === label ? 'rgba(255,255,255,0.4)' : color,
                      }} />
                      <span style={{
                        padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                        color: subject === label ? '#fff' : '#374151',
                      }}>{label}</span>
                    </button>
                  ))}
                </div>

                <FieldLabel>교재</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                  {(student?.textbooks || []).map(t => (
                    <button key={t.id} onClick={() => setTextbook(prev => prev === t.name ? '' : t.name)} style={chipStyle(textbook === t.name)}>{t.name}</button>
                  ))}
                </div>
                <input
                  value={textbook}
                  onChange={(e) => setTextbook(e.target.value)}
                  placeholder="직접 입력 또는 위에서 선택"
                  style={{ ...inputStyle, marginBottom: '12px' }}
                />
                <FieldLabel>단원</FieldLabel>
                {/* 최근 단원 히스토리 — 교재+단원 세트 원클릭 */}
                {(() => {
                  if (recentUnits.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                      {recentUnits.map((item, i) => (
                        <button key={i} onClick={() => { setTextbook(item.textbook); setUnit(item.unit); }}
                          style={{
                            padding: '4px 10px', borderRadius: `${RADIUS2.chip}px`, border: '1px solid #E5E7EB',
                            background: (textbook === item.textbook && unit === item.unit) ? TOKENS.info : '#F9FAFB',
                            color: (textbook === item.textbook && unit === item.unit) ? '#fff' : '#374151',
                            fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                            maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                          {item.textbook} · {item.unit}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {/* 표준 단원표 제안 — 최근 이력이 있으면 기본적으로 접어둠(중복 정보라 화면만 차지),
                    이력이 없는 신규 학생은 추천할 게 이것뿐이라 자동으로 펼침 */}
                {(() => {
                  const courses = getCourses(subject);
                  if (courses.length === 0) return null;
                  const isOpen = showCoursePicker != null ? showCoursePicker : recentUnits.length === 0;
                  if (!isOpen) {
                    return (
                      <button type="button" onClick={() => setShowCoursePicker(true)}
                        style={{ background: 'none', border: 'none', color: TOKENS.brand, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0', marginBottom: '4px' }}>
                        표준 단원표에서 찾기 ›
                      </button>
                    );
                  }
                  const guessedCourse = guessCourseKey(subject, student?.school);
                  const activeCourse = curriculumCourseOverride || guessedCourse;
                  const units = activeCourse ? getUnits(subject, activeCourse) : [];
                  // 코스가 많을 때(수학 24개) 기본으로는 추정 학년 앞뒤 학기만 보여주고, 필요하면 전체 펼치기
                  const activeIdx = activeCourse ? courses.indexOf(activeCourse) : -1;
                  const canNarrow = courses.length > 6 && activeIdx >= 0;
                  const visibleCourses = (showAllCourses || !canNarrow)
                    ? courses
                    : courses.slice(Math.max(0, activeIdx - 1), activeIdx + 2);
                  return (
                    <div style={{ marginBottom: '8px' }}>
                      <button type="button" onClick={() => setShowCoursePicker(false)}
                        style={{ background: 'none', border: 'none', color: TOKENS.textMute, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: '6px' }}>
                        ‹ 표준 단원표 접기
                      </button>
                      {/* 코스 칩 — 항상 노출해 추정이 틀렸을 때(복습, 학기 경계 등) 직접 바꿀 수 있게 */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px', marginBottom: units.length > 0 ? '5px' : 0 }}>
                        {(() => {
                          let lastGroup = null;
                          const groupOf = (c) => c.startsWith('고등') ? '고등' : c.startsWith('중') ? '중등' : c.startsWith('초') ? '초등' : '';
                          return visibleCourses.map(c => {
                            const group = groupOf(c);
                            // "전체 학년 보기"로 펼쳤을 때만 학교급 사이에 얇은 구분선 표시 — 평시엔 그대로 pill만
                            const showDivider = showAllCourses && group && group !== lastGroup;
                            lastGroup = group;
                            return (
                              <React.Fragment key={c}>
                                {showDivider && (
                                  <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0 1px' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 700, color: TOKENS.textMute, letterSpacing: '0.05em' }}>{group}</span>
                                    <div style={{ flex: 1, height: '1px', background: TOKENS.border }} />
                                  </div>
                                )}
                                <button type="button" onClick={() => setCurriculumCourseOverride(prev => prev === c ? null : c)}
                                  style={{
                                    padding: '3px 9px', borderRadius: `${RADIUS2.chip}px`, border: `1px solid ${TOKENS.border}`,
                                    background: activeCourse === c ? TOKENS.info : TOKENS.bg,
                                    color: activeCourse === c ? '#fff' : TOKENS.textSub,
                                    fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                  }}>{c}</button>
                              </React.Fragment>
                            );
                          });
                        })()}
                        {canNarrow && (
                          <button type="button" onClick={() => setShowAllCourses(v => !v)}
                            style={{
                              padding: '3px 9px', borderRadius: `${RADIUS2.chip}px`, border: '1px dashed #C9C9C9',
                              background: '#fff', color: '#9CA3AF', fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            }}>{showAllCourses ? '접기' : '전체 학년 보기'}</button>
                        )}
                      </div>
                      {units.length > 0 && (
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${TOKENS.border}` }}>
                          {/* 단원이 어느 코스 소속인지 캡션으로 명시 — 목록이 길 때 바로 위 항목 소속처럼 보이는 착시 방지 */}
                          <p style={{ fontSize: '10px', fontWeight: 700, color: TOKENS.brand, margin: '0 0 6px' }}>▸ {activeCourse} 단원</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {units.map(u => (
                            <button key={u} type="button" onClick={() => setUnit(u)}
                              style={{
                                padding: '4px 10px', borderRadius: `${RADIUS2.chip}px`, border: `1px solid ${unit === u ? TOKENS.info : TOKENS.border}`,
                                background: unit === u ? TOKENS.info : TOKENS.bgSoft,
                                color: unit === u ? '#fff' : TOKENS.textSub,
                                fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                              }}>{u}</button>
                          ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="예: 3단원 소수의 나눗셈" style={inputStyle} />
                <div style={{ height: '8px' }} />
                <FieldLabel>학습 범위</FieldLabel>
                <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="예: 111, 114, 124쪽 / 24~32쪽" style={inputStyle} />
              </FormSection>

              {/* 5-1. 교재/시험지 사진 분석 (선택) */}
              <FormSection number="5+" title="교재·시험지 사진 분석 (선택)" badge={photoAnalysis ? '분석완료' : (photos.length > 0 ? `${photos.length}장 선택됨` : undefined)} badgeTone={photoAnalysis ? 'success' : 'info'}>
                <p style={{ fontSize: '11px', color: TOKENS.textMute, margin: '0 0 10px' }}>
                  채점(O/△/빗금) 완료된 페이지를 촬영하면, AI가 표시만 그대로 읽어 유형별 코멘트 초안을 만들어줍니다. 여러 장(최대 {MAX_PHOTOS}장) 한 번에 올려서 페이지별 결과를 통합 분석할 수 있습니다. 점수는 반영되지 않습니다.
                </p>
                {photos.length === 0 && (
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    border: `1.5px dashed ${TOKENS.border}`, borderRadius: '12px', padding: '18px',
                    cursor: 'pointer', color: TOKENS.textSub, fontSize: '13px', fontWeight: 600, background: TOKENS.bgSoft
                  }}>
                    <FileText size={16} /> 사진 선택 (갤러리, 최대 {MAX_PHOTOS}장)
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                      onChange={(e) => { if (e.target.files?.length) { handlePhotoSelect(e.target.files); e.target.value = ''; } }} />
                  </label>
                )}
                {photos.length > 0 && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                      {photos.map((p, i) => (
                        <div key={i} style={{ position: 'relative', borderRadius: `${RADIUS2.thumbnail}px`, overflow: 'hidden', aspectRatio: '3/4', background: '#F3F4F6' }}>
                          <img
                            src={p.preview}
                            alt={`사진 ${i + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          <div className="fallback-label" style={{ display: 'none' }} />
                          <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: `${RADIUS2.badge}px` }}>{i + 1}</span>
                          {!analyzingPhoto && (
                            <button onClick={() => removeOnePhoto(i)} style={{
                              position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.55)',
                              border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent'
                            }}><X size={14} /></button>
                          )}
                        </div>
                      ))}
                      {photos.length < MAX_PHOTOS && !analyzingPhoto && (
                        <label style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '3/4',
                          border: `1.5px dashed ${TOKENS.border}`, borderRadius: `${RADIUS2.thumbnail}px`,
                          cursor: 'pointer', color: TOKENS.textMute, background: TOKENS.bgSoft
                        }}>
                          <Plus size={20} />
                          <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                            onChange={(e) => { if (e.target.files?.length) { handlePhotoSelect(e.target.files); e.target.value = ''; } }} />
                        </label>
                      )}
                    </div>
                    {!analyzingPhoto && (
                      <button onClick={removeAllPhotos} style={{ ...suggestionStyle, marginBottom: '10px' }}>전체 지우기</button>
                    )}
                    {/* 디버그 로그 — 모바일 확인용 */}
                    {photos[0]?.debugLogs?.length > 0 && (
                      <div style={{ background: '#1A1A1A', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
                        {photos[0].debugLogs.map((log, i) => (
                          <p key={i} style={{ fontSize: '10px', color: '#00FF00', margin: '1px 0', fontFamily: 'monospace' }}>{log}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {photos.length > 0 && (
                  <div>
                    {!photoAnalysis && (
                      <button onClick={() => handleAnalyzePhoto('auto')} disabled={analyzingPhoto} style={aiButtonStyle(analyzingPhoto)}>
                        {analyzingPhoto
                          ? <span style={{ display: 'inline-block', width: 13, height: 13, border: `2px solid ${TOKENS.success}40`, borderTopColor: TOKENS.success, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          : <Sparkles size={13} />} {analyzingPhoto ? 'AI가 분석 중...' : `AI로 분석하기 (${photos.length}장)`}
                      </button>
                    )}
                    {analyzingPhoto && (
                      <div style={{ marginTop: '10px' }}>
                        <style>{`@keyframes analyzePulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.9; } }`}</style>
                        <p style={{ fontSize: '11px', color: TOKENS.textSub, textAlign: 'center', marginBottom: '8px' }}>{ANALYZE_PHASES[analyzePhase]}</p>
                        {[80, 60, 90].map((w, i) => (
                          <div key={i} style={{ width: `${w}%`, height: '12px', background: TOKENS.bgSoft, borderRadius: '4px', marginBottom: '8px', animation: 'analyzePulse 1.4s ease-in-out infinite' }} />
                        ))}
                      </div>
                    )}
                    {photoError && (
                      <div style={{ background: TOKENS.dangerBg, borderRadius: '10px', padding: '10px 12px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        <p style={{ fontSize: '11px', color: TOKENS.danger, margin: 0 }}>{photoError}</p>
                        <button onClick={() => handleAnalyzePhoto('auto')} style={{ flexShrink: 0, padding: '5px 12px', fontSize: '11px', fontWeight: 700, border: 'none', borderRadius: '6px', background: TOKENS.danger, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>재시도</button>
                      </div>
                    )}
                    {photoAnalysis && (
                      <div style={{ background: TOKENS.successBg, borderRadius: '12px', padding: '12px', marginTop: '4px' }}>
                        {(photoAnalysis.bookOrTest || photoAnalysis.unit || photoAnalysis.pageRange) && (
                          <p style={{ fontSize: '11px', color: TOKENS.success, fontWeight: 700, margin: '0 0 8px' }}>
                            {[photoAnalysis.bookOrTest, photoAnalysis.unit, photoAnalysis.pageRange].filter(Boolean).join(' · ')}
                          </p>
                        )}

                        {/* 사진이 잘려서 일부 문항 번호가 안 보일 때 — AI가 안 보이는 번호를 앞뒤 문맥으로
                            추측해서 채워 넣는 걸 프롬프트에서 막아뒀지만, 애초에 사진을 다시 찍는 게 제일
                            확실하므로 여기서 바로 알려줌 */}
                        {photoAnalysis.pageCutoff && (
                          <div style={{ background: '#fff', border: `1px solid ${TOKENS.warnBorder}`, borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
                            <p style={{ fontSize: '11px', color: TOKENS.warn, margin: 0, lineHeight: 1.5 }}>
                              <AlertTriangle size={11} style={{ verticalAlign: '-1px' }} /> 사진이 잘려서 일부 문항이 안 보여요{photoAnalysis.pageCutoffNote ? ` (${photoAnalysis.pageCutoffNote})` : ''}. 잘린 문항은 결과에서 빠졌을 수 있으니, 가능하면 페이지 전체가 나오게 다시 찍어주세요.
                            </p>
                          </div>
                        )}

                        {/* 위 교재/단원 입력칸과 사진에서 읽은 단원이 다르면 경고 — 표준 단원표 추천(학년+시기 기준)을
                            그대로 쓴 채 실제로는 다른 단원 사진을 올렸을 때, AI 코멘트에 엉뚱한 단원명이 들어가는 걸 방지 */}
                        {photoAnalysis.unit && unit.trim() && !unit.includes(photoAnalysis.unit) && !photoAnalysis.unit.includes(unit) && (
                          <div style={{ background: '#fff', border: `1px solid ${TOKENS.warnBorder}`, borderRadius: '8px', padding: '8px 10px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                            <p style={{ fontSize: '11px', color: TOKENS.warn, margin: 0, lineHeight: 1.5 }}>
                              <AlertTriangle size={11} style={{ verticalAlign: '-1px' }} /> 사진에서 읽은 단원("{photoAnalysis.unit}")이 위에 입력한 단원("{unit}")과 달라요 — 다른 교재 사진 아닌지 확인해주세요.
                            </p>
                            <button type="button" onClick={() => { setUnit(photoAnalysis.unit); if (photoAnalysis.bookOrTest) setTextbook(photoAnalysis.bookOrTest); }}
                              style={{ flexShrink: 0, padding: '5px 10px', fontSize: '11px', fontWeight: 700, border: 'none', borderRadius: '6px', background: TOKENS.warn, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                              사진 기준으로 채우기
                            </button>
                          </div>
                        )}

                        {/* 재분석 버튼 — 결과가 틀렸을 때 사진 재업로드 없이 다시 시도.
                            AI가 이미 다듬어둔 코멘트(aiPolishedNote)는 재분석 전 기준으로 만들어진
                            거라 그대로 두면 새 분석 결과와 안 맞는 문장이 남게 됨 — 같이 비워서
                            "다시 시작" 느낌을 주고, 다듬기 버튼을 다시 눌러야 새 결과가 반영되게 함 */}
                        <button type="button" onClick={() => {
                          const hasManualInput = wrongItems.some(w => w.tags.length > 0 || w.memo?.trim());
                          const willClearComment = !!aiPolishedNote;
                          const confirmMsg = hasManualInput
                            ? `오답 카드에 입력한 태그/메모${willClearComment ? ', AI 다듬기 결과' : ''}가 초기화됩니다. 다시 분석할까요?`
                            : willClearComment ? 'AI 다듬기 결과가 초기화됩니다. 다시 분석할까요?' : null;
                          if (confirmMsg && !window.confirm(confirmMsg)) return;
                          setAiPolishedNote('');
                          handleAnalyzePhoto('auto');
                        }} disabled={analyzingPhoto}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, border: `1px solid ${TOKENS.success}`, borderRadius: '20px', background: '#fff', color: TOKENS.success, cursor: analyzingPhoto ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: analyzingPhoto ? 0.6 : 1 }}>
                          <Sparkles size={11} /> 결과가 다르다면 다시 분석
                        </button>

                        {/* 섹션별 렌더링: 연산 = 집계만 / 유형 = 문항별 상세 / 모의고사 = 그룹집계+약점상세 */}
                        {(photoAnalysis.sections || []).map((sec, si) => (
                          <div key={si} style={{ marginBottom: '10px' }}>
                            {sec.sectionType === 'calculation' && sec.summary && (
                              <div style={{ background: '#fff', borderRadius: '10px', padding: '10px' }}>
                                {sec.label && <p style={{ fontSize: '11px', fontWeight: 700, margin: '0 0 6px' }}>{sec.label}</p>}
                                <p style={{ fontSize: '12px', margin: 0 }}>
                                  총 <b>{sec.summary.total ?? 0}</b>문제 중
                                  <span style={{ color: TOKENS.successDark, fontWeight: 700 }}> 정답(빨간 동그라미) {sec.summary.correct ?? 0}</span>
                                  <span style={{ color: TOKENS.dangerBorder, fontWeight: 700 }}> · 약점 {sec.summary.wrong ?? 0}</span>
                                </p>
                              </div>
                            )}

                            {sec.sectionType === 'concept' && (sec.problemTypes || [])
                              .slice()
                              .sort((a, b) => parseInt(a.number) - parseInt(b.number))
                              .map((p, i) => (
                              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px', fontSize: '12px' }}>
                                <button type="button"
                                  onClick={() => {
                                    let becameWrong = false;
                                    setPhotoAnalysis(prev => ({
                                      ...prev,
                                      sections: prev.sections.map(s =>
                                        s.sectionType === 'concept'
                                          ? { ...s, problemTypes: s.problemTypes.map((pt) => {
                                              if (pt.number !== p.number) return pt;
                                              const newResult = pt.result === '잘함' ? '약점' : '잘함';
                                              becameWrong = newResult === '약점';
                                              return { ...pt, result: newResult };
                                            })}
                                          : s
                                      )
                                    }));
                                    // wrongItems도 동기화 — prev 기준으로 존재 여부를 확인해 중복 추가/유실 방지
                                    setWrongItems(prev => {
                                      const exists = prev.some(w => w.number === p.number);
                                      if (becameWrong && !exists) {
                                        return [...prev, { number: p.number, type: p.type, correctRate: '', mark: '수동오답', tags: [], memo: '' }];
                                      }
                                      if (!becameWrong && exists) {
                                        return prev.filter(w => w.number !== p.number);
                                      }
                                      return prev;
                                    });
                                  }}
                                  style={{
                                    flexShrink: 0, fontWeight: 700, fontSize: '12px', padding: '8px 14px', minHeight: '36px', borderRadius: '10px',
                                    background: p.result === '잘함' ? '#E1F5EE' : TOKENS.dangerBg,
                                    color: p.result === '잘함' ? TOKENS.successDark : TOKENS.dangerBorder,
                                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    WebkitTapHighlightColor: 'transparent',
                                  }}>{p.result === '잘함' ? '정답 ✓' : '오답 ✗'}</button>
                                <div>
                                  <p style={{ margin: 0, fontWeight: 600 }}>
                                    {p.number ? `${p.number}. ` : ''}{p.type}
                                  </p>
                                  <p style={{ margin: '2px 0 0', color: TOKENS.textSub }}>{p.note}</p>
                                </div>
                              </div>
                            ))}

                            {sec.sectionType === 'mock_exam' && (
                              <div style={{ background: '#fff', borderRadius: '10px', padding: '10px' }}>
                                {(sec.groupSummary || []).map((g, i) => (
                                  <p key={i} style={{ fontSize: '12px', margin: '0 0 4px' }}>
                                    <b>{g.type}</b> — 총 {g.total} · 정답(빨간 동그라미) {g.correct} · 약점 {g.wrong}
                                  </p>
                                ))}
                                {(sec.weakDetail || []).length > 0 && (
                                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${TOKENS.border}` }}>
                                    <p style={{ fontSize: '11px', fontWeight: 700, color: TOKENS.textSub, margin: '0 0 6px' }}>보완 필요 문항</p>
                                    {sec.weakDetail.map((p, i) => (
                                      <p key={i} style={{ fontSize: '12px', margin: '0 0 4px' }}>
                                        {p.number ? `${p.number}. ` : ''}{p.type}
                                        {p.mark && <span style={{ marginLeft: '6px', fontSize: '10px', color: TOKENS.textMute }}>[{p.mark}]</span>}
                                        {p.note && <span style={{ display: 'block', color: TOKENS.textSub }}>{p.note}</span>}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* 오답 문제별 진단 카드 */}
                        {wrongItems.length > 0 && (
                          <div style={{ marginTop: '12px' }}>
                            <p style={{ fontSize: '11px', fontWeight: 700, color: TOKENS.textSub, margin: '0 0 8px' }}>
                              오답 문제별 원인 입력
                            </p>
                            {[...wrongItems]
                              .sort((a, b) => parseInt(a.number) - parseInt(b.number))
                              .map((item, idx) => {
                              const WRONG_TAGS = [
                                { key: 'calc', label: '계산 실수', bg: '#FFF8EC', color: '#8A5A00', border: '#C9A22740' },
                                { key: 'concept', label: '개념 누락', bg: '#FDF0F0', color: '#8A2020', border: '#8A202040' },
                                { key: 'apply', label: '응용 부족', bg: '#FDF0F0', color: '#8A2020', border: '#8A202040' },
                                { key: 'time', label: '시간 부족', bg: '#F3F0FA', color: '#4A3080', border: '#4A308040' },
                                { key: 'unread', label: '문제 안 읽음', bg: '#FFF8EC', color: '#8A5A00', border: '#C9A22740' },
                              ];
                              return (
                                <div key={item.number || idx} style={{ border: '1px solid #DC262630', borderRadius: `${RADIUS2.thumbnail}px`, padding: '14px', marginBottom: '8px', background: '#FFF5F5' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                    <span style={{ background: TOKENS.dangerBorder, color: '#fff', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                                      {item.number}번 오답
                                    </span>
                                    <span style={{ fontSize: '11px', color: TOKENS.textSub, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</span>
                                    {item.correctRate && (
                                      <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 600, marginLeft: 'auto' }}>
                                        정답률 {item.correctRate}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    {WRONG_TAGS.map(tag => {
                                      const active = item.tags.includes(tag.key);
                                      return (
                                        <button type="button" key={tag.key}
                                          onClick={() => setWrongItems(prev => prev.map((w) => w.number === item.number ? {
                                            ...w,
                                            tags: active ? w.tags.filter(t => t !== tag.key) : [...w.tags, tag.key]
                                          } : w))}
                                          style={{
                                            fontSize: '11px', padding: '5px 11px', borderRadius: '20px',
                                            background: active ? tag.bg : '#fff',
                                            color: active ? tag.color : TOKENS.textMute,
                                            border: `1px solid ${active ? tag.border : TOKENS.border}`,
                                            cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 700 : 400,
                                            WebkitTapHighlightColor: 'transparent',
                                            touchAction: 'manipulation',
                                          }}>
                                          {active ? '✓ ' : ''}{tag.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <input
                                    value={item.memo}
                                    onChange={e => setWrongItems(prev => prev.map((w) => w.number === item.number ? { ...w, memo: e.target.value } : w))}
                                    placeholder="직접 입력 (선택) — 답 잘못 씀, 문제 안 읽음 등"
                                    style={{ width: '100%', padding: '6px 10px', fontSize: '16px', border: `1px solid ${TOKENS.border}`, borderRadius: '8px', fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box', color: TOKENS.text }}
                                  />
                                </div>
                              );
                            })}

                            {/* 오답 카드 기반 코멘트 생성 */}
                            <button type="button" disabled={generatingComment} onClick={async () => {
                              if (generatingComment) return;
                              setGeneratingComment(true);
                              const studentName = students.find(s => s.id === studentId)?.name || '학생';
                              const tagLabels = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', unread: '문제 안 읽음' };
                              const wrongSummary = wrongItems.map(w => {
                                const tags = w.tags.map(t => tagLabels[t]).filter(Boolean).join(', ');
                                const memo = w.memo?.trim();
                                return `${w.number}번(${w.type}${w.correctRate ? ` 정답률${w.correctRate}` : ''})${tags ? ` — ${tags}` : ''}${memo ? ` / ${memo}` : ''}`;
                              }).join('; ');

                              showToast('코멘트 생성 중...', 'info');
                              try {
                                const res = await fetch('/api/polish', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    note: wrongSummary,
                                    studentName,
                                    textbook: textbook || '',
                                    unit: unit || '',
                                    diagTags: wrongItems.flatMap(w => w.tags.map(t => tagLabels[t])).join(', '),
                                    photoContext: `오답: ${wrongSummary}`,
                                  }),
                                  signal: AbortSignal.timeout(60000),
                                });
                                if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
                                const data = await res.json();
                                if (data.result) {
                                  setTeacherNote(prev => prev ? `${prev}\n\n${data.result}` : data.result);
                                  showToast('코멘트가 선생님 메모에 추가됐습니다!', 'success');
                                } else {
                                  showToast('코멘트 생성 실패. 다시 시도해주세요.', 'error');
                                }
                              } catch (e) {
                                console.error('코멘트 생성 오류:', e);
                                showToast(e.name === 'TimeoutError' ? '응답 시간이 초과됐습니다. 다시 시도해주세요.' : '코멘트 생성 중 오류가 발생했습니다.', 'error');
                              } finally {
                                setGeneratingComment(false);
                              }
                            }}
                              style={aiButtonStyle(generatingComment)}>
                              <Sparkles size={13} /> {generatingComment ? '생성 중...' : '오답 분석 기반 코멘트 생성'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </FormSection>

              {/* 6. 진단 */}
              <FormSection number="6" title="오늘의 진단" badge={`${selectedTags.length}개 선택`} badgeTone={selectedTags.length > 0 ? 'info' : 'neutral'}>
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
                    <p style={{ fontSize: '11px', color: TOKENS.warn, fontWeight: 700, margin: '0 0 2px' }}>선택된 진단 상세 입력</p>
                    <p style={{ fontSize: '10px', color: '#8A5A00', margin: '0 0 4px', lineHeight: 1.5 }}>
                      <Info size={11} style={{ verticalAlign: '-2px' }} /> 구체적으로 적을수록 원장 보고서에서 바로 확인됩니다<br/>
                      예: <strong>4단원 · 111p · 비례식 문장제 — 식 세우기 단계에서 막힘</strong>
                    </p>
                    {selectedTags.map((tag, idx) => {
                      const tagDef = DIAGNOSIS_TAGS.find(t => t.key === tag.key);
                      return (
                        <div key={idx} style={{ background: '#fff', borderRadius: `${RADIUS2.thumbnail}px`, padding: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={tagStyle(tagDef.color, true)}>{tagDef.label}</span>
                            <button onClick={() => toggleTag(tag.key)} style={{ background: 'none', border: 'none', color: TOKENS.textMute, cursor: 'pointer', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}><X size={14} /></button>
                          </div>
                          <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                            <input value={tag.unit} onChange={(e) => updateTagDetail(idx, 'unit', e.target.value)} placeholder="단원 (예: 4단원)" style={{ ...inputStyle, fontSize: '16px', padding: '6px 10px', minWidth: 0 }} />
                            <input value={tag.pages} onChange={(e) => updateTagDetail(idx, 'pages', e.target.value)} placeholder="페이지 (예: 111, 114p)" style={{ ...inputStyle, fontSize: '16px', padding: '6px 10px', minWidth: 0 }} />
                          </div>
                          <input value={tag.detail} onChange={(e) => updateTagDetail(idx, 'detail', e.target.value)}
                            placeholder="구체적 개념명 (예: 비례식 문장제 — 식 세우기 단계에서 막힘)"
                            style={{ ...inputStyle, fontSize: '16px', padding: '6px 10px' }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </FormSection>

              {/* 7. 선생님 한 마디 */}
              <FormSection number="7" title="선생님 한 마디">

                {/* 과목별 퀵 태그 */}
                {(() => {
                  const QUICK_TAGS = {
                    수학: ['연산 실수 주의', '응용 연습 필요', '개념 완성', '계산 속도 향상 중', '문제 이해력 우수', '집중력 우수'],
                    영어: ['어휘 암기 우수', '독해 속도 향상 중', '문법 주의', '받아쓰기 정확도 높음', '발음 교정 필요', '집중력 우수'],
                    국어: ['독해력 우수', '어휘 확장 필요', '글쓰기 향상 중', '문학 이해도 높음', '비문학 연습 필요', '집중력 우수'],
                    과학: ['실험 이해 우수', '개념 암기 필요', '응용 연습 필요', '탐구력 우수', '계산 연습 필요', '집중력 우수'],
                    사회: ['시사 연계 우수', '암기 보완 필요', '이해력 향상 중', '서술 연습 필요', '핵심 개념 정리 필요', '집중력 우수'],
                    역사: ['흐름 파악 우수', '연대 암기 필요', '서술 연습 필요', '인과관계 이해 우수', '암기 보완 필요', '집중력 우수'],
                    기타: ['집중력 우수', '과제 완성도 높음', '복습 권장', '이해력 향상 중', '참여도 우수', '개념 정리 필요'],
                  };
                  const tags = QUICK_TAGS[subject] || QUICK_TAGS['기타'];
                  return (
                    <div style={{ marginBottom: '10px' }}>
                      <p style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600, margin: '0 0 6px', letterSpacing: '0.06em' }}>
                        {subject} 퀵 태그 — 클릭하면 코멘트에 추가돼요
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {tags.map(tag => (
                          <button key={tag} onClick={() => {
                            const prefix = `[${tag}]`;
                            setTeacherNote(prev => prev ? `${prev} ${prefix} ` : `${prefix} `);
                            // 퀵 태그 클릭 시 즉시 자동저장 예약 (3초 후)
                            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
                            autoSaveTimer.current = setTimeout(() => {
                              handleAutoSave();
                              setLastSaved(new Date());
                            }, 3000);
                          }}
                          style={{
                            padding: '4px 10px', borderRadius: '12px', border: '0.5px solid #E5E7EB',
                            background: '#F9FAFB', color: '#374151', fontSize: '11px', fontWeight: 500,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FieldLabel>강사 메모 (평소 카톡 톤으로 자유롭게)</FieldLabel>
                  {/* 새로고침 후 이어쓰기(자동저장 draft 복원)나 오답 분석 코멘트 생성으로 메모에
                      AI 문장이 이미 섞여 들어간 상태에서, 처음부터 다시 쓰고 싶을 때 한 번에 비우는 버튼.
                      자동저장 draft 자체는 건드리지 않음 — 다음 자동저장 때 빈 값으로 덮어써짐 */}
                  {(teacherNote || aiPolishedNote) && (
                    <button type="button" onClick={() => {
                      if (!window.confirm('강사 메모와 AI 다듬기 결과를 모두 지우고 새로 시작할까요?')) return;
                      setTeacherNote(''); setAiPolishedNote('');
                    }} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <X size={11} /> 새로 시작
                    </button>
                  )}
                </div>

                {/* 코멘트 즐겨찾기 — 학원 공용, 탭하면 메모에 이어붙임 */}
                {commentTemplates.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                    {commentTemplates.map(t => (
                      <span key={t.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: '#FFF8E7', border: '1px solid #F5D76E', borderRadius: '20px',
                        padding: '4px 6px 4px 12px', fontSize: '11px', color: '#7A5200', fontWeight: 500,
                      }}>
                        <Star size={10} fill={C.accent} color={C.accent} style={{ flexShrink: 0 }} />
                        <button type="button" onClick={() => setTeacherNote(prev => prev ? `${prev}\n${t.text}` : t.text)}
                          style={{ background: 'none', border: 'none', color: '#7A5200', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.label}
                        </button>
                        <button type="button" onClick={() => { if (window.confirm(`"${t.label}" 즐겨찾기를 삭제할까요?`)) onDeleteCommentTemplate(t.id); }}
                          style={{ background: 'none', border: 'none', color: '#B08900', cursor: 'pointer', padding: '2px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <textarea value={teacherNote} onChange={(e) => setTeacherNote(e.target.value)}
                  placeholder="예: 3단원 자릿수 실수 2번, 응용은 시간 부족으로 못 풂. 개념은 알고 있음"
                  rows={3} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
                <button type="button" onClick={() => {
                  if (!teacherNote.trim()) return;
                  const label = window.prompt('즐겨찾기 이름을 입력해주세요 (예: 계산실수 안내)', teacherNote.trim().slice(0, 12));
                  if (label && label.trim()) onSaveCommentTemplate(label.trim(), teacherNote.trim());
                }} disabled={!teacherNote.trim()} style={{
                  marginTop: '6px', width: '100%', padding: '7px', fontSize: '11px', fontWeight: 700, borderRadius: '8px',
                  border: `1px solid ${teacherNote.trim() ? '#C9A227' : '#E5E7EB'}`, background: '#fff',
                  color: teacherNote.trim() ? '#8A5A00' : '#9CA3AF', cursor: teacherNote.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}>
                  <Star size={11} style={{ verticalAlign: '-2px', marginRight: '3px' }} />현재 메모 즐겨찾기에 저장
                </button>
                <button onClick={handleAIPolish} disabled={!teacherNote.trim() || polishing} style={aiButtonStyle(!teacherNote.trim() || polishing)}>
                  <Sparkles size={13} /> {polishing ? '다듬는 중...' : 'AI로 학부모 톤으로 다듬기'}
                </button>
                {polishing && (
                  <div style={{ background: TOKENS.successBg, borderRadius: '12px', padding: '14px', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, border: `2px solid ${TOKENS.success}40`, borderTopColor: TOKENS.success, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '12px', color: TOKENS.success, fontWeight: 600 }}>AI가 학부모 톤으로 다듬는 중이에요...</span>
                  </div>
                )}
                {!polishing && aiPolishedNote && (
                  <div style={{ background: TOKENS.successBg, borderRadius: '12px', padding: '10px', marginTop: '10px' }}>
                    <p style={{ fontSize: '11px', color: TOKENS.success, fontWeight: 700, margin: '0 0 6px' }}>학부모 발송 버전 (수정 가능)</p>
                    <textarea value={aiPolishedNote} onChange={(e) => setAiPolishedNote(e.target.value)}
                      rows={3} style={{ ...inputStyle, background: '#fff', fontFamily: 'inherit', resize: 'vertical' }} />
                    <p style={{ fontSize: '10px', color: TOKENS.textMute, margin: '6px 0 0', lineHeight: 1.4 }}>
                      <Info size={11} style={{ verticalAlign: '-2px' }} /> 여기서 수정하면 아래 학부모 발송 미리보기에도 그대로 반영돼요
                    </p>
                  </div>
                )}
              </FormSection>

              {/* 8. 다음 수업 계획 */}
              <FormSection number="8" title="다음 수업 계획">
                <p style={{ fontSize: '11px', color: '#8A5A00', background: '#FFF8E7', border: '1px solid #F5D76E', borderRadius: '8px', padding: '8px 12px', margin: '0 0 10px', lineHeight: 1.6 }}>
                  <Info size={11} style={{ verticalAlign: '-2px' }} /> 오늘 진단된 약점과 연결되는 전략을 적으면 학부모 신뢰도가 높아집니다.<br/>
                  예: <strong>"응용력 보완을 위한 5단원 개념 연계 풀이 진행"</strong>
                </p>
                <FieldLabel>다음 수업 전략 (한 줄)</FieldLabel>
                <input
                  value={nextPlan}
                  onChange={(e) => setNextPlan(e.target.value)}
                  placeholder="예: 응용력 보완을 위한 5단원 비례식 연계 풀이 진행"
                  style={inputStyle}
                />
                <div style={{ height: '8px' }} />
                <FieldLabel>교재 및 범위 (선택)</FieldLabel>
                <input
                  value={nextPlanDetail}
                  onChange={(e) => setNextPlanDetail(e.target.value)}
                  placeholder="예: 디딤돌 기본+응용 6-2 · 5단원 p.130~140"
                  style={inputStyle}
                />
              </FormSection>

              {/* 저장 버튼 */}
              {/* disabled를 !isValid에 걸지 않음 — 뭐가 빠졌는지 handleSubmit의 안내 메시지로
                  알려줘야 하는데, disabled면 클릭 자체가 막혀 그 메시지에 영영 도달 못 함 */}
              <button onClick={handleSubmit} disabled={saving || polishing} style={{ ...submitButtonStyle(isValid && !saving && !polishing), width: '100%', cursor: (saving || polishing) ? 'not-allowed' : 'pointer' }}>
                {saving
                  ? <span style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <Send size={15} />} {saving ? (uploadProgress ? `사진 업로드 중 ${uploadProgress.done}/${uploadProgress.total}...` : '저장 중...') : polishing ? 'AI 다듬는 중...' : '리포트 저장 및 발송 준비'}
              </button>
              {autoSaveError ? (
                <p style={{ fontSize: '11px', color: TOKENS.danger, margin: '6px 0 0', textAlign: 'center', fontWeight: 600 }}>
                  <AlertTriangle size={11} style={{ verticalAlign: '-1px', marginRight: '3px' }} />자동저장 실패 — 네트워크를 확인하고 직접 저장해주세요
                </p>
              ) : lastSaved && (
                <p style={{ fontSize: '11px', color: TOKENS.success, margin: '6px 0 0', textAlign: 'center', fontWeight: 500 }}>
                  ✓ {lastSaved.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 자동저장됨
                </p>
              )}
            </>
          )}
        </div>

        {/* 우측 미리보기 */}
        <div style={isWide
          ? { position: 'sticky', top: '20px' }
          : { position: 'static' }
        }>
          <p style={{ fontSize: '11px', color: TOKENS.textMute, fontWeight: 700, marginBottom: '8px' }}>학부모 발송 미리보기</p>

          {/* 스킨 표시 — 학생 개별 스킨 or 선택 스킨 */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E5E7EB', padding: '10px 14px', marginBottom: '10px', boxShadow: SHADOW[1] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#6B7280', margin: 0, letterSpacing: '0.06em' }}><Palette size={10} style={{ verticalAlign: '-1px', marginRight: '3px' }} />리포트 스킨</p>
              {student?.skinColor && (
                <span style={{ fontSize: '9px', fontWeight: 600, color: '#fff', background: TOKENS.info, padding: '2px 8px', borderRadius: '4px' }}>학생 개별 스킨 적용 중</span>
              )}
            </div>
            {student?.skinColor ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F9FAFB', borderRadius: '10px', padding: '8px 10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: student.skinColor, border: '2px solid rgba(0,0,0,0.08)', flexShrink: 0 }}></div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>개별 설정 색상</span>
                <span style={{ fontSize: '10px', color: '#9CA3AF', fontFamily: 'monospace' }}>{student.skinColor}</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {[...(globalSkin ? [globalSkin] : []), ...Object.values(SKINS)].map(sk => (
                  <button
                    key={sk.key}
                    onClick={() => setSelectedSkin(sk.key)}
                    style={{
                      border: `2px solid ${selectedSkin === sk.key ? TOKENS.info : '#E5E7EB'}`,
                      borderRadius: '10px', padding: '7px 4px', cursor: 'pointer',
                      background: selectedSkin === sk.key ? TOKENS.infoBg : '#F9FAFB',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                      fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ width: '100%', height: '18px', borderRadius: '5px', background: sk.dots[0], marginBottom: '2px' }}></div>
                    <span style={{ fontSize: '8px', fontWeight: 700, color: selectedSkin === sk.key ? TOKENS.infoDark : '#6B7280', textAlign: 'center', lineHeight: 1.3 }}>{sk.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ParentCard
            student={student} teacher={teacher}
            attendance={attendance} arrivalTime={arrivalTime}
            homeworkRating={homeworkRating} conceptRating={conceptRating}
            hasTest={hasTest} testName={testName} testScore={testScore}
            textbook={textbook} unit={unit} pages={pages}
            diagnosis={selectedTags}
            teacherNote={aiPolishedNote || teacherNote}
            nextPlan={nextPlan} nextPlanDetail={nextPlanDetail}
            skin={selectedSkin === 'global' && globalSkin ? globalSkin : SKINS[selectedSkin] || SKINS.navy}
          />
        </div>
      </div>

      {/* 학생 등록 모달 */}
      {showStudentModal && (
        <StudentModal onClose={() => setShowStudentModal(false)} onSubmit={handleAddStudent} teachers={teachers} classes={classes} isDirector={isDirector} />
      )}

    </div>
    </>
  );
}

// ============================================================
// 학부모 카드 미리보기
// ============================================================
const AVATAR_BASE = "/avatars";

// 커스텀 컬러 → SKINS 형식으로 변환
export function deriveColorsToSkin(mainHex) {
  const r = parseInt(mainHex.slice(1,3),16);
  const g = parseInt(mainHex.slice(3,5),16);
  const b = parseInt(mainHex.slice(5,7),16);
  const toHex = (r,g,b) => '#'+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
  return {
    headerBg:     `linear-gradient(155deg, ${toHex(r-20,g-20,b-20)}, ${mainHex}, ${toHex(r+30,g+30,b+30)})`,
    headerText:   '#ffffff',
    headerSub:    'rgba(255,255,255,0.85)',
    bodyBg:       '#ffffff',
    cardBg:       toHex(r+150,g+150,b+150),
    cardDarkBg:   mainHex,
    cardText:     toHex(r-60,g-60,b-60),
    cardDarkText: '#ffffff',
    cardSub:      toHex(r+60,g+60,b+60),
    cardDarkSub:  'rgba(255,255,255,0.7)',
    tagBg:        toHex(r+150,g+150,b+150),
    tagText:      toHex(r-40,g-40,b-40),
    tagBorder:    toHex(r+100,g+100,b+100),
    commentBg:    toHex(r+150,g+150,b+150),
    commentBorder: mainHex,
    commentText:  toHex(r-60,g-60,b-60),
    nextBg:       mainHex,
    nextText:     '#ffffff',
    footerText:   toHex(r+80,g+80,b+80),
  };
}

function ParentCard({ student, teacher, attendance, arrivalTime, homeworkRating, conceptRating, hasTest, testName, testScore, textbook, unit, pages, diagnosis, teacherNote, nextPlan, nextPlanDetail, skin }) {
  const today = new Date();
  const dateStr = `${String(today.getMonth() + 1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')} (${'일월화수목금토'[today.getDay()]})`;
  const homeworkPct = toPct(homeworkRating);
  const conceptPct = toPct(conceptRating);

  // 학생 개별 스킨 → 없으면 선택 스킨 → 없으면 기본값
  const studentSkin = student?.skinColor ? deriveColorsToSkin(student.skinColor) : null;
  const s = studentSkin || skin || SKINS.navy;

  if (!student) return (
    <div style={{ background: '#fff', border: `1px dashed #E5E7EB`, borderRadius: '18px', padding: '50px 20px', textAlign: 'center' }}>
      <User size={28} style={{ color: '#D1D5DB', marginBottom: '10px' }} />
      <p style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500, margin: 0 }}>학생을 선택하면<br />학부모 카드가 여기에 만들어집니다</p>
    </div>
  );

  // 텍스트 계층 헬퍼 — 라벨/본문/서브 3단계
  const cardLabel = (text, dark=false) => (
    <p style={{ fontSize: '9px', fontWeight: 800, color: dark ? 'rgba(255,255,255,0.55)' : s.cardSub, letterSpacing: '0.1em', margin: '0 0 5px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", textTransform: 'uppercase' }}>{text}</p>
  );
  const cardValue = (text, dark=false, size='13px') => (
    <p style={{ fontSize: size, fontWeight: 700, color: dark ? '#ffffff' : s.cardText, margin: 0, lineHeight: 1.35, wordBreak: 'keep-all' }}>{text}</p>
  );
  const cardSub = (text, dark=false) => (
    <p style={{ fontSize: '10px', fontWeight: 600, color: dark ? 'rgba(255,255,255,0.65)' : s.cardSub, margin: '3px 0 0' }}>{text}</p>
  );

  return (
    <div style={{ background: s.bodyBg, borderRadius: '18px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>

      {/* 헤더 */}
      <div style={{ background: s.headerBg, padding: '20px 18px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '110px', height: '110px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'absolute', top: '20px', right: '10px', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
          <span style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.18em' }}>교현학원</span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: '20px' }}>{dateStr}</span>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.2em', margin: '0 0 8px' }}>LEARNING REPORT</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            {student.avatar && (
              <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden', flexShrink: 0 }}>
                <img src={`${AVATAR_BASE}/${student.avatar}.png`} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <p style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.5px' }}>{student.name}</p>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', marginBottom: '10px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{student.school}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{teacher?.name || '선생님'} 드림</span>
          </div>
        </div>
      </div>

      {/* 바디 */}
      <div style={{ padding: '14px' }}>

        {/* ★ TEACHER'S NOTE — 상단 배치 (가장 중요한 차별화 요소) */}
        {teacherNote && (
          <div style={{ background: s.commentBg, borderRadius: '14px', padding: '13px 15px', marginBottom: '10px', borderLeft: `3px solid ${s.commentBorder}` }}>
            <p style={{ fontSize: '9px', fontWeight: 800, color: s.cardSub, letterSpacing: '0.14em', margin: '0 0 7px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>TEACHER'S NOTE</p>
            <p style={{ fontSize: '13px', fontWeight: 700, color: s.commentText, margin: 0, lineHeight: 1.9, letterSpacing: '0.01em' }}>{teacherNote}</p>
          </div>
        )}

        {/* 평가 + 출결 그리드 — 이모지 제거, 숫자+텍스트 레이블로 */}
        {(homeworkRating != null || conceptRating != null) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>

            {/* 과제 수행 — 다크 */}
            <div style={{ background: s.cardDarkBg, borderRadius: '14px', padding: '12px 12px' }}>
              {cardLabel('과제 수행', true)}
              {homeworkRating != null ? (
                <>
                  <p style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', margin: '2px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {homeworkPct}<span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '2px', opacity: 0.7 }}>%</span>
                  </p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{ratingLabel(homeworkPct)}</p>
                </>
              ) : <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>미입력</p>}
            </div>

            {/* 개념 이해 — 라이트 */}
            <div style={{ background: s.cardBg, borderRadius: '14px', padding: '12px 12px' }}>
              {cardLabel('개념 이해', false)}
              {conceptRating != null ? (
                <>
                  <p style={{ fontSize: '26px', fontWeight: 800, color: s.cardText, margin: '2px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {conceptPct}<span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '2px', opacity: 0.6 }}>%</span>
                  </p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardSub, margin: 0 }}>{ratingLabel(conceptPct)}</p>
                </>
              ) : <p style={{ fontSize: '12px', color: s.cardSub, margin: 0 }}>미입력</p>}
            </div>

            {/* 출결 — 라이트 */}
            <div style={{ background: s.cardBg, borderRadius: '14px', padding: '12px 12px' }}>
              {cardLabel('출결', false)}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: s.cardSub, flexShrink: 0 }} />
                <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardText, margin: 0 }}>{attendance}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: s.cardSub, flexShrink: 0 }} />
                <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardText, margin: 0 }}>{arrivalTime} 등원</p>
              </div>
            </div>

            {/* 학습 범위 — 다크 */}
            <div style={{ background: s.cardDarkBg, borderRadius: '14px', padding: '12px 12px' }}>
              {cardLabel('학습 범위', true)}
              {/* 교재명 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 9px', marginBottom: '4px' }}>
                <p style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', margin: 0, lineHeight: 1.4, wordBreak: 'keep-all' }}>{textbook || '미입력'}</p>
              </div>
              {/* 구분선 */}
              {(unit || pages) && <div style={{ height: '1px', background: 'rgba(255,255,255,0.12)', margin: '7px 0' }} />}
              {/* 단원 */}
              {unit && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.45)', flexShrink: 0, marginTop: '5px' }} />
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.4, wordBreak: 'keep-all' }}>{unit}</p>
                </div>
              )}
              {/* 범위 */}
              {pages && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.45)', flexShrink: 0, marginTop: '5px' }} />
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.4 }}>{pages}</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* 시험 */}
        {hasTest && testName && (
          <div style={{ background: '#FFFBEB', borderRadius: '14px', padding: '12px 14px', marginBottom: '10px', border: '1.5px solid #F5D76E' }}>
            <p style={{ fontSize: '9px', fontWeight: 800, color: '#B8860B', margin: '0 0 5px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", letterSpacing: '0.1em' }}>TEST RESULT</p>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#7A5500', margin: '0 0 4px' }}>{testName}</p>
            {testScore && (
              <p style={{ fontSize: '26px', fontWeight: 800, color: '#7A5500', margin: 0, fontFamily: "'Pretendard Variable', Pretendard, sans-serif", letterSpacing: '-1px', lineHeight: 1 }}>
                {testScore}<span style={{ fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>점</span>
              </p>
            )}
          </div>
        )}

        {/* 진단 */}
        {diagnosis.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardText, margin: '0 0 8px' }}>진단</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {diagnosis.map((d, idx) => {
                const DIAG_COLOR = {
                  calc:    { label: '⚠ 계산 실수', bg: '#A32D2D' },
                  concept: { label: '⚠ 개념 누락', bg: '#A32D2D' },
                  apply:   { label: '⚠ 응용 부족', bg: '#A32D2D' },
                  time:    { label: '△ 시간 부족', bg: '#8A5A00' },
                  perfect: { label: '✓ 개념 완벽', bg: '#0F6E56' },
                };
                const tagDef = DIAG_COLOR[d.key] || { label: d.key, bg: '#8A5A00' };
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', background: tagDef.bg, color: '#fff', fontSize: '13px', fontWeight: 700, padding: '5px 13px', borderRadius: '20px' }}>
                      {tagDef.label}
                      {(d.unit || d.pages) && (
                        <span style={{ marginLeft: '6px', fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                          {d.unit && `${d.unit}단원`}{d.unit && d.pages ? ' · ' : ''}{d.pages && `${d.pages}p`}
                        </span>
                      )}
                    </span>
                    {d.detail && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', paddingLeft: '4px' }}>
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: tagDef.bg, flexShrink: 0 }} />
                        <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardText, margin: 0, lineHeight: 1.4 }}>{d.detail}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 다음 수업 */}
        {nextPlan && (
          <div style={{ background: s.nextBg, borderRadius: '14px', padding: '12px 14px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, marginRight: '10px' }}>
              <p style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.14em', margin: '0 0 6px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>NEXT CLASS</p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: nextPlanDetail ? '4px' : '0' }}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.55)', flexShrink: 0, marginTop: '5px' }} />
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.4 }}>{nextPlan}</p>
              </div>
              {nextPlanDetail && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.55)', flexShrink: 0, marginTop: '5px' }} />
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', margin: 0, lineHeight: 1.4 }}>{nextPlanDetail}</p>
                </div>
              )}
            </div>
            <div style={{ width: '30px', height: '30px', background: 'rgba(255,255,255,0.15)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '15px', flexShrink: 0 }}>→</div>
          </div>
        )}

        {/* 푸터 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: `1px solid rgba(0,0,0,0.06)` }}>
          <span style={{ fontSize: '9px', fontWeight: 700, color: s.footerText, fontFamily: "'Pretendard Variable', Pretendard, sans-serif", letterSpacing: '0.12em' }}>교현학원</span>
          <span style={{ fontSize: '9px', fontWeight: 500, color: s.footerText, fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>031-707-0591</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 서브 컴포넌트 & 스타일
// ============================================================
// 섹션 위계는 숫자 배지 대신 좌측 4px 컬러 바로 표현 (디자인 토큰 v2 섹션 3).
// number는 기존 호출부 호환을 위해 받기만 하고 렌더링하지 않음.
// badge는 상태 배지 스타일: badgeTone = 'success'(완료) | 'info'(활성) | 'neutral'(기본)
function FormSection({ number, title, badge, badgeTone = 'neutral', children }) {
  const tone = {
    success: { background: TOKENS.success, color: '#fff' },
    info:    { background: TOKENS.info, color: '#fff' },
    neutral: { background: TOKENS.borderLight, color: TOKENS.textSub },
  }[badgeTone];
  return (
    <div style={{ background: '#fff', borderRadius: `${RADIUS2.card}px`, padding: '16px', border: `1px solid #E5E7EB`, boxShadow: SHADOW[1] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ width: '4px', height: '15px', borderRadius: '2px', background: TOKENS.brand, flexShrink: 0 }} />
        <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
        {badge && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: `${RADIUS2.badge}px`, ...tone }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 5px' }}>{children}</p>;
}

function RatingPicker({ label, value, onChange }) {
  const isEmpty = value == null;
  const pct = value ?? 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: 0 }}>{label}</p>
        <span style={{
          fontSize: '12px', fontWeight: 800, padding: '2px 11px', borderRadius: '20px', fontVariantNumeric: 'tabular-nums',
          color: isEmpty ? '#9CA3AF' : TOKENS.infoDark, background: isEmpty ? '#F3F4F6' : TOKENS.infoBg,
        }}>
          {isEmpty ? '미입력' : `${pct}%`}
        </span>
      </div>
      <input
        type="range" min={0} max={100} step={10}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={isEmpty ? '미입력' : `${pct}% (${ratingLabel(pct) || '노력 필요'})`}
        style={{ width: '100%', accentColor: isEmpty ? '#9CA3AF' : TOKENS.info, cursor: 'pointer', display: 'block', height: '44px' }}
      />
    </div>
  );
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
// 선택 토글(chip/toggle)의 활성 상태는 Info 계열 — Primary(전송/저장)와 시각적으로 분리
const chipStyle = (active) => ({
  padding: '6px 12px', fontSize: '12px', fontWeight: active ? 700 : 500,
  borderRadius: `${RADIUS2.chip}px`, border: `1px solid ${active ? TOKENS.info : '#E5E7EB'}`,
  background: active ? TOKENS.infoBg : '#fff', color: active ? TOKENS.infoDark : '#6B7280',
  cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.02em',
});
const tagStyle = (color, active) => {
  const c = { warn: { bg: TOKENS.warnBg, border: TOKENS.warnBorder, text: TOKENS.warnText }, danger: { bg: TOKENS.dangerBg, border: TOKENS.dangerBorder, text: TOKENS.danger }, success: { bg: TOKENS.successBg, border: TOKENS.success, text: TOKENS.successDark } }[color] || {};
  return { padding: '4px 9px', fontSize: '12px', fontWeight: 600, borderRadius: `${RADIUS2.chip}px`, border: `1px solid ${active ? c.border : '#E5E7EB'}`, background: active ? c.bg : '#fff', color: active ? c.text : '#6B7280', cursor: 'pointer', fontFamily: 'inherit' };
};
const toggleStyle = (active) => ({
  flex: 1, padding: '7px', fontSize: '12px', fontWeight: active ? 700 : 500,
  border: 'none', borderRadius: `${RADIUS2.chip}px`, background: active ? '#fff' : 'transparent',
  color: active ? TOKENS.infoDark : '#6B7280', cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
});
const suggestionStyle = { padding: '7px 12px', fontSize: '12px', fontWeight: 500, borderRadius: `${RADIUS2.chip}px`, border: 'none', background: TOKENS.brandLight, color: TOKENS.brand, cursor: 'pointer', fontFamily: 'inherit', minHeight: '32px' };
const aiButtonStyle = (disabled) => ({
  marginTop: '8px', width: '100%', padding: '9px', fontSize: '12px', fontWeight: 700,
  borderRadius: `${RADIUS2.input}px`, border: `1px solid ${disabled ? '#E5E7EB' : TOKENS.success}`,
  background: disabled ? '#F9FAFB' : '#fff', color: disabled ? '#9CA3AF' : TOKENS.success,
  cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: '5px', fontFamily: 'inherit',
});
// 메인 액션(저장/발송) — Primary Navy 전용. padding은 스펙 섹션 5 "Primary 버튼 padding: 16px(수직)/20px(수평)" 그대로
const submitButtonStyle = (valid) => ({
  padding: '16px 20px', fontSize: '14px', fontWeight: 700, borderRadius: `${RADIUS2.input}px`, border: 'none',
  background: valid ? TOKENS.brand : '#E5E7EB', color: valid ? '#fff' : '#9CA3AF', cursor: valid ? 'pointer' : 'not-allowed',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
  fontFamily: 'inherit', boxShadow: valid ? '0 4px 14px rgba(13,45,107,0.28)' : 'none',
});
const addStudentButtonStyle = {
  marginTop: '8px', width: '100%', padding: '10px', fontSize: '13px', fontWeight: 700,
  borderRadius: `${RADIUS2.input}px`, border: `1px dashed ${TOKENS.brand}`, background: TOKENS.brandLight, color: TOKENS.brand,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: '5px', fontFamily: 'inherit',
};

