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
  UserPlus, GraduationCap, Settings, Trash2
} from 'lucide-react';
import { calculateReportPoints } from './growth.js';
import { storage } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
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
          border: 'none', borderRadius: '10px', background: '#0D2D6B',
          color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
        }}>확인</button>
      </div>
    </div>
  );
}

export default function DiagnosticReportInput({
  students = [],
  teachers = [],
  reports = [],
  onSaveStudent = async () => {},
  onSaveTeacher = async () => {},
  onDeleteTeacher = async () => {},
  onSave = async () => {},
  editingReport = null,
  onEditDone = () => {},
}) {
  const isWide = useMediaQuery('(min-width: 901px)');
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showTeacherPanel, setShowTeacherPanel] = useState(false);
  const [selectedSkin, setSelectedSkin] = useState('navy');
  const autoSaveTimer = React.useRef(null);
  const [lastSaved, setLastSaved] = useState(null);

  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const [attendance, setAttendance] = useState('정시');
  const [arrivalTime, setArrivalTime] = useState('15:30');
  const [homeworkRating, setHomeworkRating] = useState(0);
  const [conceptRating, setConceptRating] = useState(0);
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
  const [toast, setToast] = useState(null);
  const [savedReportId, setSavedReportId] = useState(null);
  // 학생 선택 변경 시 헤더에 알림
  React.useEffect(() => {
    if (!studentId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleAutoSave();
    }, 30000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [studentId, teacherNote, homeworkRating, conceptRating, selectedTags, textbook, unit, pages, subject]);

  const handleAutoSave = async () => {
    if (!studentId || saving) return;
    try {
      const reportPayload = {
        ...(editingReport ? { id: editingReport.id } : {}),
        studentId, studentName: student?.name,
        teacherId: teacherId || '', teacherName: teacher?.name || '',
        attendance, arrivalTime,
        homeworkRating: homeworkRating || 0,
        conceptRating: conceptRating || 0,
        hasTest,
        testName: hasTest ? testName : null,
        testScore: hasTest ? testScore : null,
        testRound: hasTest ? testRound : null,
        textbook, subject, unit, pages,
        diagnosis: selectedTags,
        teacherNote: teacherNote || '',
        nextPlan, nextPlanDetail,
        photoUrls: [],
        photoAnalysis: photoAnalysis || null,
      };
      await onSave(reportPayload);
      setLastSaved(new Date());
    } catch (e) {
      console.error('자동저장 오류:', e);
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

  // ── 수정 모드: editingReport가 들어오면 폼 pre-fill ──
  useEffect(() => {
    if (!editingReport) return;
    setStudentId(editingReport.studentId || '');
    setTeacherId(editingReport.teacherId || '');
    setAttendance(editingReport.attendance || '정시');
    setArrivalTime(editingReport.arrivalTime || '15:30');
    setHomeworkRating(editingReport.homeworkRating || 0);
    setConceptRating(editingReport.conceptRating || 0);
    setHasTest(editingReport.hasTest || false);
    setTestName(editingReport.testName || '');
    setTestScore(editingReport.testScore || '');
    setTestRound(editingReport.testRound || '');
    setTextbook(editingReport.textbook || '');
    setSubject(editingReport.subject || '수학');
    setUnit(editingReport.unit || '');
    setPages(editingReport.pages || '');
    setSelectedTags(editingReport.diagnosis || []);
    setTeacherNote(editingReport.teacherNote || '');
    setAiPolishedNote('');
    setNextPlan(editingReport.nextPlan || '');
    setNextPlanDetail(editingReport.nextPlanDetail || '');
    setPhotoAnalysis(editingReport.photoAnalysis || null);

    // 기존 사진 유지 — photoUrls → photos 변환
    if (editingReport.photoUrls?.length > 0) {
      const existingPhotos = editingReport.photoUrls.map(url => ({
        preview: url,
        blob: null,      // 기존 사진은 blob 없음 (이미 Storage에 있음)
        existingUrl: url // 기존 URL 표시
      }));
      setPhotos(existingPhotos);
    } else {
      setPhotos([]);
    }
  }, [editingReport]);

  // 강사 1명이면 자동 선택
  useEffect(() => {
    if (teachers.length === 1 && !teacherId) {
      setTeacherId(teachers[0].id);
    }
  }, [teachers]);

  // 작성 중 이탈 방지 — 데이터 입력 시작 후 탭 닫기/뒤로가기 경고
  const isDirty = !!(studentId || teacherNote || homeworkRating || conceptRating || selectedTags.length);
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
  const isValid = studentId && homeworkRating && conceptRating && teacherId;
  const isReadyToSend = isValid && (teacherNote.trim() || aiPolishedNote.trim()); // 선생님 코멘트까지 있어야 완전한 리포트

  // 학생 등록 — Firebase에 저장
  const handleAddStudent = async (newStudent) => {
    try {
      await onSaveStudent(newStudent);
      setShowStudentModal(false);
    } catch (e) {
      console.error('학생 저장 오류:', e);
      setAlertMessage('학생 저장 중 오류가 발생했습니다.');
    }
  };

  // 강사 등록 — Firebase에 저장
  const handleAddTeacher = async (name) => {
    try {
      await onSaveTeacher({ name });
    } catch (e) {
      console.error('강사 저장 오류:', e);
      setAlertMessage('강사 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteTeacher = async (id) => {
    if (teachers.length <= 1) {
      setAlertMessage('최소 1명의 강사는 등록되어 있어야 합니다.');
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
    if (!teacherNote.trim() || polishing) return;
    setPolishing(true);
    try {
      const diagLabels = { calc: '계산 실수', concept: '개념 누락', apply: '응용 부족', time: '시간 부족', perfect: '개념 완벽' };
      const tagNames = selectedTags.map(t => diagLabels[t.key] || t.key).join(', ');

      // 사진 분석 결과 추출
      let photoContext = '';
      if (photoAnalysis) {
        const wrongs = (photoAnalysis.rawObservations || []).filter(o => o.mark !== 'O');
        const rights = (photoAnalysis.rawObservations || []).filter(o => o.mark === 'O');
        const wrongNums = wrongs.map(o => `${o.num}번`).join(', ');
        photoContext = [
          photoAnalysis.unit && `분석 단원: ${photoAnalysis.unit}`,
          rights.length > 0 && `정답 문제: ${rights.length}개`,
          wrongs.length > 0 && `오답 문제: ${wrongNums}`,
          photoAnalysis.draftComment && `AI 분석 요약: ${photoAnalysis.draftComment}`,
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
      });
      const data = await response.json();
      setAiPolishedNote(data.result);
    } catch (e) {
      console.error('AI 오류:', e);
      showToast('AI 연결에 실패했습니다.', 'error');
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
    setAnalyzingPhoto(true);
    setPhotoError('');
    try {
      const images = photos.map(p => ({ imageBase64: p.base64, mimeType: p.mimeType || 'image/jpeg' }));
      const response = await fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          hintTextbook: textbook, hintUnit: unit, hintSubject: subject,
          mode: modeOverride || 'auto',
        }),
      });
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
      setPhotoError('AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    setAnalyzingPhoto(false);
  };

  // AI 초안 코멘트를 강사 메모에 이어붙이기 (덮어쓰지 않음)
  const appendDraftComment = () => {
    if (!photoAnalysis?.draftComment) return;
    setTeacherNote(prev => prev ? `${prev}\n\n${photoAnalysis.draftComment}` : photoAnalysis.draftComment);
  };

  const removeAllPhotos = () => {
    setPhotos([]);
    photosRef.current = [];
    setPhotoAnalysis(null); setPhotoError('');
    setWrongItems([]);
  };
;

  const handleSubmit = async () => {
    // 단계별 검증
    if (!studentId) return setAlertMessage('학생을 먼저 선택해주세요.');
    if (!teacherId) return setAlertMessage('담당 강사를 선택해주세요.');
    if (!homeworkRating || !conceptRating) return setAlertMessage('과제 수행과 개념 이해 평가를 입력해주세요.');
    if (polishing) return setAlertMessage('AI가 코멘트를 다듬는 중입니다. 완료 후 다시 저장해주세요.');
    if (!teacherNote.trim() && !aiPolishedNote.trim()) return setAlertMessage('선생님 코멘트를 입력해주세요.\n학부모에게 전달되는 핵심 내용입니다.');

    setSaving(true);
    try {
      let photoUrls = [];
      if (photos.length > 0) {
        photoUrls = await Promise.all(photos.map(async (p, i) => {
          // 기존 사진 (blob 없음) → URL 그대로 유지
          if (!p.blob && p.existingUrl) return p.existingUrl;
          // 새로 추가한 사진 → Storage 업로드
          const path = `students/${studentId}/photos/${Date.now()}_${i}.jpg`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, p.blob);
          return await getDownloadURL(storageRef);
        }));
      }

      const reportPayload = {
        ...(editingReport ? { id: editingReport.id } : {}),
        studentId, studentName: student?.name,
        teacherId, teacherName: teacher?.name,
        attendance, arrivalTime,
        homeworkRating, conceptRating,
        hasTest,
        testName: hasTest ? testName : null,
        testScore: hasTest ? testScore : null,
        testRound: hasTest ? testRound : null,
        textbook, subject, unit, pages,
        diagnosis: selectedTags,
        teacherNote: aiPolishedNote || teacherNote,
        nextPlan, nextPlanDetail,
        photoUrls,
        photoAnalysis: photoAnalysis || null,
        wrongItems: wrongItems.length > 0 ? wrongItems : null,
      };
      reportPayload.points = calculateReportPoints(reportPayload);
      const savedId = await onSave(reportPayload);
      setStudentId(''); setHomeworkRating(0); setConceptRating(0);
      setHasTest(false); setTestName(''); setTestScore(''); setTestRound('');
      setTextbook(''); setSubject('수학'); setUnit(''); setPages('');
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
        setHomeworkRating(0); setConceptRating(0);
        showToast('저장 완료! 링크를 복사해서 카카오톡으로 전송하세요.', 'success', savedId);
      }
    } catch (e) {
      console.error('리포트 저장 오류:', e);
      showToast('저장 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
    }
    setSaving(false);
  };

  // 토스트 색상
  const toastColors = {
    success: { bg: '#0F6E56', icon: '✓' },
    error:   { bg: '#8B2020', icon: '✕' },
    warn:    { bg: '#8A5A00', icon: '!' },
    info:    { bg: '#0D2D6B', icon: '📋' },
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
                  style={{ ...inputStyle, padding: '5px 10px', fontSize: '16px', width: 'auto' }}>
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
            <select value={studentId} onChange={async (e) => {
              const newId = e.target.value;

              // 이미 학생이 선택된 상태에서 전환 시 → 자동저장 먼저
              if (studentId && newId !== studentId && !editingReport) {
                if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
                await handleAutoSave();
              }

              setStudentId(newId);

              // 최근 리포트 자동 불러오기
              if (newId && !editingReport) {
                const lastReport = [...reports]
                  .filter(r => r.studentId === newId)
                  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
                if (lastReport) {
                  if (lastReport.textbook) setTextbook(lastReport.textbook);
                  if (lastReport.subject) setSubject(lastReport.subject);
                  if (lastReport.unit) setUnit(lastReport.unit);
                }
                // 새 학생 전환 시 입력 초기화
                setHomeworkRating(0); setConceptRating(0);
                setHasTest(false); setTestScore(''); setTestName(''); setTestRound('');
                setUnit(''); setPages('');
                setTeacherNote(''); setSelectedTags([]);
                setNextPlan(''); setNextPlanDetail('');
                setPhotos([]); setPhotoAnalysis(null);
                setWrongItems([]);
                setLastSaved(null);
              }
            }} style={selectStyle}>
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
                          style={{ ...suggestionStyle, background: testRound === r ? '#0D2D6B' : undefined, color: testRound === r ? '#fff' : undefined, borderColor: testRound === r ? '#0D2D6B' : undefined }}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <FieldLabel>점수</FieldLabel>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="number" value={testScore} onChange={(e) => setTestScore(e.target.value)} placeholder="84"
                        style={{ ...inputStyle, width: '90px', textAlign: 'center' }} />
                      <span style={{ fontSize: '12px', color: TOKENS.textSub, fontWeight: 500 }}>점 / 100점</span>
                      {testRound && <span style={{ fontSize: '11px', fontWeight: 700, color: '#0D2D6B', background: '#EAF0F9', padding: '3px 8px', borderRadius: '4px' }}>{testRound}</span>}
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
                    { label: '과학', color: '#7A4F00' },
                    { label: '국어', color: '#8A2020' },
                    { label: '사회', color: '#4A3080' },
                    { label: '수학', color: '#0D2D6B' },
                    { label: '역사', color: '#1A5C3A' },
                    { label: '영어', color: '#0F6E56' },
                    { label: '기타', color: '#4A4A4A' },
                  ].map(({ label, color }) => (
                    <button key={label} onClick={() => setSubject(label)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 0,
                        padding: 0, border: `1px solid ${subject === label ? color : '#E5E7EB'}`,
                        borderRadius: '8px', cursor: 'pointer', overflow: 'hidden',
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
                  const recentUnits = [];
                  const seen = new Set();
                  const studentReports = [...reports]
                    .filter(r => r.studentId === studentId && r.textbook && r.unit)
                    .sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
                  for (const r of studentReports) {
                    const key = `${r.textbook}|||${r.unit}`;
                    if (!seen.has(key)) {
                      seen.add(key);
                      recentUnits.push({ textbook: r.textbook, unit: r.unit });
                      if (recentUnits.length >= 3) break;
                    }
                  }
                  if (recentUnits.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                      {recentUnits.map((item, i) => (
                        <button key={i} onClick={() => { setTextbook(item.textbook); setUnit(item.unit); }}
                          style={{
                            padding: '4px 10px', borderRadius: '10px', border: '1px solid #E5E7EB',
                            background: (textbook === item.textbook && unit === item.unit) ? '#0D2D6B' : '#F9FAFB',
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
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="예: 3단원 소수의 나눗셈" style={inputStyle} />
                <div style={{ height: '8px' }} />
                <FieldLabel>학습 범위</FieldLabel>
                <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="예: 111, 114, 124쪽 / 24~32쪽" style={inputStyle} />
              </FormSection>

              {/* 5-1. 교재/시험지 사진 분석 (선택) */}
              <FormSection number="5+" title="교재·시험지 사진 분석 (선택)" badge={photoAnalysis ? '분석완료' : (photos.length > 0 ? `${photos.length}장 선택됨` : undefined)}>
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
                        <div key={i} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '3/4', background: '#F3F4F6' }}>
                          <img
                            src={p.preview}
                            alt={`사진 ${i + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          <div className="fallback-label" style={{ display: 'none' }} />
                          <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '6px' }}>{i + 1}</span>
                          <button onClick={() => removeOnePhoto(i)} style={{
                            position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.55)',
                            border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent'
                          }}><X size={14} /></button>
                        </div>
                      ))}
                      {photos.length < MAX_PHOTOS && (
                        <label style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '3/4',
                          border: `1.5px dashed ${TOKENS.border}`, borderRadius: '10px',
                          cursor: 'pointer', color: TOKENS.textMute, background: TOKENS.bgSoft
                        }}>
                          <Plus size={20} />
                          <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                            onChange={(e) => { if (e.target.files?.length) { handlePhotoSelect(e.target.files); e.target.value = ''; } }} />
                        </label>
                      )}
                    </div>
                    <button onClick={removeAllPhotos} style={{ ...suggestionStyle, marginBottom: '10px' }}>전체 지우기</button>
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
                    {photoError && <p style={{ fontSize: '11px', color: TOKENS.danger, marginTop: '8px' }}>{photoError}</p>}
                    {photoAnalysis && (
                      <div style={{ background: TOKENS.successBg, borderRadius: '12px', padding: '12px', marginTop: '4px' }}>
                        {(photoAnalysis.bookOrTest || photoAnalysis.unit || photoAnalysis.pageRange) && (
                          <p style={{ fontSize: '11px', color: TOKENS.success, fontWeight: 700, margin: '0 0 8px' }}>
                            {[photoAnalysis.bookOrTest, photoAnalysis.unit, photoAnalysis.pageRange].filter(Boolean).join(' · ')}
                          </p>
                        )}

                        {/* AI 판정 배지 + 재지정 버튼 */}

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
                                    setPhotoAnalysis(prev => ({
                                      ...prev,
                                      sections: prev.sections.map(s =>
                                        s.sectionType === 'concept'
                                          ? { ...s, problemTypes: s.problemTypes.map((pt, pi) =>
                                              pt.number === p.number
                                                ? { ...pt, result: pt.result === '잘함' ? '약점' : '잘함' }
                                                : pt
                                            )}
                                          : s
                                      )
                                    }));
                                    // wrongItems도 동기화
                                    if (p.result === '잘함') {
                                      setWrongItems(prev => [...prev, { number: p.number, type: p.type, correctRate: '', mark: '수동오답', tags: [], memo: '' }]);
                                    } else {
                                      setWrongItems(prev => prev.filter(w => w.number !== p.number));
                                    }
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
                                <div key={item.number || idx} style={{ border: '1px solid #DC262630', borderRadius: '10px', padding: '10px', marginBottom: '8px', background: '#FFF5F5' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                    <span style={{ background: '#DC2626', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>
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
                                });
                                const data = await res.json();
                                if (data.result) {
                                  setTeacherNote(prev => prev ? `${prev}\n\n${data.result}` : data.result);
                                  showToast('코멘트가 선생님 메모에 추가됐습니다!', 'success');
                                } else {
                                  showToast('코멘트 생성 실패. 다시 시도해주세요.', 'error');
                                }
                              } catch (e) {
                                console.error('코멘트 생성 오류:', e);
                                showToast('코멘트 생성 중 오류가 발생했습니다.', 'error');
                              } finally {
                                setGeneratingComment(false);
                              }
                            }}
                              style={{ width: '100%', padding: '10px', fontSize: '12px', fontWeight: 700, border: 'none', borderRadius: '8px', background: generatingComment ? '#8A93A8' : '#0D2D6B', color: '#fff', cursor: generatingComment ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                              {generatingComment ? '생성 중...' : '✨ 오답 분석 기반 코멘트 생성'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
                    <p style={{ fontSize: '11px', color: TOKENS.warn, fontWeight: 700, margin: '0 0 2px' }}>선택된 진단 상세 입력</p>
                    <p style={{ fontSize: '10px', color: '#8A5A00', margin: '0 0 4px', lineHeight: 1.5 }}>
                      💡 구체적으로 적을수록 원장 보고서에서 바로 확인됩니다<br/>
                      예: <strong>4단원 · 111p · 비례식 문장제 — 식 세우기 단계에서 막힘</strong>
                    </p>
                    {selectedTags.map((tag, idx) => {
                      const tagDef = DIAGNOSIS_TAGS.find(t => t.key === tag.key);
                      return (
                        <div key={idx} style={{ background: '#fff', borderRadius: '10px', padding: '10px' }}>
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

                <FieldLabel>강사 메모 (평소 카톡 톤으로 자유롭게)</FieldLabel>

                <textarea value={teacherNote} onChange={(e) => setTeacherNote(e.target.value)}
                  placeholder="예: 3단원 자릿수 실수 2번, 응용은 시간 부족으로 못 풂. 개념은 알고 있음"
                  rows={3} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
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
                  </div>
                )}
              </FormSection>

              {/* 8. 다음 수업 계획 */}
              <FormSection number="8" title="다음 수업 계획">
                <p style={{ fontSize: '11px', color: '#8A5A00', background: '#FFF8E7', border: '1px solid #F5D76E', borderRadius: '8px', padding: '8px 12px', margin: '0 0 10px', lineHeight: 1.6 }}>
                  💡 오늘 진단된 약점과 연결되는 전략을 적으면 학부모 신뢰도가 높아집니다.<br/>
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
              <button onClick={handleSubmit} disabled={!isValid || saving || polishing} style={{ ...submitButtonStyle(isValid && !saving && !polishing), width: '100%' }}>
                {saving
                  ? <span style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <Send size={15} />} {saving ? '저장 중...' : polishing ? 'AI 다듬는 중...' : '리포트 저장 및 발송 준비'}
              </button>
              {lastSaved && (
                <p style={{ fontSize: '11px', color: '#0F6E56', margin: '6px 0 0', textAlign: 'center', fontWeight: 500 }}>
                  ✓ {lastSaved.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 자동저장됨
                </p>
              )}
            </>
          )}
        </div>

        {/* 우측 미리보기 */}
        <div style={isWide
          ? { position: 'sticky', top: '20px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }
          : { position: 'static' }
        }>
          <p style={{ fontSize: '11px', color: TOKENS.textMute, fontWeight: 700, marginBottom: '8px' }}>학부모 발송 미리보기</p>

          {/* 스킨 표시 — 학생 개별 스킨 or 선택 스킨 */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E5E7EB', padding: '10px 14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#6B7280', margin: 0, letterSpacing: '0.06em' }}>🎨 리포트 스킨</p>
              {student?.skinColor && (
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#185FA5', background: '#E6F1FB', padding: '2px 8px', borderRadius: '6px' }}>학생 개별 스킨 적용 중</span>
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
                {Object.values(SKINS).map(sk => (
                  <button
                    key={sk.key}
                    onClick={() => setSelectedSkin(sk.key)}
                    style={{
                      border: selectedSkin === sk.key ? '2px solid #185FA5' : '2px solid #E5E7EB',
                      borderRadius: '10px', padding: '7px 4px', cursor: 'pointer',
                      background: selectedSkin === sk.key ? '#E6F1FB' : '#F9FAFB',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                      fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ width: '100%', height: '18px', borderRadius: '5px', background: sk.dots[0], marginBottom: '2px' }}></div>
                    <span style={{ fontSize: '8px', fontWeight: 700, color: selectedSkin === sk.key ? '#185FA5' : '#6B7280', textAlign: 'center', lineHeight: 1.3 }}>{sk.name}</span>
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
            skin={SKINS[selectedSkin]}
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
    </>
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
  const [studentType, setStudentType] = useState('new'); // 'new' | 'returning'
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
      studentType,
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

          {/* 학생 유형 토글 */}
          <div style={{ marginBottom: '14px' }}>
            <FieldLabel>학생 구분</FieldLabel>
            <div style={{ display: 'flex', gap: '0', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
              {[
                { key: 'new', label: '🌱 신규생', desc: '처음 등록하는 학생' },
                { key: 'returning', label: '📚 재학생', desc: '기존에 다니던 학생' },
              ].map(({ key, label, desc }) => (
                <button key={key} onClick={() => setStudentType(key)}
                  style={{
                    flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer',
                    background: studentType === key ? '#0D2D6B' : '#fff',
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
          <button onClick={handleSubmit} disabled={!isValid || saving} style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '9px', border: 'none', background: isValid ? '#185FA5' : '#E5E7EB', color: isValid ? '#fff' : '#9CA3AF', cursor: isValid ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit' }}>
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
            <button onClick={handleAdd} disabled={!newName.trim() || saving} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '9px', border: 'none', background: newName.trim() ? '#185FA5' : '#E5E7EB', color: newName.trim() ? '#fff' : '#9CA3AF', cursor: newName.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', flexShrink: 0 }}>
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
  const homework = RATING_LEVELS.find(r => r.level === homeworkRating);
  const concept  = RATING_LEVELS.find(r => r.level === conceptRating);

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
        {(homeworkRating || conceptRating) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>

            {/* 과제 수행 — 다크 */}
            <div style={{ background: s.cardDarkBg, borderRadius: '14px', padding: '12px 12px' }}>
              {cardLabel('과제 수행', true)}
              {homework ? (
                <>
                  <p style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', margin: '2px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {homeworkRating}<span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '2px', opacity: 0.7 }}>/5</span>
                  </p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{homework.label}</p>
                </>
              ) : <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>미입력</p>}
            </div>

            {/* 개념 이해 — 라이트 */}
            <div style={{ background: s.cardBg, borderRadius: '14px', padding: '12px 12px' }}>
              {cardLabel('개념 이해', false)}
              {concept ? (
                <>
                  <p style={{ fontSize: '26px', fontWeight: 800, color: s.cardText, margin: '2px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {conceptRating}<span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '2px', opacity: 0.6 }}>/5</span>
                  </p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: s.cardSub, margin: 0 }}>{concept.label}</p>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: 0 }}>{label}</p>
        <input
          type="number" inputMode="numeric" min={1} max={5} step={1}
          value={value || ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') { onChange(0); return; }
            const n = Math.min(5, Math.max(1, Math.round(Number(raw))));
            if (!Number.isNaN(n)) onChange(n);
          }}
          placeholder="1~5"
          style={{ width: '46px', padding: '3px 4px', fontSize: '13px', textAlign: 'center', border: '1px solid #E5E7EB', borderRadius: '6px', fontFamily: 'inherit', fontWeight: 700, color: '#1A1A1A', outline: 'none' }}
        />
      </div>
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
  width: '100%', padding: '9px 11px', fontSize: '16px',
  border: `1px solid #E5E7EB`, borderRadius: '9px',
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
const suggestionStyle = { padding: '7px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '7px', border: 'none', background: '#E6F1FB', color: '#185FA5', cursor: 'pointer', fontFamily: 'inherit', minHeight: '32px' };
const aiButtonStyle = (disabled) => ({
  marginTop: '8px', width: '100%', padding: '9px', fontSize: '12px', fontWeight: 700,
  borderRadius: '9px', border: `1px solid ${disabled ? '#E5E7EB' : '#0F6E56'}`,
  background: disabled ? '#F9FAFB' : '#fff', color: disabled ? '#9CA3AF' : '#0F6E56',
  cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: '5px', fontFamily: 'inherit',
});
const submitButtonStyle = (valid) => ({
  padding: '14px', fontSize: '14px', fontWeight: 700, borderRadius: '12px', border: 'none',
  background: valid ? '#185FA5' : '#E5E7EB', color: valid ? '#fff' : '#9CA3AF', cursor: valid ? 'pointer' : 'not-allowed',
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

