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
import { useMediaQuery, useEscapeClose, useFocusTrap } from './hooks.js';
import {
  User, Clock,
  FileText, Sparkles, Send, Plus, X, Check,
  UserPlus, GraduationCap, Info, Star, AlertTriangle, Palette
} from 'lucide-react';
import { C, R, RADIUS2, TYPE, SHADOW, textSafeColor } from './tokens.jsx';
import { resolveBookSections } from './photoSections.js';
import { calculateReportPoints, toPct, ratingLabel, kstDay, kstWeekday, getKstWeekRange, isReportSent } from './growth.js';
import { DIAG_LABELS as diagLabels, WRONG_TAGS, WRONG_TAG_LABELS } from './diagnosis.js';
import { findUnitKey, getUnits, getCourses } from './curriculum.js';
import { storage, auth } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { StudentModal } from './views/StudentModal.jsx';

// AI 호출(polish/analyze-photo)은 서버에서 로그인 여부를 검증하므로 매번 최신 ID 토큰을 실어 보냄
async function getAuthHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 파일 내용 해시(SHA-256, hex) — 완전히 같은 사진을 두 번 골랐는지 판별하는 용도.
// crypto.subtle은 보안 컨텍스트(HTTPS/localhost)에서만 동작하므로, 실패하면 null을 돌려주고
// 호출부에서 dedup 없이 그냥 통과시킴 — 이 기능이 안 되더라도 사진 업로드 자체는 막지 않음
async function hashBuffer(buffer) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

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

    // AI용 압축(2200px, 0.88품질) + 썸네일(canvas) 병렬 처리
    // 해상도를 1800→2200px로, 용량 상한을 0.8→1.2MB로 올림 — 문항 번호 옆의 가늘고 짧은
    // 빨간 사선처럼 미세한 채점 표시를 Gemini가 더 잘 보게 하려는 시도(실사용 중 특정 문항의
    // 사선을 계속 놓치는 사례 발견). 5장 기준 최대 6MB(base64 인코딩 후 약 8MB)로, Vercel
    // 바디 제한(10mb, config 참고)에 여유를 두고 맞춤. 정확도 보장은 아니고 완화 시도.
    const [aiFile, thumbDataUrl] = await Promise.all([
      imageCompression(processFile, {
        maxSizeMB: 1.2,
        maxWidthOrHeight: 2200,
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
  text: '#1A1A1A', textSub: '#6B7280', textMute: '#6C7586',
  border: '#E5E7EB', borderLight: '#F3F4F6', bg: '#FFFFFF', bgSoft: '#F9FAFB',
};

// 문항 정렬 — "13" 같은 순수 번호 문항을 먼저 오름차순으로, "유제3"/"서술형2"처럼 글자가 섞인
// 식별자는 그 뒤에 내장된 숫자 기준 오름차순으로 배치. parseInt(a.number)는 "유제3" 같은 문자열 앞에
// 숫자가 없으면 NaN이라 정렬이 통째로 무력화되므로(사진을 찍은 순서 그대로 남아버림), 문자열 어디에 있든
// 숫자를 찾아내 비교한다.
function sortByItemNumber(a, b) {
  const numA = parseInt(String(a.number ?? '').match(/\d+/)?.[0] ?? '0', 10);
  const numB = parseInt(String(b.number ?? '').match(/\d+/)?.[0] ?? '0', 10);
  const isPureA = /^\d+$/.test(String(a.number ?? '').trim());
  const isPureB = /^\d+$/.test(String(b.number ?? '').trim());
  if (isPureA !== isPureB) return isPureA ? -1 : 1;
  return numA - numB;
}

const DIAGNOSIS_TAGS = [
  { key: 'calc',    label: diagLabels.calc,    color: 'warn'    },
  { key: 'concept', label: diagLabels.concept, color: 'warn'    },
  { key: 'apply',   label: diagLabels.apply,   color: 'danger'  },
  { key: 'time',    label: diagLabels.time,    color: 'danger'  },
  { key: 'perfect', label: diagLabels.perfect, color: 'success' },
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
    // 원본 색 2개 — 리포트 문서에 스킨을 저장할 때 이 값만 저장하고,
    // PublicReport가 레터헤드 주조색(main)/포인트색(accent)으로 사용
    main: mainHex, accent,
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
  const panelRef = React.useRef(null);
  useEscapeClose(onClose, !!message);
  useFocusTrap(panelRef, !!message);
  if (!message) return null;
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.45)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={onClose}>
      <div ref={panelRef} style={{
        background: TOKENS.bg, borderRadius: `${RADIUS2.panel}px`, padding: '32px 24px',
        width: '100%', maxWidth: '320px', textAlign: 'center',
        boxShadow: SHADOW[3],
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%',
          background: TOKENS.warnBg, border: `2px solid ${TOKENS.warnBorder}`, color: TOKENS.warnText,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: '24px',
        }}>!</div>
        <p style={{ fontSize: '17px', fontWeight: 700, color: TOKENS.text, margin: '0 0 8px' }}>알림</p>
        <p style={{ fontSize: '14px', color: TOKENS.textSub, margin: '0 0 24px', lineHeight: 1.6 }}>{message}</p>
        <button onClick={onClose} style={{
          width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700,
          border: 'none', borderRadius: `${RADIUS2.input}px`, background: TOKENS.brand,
          color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
        }}>확인</button>
      </div>
    </div>
  );
}

// 채점 사진 라이트박스 위에 AI가 인식한 문항 위치를 클릭 가능한 박스로 겹쳐 보여줌 — 선생님이
// 텍스트 카드만 보고 판단하지 않고 실제 사진과 바로 대조 확인할 수 있게 함. box_2d는 Gemini가
// 돌려주는 0~1000 정규화 좌표라, object-fit:contain으로 렌더된 이미지의 실제 영역(레터박스
// 보정)을 계산해서 그 안에서 좌표를 환산해야 함 — 컨테이너 전체 기준으로 찍으면 어긋남
function PhotoBoxOverlay({ src, items, onToggle }) {
  const imgRef = React.useRef(null);
  const [rect, setRect] = React.useState(null); // 이미지가 실제로 그려진 영역(레터박스 제외), 컨테이너 기준 px

  const recompute = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.clientWidth) return;
    const cw = img.clientWidth, ch = img.clientHeight;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const containerRatio = cw / ch;
    let width, height;
    if (imgRatio > containerRatio) { width = cw; height = cw / imgRatio; }
    else { height = ch; width = ch * imgRatio; }
    setRect({ left: (cw - width) / 2, top: (ch - height) / 2, width, height });
  };

  React.useEffect(() => {
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <img ref={imgRef} src={src} alt="확대된 사진" onLoad={recompute}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '4px', display: 'block' }} />
      {rect && items.map((item) => {
        const [ymin, xmin, ymax, xmax] = item.box_2d;
        const boxColor = item.status === 'wrong' ? '#E53E3E' : '#009652';
        return (
          <div key={item.key} onClick={(e) => { e.stopPropagation(); onToggle(item); }}
            title={`${item.number}번 · 클릭하면 ${item.sourceType === 'calculation' ? '결과에서 제외' : '정답⇄오답 전환'}`}
            style={{
              position: 'absolute', cursor: 'pointer',
              left: `${rect.left + (xmin / 1000) * rect.width}px`,
              top: `${rect.top + (ymin / 1000) * rect.height}px`,
              width: `${((xmax - xmin) / 1000) * rect.width}px`,
              height: `${((ymax - ymin) / 1000) * rect.height}px`,
              border: `2px ${item.confidence === 'low' ? 'dashed' : 'solid'} ${boxColor}`,
              borderRadius: '4px', background: `${boxColor}1A`,
              boxSizing: 'border-box',
            }}>
            <span style={{
              position: 'absolute', top: '-20px', left: '-2px', fontSize: '11px', fontWeight: 700,
              color: '#fff', background: boxColor, padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap',
            }}>{item.number}</span>
          </div>
        );
      })}
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
  onSave = async () => {},
  editingReport = null,
  onEditDone = () => {},
  commentTemplates = [],
  onSaveCommentTemplate = async () => {},
  onDeleteCommentTemplate = async () => {},
  currentTeacherId = null,
  isDirector = false,
  academyName = null,
  academyPhone = null,
  academySubjects = null,
  academyReportMode = 'daily',
  isPlatformAdmin = false,
}) {
  const isWide = useMediaQuery('(min-width: 901px)');
  const [showStudentModal, setShowStudentModal] = useState(false);
  // 스킨 기본값 — 관리>설정의 "학원 기본 스킨" 색상을 따름 (없으면 navy)
  const globalSkin = React.useMemo(() => {
    const c = localStorage.getItem('globalSkinColor');
    return c ? { ...deriveColorsToSkin(c), key: 'global', name: '학원 기본', main: c, accent: null, dots: [c] } : null;
  }, []);
  const [selectedSkin, setSelectedSkin] = useState(globalSkin ? 'global' : 'navy');
  const autoSaveTimer = React.useRef(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [autoSaveError, setAutoSaveError] = useState(false);

  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [curriculumCourseOverride, setCurriculumCourseOverride] = useState(null);
  // 표준 단원표 오버레이 — 예전 인라인 칩 벽(24개 과정 펼침) 방식이 리포트 작성 중에
  // 너무 불편하다는 피드백으로 교체: 폼엔 "찾기" 버튼 한 줄만, 누르면 검색+탐색 오버레이
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [unitPickerSearch, setUnitPickerSearch] = useState('');
  const [unitPickerCourse, setUnitPickerCourse] = useState(null); // 오버레이 안에서 보고 있는 과정

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
  // 주간형(reportType==='weekly') 전용 — 이번 주 열린 리포트 문서 id + 이미 쌓인 세션들.
  // weeklyDraftIdRef는 draftIdRef와 별개(주간형은 한 주 내내 같은 문서를 재사용해야 해서 학생
  // 전환/재선택에도 안 지워지고, "이번 주" 범위 판정이 있어야 함 — 아래 select onChange 참고)
  const weeklyDraftIdRef = React.useRef(null);
  const [weeklySessions, setWeeklySessions] = useState([]);
  const [staleWeeklyDraft, setStaleWeeklyDraft] = useState(null); // 지난주 이전에 발송 안 된 열린 draft(있으면 배너로 안내)
  // 학생 선택 변경 시 헤더에 알림
  React.useEffect(() => {
    if (!studentId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleAutoSave();
    }, 30000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [studentId, teacherNote, homeworkRating, conceptRating, selectedTags, textbook, unit, pages, subject, attendance, arrivalTime, hasTest, testName, testScore, testRound, nextPlan, nextPlanDetail]);

  // 학생만 선택하고 아무것도 입력하지 않아도 30초 뒤 자동저장이 돌아 빈 초안이 생기던 문제 —
  // 실제로 뭔가 입력된 게 있을 때만 자동저장하도록 최소 하나의 필드 확인
  const hasAutoSaveContent = () =>
    teacherNote.trim() || homeworkRating != null || conceptRating != null || selectedTags.length > 0
    || hasTest || textbook.trim() || unit.trim() || nextPlan.trim() || nextPlanDetail.trim() || !!photoAnalysis;

  // 주간형 세션 1건(오늘치) — photoUrls는 일부러 안 넣음(자동저장은 사진을 업로드하지 않으므로,
  // 아래 upsertSessionEntry에서 기존에 저장돼 있던 photoUrls를 실수로 지우지 않게 하기 위함).
  // 실제 사진 업로드는 handleSubmit에서만 일어나고, 그때 photoUrls를 명시적으로 얹어서 덮어씀.
  // 오답이 속한 책 섹션 라벨 — 문제집은 소단원 섹션마다 번호가 01부터 리셋되므로,
  // 저장·코멘트 생성 시 "중단원 마무리하기 01번"처럼 섹션을 붙여야 번호가 안 겹침
  const sectionLabelFor = (w) => (w?.sectionIdx != null && photoAnalysis?.sections?.[w.sectionIdx]?.resolvedSection?.label) || '';
  // 저장 시점에 섹션 라벨을 얹음 — 화면에서 칩으로 수정한 최신 라벨이 반영되도록 저장 직전에 계산
  const enrichedWrongItems = () => wrongItems.map(w => ({ ...w, section: sectionLabelFor(w) || null }));
  // AI가 놓친 문항 직접 추가 — photoIndex를 지정하면 그 사진 카드 밑에 바로 붙어서 보이고,
  // 안 지정하면(사진 구분이 없는 레거시 데이터) 맨 아래 공용 목록에 들어감. 사진이 여러 장일 때
  // photoIndex 없이 추가하면 어느 사진 문항인지 알 수 없어져서, 사진별 버튼에서 항상 넘겨줌
  const addMissedWrongItem = (photoIndex) => {
    const number = window.prompt('AI가 놓친 오답 문항의 번호를 입력해주세요 (예: 03)');
    if (!number?.trim()) return;
    const type = window.prompt('이 문항은 어떤 유형/내용인가요? (간단히)') || '';
    // sectionIdx는 일부러 안 넣음 — Firestore updateDoc은 undefined 필드값을 거부하고
    // (실제로 "Unsupported field value: undefined" 저장 오류로 이어졌던 버그), 키 자체를
    // 생략해도 이후 비교 코드(w.sectionIdx === item.sectionIdx)는 어차피 undefined로 읽힘
    setWrongItems(prev => [...prev, {
      number: number.trim(), type: type.trim(), correctRate: '', mark: '수동오답',
      confidence: 'high', tags: [], memo: '',
      ...(photoIndex != null ? { photoIndex } : {}),
    }]);
  };
  // AI가 잘못 포함시킨 문항 완전 제외 — 예: 교재가 이미 풀어준 예제인데 학생이 검산하며 남긴
  // 필기를 채점 마크로 오인해 별도 문항으로 잡은 경우("확인N"만 진짜 학생 문항이고 "N"은
  // 선생님이 같이 푼 문제라 평가에서 빼고 싶은 경우 등). 정답↔오답 토글과 달리 행 자체를
  // problemTypes/weakDetail에서 지우고, 남아있던 wrongItems 항목도 같이 정리
  const removeAnalyzedItem = (si, number) => {
    if (!window.confirm(`${number}번 문항을 결과에서 완전히 제외할까요?\n(교재 예제, 선생님과 같이 푼 문제 등 학생 채점 대상이 아닐 때 사용)`)) return;
    setPhotoAnalysis(prev => ({
      ...prev,
      sections: prev.sections.map((s, sIdx) => sIdx !== si ? s : {
        ...s,
        problemTypes: (s.problemTypes || []).filter(pt => pt.number !== number),
        weakDetail: (s.weakDetail || []).filter(pt => pt.number !== number),
      }),
    }));
    setWrongItems(prev => prev.filter(w => !(w.number === number && w.sectionIdx === si)));
  };

  // concept 섹션 문항의 정답⇄오답 토글 — 오답 카드의 버튼과 사진 위 박스 오버레이(클릭) 둘 다
  // 이 함수 하나만 호출하게 해서, {number, sectionIdx} 매칭 로직이 두 군데로 갈라지는(그래서
  // 한쪽만 고치고 다른 쪽을 안 고쳐서 다시 버그가 나는) 일을 방지
  const toggleProblemResult = (si, p) => {
    let becameWrong = false;
    setPhotoAnalysis(prev => ({
      ...prev,
      sections: prev.sections.map((s, sIdx) =>
        sIdx === si
          ? { ...s, problemTypes: s.problemTypes.map((pt) => {
              if (pt.number !== p.number) return pt;
              const newResult = pt.result === '잘함' ? '약점' : '잘함';
              becameWrong = newResult === '약점';
              return { ...pt, result: newResult };
            }) }
          : s
      )
    }));
    setWrongItems(prev => {
      const exists = prev.some(w => w.number === p.number && w.sectionIdx === si);
      if (becameWrong && !exists) {
        return [...prev, { number: p.number, sectionIdx: si, type: p.type, correctRate: '', mark: '수동오답', tags: [], memo: '' }];
      }
      if (!becameWrong && exists) {
        return prev.filter(w => !(w.number === p.number && w.sectionIdx === si));
      }
      return prev;
    });
  };

  // 사진 위 박스 오버레이용 — box_2d가 있는 항목만 그 사진(photoIndex) 기준으로 모음.
  // calculation 섹션 오답은 wrongItems에서, concept 섹션은 photoAnalysis.sections에서 옴 —
  // 두 출처가 서로 다른 배열이라 여기서 한 번에 합쳐서 오버레이가 출처를 신경 안 쓰게 함.
  //
  // box_2d는 Gemini 응답을 서버에서 검증 없이 그대로 통과시킨 값이라 형태를 신뢰할 수 없다 —
  // 숫자 4개 배열이 아니라 객체({ymin:...})나 문자열, 길이가 다른 배열로 오는 경우가 실제로
  // 있었고, 그러면 오버레이의 [ymin,xmin,ymax,xmax] 구조분해가 TypeError를 던져 사진 확대
  // 순간 화면 전체가 크래시했다(에러 경계까지 올라감). 형태 검증을 이 한 곳에서만 하고,
  // 통과 못 한 항목은 박스만 조용히 생략한다 — 판정 자체는 텍스트 카드로 그대로 확인 가능.
  const isValidBox = (b) => Array.isArray(b) && b.length === 4 && b.every(n => Number.isFinite(n));
  const getBoxItemsForPhoto = (pi) => {
    const fromCalculation = wrongItems
      .filter(w => w.photoIndex === pi && isValidBox(w.box_2d))
      .map(w => ({
        key: `calc-${w.sectionIdx ?? 'x'}-${w.number}`, box_2d: w.box_2d,
        number: w.number, sectionIdx: w.sectionIdx, status: 'wrong',
        confidence: w.confidence, sourceType: 'calculation',
      }));
    const fromConcept = (photoAnalysis?.sections || [])
      .map((s, si) => ({ s, si }))
      .filter(({ s }) => s.sectionType === 'concept' && (s.photoIndex ?? 0) === pi)
      .flatMap(({ s, si }) => (s.problemTypes || [])
        .filter(p => isValidBox(p.box_2d))
        .map(p => ({
          key: `concept-${si}-${p.number}`, box_2d: p.box_2d,
          number: p.number, sectionIdx: si, status: p.result === '잘함' ? 'correct' : 'wrong',
          confidence: p.confidence, sourceType: 'concept', p,
        })));
    return [...fromCalculation, ...fromConcept];
  };

  // 박스 클릭 → 출처에 맞는 기존 핸들러 그대로 호출(제외 vs 토글, 로직 중복 없음)
  const handleBoxToggle = (item) => {
    if (item.sourceType === 'calculation') removeAnalyzedItem(item.sectionIdx, item.number);
    else toggleProblemResult(item.sectionIdx, item.p);
  };

  const buildSessionEntry = () => ({
    date: kstDay(Date.now() / 1000),
    attendance, arrivalTime,
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
    wrongItems: wrongItems.length > 0 ? enrichedWrongItems() : null,
  });
  const upsertSessionEntry = (existingSessions, entry) => {
    const idx = existingSessions.findIndex(s => s.date === entry.date);
    if (idx === -1) return [...existingSessions, entry];
    const merged = [...existingSessions];
    merged[idx] = { ...existingSessions[idx], ...entry };
    return merged;
  };

  const handleAutoSave = async () => {
    if (!studentId || saving || !hasAutoSaveContent()) return;
    try {
      if (effectiveReportMode === 'weekly' && !editingReport) {
        const updatedSessions = upsertSessionEntry(weeklySessions, buildSessionEntry());
        const reportPayload = {
          ...(weeklyDraftIdRef.current ? { id: weeklyDraftIdRef.current } : {}),
          studentId, studentName: student?.name,
          teacherId: teacherId || '', teacherName: teacher?.name || '',
          reportType: 'weekly',
          sessions: updatedSessions,
          isDraft: true, // 원장이 검토 화면에서 발송할 때만 false로 바뀜
        };
        const savedId = await onSave(reportPayload);
        if (savedId && !weeklyDraftIdRef.current) weeklyDraftIdRef.current = savedId;
        setWeeklySessions(updatedSessions);
        setLastSaved(new Date());
        setAutoSaveError(false);
        return;
      }

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
  // 사진 분석은 건당 크레딧이 나가는 유료 호출이라, 이번 리포트(같은 학생/세션)에서 이미
  // 한 번 성공적으로 차감됐는지 추적 — 사진을 지우고 새로 올려도(photoAnalysis는 초기화되지만)
  // 이 플래그는 유지해서 재분석 시 "크레딧 또 나간다" 경고를 띄울 수 있게 함. 학생 전환/새
  // 리포트 시작(편집 대상이 바뀔 때)에만 리셋됨.
  const [hasChargedAnalysis, setHasChargedAnalysis] = useState(false);
  const [photoContentType, setPhotoContentType] = useState(''); // '숙제' | '테스트' | '기타' — AI 코멘트 문장 시작을 이 사진이 뭔지에 맞춰 자연스럽게 만들기 위함

  // "지난 수업 값 불러옴" — 학생 선택 시 자동 적용되는 프리필의 스냅샷 + on/off 상태.
  // 배지 클릭으로 해제/재적용 토글(결정 5: 버튼이 아니라 상태 배지). 스냅샷이 null이면
  // 그 학생의 첫 수업이라는 뜻이라 배지 자체를 숨김
  const [lastValuesSnapshot, setLastValuesSnapshot] = useState(null); // { textbook, unit, pages } | null
  const [lastValuesApplied, setLastValuesApplied] = useState(true);

  // 1d 선택 그룹(사진 분석/진단/테스트) 접기 상태 — 기본 접힘, 접힌 줄에는 상태 텍스트만 표시
  const [optOpen, setOptOpen] = useState({ photo: false, diag: false, test: false });
  // 학생을 바꾸면 다시 접힘 — 단, 수정 모드 진입은 editingReport 설정 후 한 사이클 뒤에
  // studentId가 따라 바뀌는 순서라, 여기서 무조건 접으면 아래 자동 펼침을 도로 덮어씀.
  // 수정 모드일 땐 리셋을 건너뛴다(수정 종료 후 학생을 새로 고르면 editingReport가 null이라 정상 리셋)
  useEffect(() => {
    if (editingReport) return;
    setOptOpen({ photo: false, diag: false, test: false });
  }, [studentId]);
  // 수정 모드로 열면 내용이 이미 있는 섹션만 자동으로 펼침
  useEffect(() => {
    if (!editingReport) return;
    setOptOpen({
      photo: (editingReport.photoUrls || []).length > 0 || !!editingReport.photoAnalysis,
      diag: (editingReport.diagnosis || []).length > 0,
      test: !!editingReport.hasTest,
    });
  }, [editingReport]);
  // 자동저장 draft 복원 등으로 분석 결과가 생기면 사진 섹션을 펼쳐서 바로 보이게
  useEffect(() => { if (photoAnalysis) setOptOpen(p => (p.photo ? p : { ...p, photo: true })); }, [photoAnalysis]);
  const [wrongItems, setWrongItems] = useState([]);
  const [alertMessage, setAlertMessage] = useState('');
  const [photoError, setPhotoError] = useState('');
  // 사진 확대 보기 — window.open(dataUrl)로 새 탭을 띄우면 최신 Chrome이 data: URL의
  // 최상위 탐색을 보안상 막아 백지 탭만 뜨는 문제가 있어(팝업 차단 위험도 별개로 있음),
  // 새 탭 대신 앱 안에서 원본 크기로 보여주는 라이트박스로 대체
  const [zoomedPhoto, setZoomedPhoto] = useState(null); // { src, photoIndex } | null — photoIndex는 박스 오버레이가 그 사진에 해당하는 항목만 골라내는 데 씀
  useEscapeClose(() => setZoomedPhoto(null), !!zoomedPhoto);
  // AI가 문항별로 무엇을 보고 어떻게 판단했는지(rawObservations) — 평소엔 접어두고, 결과가
  // 이상할 때(예: 문항이 빠짐) 펼쳐서 AI가 그 번호를 아예 검토했는지, 왜 뺐는지 바로 확인용
  const [showRawObservations, setShowRawObservations] = useState(false);
  // 사진 분석 결과 화면의 "이 화면 사용법" 패널 — 처음엔 펼쳐서 보여주고, 한 번이라도
  // 접으면 그 브라우저에서는 계속 접힌 채로 시작(다시 펼치는 건 언제든 가능, 완전히
  // 숨기진 않음 — 매번 스쳐 지나가는 게 익숙해진 선생님한텐 방해될 수 있어서)
  // 채점 모델 A/B 비교용 — 플랫폼 관리자에게만 노출되는 실험 장치. 빈 문자열이면 서버 기본값
  // (환경변수 GEMINI_ANALYZE_MODEL, 미설정 시 api/analyze-photo.js의 DEFAULT_MODEL)을 그대로 쓴다.
  // 기본값을 여기 적어두면 서버만 바뀌었을 때 조용히 거짓말이 되므로 파일 이름만 가리킨다.
  // 서버도 화이트리스트로 한 번 더 거르므로 여기 값이 잘못돼도 임의 모델이 호출되지는 않음.
  const ANALYZE_MODELS = [
    { id: '', label: '기본값 (서버 설정)' },
    { id: 'gemini-3.6-flash', label: '3.6 Flash (현재 기본)' },
    { id: 'gemini-2.5-pro', label: '2.5 Pro (직전 기본)' },
    { id: 'gemini-3.5-flash', label: '3.5 Flash' },
    { id: 'gemini-2.5-flash', label: '2.5 Flash' },
    { id: 'gemini-3.1-pro-preview', label: '3.1 Pro (프리뷰)' },
  ];
  const [analyzeModel, setAnalyzeModel] = useState(() => {
    try { return localStorage.getItem('analyzeModelOverride') || ''; } catch { return ''; }
  });
  const [lastAnalyzeMeta, setLastAnalyzeMeta] = useState(null); // { model, elapsedMs, usage }
  // 1M 토큰당 USD (200k 토큰 이하 구간). 캐시된 입력은 단가가 달라서 따로 계산하지만,
  // 실측상 실사용에서는 캐시가 거의 안 잡힌다(측정값 전부 "캐시 0" — CLAUDE.md "실측 원가" 참고).
  // 그래도 분기를 남겨두는 건, 나중에 명시적 캐싱을 붙이면 이 계산이 바로 맞아떨어지기 때문.
  const MODEL_PRICING = {
    'gemini-2.5-pro': { in: 1.25, cached: 0.125, out: 10.00 },
    'gemini-2.5-flash': { in: 0.30, cached: 0.03, out: 2.50 },
    'gemini-3.5-flash': { in: 1.50, cached: 0.15, out: 9.00 },
    'gemini-3.6-flash': { in: 1.50, cached: 0.15, out: 7.50 },
    'gemini-3.1-pro-preview': { in: 2.00, cached: 0.20, out: 12.00 },
  };
  const estimateCostUsd = (meta) => {
    const p = MODEL_PRICING[meta?.model];
    const u = meta?.usage;
    if (!p || !u) return null;
    const fresh = Math.max(0, u.promptTokens - u.cachedTokens);
    return (fresh * p.in + u.cachedTokens * p.cached + u.outputTokens * p.out) / 1e6;
  };
  const [photoGuideOpen, setPhotoGuideOpen] = useState(() => localStorage.getItem('photoGuideCollapsed') !== '1');
  const togglePhotoGuide = () => setPhotoGuideOpen(prev => {
    const next = !prev;
    localStorage.setItem('photoGuideCollapsed', next ? '0' : '1');
    return next;
  });
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
    if (!editingReport) { setHasChargedAnalysis(false); return; }
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
    setCurriculumCourseOverride(null); setUnitPickerOpen(false); setUnitPickerCourse(null);
    setUnit(editingReport.unit || '');
    setPages(editingReport.pages || '');
    setSelectedTags(editingReport.diagnosis || []);
    setTeacherNote(editingReport.teacherNote || '');
    setAiPolishedNote('');
    setNextPlan(editingReport.nextPlan || '');
    setNextPlanDetail(editingReport.nextPlanDetail || '');
    setPhotoAnalysis(editingReport.photoAnalysis || null);
    setWrongItems(editingReport.wrongItems || []);
    setHasChargedAnalysis(false);
    // 저장돼 있던 스킨 복원 — 안 하면 수정 후 재저장 때 픽커 기본값(navy)으로 덮여 스킨이 날아감
    setSelectedSkin(editingReport.skin?.key && SKINS[editingReport.skin.key] ? editingReport.skin.key
      : editingReport.skin?.key === 'global' && globalSkin ? 'global' : 'navy');

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
  // 반이 개별적으로 설정돼 있으면 그걸 우선, 없으면 학원 기본값. 단, 기존 리포트를 수정 중일
  // 때는(기록보관소 "수정" 등) 지금 설정이 아니라 그 리포트가 저장된 당시의 reportType을 그대로
  // 따름(학원 설정이 나중에 바뀌어도 이미 만든 리포트의 성격은 안 바뀌어야 함) — 그리고 아래
  // "이번 주 세션 찾기/upsert" 로직 자체는 editingReport가 있을 땐 관여하지 않고(주간 리포트를
  // 기록보관소에서 직접 수정할 땐 세션 캡처가 아니라 최종본 필드를 그대로 고치는 기존 방식 사용),
  // 오직 학생 선택으로 새로 들어오는 라이브 작성 흐름에서만 세션 upsert가 일어남
  const effectiveReportMode = editingReport
    ? (editingReport.reportType || 'daily')
    : (student?.reportMode || classes.find(c => c.id === student?.classId)?.reportMode || academyReportMode || 'daily');

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
  // 결석이면 평가·오늘 학습·사진 분석을 비활성화하고 저장 필수 조건에서 평가를 제외
  // (1d 결정사항 6 — 결석인데 개념 이해도 입력을 요구하던 기존 동작이 오히려 이상했음)
  const isAbsent = attendance === '결석';
  // teacherNote는 handleSubmit의 기존 검증("선생님 코멘트를 입력해주세요")이 이미 필수로
  // 막고 있었음 — 버튼 활성 색(isValid)과 실제 차단 조건이 어긋나지 않게 여기도 포함
  const isValid = studentId && teacherId && teacherNote.trim() && (isAbsent || (homeworkRating != null && conceptRating != null));

  // 1d 네이비 헤더의 "기본 항목 4칸" 진행 바 — 표시용이며 저장 차단 조건은 handleSubmit 검증이 전부
  // (결정사항 1 확정: 오늘 학습만 저장 비차단, 등원·평가·한 마디는 기존대로 저장 필수)
  const requiredSteps = [
    { label: '등원', done: !!attendance },
    { label: '평가', done: isAbsent || (homeworkRating != null && conceptRating != null) },
    { label: '오늘 학습', done: isAbsent || !!(textbook.trim() && pages.trim()) },
    { label: '한 마디', done: !!teacherNote.trim() },
  ];
  const requiredDone = requiredSteps.filter(s => s.done).length;

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
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({
          note: teacherNote,
          studentName: student?.name || '',
          textbook: textbook || '',
          unit: unit || '',
          diagTags: tagNames || '',
          photoContext: photoContext || '',
          contentType: photoContentType || '',
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
          const hash = await hashBuffer(buffer);
          const blob = new Blob([buffer], { type: file.type || 'image/jpeg' });
          return { file: new File([blob], file.name || 'photo.jpg', { type: file.type || 'image/jpeg' }), hash };
        } catch (e) {
          console.warn('파일 버퍼링 실패, 원본 사용:', e);
          return { file, hash: null };
        }
      })
    );

    // 중복 사진 걸러내기 — 이미 추가된 사진 및 이번에 함께 고른 파일들 사이에서 내용이 완전히
    // 같은 파일(SHA-256 해시 동일)은 건너뜀. 같은 페이지를 실수로 두 번 고르면 AI가 각각
    // 독립적으로 분석해 오답 문항이 조용히 2배로 기록되는 문제가 있어서 업로드 단계에서 미리 차단.
    // 해시 계산이 안 되는 환경(구형 브라우저 등)은 dedup 없이 그냥 통과시킴(업로드 자체는 안 막음)
    const existingHashes = new Set(photosRef.current.map(p => p.hash).filter(Boolean));
    const seenInBatch = new Set();
    let dupCount = 0;
    const deduped = bufferedFiles.filter(({ hash }) => {
      if (!hash) return true;
      if (existingHashes.has(hash) || seenInBatch.has(hash)) { dupCount++; return false; }
      seenInBatch.add(hash);
      return true;
    });
    if (dupCount > 0) {
      showToast(`이미 추가된 사진과 완전히 같은 파일 ${dupCount}장은 건너뛰었어요`, 'info');
    }
    if (deduped.length === 0) return;

    showToast(`사진 ${deduped.length}장 압축 중...`, 'info');

    let okCount = 0;
    let failCount = 0;
    for (const { file, hash } of deduped) {
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
          hash,
        };
        photosRef.current = [...photosRef.current, newPhoto];
        setPhotos(prev => [...prev, newPhoto]);
        okCount++;
      } catch (e) {
        const msg = e?.message || e?.toString() || '알 수 없는 오류';
        console.error('사진 처리 오류:', msg, e);
        setPhotoError(`사진 처리 실패: ${msg}`);
        showToast(`사진 처리 실패: ${msg}`, 'error');
        failCount++;
      }
    }
    // 전부 실패했는데도 성공 토스트가 에러 토스트를 덮어쓰던 문제 — 실제 성공 건수로 분기
    if (okCount > 0) {
      showToast(failCount > 0 ? `사진 ${okCount}장 준비 완료 (${failCount}장 실패)` : '사진 준비 완료!', failCount > 0 ? 'info' : 'success');
    }
  };

  const removeOnePhoto = (idx) => {
    // 사진 분석 결과가 이미 있으면(오답 태그/메모까지 입력했을 수 있음) 확인 없이 지우면
    // 그 작업이 통째로 날아감 — 재분석 버튼과 동일하게 한 번 확인. 이미 크레딧이 나간 분석이면
    // (사진 지우고 다시 올려서 재분석하면 또 차감된다는 걸) 여기서 미리 크게 알려줌
    if (photoAnalysis && !window.confirm(
      hasChargedAnalysis
        ? '이 사진을 지우면 지금까지의 사진 분석 결과와 오답 태그/메모가 모두 초기화돼요.\n\n⚠️ 새 사진으로 다시 분석하면 분석 1회가 더 차감돼요. 지울까요?'
        : '이 사진을 지우면 지금까지의 사진 분석 결과와 오답 태그/메모가 모두 초기화됩니다. 지울까요?'
    )) return;
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
    // 사진 분석은 건당 크레딧이 나가는 호출 — 이 리포트에서 이미 한 번 성공해서 차감됐다면
    // (사진을 지우고 새로 올렸어도 이 세션에서 재분석하는 거라면) 한 번 더 크레딧이 나간다는 걸
    // 분명히 알려주고 확인받음. 다듬기(코멘트 생성/학부모 톤)는 여기 안 걸림 — 무제한 무료.
    if (hasChargedAnalysis && !window.confirm('사진을 다시 분석하면 분석 1회가 더 차감돼요. 계속할까요?')) {
      return;
    }
    setAnalyzingPhoto(true);
    setPhotoError('');
    try {
      const images = analyzable.map(p => ({ imageBase64: p.base64, mimeType: p.mimeType || 'image/jpeg' }));
      const response = await fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({
          images,
          hintTextbook: textbook, hintUnit: unit, hintSubject: subject,
          mode: modeOverride || 'auto',
          // 관리자만 유효 — 서버가 플랫폼 관리자 여부를 다시 확인하고 아니면 기본값을 쓴다
          ...(analyzeModel ? { model: analyzeModel } : {}),
        }),
        // 서버(api/analyze-photo.js)의 maxDuration이 60초인데 여기까지 60초로 잡으면, 업로드
        // (사진 5장이면 base64로 8MB에 육박)와 응답 수신까지 그 안에 다 들어가야 해서 느린
        // 분석에서는 클라이언트가 항상 먼저 포기한다 — 서버가 결과나 안내 메시지를 정상적으로
        // 만들어 보내도 사용자에겐 "시간 초과"만 뜨던 원인. 서버 한도보다 넉넉히 크게 잡아
        // 서버가 내려주는 응답(성공이든 실패 안내든)을 실제로 받아볼 수 있게 함.
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error(`서버 오류 (${response.status})`);
      const data = await response.json();
      if (data.error) {
        setPhotoError(data.error);
        // 직전 성공의 측정값을 남겨두면 모델 A 성공 → 모델 B 실패 시 화면엔 여전히 A의
        // 속도·비용이 떠 있어서, A/B 비교를 엉뚱한 숫자로 하게 된다
        setLastAnalyzeMeta(null);
      } else {
        setHasChargedAnalysis(true);
        setLastAnalyzeMeta(data.meta || null);
        // 책 섹션 확정(쪽번호 정렬 → 번호 퍼즐 → 순서 상속)을 섹션에 주입 — photoAnalysis에
        // 같이 저장되므로 리포트 문서에도 따라가고, 수정 모드에서 다시 열어도 유지됨
        const resolvedList = resolveBookSections(data.sections || []);
        const enriched = {
          ...data,
          sections: (data.sections || []).map((s, i) => ({ ...s, resolvedSection: resolvedList[i] })),
        };
        setPhotoAnalysis(enriched);
        if (data.wrongItems?.length > 0) {
          // data.wrongItems는 섹션 구분 없는 전체 요약이라, 어느 섹션의 항목인지 찾아서
          // sectionIdx를 붙여둬야 이후 섹션별 토글/태그 UI가 올바른 섹션과 매칭됨.
          // 같은 번호가 여러 섹션에 있을 수 있으므로(책 섹션마다 01부터 리셋) photoIndex가
          // 있으면 같은 사진의 섹션만 후보로 삼는다. concept 섹션을 먼저 찾고(체크리스트 행
          // 인라인 표시와 연결), 없으면 모의고사 등 나머지 섹션에서도 찾는다.
          const samePhoto = (s, item) => item.photoIndex == null || s.photoIndex == null || s.photoIndex === item.photoIndex;
          setWrongItems(data.wrongItems.map(item => {
            let sectionIdx = enriched.sections.findIndex(s =>
              s.sectionType === 'concept' && samePhoto(s, item) && (s.problemTypes || []).some(pt => pt.number === item.number && pt.result === '약점')
            );
            if (sectionIdx < 0) {
              sectionIdx = enriched.sections.findIndex(s =>
                samePhoto(s, item) && (
                  (s.problemTypes || []).some(pt => pt.number === item.number && pt.result === '약점')
                  || (s.weakDetail || []).some(pt => pt.number === item.number)
                )
              );
            }
            // sectionIdx가 안 잡히면 undefined를 명시적으로 넣지 않고 키 자체를 생략함 —
            // Firestore updateDoc이 undefined 필드값을 거부해 저장 오류로 이어졌던 버그
            const { sectionIdx: _drop, ...itemRest } = item;
            return { ...itemRest, ...(sectionIdx >= 0 ? { sectionIdx } : {}), tags: [], memo: '' };
          }));
        } else {
          setWrongItems([]);
        }
      }
    } catch (e) {
      console.error('사진 분석 오류:', e);
      // 사진 장수는 분석 시간에 거의 영향이 없음(사진별 병렬 호출이라 전체 시간이 "가장 느린
      // 한 장"에 수렴 — 실측: 5장 11.0초 vs 1장 12.9초). 그래서 "장수를 줄이라"를 1순위 조치로
      // 안내하지 않고, 일시적 지연일 가능성이 높으니 재시도를 먼저 권한다. 다만 업로드 용량은
      // 장수에 비례하므로(5장이면 8MB 육박) 느린 회선에서 반복 실패할 때의 차선책으로는 남겨둠
      // "차감 안 됨"을 단정하지 않는 이유: 서버는 분석을 다 끝내고 차감까지 한 뒤 응답만
      // 전달되지 못했을 수도 있다(드물지만 가능). 돈에 관한 문구라 확신 대신 확인 경로를 안내함
      setPhotoError(e.name === 'TimeoutError' ? '분석 시간이 초과됐습니다. 잠시 후 다시 시도해주세요. 계속 실패하면 사진을 나눠서 올려보세요. (대부분 크레딧이 차감되지 않지만, 설정 화면에서 잔여 횟수를 확인하실 수 있어요)' : 'AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    setAnalyzingPhoto(false);
  };

  const removeAllPhotos = () => {
    setPhotos([]);
    photosRef.current = [];
    setPhotoAnalysis(null); setPhotoError('');
    setWrongItems([]);
    setHasChargedAnalysis(false);
  };

  // "전체 지우기" 버튼 전용 — 이미 크레딧이 나간 분석이 있으면 지우기 전에 한 번 더 크게 확인
  const confirmRemoveAllPhotos = () => {
    if (hasChargedAnalysis && !window.confirm(
      '지금까지의 사진 분석 결과와 오답 태그/메모가 모두 초기화돼요.\n\n⚠️ 새 사진으로 다시 분석하면 분석 1회가 더 차감돼요. 전체 지울까요?'
    )) return;
    removeAllPhotos();
  };

  const handleSubmit = async () => {
    // 단계별 검증
    if (!studentId) return setAlertMessage('학생을 먼저 선택해주세요.');
    if (!teacherId) return setAlertMessage('담당 강사를 선택해주세요.');
    if (!isAbsent && (homeworkRating == null || conceptRating == null)) return setAlertMessage('과제 수행과 개념 이해 평가를 입력해주세요.');
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

      if (effectiveReportMode === 'weekly' && !editingReport) {
        const updatedSessions = upsertSessionEntry(weeklySessions, { ...buildSessionEntry(), photoUrls });
        const reportPayload = {
          ...(weeklyDraftIdRef.current ? { id: weeklyDraftIdRef.current } : {}),
          studentId, studentName: student?.name,
          teacherId, teacherName: teacher?.name,
          reportType: 'weekly',
          sessions: updatedSessions,
          isDraft: true, // 원장이 검토 화면에서 발송할 때만 false로 바뀜 — 여기선 세션 저장만
        };
        await onSave(reportPayload);
        weeklyDraftIdRef.current = null;
        setWeeklySessions([]); setStaleWeeklyDraft(null);
        setHomeworkRating(null); setConceptRating(null);
        setHasTest(false); setTestName(''); setTestScore(''); setTestRound('');
        setCurriculumCourseOverride(null); setUnitPickerOpen(false); setUnitPickerCourse(null);
        setSelectedTags([]); setTeacherNote(''); setAiPolishedNote('');
        setAttendance('정시'); setArrivalTime('15:30');
        removeAllPhotos();
        setLastSaved(null);
        // 4단계: 학생 큐에 다음 미완료 학생이 있으면 자동 전환("저장하고 다음 학생")
        {
          const nextStudent = findNextQueueStudent(studentId);
          if (nextStudent) {
            setStudentId(nextStudent.id);
            initStudentContext(nextStudent.id);
            showToast(`오늘 수업 기록이 저장됐어요. 다음 학생 · ${nextStudent.name}(으)로 이동했어요.`, 'success');
          } else {
            setStudentId(''); setTextbook(''); setSubject('수학'); setUnit(''); setPages('');
            showToast('오늘 수업 기록이 저장됐어요. 원장님이 이번 주 리포트를 모아서 발송해요.', 'success');
          }
        }
        setSaving(false);
        setUploadProgress(null);
        return;
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
        wrongItems: wrongItems.length > 0 ? enrichedWrongItems() : null,
        // 선택한 스킨을 문서에 저장 — PublicReport가 읽어서 레터헤드 색으로 반영.
        // 우선순위는 미리보기(ParentCard)와 동일: 학생 개별 색 > 픽커 선택.
        // 기본값(navy)은 저장 안 함 → 기존 리포트와 똑같이 PublicReport 기본색 사용
        skin: (() => {
          if (student?.skinColor) return { key: 'custom', main: student.skinColor, accent: null };
          const sk = selectedSkin === 'global' && globalSkin ? globalSkin : SKINS[selectedSkin];
          if (!sk || sk.key === 'navy') return null;
          return { key: sk.key, main: sk.main || null, accent: sk.accent || null };
        })(),
        isDraft: false, // 최종 저장 — 이 시점에 복습 일정 생성
      };
      reportPayload.points = calculateReportPoints(reportPayload);
      const savedId = await onSave(reportPayload);
      const savedStudentId = studentId;
      draftIdRef.current = null;
      setHomeworkRating(null); setConceptRating(null);
      setHasTest(false); setTestName(''); setTestScore(''); setTestRound('');
      setCurriculumCourseOverride(null); setUnitPickerOpen(false); setUnitPickerCourse(null);
      setSelectedTags([]); setTeacherNote(''); setAiPolishedNote('');
      setNextPlan(''); setNextPlanDetail('');
      removeAllPhotos();
      setLastSaved(null);
      if (editingReport) {
        setTextbook(''); setSubject('수학'); setUnit(''); setPages('');
        setStudentId('');
        onEditDone();
        showToast('리포트가 수정됐습니다!', 'success');
      } else {
        setAttendance('정시'); setArrivalTime('15:30');
        // 4단계: 학생 큐에 다음 미완료 학생이 있으면 자동 전환("저장하고 다음 학생")
        const nextStudent = findNextQueueStudent(savedStudentId);
        if (nextStudent) {
          setStudentId(nextStudent.id);
          initStudentContext(nextStudent.id);
          showToast(`저장 완료! 다음 학생 · ${nextStudent.name}(으)로 이동했어요.`, 'success', savedId);
        } else {
          setTextbook(''); setSubject('수학'); setUnit(''); setPages('');
          setStudentId(''); // 완료 후 학생 선택 초기화
          showToast('저장 완료! 링크를 복사해서 카카오톡으로 전송하세요.', 'success', savedId);
        }
      }
    } catch (e) {
      console.error('리포트 저장 오류:', e);
      showToast('저장 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
    }
    setUploadProgress(null);
    setSaving(false);
  };

  // 오늘 수업 대상 학생 큐 — DashboardView.jsx의 "오늘 학생 현황"과 동일 기준(scheduleDays
  // 미설정이면 매일 대상, 이미 완료된 학생은 스케줄과 무관하게 계속 표시)을 그대로 재사용.
  // 별도 API 없이 이미 내려오는 students/reports prop만으로 계산
  const todayKstStr = kstDay(Date.now() / 1000);
  const isScheduledToday = (s) => !s.scheduleDays || s.scheduleDays.length === 0 || s.scheduleDays.includes(kstWeekday(Date.now() / 1000));
  const isHandledToday = (r) => isReportSent(r) || (r.attendance === '결석' && r.isDraft !== true);
  const todayReportsAll = reports.filter(r => r.createdAt?.seconds && isHandledToday(r) && kstDay(r.createdAt.seconds) === todayKstStr);
  const hasWeeklySessionToday = (r) => r.reportType === 'weekly' && (r.sessions || []).some(s => s.date === todayKstStr);
  const doneOfStudent = (s) => todayReportsAll.some(r => r.studentId === s.id) || reports.some(r => r.studentId === s.id && hasWeeklySessionToday(r));
  const queueStudents = [...students]
    .filter(s => isScheduledToday(s) || doneOfStudent(s))
    .sort((a, b) => (doneOfStudent(a) === doneOfStudent(b) ? (a.name || '').localeCompare(b.name || '') : (doneOfStudent(a) ? 1 : -1)));
  const queueDoneCount = queueStudents.filter(doneOfStudent).length;
  // 저장 직후 "다음 학생" 자동 전환 대상 — 방금 저장한 학생 제외, 아직 완료 안 된 첫 학생.
  // handleSubmit이 이 컴포넌트 body보다 위에서 선언돼 있지만, 실제 호출은 저장 버튼 클릭
  // 시점(렌더 완료 후)이라 클로저에 이 값이 이미 채워져 있어 문제없음
  const findNextQueueStudent = (savedId) => queueStudents.find(qs => qs.id !== savedId && !doneOfStudent(qs));

  // 학생 선택 로직 — <select>와 학생 큐 칩 양쪽에서 재사용(중복 매칭 로직 금지, CLAUDE.md
  // 인덱스 매칭 버그 패턴과 같은 이유로 한 곳에만 둠)
  // 새 학생으로 폼을 초기화 + 지난 값 이어받기 — selectStudent(수동 전환)와 handleSubmit의
  // "저장하고 다음 학생"(4단계) 양쪽에서 재사용. 후자는 방금 저장을 마친 직후라 자동저장을
  // 또 걸면 안 되므로, 그 앞단(자동저장 여부 판단)은 selectStudent에만 두고 이 함수는 순수
  // 초기화만 담당한다
  const initStudentContext = (newId) => {
    if (newId && !editingReport) {
      draftIdRef.current = null; // 이전 학생 draft에 이어쓰지 않도록
      weeklyDraftIdRef.current = null;
      setWeeklySessions([]); setStaleWeeklyDraft(null);
      setHomeworkRating(null); setConceptRating(null);
      setHasTest(false); setTestScore(''); setTestName(''); setTestRound('');
      setTextbook(''); setSubject('수학'); setUnit(''); setPages('');
      setCurriculumCourseOverride(null); setUnitPickerOpen(false); setUnitPickerCourse(null);
      setTeacherNote(''); setSelectedTags([]);
      setAiPolishedNote('');
      setNextPlan(''); setNextPlanDetail('');
      setPhotos([]); setPhotoAnalysis(null);
      setWrongItems([]);
      setHasChargedAnalysis(false);
      setLastSaved(null);
      setAutoSaveError(false);
      setLastValuesSnapshot(null); setLastValuesApplied(true);

      const newStudent = students.find(s => s.id === newId);
      const newMode = newStudent?.reportMode || classes.find(c => c.id === newStudent?.classId)?.reportMode || academyReportMode || 'daily';

      if (newMode === 'weekly') {
        // 이번 주 범위에 세션 날짜가 걸리는, 아직 발송 안 된(draft) 주간 리포트를 찾음 —
        // 없으면 오늘이 이번 주 첫 세션이라는 뜻. 지난주 이전 열린 draft가 남아있으면
        // 이번 주 draft와 섞이지 않도록 별도로 골라내서 배너로만 안내
        const week = getKstWeekRange(0);
        const openDrafts = reports.filter(r => r.studentId === newId && r.reportType === 'weekly' && r.isDraft === true);
        const currentWeekDraft = openDrafts.find(r => (r.sessions || []).some(s => s.date >= week.startStr && s.date <= week.endStr));
        const stale = openDrafts.find(r => r.id !== currentWeekDraft?.id);
        weeklyDraftIdRef.current = currentWeekDraft?.id || null;
        setWeeklySessions(currentWeekDraft?.sessions || []);
        setStaleWeeklyDraft(stale || null);

        // 오늘 세션을 이미 저장해뒀으면(같은 날 다시 들어온 경우) 그 내용을 불러와 수정,
        // 없으면 방금 초기화한 빈 폼 그대로 새 세션 입력
        const todayStr = kstDay(Date.now() / 1000);
        const todaySession = currentWeekDraft?.sessions?.find(s => s.date === todayStr);
        if (todaySession) {
          setAttendance(todaySession.attendance || '정시');
          setArrivalTime(todaySession.arrivalTime || '15:30');
          setHomeworkRating(todaySession.homeworkRating ?? null);
          setConceptRating(todaySession.conceptRating ?? null);
          setHasTest(!!todaySession.hasTest);
          setTestName(todaySession.testName || ''); setTestScore(todaySession.testScore || ''); setTestRound(todaySession.testRound || '');
          setTextbook(todaySession.textbook || ''); setSubject(todaySession.subject || '수학'); setUnit(todaySession.unit || ''); setPages(todaySession.pages || '');
          setSelectedTags(todaySession.diagnosis || []);
          setTeacherNote(todaySession.teacherNote || '');
          setWrongItems(todaySession.wrongItems || []);
          return; // 최근 리포트 자동 불러오기(교재/단원)는 이미 세션 값으로 채워졌으니 건너뜀
        }
      }

      // 지난 수업 값 불러오기(결정 5) — 교재/과목/단원은 지난 리포트에서, 학습 범위는 지난
      // "다음 수업 계획"(교재 및 범위)에서 이어받음. 점수·코멘트·사진은 절대 안 물려받음.
      // 초기화 이후에 덮어써야 실제로 반영됨
      const lastReport = [...reports]
        .filter(r => r.studentId === newId)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
      if (lastReport) {
        const inherited = {
          textbook: lastReport.textbook || '',
          unit: lastReport.unit || '',
          pages: lastReport.nextPlanDetail || '',
        };
        if (lastReport.subject) setSubject(lastReport.subject);
        if (inherited.textbook) setTextbook(inherited.textbook);
        if (inherited.unit) setUnit(inherited.unit);
        if (inherited.pages) setPages(inherited.pages);
        setLastValuesSnapshot(inherited);
        setLastValuesApplied(true);
      } else {
        setLastValuesSnapshot(null); // 첫 수업 — 배지 자체를 숨김
      }
    }
  };

  const selectStudent = async (newId) => {
    // 이미 학생이 선택된 상태에서 전환 시 → 자동저장 먼저
    if (studentId && newId !== studentId && !editingReport) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      await handleAutoSave();
    }
    setStudentId(newId);
    initStudentContext(newId);
  };

  // "지난 수업 값 불러옴" 배지 토글 — 해제 시 이어받았던 교재/단원/범위만 비움(과목 칩은
  // 선택형이라 비우는 게 의미 없어 건드리지 않음), 재적용 시 스냅샷을 그대로 되돌림
  const toggleLastValues = () => {
    if (!lastValuesSnapshot) return;
    if (lastValuesApplied) {
      setTextbook(''); setUnit(''); setPages('');
      setLastValuesApplied(false);
    } else {
      setTextbook(lastValuesSnapshot.textbook); setUnit(lastValuesSnapshot.unit); setPages(lastValuesSnapshot.pages);
      setLastValuesApplied(true);
    }
  };

  // 토스트 색상 — 화면 전역에서 쓰는 TOKENS 성공/실패/경고 어휘와 통일
  const toastColors = {
    success: { bg: TOKENS.successDark, icon: '✓' },
    error:   { bg: TOKENS.danger, icon: '✕' },
    warn:    { bg: TOKENS.warn, icon: '!' },
    info:    { bg: TOKENS.brand, icon: 'i' },
  };

  return (
    <>
      {/* 중앙 알림 모달 */}
      <AlertModal message={alertMessage} onClose={() => setAlertMessage('')} />

      {/* 사진 확대 보기 — 새 탭 대신 앱 안 라이트박스(위 zoomedPhoto 참고). AI가 인식한 문항
          위치를 박스로 겹쳐 보여줘서, 텍스트 카드 대신 실제 사진과 바로 대조 확인할 수 있게 함 */}
      {zoomedPhoto && (
        <div role="dialog" aria-modal="true" onClick={() => setZoomedPhoto(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          {/* width/height:100% + objectFit:contain — maxWidth/maxHeight만 쓰면 원본이 뷰포트보다
              작을 때(예: 압축된 사진) 늘어나지 않고 원래 크기 그대로 작게 떠서 확대한 의미가 없어짐 */}
          <div style={{ width: '100%', height: '100%' }} onClick={e => e.stopPropagation()}>
            <PhotoBoxOverlay src={zoomedPhoto.src} items={getBoxItemsForPhoto(zoomedPhoto.photoIndex)} onToggle={handleBoxToggle} />
          </div>
          <button type="button" onClick={() => setZoomedPhoto(null)} aria-label="닫기"
            style={{ position: 'fixed', top: '16px', right: '16px', width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.9)', fontSize: '18px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}

      {/* 토스트 알림 */}
      {toast && (
        <div style={{
          // PC(≥900px)는 상단 탭으로 바뀌면서 하단 탭 바가 없어짐 — 그 자리를 비울 필요가 없어짐
          position: 'fixed', bottom: isWide ? '20px' : '80px', left: '50%', transform: 'translateX(-50%)',
          background: toastColors[toast.type]?.bg || C.successDark,
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
          background: TOKENS.warnBg, border: `1.5px solid ${TOKENS.warnBorder}`, borderRadius: `${RADIUS2.input}px`,
          padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '10px'
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 800, color: TOKENS.warnText, margin: 0, wordBreak: 'keep-all' }}>
              수정 모드 — {editingReport.studentName} 리포트를 수정 중입니다
            </p>
            <p style={{ fontSize: '11px', color: TOKENS.warnText, margin: '2px 0 0' }}>
              내용을 수정한 뒤 저장하면 기존 리포트가 업데이트됩니다.
            </p>
          </div>
          <button onClick={() => { onEditDone(); setStudentId(''); }}
            style={{ background: 'none', border: `1px solid ${TOKENS.warnBorder}`, borderRadius: `${RADIUS2.chip}px`, padding: '5px 12px', fontSize: '11px', fontWeight: 700, color: TOKENS.warnText, cursor: 'pointer', flexShrink: 0 }}>
            취소
          </button>
        </div>
      )}
      <div style={{
        maxWidth: '1100px', margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: isWide ? '1.55fr 1fr' : '1fr',
        gap: '20px', alignItems: 'flex-start',
      }}>
        {/* 좌측 입력 폼 — 섹션 간 여백 20px(스펙 섹션 5 "섹션 상단 여백") */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* 헤더 + 강사 */}
          <div style={{ background: TOKENS.bg, borderRadius: '16px', padding: '18px 20px', border: `1px solid ${TOKENS.border}` }}>
            {/* 로그인 화면과 동일한 레터헤드 톤 — 색 배지 없이 텍스트만. 실제 로고 업로드 기능은
                이 화면에 연동되어 있지 않으므로(하드코딩 "K"), 로고 확정 시 별도로 연동 필요 */}
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: TOKENS.textMute, margin: '0 0 14px' }}>{academyName || '데일리 리포트'}</p>
            <h1 style={{ fontSize: `${TYPE.h2.fontSize}px`, fontWeight: TYPE.h2.fontWeight, lineHeight: TYPE.h2.lineHeight, margin: '0 0 4px', letterSpacing: '-0.025em' }}>오늘의 학습 리포트 작성</h1>
            <p style={{ fontSize: '13px', color: TOKENS.textSub, margin: '0 0 14px', fontWeight: 500 }}>한 단계씩 채우면 우측에 학부모 발송 화면이 실시간으로 만들어집니다</p>

            <div style={{ paddingTop: '12px', borderTop: `1px dashed ${TOKENS.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GraduationCap size={14} style={{ color: TOKENS.textMute, flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: TOKENS.textSub, fontWeight: 600, flexShrink: 0 }}>작성 강사</span>
              {teachers.length === 0 ? (
                <span style={{ fontSize: '13px', color: TOKENS.textMute }}>강사 없음</span>
              ) : teachers.length === 1 ? (
                <span style={{ fontSize: '14px', fontWeight: 700, color: TOKENS.brandDark }}>{teachers[0].name}</span>
              ) : (
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}
                  style={{ ...inputStyle, padding: '5px 10px', fontSize: '16px', width: 'auto' }}>
                  <option value="">선택</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: TYPE.small.fontWeight, color: TOKENS.textSub }}>
                강사 추가/수정은 관리 › 설정에서
              </span>
            </div>
          </div>

          {/* 1. 학생 선택 */}
          <FormSection number="1" title="대상 학생">
            <select value={studentId} onChange={(e) => selectStudent(e.target.value)} style={selectStyle}>
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
              {/* 1d 네이비 헤더 — 학생 컨텍스트 + 학생 큐 + 기본 항목 진행 바 */}
              {(() => {
                const today = new Date();
                const headerDate = `${today.getMonth() + 1}월 ${today.getDate()}일 (${'일월화수목금토'[today.getDay()]})`;
                const teacherName = teachers.find(t => t.id === teacherId)?.name;
                return (
                  <div style={{ background: R.navy, borderRadius: '16px', padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', color: R.gold }}>
                          {academyName || '데일리 리포트'}{queueStudents.length > 0 ? ` · 오늘 ${queueDoneCount} / ${queueStudents.length}명 완료` : ''}
                        </span>
                        <span style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.4px', color: '#fff' }}>
                          {student?.name}{student?.school ? ` · ${student.school}` : ''}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.82)' }}>
                          {headerDate} · {arrivalTime}{teacherName ? ` · ${teacherName} 선생` : ''}
                        </span>
                      </div>
                      {/* 지난 수업 값 불러옴 — 결정 5: 버튼이 아니라 상태 배지(누르면 해제/재적용
                          토글). 첫 수업(스냅샷 없음)이면 배지 자체를 숨김 */}
                      {lastValuesSnapshot && (
                        <button type="button" onClick={toggleLastValues}
                          style={{
                            flexShrink: 0, border: '1px solid rgba(255,255,255,0.3)', borderRadius: '16px',
                            background: lastValuesApplied ? 'rgba(255,255,255,0.12)' : 'transparent',
                            color: '#fff', fontSize: '11px', fontWeight: 700, padding: '8px 12px',
                            whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          {lastValuesApplied ? '✓ 지난 수업 값 불러옴' : '지난 수업 값 해제됨'}
                        </button>
                      )}
                    </div>

                    {/* 학생 큐 — 가로 스크롤, 오늘 대상 학생을 완료 여부 순으로. 클릭하면 그
                        학생으로 즉시 전환(자동저장 후) — <select>와 같은 selectStudent 재사용 */}
                    {queueStudents.length > 1 && (
                      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                        {queueStudents.map(qs => {
                          const active = qs.id === studentId;
                          const done = doneOfStudent(qs);
                          return (
                            <button type="button" key={qs.id} onClick={() => selectStudent(qs.id)}
                              style={{
                                border: active ? `1.5px solid ${R.gold}` : 'none', borderRadius: '8px',
                                background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                                padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '2px',
                                textAlign: 'left', flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit',
                              }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: active ? '#fff' : 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>{qs.name}</span>
                              <span style={{ fontSize: '10px', fontWeight: 600, color: done ? '#F0D480' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{done ? '완료' : '대기'}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>기본 항목 {requiredDone} / 4</span>
                        <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.82)' }}>
                          {requiredDone === 4 ? '기본 항목이 모두 채워졌어요' : '저장엔 등원 · 평가 · 한 마디가 필요해요'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {requiredSteps.map(st => (
                          <div key={st.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: st.done ? R.gold : 'rgba(255,255,255,0.22)' }} />
                            <span style={{ fontSize: '11px', fontWeight: 600, color: st.done ? '#F0D480' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {effectiveReportMode === 'weekly' && !editingReport && (
                <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#EAF0F9', border: '1px solid #C5D5F0', fontSize: '12px', color: '#0D2D6B', fontWeight: 600 }}>
                  📋 이번 주 세션 {weeklySessions.length}개 저장됨 — 오늘 작성한 내용은 원장님이 모아서 주 1회 발송해요.
                  {staleWeeklyDraft && (
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: C.warningText, fontWeight: 700 }}>
                      ⚠ 지난주 이전 리포트가 아직 발송되지 않았어요 — 원장님께 "주간 리포트 검토" 화면 확인을 요청해주세요.
                    </p>
                  )}
                </div>
              )}

              {/* 1그룹 · 필수 — 1d 확정안: 한 카드 안에 100px 라벨 행 4개 (등원/평가/오늘 학습/한 마디) */}
              <div style={{ background: TOKENS.bg, borderRadius: '16px', border: `1px solid ${TOKENS.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px 6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.4px', color: R.navy, whiteSpace: 'nowrap' }}>1 · 필수</span>
                <div style={{ flex: 1, height: '1px', background: '#E4E6EB' }} />
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>여기까지만 채우면 저장 가능</span>
              </div>
              <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <FieldRow wide={isWide} label="등원">
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                  {ATTENDANCE.map(a => (
                    <button key={a} onClick={() => setAttendance(a)} style={chipStyle(attendance === a)}>{a}</button>
                  ))}
                  <TimeField wide={isWide} value={arrivalTime} onChange={setArrivalTime} />
                </div>
              </FieldRow>

              <div style={{ height: '1px', background: '#F1F1F4' }} />

              <FieldRow wide={isWide} label="오늘의 평가" sub={isAbsent ? '결석 — 평가 생략' : '10% 단위로 선택 · 숫자키 1~9=10~90%, 0=100%'} disabled={isAbsent}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <ScoreGrid wide={isWide} label="과제" value={homeworkRating} onChange={setHomeworkRating} />
                  <ScoreGrid wide={isWide} label="개념" value={conceptRating} onChange={setConceptRating} />
                </div>
              </FieldRow>

              <div style={{ height: '1px', background: '#F1F1F4' }} />

              <FieldRow wide={isWide} label="오늘 학습" disabled={isAbsent}>

                {/* 과목 선택 — 학원마다 운영 과목이 달라(수학/영어만 있는 곳도, 국어·과학까지
                    있는 곳도) academies/{id}.subjects로 커스터마이즈 가능. 미설정 학원은 기존과
                    동일하게 수학/영어/기타 3개(curriculum.js에 단원표가 있는 건 수학/영어뿐이라
                    다른 과목은 '기타'처럼 단원을 직접 입력하는 방식으로 동작) */}
                <FieldLabel>과목</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                  {(() => {
                    const SUBJECT_COLOR_MAP = { '수학': TOKENS.info, '영어': TOKENS.success, '기타': TOKENS.midGray };
                    const SUBJECT_FALLBACK_COLORS = [TOKENS.warn, TOKENS.danger, '#7C3AED', '#0EA5E9'];
                    const subjects = academySubjects && academySubjects.length ? academySubjects : ['수학', '영어', '기타'];
                    return subjects.map((label, i) => ({ label, color: SUBJECT_COLOR_MAP[label] || SUBJECT_FALLBACK_COLORS[i % SUBJECT_FALLBACK_COLORS.length] }));
                  })().map(({ label, color }) => (
                    <button key={label} onClick={() => { setSubject(label); setCurriculumCourseOverride(null); setUnitPickerOpen(false); setUnitPickerCourse(null); }}
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
                            background: (textbook === item.textbook && unit === item.unit) ? TOKENS.infoDark : '#F9FAFB',
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
                {/* 표준 단원표 — 예전엔 인라인 칩 벽(펼치기→전체 학년 보기→24개 과정)이었는데
                    리포트 작성 중 불편이 커서 오버레이(검색+탐색)로 교체. 폼엔 이 버튼 한 줄만 */}
                {getCourses(subject).length > 0 && (
                  <button type="button"
                    onClick={() => { setUnitPickerSearch(''); setUnitPickerCourse(curriculumCourseOverride || guessCourseKey(subject, student?.school)); setUnitPickerOpen(true); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '8px',
                      padding: '6px 13px', borderRadius: '8px', border: `1px solid ${TOKENS.brand}`,
                      background: '#E6F1FB', color: TOKENS.brand, fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    🔍 표준 단원표에서 찾기
                  </button>
                )}
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="예: 3단원 소수의 나눗셈" style={inputStyle} />

                {/* 단원 선택 오버레이 — 상단 검색(전 과정 즉시 필터) + 초/중/고 탭 → 과정 칩 → 단원 목록 */}
                {unitPickerOpen && (() => {
                  const courses = getCourses(subject);
                  const groupOf = (c) => c.startsWith('고등') ? '고등' : c.startsWith('중') ? '중등' : c.startsWith('초') ? '초등' : '';
                  const levels = [...new Set(courses.map(groupOf).filter(Boolean))];
                  const guessedCourse = guessCourseKey(subject, student?.school);
                  const activeCourse = (unitPickerCourse && courses.includes(unitPickerCourse)) ? unitPickerCourse : (courses.includes(guessedCourse) ? guessedCourse : courses[0]);
                  const activeLevel = groupOf(activeCourse);
                  const q = unitPickerSearch.trim();
                  const hits = q
                    ? courses.flatMap(c => getUnits(subject, c).filter(u => u.includes(q)).map(u => [c, u]))
                    : null;
                  const pickUnit = (c, u) => {
                    setUnit(u);
                    // 추정 과정과 다른 과정에서 골랐으면 override로 기억해야 unitKey 매칭이 정확해짐
                    setCurriculumCourseOverride(c === guessedCourse ? null : c);
                    setUnitPickerOpen(false);
                  };
                  const unitBtnStyle = (on) => ({
                    textAlign: 'left', padding: '11px 13px', borderRadius: '9px',
                    border: `1px solid ${on ? TOKENS.info : TOKENS.border}`,
                    background: on ? TOKENS.infoDark : '#fff', color: on ? '#fff' : TOKENS.text,
                    fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  });
                  return (
                    <div onClick={(e) => { if (e.target === e.currentTarget) setUnitPickerOpen(false); }}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: isWide ? 'center' : 'flex-end', justifyContent: 'center', padding: isWide ? '24px' : 0 }}>
                      <div style={{ background: '#fff', width: '100%', maxWidth: '520px', borderRadius: isWide ? '16px' : '18px 18px 0 0', maxHeight: isWide ? '80vh' : '86dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 18px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <p style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>표준 단원표에서 찾기</p>
                            <button type="button" onClick={() => setUnitPickerOpen(false)}
                              style={{ width: '36px', height: '36px', border: 'none', background: 'none', color: '#9AA0AA', fontSize: '20px', cursor: 'pointer', borderRadius: '8px' }}>✕</button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: `1.5px solid ${TOKENS.brand}`, borderRadius: '10px', padding: '9px 12px', marginBottom: '12px' }}>
                            <span style={{ color: TOKENS.brand, flexShrink: 0, fontSize: '14px' }}>🔍</span>
                            <input autoFocus value={unitPickerSearch} onChange={(e) => setUnitPickerSearch(e.target.value)}
                              placeholder="단원 이름 검색 (예: 나눗셈, 닮음)"
                              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '16px', fontFamily: 'inherit', minWidth: 0, background: 'transparent' }} />
                          </div>
                          {!q && levels.length >= 2 && (
                            <div style={{ display: 'flex', background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, borderRadius: '10px', padding: '3px', marginBottom: '10px' }}>
                              {levels.map(l => (
                                <button key={l} type="button"
                                  onClick={() => { const first = courses.find(c => groupOf(c) === l); if (first) setUnitPickerCourse(groupOf(activeCourse) === l ? activeCourse : first); }}
                                  style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: '8px', background: activeLevel === l ? TOKENS.brand : 'transparent', fontSize: '12.5px', fontWeight: 700, color: activeLevel === l ? '#fff' : TOKENS.textSub, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {l}
                                </button>
                              ))}
                            </div>
                          )}
                          {!q && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '4px' }}>
                              {courses.filter(c => levels.length < 2 || groupOf(c) === activeLevel).map(c => (
                                <button key={c} type="button" onClick={() => setUnitPickerCourse(c)}
                                  style={{
                                    padding: '5px 11px', borderRadius: '14px', border: `1px solid ${c === activeCourse ? TOKENS.info : TOKENS.border}`,
                                    background: c === activeCourse ? TOKENS.infoDark : '#fff', color: c === activeCourse ? '#fff' : TOKENS.textSub,
                                    fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                  }}>
                                  {c.replace('고등-', '')}{c === guessedCourse ? ' ★' : ''}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '4px 18px 18px', overflowY: 'auto', flex: 1 }}>
                          {q ? (
                            hits.length === 0 ? (
                              <p style={{ fontSize: '12px', color: TOKENS.textMute, textAlign: 'center', padding: '24px 0' }}>"{q}" 단원을 못 찾았어요 — 철자를 바꿔보거나 검색어를 지우고 직접 찾아보세요</p>
                            ) : (
                              <>
                                <p style={{ fontSize: '11px', fontWeight: 700, color: TOKENS.brand, margin: '10px 0 7px' }}>검색 결과 {hits.length}건 (전체 과정)</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {hits.map(([c, u]) => (
                                    <button key={`${c}|${u}`} type="button" onClick={() => pickUnit(c, u)} style={unitBtnStyle(unit === u && activeCourse === c)}>
                                      {u}
                                      <span style={{ display: 'block', fontSize: '10.5px', color: unit === u && activeCourse === c ? 'rgba(255,255,255,0.75)' : TOKENS.textMute, fontWeight: 500, marginTop: '2px' }}>{c}</span>
                                    </button>
                                  ))}
                                </div>
                              </>
                            )
                          ) : (
                            <>
                              <p style={{ fontSize: '11px', fontWeight: 700, color: TOKENS.brand, margin: '10px 0 7px' }}>▸ {activeCourse} 단원{activeCourse === guessedCourse ? ' (학생 학년 기준 추천)' : ''}</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {getUnits(subject, activeCourse).map(u => (
                                  <button key={u} type="button" onClick={() => pickUnit(activeCourse, u)} style={unitBtnStyle(unit === u)}>{u}</button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ height: '8px' }} />
                <FieldLabel>학습 범위</FieldLabel>
                <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="예: 111, 114, 124쪽 / 24~32쪽" style={inputStyle} />
              </FieldRow>

              <div style={{ height: '1px', background: '#F1F1F4' }} />

              {/* 필수 4/4 · 선생님 한 마디 — 1d 재배열로 필수 그룹 마지막 줄로 이동 */}
              <FieldRow wide={isWide} label="선생님 한 마디">

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
                      <p style={{ fontSize: '10px', color: '#6C7586', fontWeight: 600, margin: '0 0 6px', letterSpacing: '0.06em' }}>
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
                    }} style={{ background: 'none', border: 'none', color: '#6C7586', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <X size={11} /> 새로 시작
                    </button>
                  )}
                </div>

                {/* 코멘트 즐겨찾기 — 학원 공용, 탭하면 메모에 이어붙임.
                    오늘 선택한 진단 태그와 겹치는 즐겨찾기(저장 당시 태그 기록해둔 것)를
                    앞으로 정렬 + "추천" 표시 — 목록이 늘어날수록 원하는 걸 찾기 어려워지는 걸 방지 */}
                {commentTemplates.length > 0 && (() => {
                  const currentTagKeys = new Set(selectedTags.map(t => t.key));
                  const scored = commentTemplates.map(t => ({
                    t, score: (t.tags || []).filter(k => currentTagKeys.has(k)).length,
                  }));
                  const sorted = currentTagKeys.size > 0
                    ? [...scored].sort((a, b) => b.score - a.score)
                    : scored;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                      {sorted.map(({ t, score }) => {
                        const recommended = score > 0;
                        return (
                          <span key={t.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            background: recommended ? '#FFF0D6' : '#FFF8E7', border: `1px solid ${recommended ? C.accent : '#F5D76E'}`, borderRadius: '20px',
                            padding: '4px 6px 4px 12px', fontSize: '11px', color: C.warningText, fontWeight: 500,
                          }}>
                            <Star size={10} fill={C.accent} color={C.accent} style={{ flexShrink: 0 }} />
                            <button type="button" onClick={() => setTeacherNote(prev => prev ? `${prev}\n${t.text}` : t.text)}
                              style={{ background: 'none', border: 'none', color: C.warningText, fontWeight: recommended ? 800 : 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {recommended && '👍 '}{t.label}
                            </button>
                            <button type="button" onClick={() => { if (window.confirm(`"${t.label}" 즐겨찾기를 삭제할까요?`)) onDeleteCommentTemplate(t.id); }}
                              style={{ background: 'none', border: 'none', color: '#B08900', cursor: 'pointer', padding: '2px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <X size={11} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}

                <textarea value={teacherNote} onChange={(e) => setTeacherNote(e.target.value)}
                  placeholder="예: 3단원 자릿수 실수 2번, 응용은 시간 부족으로 못 풂. 개념은 알고 있음"
                  rows={3} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
                <button type="button" onClick={() => {
                  if (!teacherNote.trim()) return;
                  const label = window.prompt('즐겨찾기 이름을 입력해주세요 (예: 계산실수 안내)', teacherNote.trim().slice(0, 12));
                  if (label && label.trim()) onSaveCommentTemplate(label.trim(), teacherNote.trim(), selectedTags.map(t => t.key));
                }} disabled={!teacherNote.trim()} style={{
                  marginTop: '6px', width: '100%', padding: '7px', fontSize: '11px', fontWeight: 700, borderRadius: '8px',
                  border: `1px solid ${teacherNote.trim() ? '#C9A227' : '#E5E7EB'}`, background: '#fff',
                  color: teacherNote.trim() ? C.warningText : '#6C7586', cursor: teacherNote.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
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
              </FieldRow>
              </div>
              </div>

              <GroupDivider num="2" title="선택" hint="시간 있을 때만" />

              {/* 5-1. 교재/시험지 사진 분석 (선택) — 결석 시 비활성(결석이면 채점 사진 자체가 없음) */}
              <div style={{ opacity: isAbsent ? 0.45 : 1, pointerEvents: isAbsent ? 'none' : 'auto' }}>
              <FoldSection title="교재·시험지 사진 분석" hint="채점 사진을 올리면 AI가 오답을 유형별로 정리해요"
                state={photoAnalysis ? '분석완료' : (photos.length > 0 ? `${photos.length}장 선택됨` : '사진 없음')}
                stateColor={photoAnalysis ? TOKENS.successDark : (photos.length > 0 ? R.navy : undefined)}
                open={optOpen.photo} onToggle={() => setOptOpen(p => ({ ...p, photo: !p.photo }))}>
                <p style={{ fontSize: '11px', color: TOKENS.textMute, margin: '0 0 6px' }}>
                  채점(O/△/빗금) 완료된 페이지를 촬영하면, AI가 표시만 그대로 읽어 유형별 코멘트 초안을 만들어줍니다. 여러 장(최대 {MAX_PHOTOS}장) 한 번에 올려서 페이지별 결과를 통합 분석할 수 있습니다. 점수는 반영되지 않습니다.
                </p>
                <p style={{ fontSize: '11px', color: TOKENS.warn, margin: '0 0 10px' }}>
                  <AlertTriangle size={11} style={{ verticalAlign: '-1px' }} /> AI 분석 결과가 실제 채점과 다를 수 있어요 — 아래 정답/오답 표시를 눌러 직접 수정할 수 있습니다.
                </p>
                <p style={{ fontSize: '11px', color: TOKENS.textMute, margin: '0 0 10px' }}>
                  채점 표시가 선명하고 그림자·빛반사 없이 촬영할수록 AI가 더 정확하게 읽어요.
                </p>

                {/* 모델 A/B 비교 — 플랫폼 관리자 전용 실험 장치. 같은 사진으로 모델만 바꿔가며
                    정확도·속도·비용을 비교하기 위한 것이라, 일반 학원 계정에는 아예 안 보임 */}
                {isPlatformAdmin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', padding: '8px 10px', background: TOKENS.brandBg, border: `1px solid ${TOKENS.brandLight}`, borderRadius: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: TOKENS.brand, letterSpacing: '0.04em' }}>관리자 · 채점 모델</span>
                    <select value={analyzeModel}
                      onChange={(e) => {
                        setAnalyzeModel(e.target.value);
                        try { localStorage.setItem('analyzeModelOverride', e.target.value); } catch { /* 저장 실패해도 이번 세션엔 적용됨 */ }
                      }}
                      style={{ fontSize: '12px', fontWeight: 600, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${TOKENS.border}`, background: '#fff', color: TOKENS.text, fontFamily: 'inherit' }}>
                      {ANALYZE_MODELS.map(m => <option key={m.id || 'default'} value={m.id}>{m.label}</option>)}
                    </select>
                    <span style={{ fontSize: '10px', color: TOKENS.textMute }}>같은 사진으로 모델만 바꿔 비교해보세요</span>
                  </div>
                )}

                {/* 이 사진이 뭔지 태그 — AI 코멘트 문장이 "숙제를 보니", "오늘 테스트에서"처럼
                    자연스럽게 시작하도록 반영됨 (선택 안 해도 분석/코멘트 생성엔 지장 없음) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: TOKENS.textMute, fontWeight: 600 }}>이 사진은?</span>
                  {['숙제', '테스트', '기타'].map(t => (
                    <button key={t} type="button" onClick={() => setPhotoContentType(prev => prev === t ? '' : t)}
                      style={{
                        fontSize: '11px', fontWeight: 700, padding: '4px 11px', borderRadius: '20px',
                        border: `1px solid ${photoContentType === t ? TOKENS.info : TOKENS.border}`,
                        background: photoContentType === t ? TOKENS.info : '#fff',
                        color: photoContentType === t ? '#fff' : TOKENS.textSub,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>{t}</button>
                  ))}
                </div>

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
                            <button onClick={() => removeOnePhoto(i)} title="사진 삭제" style={{
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
                      <button onClick={confirmRemoveAllPhotos} style={{ ...suggestionStyle, marginBottom: '10px' }}>전체 지우기</button>
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
                      <>
                        <button onClick={() => handleAnalyzePhoto('auto')} disabled={analyzingPhoto} style={aiButtonStyle(analyzingPhoto)}>
                          {analyzingPhoto
                            ? <span style={{ display: 'inline-block', width: 13, height: 13, border: `2px solid ${TOKENS.success}40`, borderTopColor: TOKENS.success, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            : <Sparkles size={13} />} {analyzingPhoto ? 'AI가 분석 중...' : `AI로 분석하기 (${photos.length}장)`}
                        </button>
                        {!analyzingPhoto && (
                          <p style={{ fontSize: '10px', color: TOKENS.textMute, textAlign: 'center', margin: '6px 0 0' }}>분석 1회 차감 (사진 장수 무관)</p>
                        )}
                      </>
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
                    {photoAnalysis && (() => {
                      // 확신도 낮은 문항 개수 — concept/mock_exam 양쪽 다 집계 (섹션별 렌더링 코드와 별개로
                      // 상단 요약 배지에만 쓰는 가벼운 카운트)
                      const lowConfidenceCount = (photoAnalysis.sections || []).reduce((n, s) =>
                        n + (s.problemTypes || []).filter(p => p.confidence === 'low').length
                          + (s.weakDetail || []).filter(p => p.confidence === 'low').length, 0);
                      // concept 섹션 문항 번호 — 이 번호들은 체크리스트 행 안에 오답 원인 입력을 바로
                      // 붙여서 보여주므로, 아래쪽 "오답 원인 입력"에서는 중복 표시하지 않고 제외함
                      const conceptNumbers = new Set(
                        (photoAnalysis.sections || []).filter(s => s.sectionType === 'concept')
                          .flatMap(s => (s.problemTypes || []).map(p => p.number))
                      );
                      const leftoverWrongItems = wrongItems.filter(w => !conceptNumbers.has(w.number));
                      // 사진별로 그룹 렌더링되는 화면인지 — 그렇다면 아래 leftover 카드도 사진별
                      // "+직접 추가" 버튼으로 넣은 항목(photoIndex 있음)은 해당 사진 카드 밑에서 렌더링하고,
                      // 여기 공용 목록에는 photoIndex 없는 항목(레거시 데이터/그룹 UI 밖 사진)만 남김
                      const hasPhotoInfoOuter = (photoAnalysis.sections || []).some(s => s.photoIndex != null);
                      // 오답 원인 입력 카드 하나 — 사진별 그룹 안/공용 leftover 목록 양쪽에서 재사용
                      const renderLeftoverCard = (item, idx) => {
                        // number만으로 매칭하면 사진 2장에 같은 번호 오답이 있을 때 한 카드의
                        // 태그/메모 입력이 다른 카드까지 같이 바뀜 — concept 섹션과 동일하게
                        // sectionIdx까지 함께 매칭 (CLAUDE.md 인덱스 매칭 버그 패턴)
                        const matches = (w) => w.number === item.number && w.sectionIdx === item.sectionIdx;
                        return (
                          <div key={`${item.sectionIdx ?? 'x'}-${item.number ?? idx}`} style={{
                            border: item.confidence === 'low' ? `1px solid ${TOKENS.warnBorder}` : `1px solid ${C.danger}30`,
                            borderRadius: `${RADIUS2.thumbnail}px`, padding: '14px',
                            background: item.confidence === 'low' ? TOKENS.warnBg : C.dangerBg,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <span style={{ background: TOKENS.dangerBorder, color: '#fff', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                                {sectionLabelFor(item) ? `${sectionLabelFor(item)} · ` : ''}{item.number}번 오답
                              </span>
                              <span style={{ fontSize: '11px', color: TOKENS.textSub, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexShrink: 0 }}>
                                {item.correctRate && (
                                  <span style={{ fontSize: '10px', color: C.danger, fontWeight: 600 }}>
                                    정답률 {item.correctRate}
                                  </span>
                                )}
                                <button type="button" onClick={() => removeAnalyzedItem(item.sectionIdx, item.number)}
                                  title="이 문항 결과에서 제외"
                                  style={{
                                    flexShrink: 0, width: '22px', height: '22px', borderRadius: '6px',
                                    border: `1px solid ${TOKENS.dangerBorder}40`, background: 'transparent', color: TOKENS.dangerBorder,
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', lineHeight: 1, padding: 0,
                                    WebkitTapHighlightColor: 'transparent',
                                  }}>✕</button>
                              </div>
                            </div>
                            {item.confidence === 'low' && (
                              <p style={{ margin: '0 0 8px', fontSize: '11px', color: TOKENS.warn, fontWeight: 600, lineHeight: 1.4 }}>
                                <AlertTriangle size={10} style={{ verticalAlign: '-1px' }} /> AI가 표시를 확신하지 못했어요 — 실제 채점과 맞는지 확인해주세요
                              </p>
                            )}
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
                              {WRONG_TAGS.map(tag => {
                                const active = item.tags.includes(tag.key);
                                return (
                                  <button type="button" key={tag.key}
                                    onClick={() => setWrongItems(prev => prev.map((w) => matches(w) ? {
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
                              onChange={e => setWrongItems(prev => prev.map((w) => matches(w) ? { ...w, memo: e.target.value } : w))}
                              placeholder="직접 입력 (선택) — 답 잘못 씀, 문제 안 읽음 등"
                              style={{ width: '100%', padding: '6px 10px', fontSize: '16px', border: `1px solid ${TOKENS.border}`, borderRadius: '8px', fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box', color: TOKENS.text }}
                            />
                          </div>
                        );
                      };
                      return (
                      <div style={{ background: TOKENS.bgSoft, border: `1px solid ${TOKENS.borderLight}`, borderRadius: '12px', padding: '12px', marginTop: '4px' }}>
                        {/* 모델 비교 실측값 — 관리자 전용. 속도(초)와 이번 분석에 실제로 들어간
                            토큰 기준 비용을 보여줘, 정확도와 함께 3축으로 비교할 수 있게 함 */}
                        {isPlatformAdmin && lastAnalyzeMeta && (() => {
                          const cost = estimateCostUsd(lastAnalyzeMeta);
                          const photoCount = photos.filter(p => p.base64).length || 1;
                          return (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px', padding: '8px 10px', background: '#fff', border: `1px solid ${TOKENS.brandLight}`, borderRadius: '8px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 800, color: TOKENS.brand }}>{lastAnalyzeMeta.model}</span>
                              <span style={{ fontSize: '10px', color: TOKENS.textSub }}>· {(lastAnalyzeMeta.elapsedMs / 1000).toFixed(1)}초</span>
                              {lastAnalyzeMeta.usage && (
                                <span style={{ fontSize: '10px', color: TOKENS.textSub }}>
                                  · 입력 {lastAnalyzeMeta.usage.promptTokens.toLocaleString()}(캐시 {lastAnalyzeMeta.usage.cachedTokens.toLocaleString()}) / 출력 {lastAnalyzeMeta.usage.outputTokens.toLocaleString()} 토큰
                                </span>
                              )}
                              {cost != null && (
                                <span style={{ fontSize: '10px', fontWeight: 700, color: TOKENS.warn }}>
                                  · 약 ${cost.toFixed(4)} (사진 {photoCount}장 · 장당 ${(cost / photoCount).toFixed(4)})
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {/* "이 화면 사용법" 패널 — 제외/놓친 오답 추가/재분석/책 섹션 태그, 4개 기능을
                            한 곳에서 설명. 개별 버튼마다 물음표 아이콘을 붙이는 안(A)도 검토했는데,
                            발견을 사용자에게 맡기게 돼서 여기서는 진입 시 한 번에 보여주는 쪽(B)으로 감 */}
                        <div style={{ border: `1px solid ${TOKENS.brandLight}`, background: TOKENS.brandBg, borderRadius: '10px', marginBottom: '12px', overflow: 'hidden' }}>
                          <button type="button" onClick={togglePhotoGuide}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                              <span style={{ width: '20px', height: '20px', borderRadius: '5px', background: TOKENS.brand, color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</span>
                              <span style={{ fontSize: '11.5px', fontWeight: 700, color: TOKENS.brand }}>이 화면 사용법</span>
                            </span>
                            <span style={{ fontSize: '10px', color: TOKENS.brand, transform: photoGuideOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                          </button>
                          {photoGuideOpen && (
                            <div style={{ padding: '0 12px 12px' }}>
                              {[
                                { mark: '✓/✕', title: '정답⇄오답 직접 수정', desc: 'AI가 빗금·동그라미를 놓치는 경우가 있어요. 발송 전에 카드의 표시를 한 번 훑어보고, 다르면 눌러서 바로 바꿔주세요.' },
                                { mark: '✕', title: '결과에서 제외', desc: '교재 예제, 선생님과 같이 푼 문제처럼 채점 대상이 아니면 완전히 빼요.' },
                                { mark: '＋', title: '놓친 오답 추가', desc: 'AI가 못 찾은 오답을 문항 번호만 입력해서 직접 넣어요.' },
                                { mark: '🔄', title: '재분석', desc: '결과가 실제 채점과 다르면 다시 시도할 수 있어요 — 분석 1회가 더 나가요.' },
                                { mark: '📖', title: '책 섹션 태그', desc: '소단원별로 번호가 겹치지 않게 AI가 자동으로 구분해요. 틀렸으면 태그를 눌러 고칠 수 있어요.' },
                              ].map((it, i) => (
                                <div key={it.title} style={{ display: 'flex', gap: '10px', padding: '9px 0', borderTop: i === 0 ? 'none' : `1px solid ${TOKENS.brandLight}` }}>
                                  <span style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#fff', border: `1px solid ${TOKENS.brandLight}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>{it.mark}</span>
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: TOKENS.text, marginBottom: '2px' }}>{it.title}</span>
                                    <span style={{ display: 'block', fontSize: '10.5px', color: TOKENS.textSub, lineHeight: 1.6 }}>{it.desc}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {(photoAnalysis.bookOrTest || photoAnalysis.unit || photoAnalysis.pageRange) && (
                          <p style={{ fontSize: '11px', color: TOKENS.success, fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {[photoAnalysis.bookOrTest, photoAnalysis.unit, photoAnalysis.pageRange].filter(Boolean).join(' · ')}
                            {lowConfidenceCount > 0 && (
                              <span style={{ background: TOKENS.warnBg, color: TOKENS.warn, border: `1px solid ${TOKENS.warnBorder}`, borderRadius: '20px', padding: '1px 8px', fontSize: '10px', fontWeight: 700 }}>
                                확인 필요 {lowConfidenceCount}건
                              </span>
                            )}
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

                        {/* AI 관찰 로그 — 특정 문항이 결과에서 빠졌을 때 "AI가 그 번호를 보긴 봤는지,
                            왜 뺐는지"를 바로 확인하는 용도. 평소엔 접어둠(정상일 땐 안 볼 정보) */}
                        {photoAnalysis.rawObservations?.length > 0 && (
                          <div style={{ marginBottom: '10px' }}>
                            <button type="button" onClick={() => setShowRawObservations(v => !v)}
                              style={{ fontSize: '10px', fontWeight: 700, color: TOKENS.textMute, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              {showRawObservations ? '▾' : '▸'} AI 관찰 로그 보기 (결과가 이상할 때 확인) · {photoAnalysis.rawObservations.length}건
                            </button>
                            {showRawObservations && (
                              <ul style={{ margin: '6px 0 0', paddingLeft: '16px', fontSize: '11px', color: TOKENS.textSub, lineHeight: 1.7 }}>
                                {photoAnalysis.rawObservations.map((obs, i) => <li key={i}>{obs}</li>)}
                              </ul>
                            )}
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

                        {/* 섹션별 렌더링: 연산 = 집계만 / 유형 = 문항별 상세 / 모의고사 = 그룹집계+약점상세.
                            새 응답(photoIndex 포함)은 사진별로 묶어서 보여줌 — 썸네일이 작아 어떤 사진의
                            결과인지 알기 어려웠던 문제 해결 + 책 섹션 라벨 검수 화면 역할 겸함 */}
                        {(() => {
                          const secs = photoAnalysis.sections || [];
                          // 구버전 저장 리포트(photoIndex 없음)는 기존 평면 렌더 그대로 유지
                          const hasPhotoInfo = secs.some(s => s.photoIndex != null);
                          const analyzedPhotos = photos.filter(p => p.base64);
                          const sectionWrongCount = (s) =>
                            (s.problemTypes || []).filter(p => p.result === '약점').length
                            + (s.weakDetail || []).length
                            + (s.problemTypes ? 0 : (s.summary?.wrong || 0));
                          // identifiedNumbers(존재를 확인한 번호 전체)에는 있는데 problemTypes/weakDetail
                          // 어디에도 최종 판정이 안 남은 번호 — "AI가 보긴 봤는데 표시를 못 찾아 제외한 번호"
                          // 후보. 03번 사례처럼 실제로는 표시가 있었는데 놓친 경우를 눈에 띄게 하기 위함
                          const sectionMissingNumbers = (s) => {
                            const seen = [
                              ...(s.problemTypes || []).map(p => p.number),
                              ...(s.weakDetail || []).map(p => p.number),
                            ];
                            return (s.identifiedNumbers || []).filter(n => !seen.includes(n));
                          };
                          // 책 섹션 칩 — AI가 확정한 라벨 표시 + 탭해서 수동 지정/수정 (최종 확정권은 사람)
                          const renderSectionChip = (sec, si) => {
                            const label = sec.resolvedSection?.label || null;
                            const unknown = !label;
                            return (
                              <button type="button"
                                onClick={() => {
                                  const name = window.prompt('이 문항들이 속한 책 섹션 이름을 입력해주세요\n(예: 중단원 마무리하기, 이런 문제가 시험에 나온다)', label || '');
                                  if (name == null) return;
                                  setPhotoAnalysis(prev => ({
                                    ...prev,
                                    sections: prev.sections.map((s, i) => i === si ? { ...s, resolvedSection: { label: name.trim() || null, source: 'manual' } } : s),
                                  }));
                                }}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '6px',
                                  fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: `${RADIUS2.chip}px`,
                                  border: `1px solid ${unknown ? TOKENS.warnBorder : TOKENS.border}`,
                                  background: unknown ? TOKENS.warnBg : TOKENS.bgSoft,
                                  color: unknown ? TOKENS.warn : TOKENS.textSub,
                                  cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                {unknown ? '⚠ 섹션 미확인 — 눌러서 지정' : `${label} ✎`}
                              </button>
                            );
                          };
                          const renderSection = (sec, si) => (
                          <div key={si} style={{ marginBottom: '10px' }}>
                            {hasPhotoInfo && renderSectionChip(sec, si)}
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

                            {sec.sectionType === 'concept' && (() => {
                              return (sec.problemTypes || [])
                              .slice()
                              .sort(sortByItemNumber)
                              .map((p, i) => {
                              // number만으로 매칭하면 서로 다른 concept 섹션(예: 교재 2장을 함께 분석)에
                              // 같은 번호(예: 3번)가 둘 다 있을 때 한쪽 토글이 다른 섹션까지 같이 뒤집히던
                              // 버그가 있었음 — sectionIdx(si)까지 같이 매칭해서 섹션별로 독립되게 함
                              const wrongItem = p.result === '약점' ? wrongItems.find(w => w.number === p.number && w.sectionIdx === si) : null;
                              return (
                              <div key={i} style={{
                                padding: '6px 0', borderBottom: i < (sec.problemTypes || []).length - 1 ? `1px solid ${TOKENS.border}` : 'none',
                                fontSize: '12px',
                                ...(p.confidence === 'low' ? { background: TOKENS.warnBg, border: `1px solid ${TOKENS.warnBorder}`, borderRadius: '10px', padding: '8px' } : {}),
                              }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button type="button"
                                  onClick={() => toggleProblemResult(si, p)}
                                  style={{
                                    flexShrink: 0, width: '68px', textAlign: 'center', fontWeight: 700, fontSize: '12px', padding: '8px 0', minHeight: '36px', borderRadius: '10px',
                                    background: p.result === '잘함' ? TOKENS.successBg : TOKENS.dangerBg,
                                    color: p.result === '잘함' ? TOKENS.successDark : TOKENS.dangerBorder,
                                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    WebkitTapHighlightColor: 'transparent',
                                  }}>{p.result === '잘함' ? '정답 ✓' : '오답 ✗'}</button>
                                <div>
                                  <p style={{ margin: 0, fontWeight: 600 }}>
                                    {p.number ? `${p.number}. ` : ''}{p.type}
                                  </p>
                                  {p.note?.trim() && <p style={{ margin: '2px 0 0', color: TOKENS.textSub }}>{p.note}</p>}
                                  {p.confidence === 'low' && (
                                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: TOKENS.warn, fontWeight: 600, lineHeight: 1.4 }}>
                                      <AlertTriangle size={10} style={{ verticalAlign: '-1px' }} /> AI가 표시를 확신하지 못했어요 — 실제 채점과 맞는지 확인해주세요
                                    </p>
                                  )}
                                </div>
                                <button type="button" onClick={() => removeAnalyzedItem(si, p.number)}
                                  title="이 문항 결과에서 제외"
                                  style={{
                                    marginLeft: 'auto', flexShrink: 0, width: '28px', height: '28px', borderRadius: '8px',
                                    border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.textMute,
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', lineHeight: 1,
                                    WebkitTapHighlightColor: 'transparent',
                                  }}>✕</button>
                                </div>

                                {/* 오답 원인 입력 — 체크리스트 바로 이 줄 안에 붙여서, 옆에 따로 뒀을 때
                                    정답 문항 때문에 줄이 안 맞던 문제를 근본적으로 없앰 */}
                                {wrongItem && (
                                  <div style={{ marginTop: '8px', paddingLeft: '76px' }}>
                                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                      {WRONG_TAGS.map(tag => {
                                        const active = wrongItem.tags.includes(tag.key);
                                        return (
                                          <button type="button" key={tag.key}
                                            onClick={() => setWrongItems(prev => prev.map((w) => w.number === p.number && w.sectionIdx === si ? {
                                              ...w,
                                              tags: active ? w.tags.filter(t => t !== tag.key) : [...w.tags, tag.key]
                                            } : w))}
                                            style={{
                                              fontSize: '11px', padding: '9px 13px', minHeight: '36px', borderRadius: '20px',
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
                                      value={wrongItem.memo}
                                      onChange={e => setWrongItems(prev => prev.map((w) => w.number === p.number && w.sectionIdx === si ? { ...w, memo: e.target.value } : w))}
                                      placeholder="직접 입력 (선택) — 답 잘못 씀, 문제 안 읽음 등"
                                      style={{ width: '100%', padding: '6px 10px', fontSize: '16px', border: `1px solid ${TOKENS.border}`, borderRadius: '8px', fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box', color: TOKENS.text }}
                                    />
                                  </div>
                                )}
                              </div>
                              );
                            });
                            })()}

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
                                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', margin: '0 0 4px', ...(p.confidence === 'low' ? { background: TOKENS.warnBg, borderRadius: '6px', padding: '4px 6px' } : {}) }}>
                                        <p style={{ margin: 0, flex: '1 1 auto', minWidth: 0 }}>
                                          {p.number ? `${p.number}. ` : ''}{p.type}
                                          {p.mark && <span style={{ marginLeft: '6px', fontSize: '10px', color: TOKENS.textMute }}>[{p.mark}]</span>}
                                          {p.confidence === 'low' && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, color: TOKENS.warn }}>확인 필요</span>}
                                          {p.note && <span style={{ display: 'block', color: TOKENS.textSub }}>{p.note}</span>}
                                        </p>
                                        <button type="button" onClick={() => removeAnalyzedItem(si, p.number)}
                                          title="이 문항 결과에서 제외"
                                          style={{
                                            flexShrink: 0, width: '22px', height: '22px', borderRadius: '6px',
                                            border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.textMute,
                                            cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', lineHeight: 1, padding: 0,
                                            WebkitTapHighlightColor: 'transparent',
                                          }}>✕</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          );

                          if (!hasPhotoInfo) return secs.map((sec, si) => renderSection(sec, si));

                          // 사진별 그룹 — 분석에 포함된 모든 사진을 나열. 문항이 안 나온 사진도
                          // 숨기지 않고 보여줘서, 누락인지 진짜 전부 정답인지 구분되게 함
                          const maxPi = Math.max(0, ...secs.map(s => s.photoIndex ?? 0));
                          const totalPhotos = Math.max(analyzedPhotos.length, maxPi);
                          return Array.from({ length: totalPhotos }, (_, i) => i + 1).map(pi => {
                            const inPhoto = secs.map((s, si) => ({ s, si })).filter(x => (x.s.photoIndex ?? 0) === pi);
                            const photoRec = analyzedPhotos[pi - 1] || null;
                            const preview = photoRec?.preview || null; // 48px 썸네일 표시용(300px 압축본)
                            // 확대 보기는 썸네일이 아니라 AI 분석에 실제로 쓰인 원본급(최대 1800px) 이미지를 사용 —
                            // 안 그러면 라이트박스를 열어도 300px짜리라 여전히 흐릿하고 작게 보임
                            const fullRes = photoRec?.base64 ? `data:${photoRec.mimeType || 'image/jpeg'};base64,${photoRec.base64}` : preview;
                            const wrongTotal = inPhoto.reduce((n, x) => n + sectionWrongCount(x.s), 0);
                            const missingNumbers = [...new Set(inPhoto.flatMap(x => sectionMissingNumbers(x.s)))];
                            return (
                              <div key={`photo-${pi}`} style={{ marginBottom: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, borderRadius: '10px', marginBottom: '8px' }}>
                                  {preview
                                    ? <img src={preview} alt={`${pi}번째 사진`} onClick={() => setZoomedPhoto({ src: fullRes, photoIndex: pi })}
                                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${TOKENS.border}`, cursor: 'zoom-in', flexShrink: 0 }} />
                                    : <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: TOKENS.borderLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>📷</div>}
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: '12px', fontWeight: 800, margin: 0, color: TOKENS.text }}>{pi}번째 사진</p>
                                    <p style={{ fontSize: '11px', margin: '2px 0 0', fontWeight: 600, color: inPhoto.length === 0 ? TOKENS.warn : wrongTotal === 0 ? TOKENS.successDark : TOKENS.dangerBorder }}>
                                      {inPhoto.length === 0 ? '분석된 문항 없음' : wrongTotal === 0 ? '오답 없음 ✓' : `오답 ${wrongTotal}건`}
                                    </p>
                                  </div>
                                </div>
                                {/* AI가 번호 존재는 확인했지만(Step 0) 표시를 못 찾아 최종 결과에서 빠진 번호 —
                                    03번 사례처럼 실제로는 표시가 있었는데 인식을 놓친 경우일 수 있어 바로
                                    확인/추가할 수 있게 노출 */}
                                {missingNumbers.length > 0 && (
                                  <div style={{ background: TOKENS.warnBg, border: `1px solid ${TOKENS.warnBorder}`, borderRadius: '8px', padding: '8px 10px', marginBottom: '8px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                    <AlertTriangle size={11} style={{ color: TOKENS.warn, flexShrink: 0 }} />
                                    <span style={{ fontSize: '11px', color: TOKENS.warn }}>
                                      {missingNumbers.join(', ')}번은 번호는 확인했지만 채점 표시를 못 찾아 결과에서 빠졌어요. 실제로 채점 표시가 있었다면 아래 "직접 추가"로 넣어주세요.
                                    </span>
                                  </div>
                                )}
                                {inPhoto.length === 0
                                  ? <p style={{ fontSize: '11px', color: TOKENS.textMute, margin: '0 0 4px 4px' }}>이 사진에서는 채점된 문항을 찾지 못했어요 — 사진이 잘 나왔는지 확인해주세요.</p>
                                  : inPhoto.map(({ s, si }) => renderSection(s, si))}
                                {/* 이 사진에서 "+직접 추가"로 넣은 오답 — photoIndex로 이 사진 카드 밑에만 표시 */}
                                {(() => {
                                  const inPhotoLeftover = leftoverWrongItems.filter(w => w.photoIndex === pi);
                                  return inPhotoLeftover.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px', marginTop: '8px' }}>
                                      {[...inPhotoLeftover].sort(sortByItemNumber).map((item, idx) => renderLeftoverCard(item, idx))}
                                    </div>
                                  );
                                })()}
                                <button type="button" onClick={() => addMissedWrongItem(pi)}
                                  style={{
                                    marginTop: '8px', width: '100%', padding: '7px', fontSize: '10.5px', fontWeight: 700,
                                    border: `1.5px dashed ${TOKENS.border}`, borderRadius: '8px', background: 'transparent',
                                    color: TOKENS.textSub, cursor: 'pointer', fontFamily: 'inherit',
                                  }}>
                                  + 이 사진에서 놓친 오답 추가
                                </button>
                              </div>
                            );
                          });
                        })()}

                        {/* 모의고사 등 concept 섹션 밖에서 나온 오답 중 사진에 안 붙는 것만 여기 별도로 —
                            사진별 그룹 UI(hasPhotoInfoOuter)에서는 photoIndex 있는 항목이 각 사진 카드
                            밑에서 이미 렌더링되므로, 여기서는 photoIndex 없는 잔여 항목만 남김 */}
                        {(() => {
                          const residualLeftover = leftoverWrongItems.filter(w => !hasPhotoInfoOuter || w.photoIndex == null);
                          return residualLeftover.length > 0 && (
                            <div style={{ marginTop: '12px' }}>
                              <p style={{ fontSize: '11px', fontWeight: 700, color: TOKENS.textSub, margin: '0 0 8px' }}>
                                오답 문제별 원인 입력
                              </p>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                                {[...residualLeftover].sort(sortByItemNumber).map((item, idx) => renderLeftoverCard(item, idx))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* AI가 놓친 문항 직접 추가 — temperature:0이라 같은 사진을 재분석해도 같은
                            문항을 또 놓칠 수 있음. 프롬프트 튜닝으로 인식률을 조금 올릴 순 있어도
                            100% 보장은 못 하므로, 사람이 "이 번호도 오답이었어요"를 바로 기록할 수
                            있는 확실한 대안을 항상 열어둠(AI 결과가 있든 없든). 사진별 그룹 UI에서는
                            사진마다 이미 자기 버튼이 있으니, 여기서는 레거시(사진 구분 없는) 데이터일
                            때만 공용 버튼을 보여줌 — 안 그러면 어느 사진 문항인지 모른 채 추가돼버림 */}
                        {!hasPhotoInfoOuter && (
                          <button type="button" onClick={() => addMissedWrongItem()}
                            style={{
                              marginTop: '12px', width: '100%', padding: '9px', fontSize: '11px', fontWeight: 700,
                              border: `1.5px dashed ${TOKENS.border}`, borderRadius: '10px', background: 'transparent',
                              color: TOKENS.textSub, cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            + AI가 놓친 오답 직접 추가
                          </button>
                        )}

                        {/* 오답 카드 기반 코멘트 생성 — 체크리스트 인라인이든 leftover 카드든 상관없이 wrongItems 전체 기준 */}
                        {wrongItems.length > 0 && (
                            <button type="button" disabled={generatingComment} onClick={async () => {
                              if (generatingComment) return;
                              setGeneratingComment(true);
                              const studentName = students.find(s => s.id === studentId)?.name || '학생';
                              const wrongSummary = wrongItems.map(w => {
                                const tags = w.tags.map(t => WRONG_TAG_LABELS[t]).filter(Boolean).join(', ');
                                const memo = w.memo?.trim();
                                const lbl = sectionLabelFor(w);
                                return `${lbl ? `[${lbl}] ` : ''}${w.number}번(${w.type}${w.correctRate ? ` 정답률${w.correctRate}` : ''})${tags ? ` — ${tags}` : ''}${memo ? ` / ${memo}` : ''}`;
                              }).join('; ');

                              showToast('코멘트 생성 중...', 'info');
                              try {
                                const res = await fetch('/api/polish', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
                                  body: JSON.stringify({
                                    note: wrongSummary,
                                    studentName,
                                    textbook: textbook || '',
                                    unit: unit || '',
                                    diagTags: wrongItems.flatMap(w => w.tags.map(t => WRONG_TAG_LABELS[t])).join(', '),
                                    photoContext: `오답: ${wrongSummary}`,
                                    contentType: photoContentType || '',
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
                        )}
                      </div>
                      );
                    })()}
                  </div>
                )}
              </FoldSection>
              </div>

              {/* 6. 진단 */}
              <FoldSection title="오늘의 진단" hint="오늘 수업에서 보인 약점을 태그로 기록 — 학부모에겐 안 보여요"
                state={selectedTags.length > 0 ? `${selectedTags.length}개 선택` : '선택 안 함'}
                stateColor={selectedTags.length > 0 ? R.navy : undefined}
                open={optOpen.diag} onToggle={() => setOptOpen(p => ({ ...p, diag: !p.diag }))}>
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
                    <p style={{ fontSize: '10px', color: TOKENS.warn, margin: '0 0 4px', lineHeight: 1.5 }}>
                      <Info size={11} style={{ verticalAlign: '-2px' }} /> 구체적으로 적을수록 원장 보고서에서 바로 확인됩니다<br/>
                      예: <strong>4단원 · 111p · 비례식 문장제 — 식 세우기 단계에서 막힘</strong>
                    </p>
                    {selectedTags.map((tag, idx) => {
                      const tagDef = DIAGNOSIS_TAGS.find(t => t.key === tag.key);
                      return (
                        <div key={idx} style={{ background: '#fff', borderRadius: `${RADIUS2.thumbnail}px`, padding: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={tagStyle(tagDef.color, true)}>{tagDef.label}</span>
                            <button onClick={() => toggleTag(tag.key)} title="태그 제거" style={{ background: 'none', border: 'none', color: TOKENS.textMute, cursor: 'pointer', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}><X size={14} /></button>
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
              </FoldSection>

              {/* 테스트 — 1d 재배열로 선택 그룹 맨 뒤로 이동 (사진분석 → 진단 → 테스트) */}
              <FoldSection title="테스트" hint="단원평가·모의고사를 봤다면 점수를 기록해요"
                state={hasTest ? '진행함' : '진행 안 함'}
                stateColor={hasTest ? R.navy : undefined}
                open={optOpen.test} onToggle={() => setOptOpen(p => ({ ...p, test: !p.test }))}>
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
              </FoldSection>

              <GroupDivider num="3" title="마무리" />

              {/* 8. 다음 수업 계획 */}
              <FormSection number="8" title="다음 수업 계획">
                <p style={{ fontSize: '11px', color: TOKENS.warn, background: TOKENS.warnBg, border: `1px solid ${TOKENS.warnBorder}`, borderRadius: `${RADIUS2.input}px`, padding: '8px 12px', margin: '0 0 10px', lineHeight: 1.6 }}>
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
                  : <Send size={15} />} {saving ? (uploadProgress ? `사진 업로드 중 ${uploadProgress.done}/${uploadProgress.total}...` : '저장 중...') : polishing ? 'AI 다듬는 중...' : (effectiveReportMode === 'weekly' && !editingReport) ? '오늘 수업 기록 저장 (이번 주 리포트에 추가)' : '리포트 저장 및 발송 준비'}
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
          <div style={{ background: TOKENS.bg, borderRadius: `${RADIUS2.card}px`, border: `1px solid ${TOKENS.border}`, padding: '10px 14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <FieldLabel><Palette size={10} style={{ verticalAlign: '-1px', marginRight: '3px' }} />리포트 스킨</FieldLabel>
              {student?.skinColor && (
                <span style={{ fontSize: '9px', fontWeight: 600, color: '#fff', background: TOKENS.info, padding: '2px 8px', borderRadius: `${RADIUS2.badge}px` }}>학생 개별 스킨 적용 중</span>
              )}
            </div>
            {student?.skinColor ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: TOKENS.bgSoft, borderRadius: `${RADIUS2.input}px`, padding: '8px 10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: student.skinColor, border: '2px solid rgba(0,0,0,0.08)', flexShrink: 0 }}></div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: TOKENS.text }}>개별 설정 색상</span>
                <span style={{ fontSize: '10px', color: TOKENS.textMute, fontFamily: 'monospace' }}>{student.skinColor}</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {[...(globalSkin ? [globalSkin] : []), ...Object.values(SKINS)].map(sk => (
                  <button
                    key={sk.key}
                    onClick={() => setSelectedSkin(sk.key)}
                    style={{
                      border: `2px solid ${selectedSkin === sk.key ? TOKENS.info : TOKENS.border}`,
                      borderRadius: `${RADIUS2.input}px`, padding: '7px 4px', cursor: 'pointer',
                      background: selectedSkin === sk.key ? TOKENS.infoBg : TOKENS.bgSoft,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                      fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ width: '100%', height: '18px', borderRadius: '5px', background: sk.dots[0], marginBottom: '2px' }}></div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: selectedSkin === sk.key ? TOKENS.infoDark : TOKENS.textSub, textAlign: 'center', lineHeight: 1.3 }}>{sk.name}</span>
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
            academyName={academyName} academyPhone={academyPhone}
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

// 학부모 미리보기 카드 — PublicReport.jsx(학부모가 실제로 받는 화면)와 구조를 그대로 맞춤.
// 예전엔 이 카드가 그라데이션 헤더의 독자적인 디자인이라 "선생님이 여기서 보는 것"과
// "학부모가 실제로 받는 것"이 완전히 달라서 미리보기가 사실상 거짓말이었음(색만 반영되고
// 레이아웃은 무관) — 지금은 PublicReport와 동일한 레터헤드 구조에 skin.main/accent로 색만
// 입힌다. PublicReport에 없는 기능(아바타 등)은 미리보기에서도 뺐다 — 안 그러면 반대로
// "미리보기엔 있는데 실제론 없는" 거짓말이 생김.
function ParentCard({ student, teacher, attendance, arrivalTime, homeworkRating, conceptRating, hasTest, testName, testScore, textbook, unit, pages, diagnosis, teacherNote, nextPlan, nextPlanDetail, skin, academyName = null, academyPhone = null }) {
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일 (${'일월화수목금토'[today.getDay()]})`;
  const homeworkPct = toPct(homeworkRating);
  const conceptPct = toPct(conceptRating);

  if (!student) return (
    <div style={{ background: '#fff', border: `1px dashed #E5E7EB`, borderRadius: '18px', padding: '50px 20px', textAlign: 'center' }}>
      <User size={28} style={{ color: '#D1D5DB', marginBottom: '10px' }} />
      <p style={{ fontSize: '12px', color: '#6C7586', fontWeight: 500, margin: 0 }}>학생을 선택하면<br />학부모 카드가 여기에 만들어집니다</p>
    </div>
  );

  // PublicReport.jsx와 동일한 우선순위: 학생 개별 색 > 픽커에서 고른 스킨 > 기본 네이비/골드
  const { rule, inkMute, inkSub, ink, positive, serif, body } = R;
  const navy = student?.skinColor || skin?.main || R.navy;
  const gold = (!student?.skinColor && skin?.accent) || R.gold;
  // 텍스트 색으로 쓸 땐 gold를 그대로 쓰지 않는다 — PublicReport.jsx와 동일한 이유
  // (학생이 고른 스킨의 accent가 배경/테두리용 옅은 톤일 수도 있음)
  const goldText = (!student?.skinColor && skin?.accent) ? textSafeColor(gold) : R.goldText;

  const teacherSuffix = /선생님?$/.test(teacher?.name || '') ? '' : ' 선생님';

  return (
    <div style={{ background: '#fff', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.10)', fontFamily: body }}>

      {/* 헤더 — PublicReport와 동일 구조(브랜드 스트립 + 골드 구분선 + 세리프 학생명) */}
      <div style={{ background: navy, padding: '20px 22px 18px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ width: '4px', height: '20px', background: gold, borderRadius: '1px', flexShrink: 0 }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.15em' }}>{academyName || '데일리 리포트 시스템'}</span>
        </div>
        <div style={{ height: '1px', background: `${gold}4D`, marginBottom: '14px' }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.15em', margin: '0 0 4px', fontWeight: 600 }}>LEARNING REPORT</p>
            <p style={{ fontFamily: serif, fontSize: '26px', fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{student.name}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', margin: 0 }}>{dateStr} · {teacher?.name || '선생님'}{teacherSuffix}</p>
          </div>
        </div>
      </div>

      {/* 바디 */}
      <div style={{ padding: '18px 20px' }}>

        {/* 핵심 지표 3열 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '18px' }}>
          <div style={{ borderRight: `1px solid ${rule}`, padding: '0 8px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>과제 수행</p>
            <p style={{ fontSize: '24px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {homeworkRating != null ? homeworkPct : '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>%</span>
            </p>
            <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{homeworkRating != null ? ratingLabel(homeworkPct) : ''}</p>
          </div>
          <div style={{ borderRight: `1px solid ${rule}`, padding: '0 8px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>개념 이해</p>
            <p style={{ fontSize: '24px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {conceptRating != null ? conceptPct : '-'}<span style={{ fontSize: '12px', fontWeight: 500, color: inkMute }}>%</span>
            </p>
            <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{conceptRating != null ? ratingLabel(conceptPct) : ''}</p>
          </div>
          <div style={{ padding: '0 8px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>출결</p>
            <p style={{ fontSize: '16px', fontWeight: 800, color: attendance === '정시' ? positive : navy, margin: 0, lineHeight: '24px' }}>{attendance}</p>
            {attendance !== '결석' && <p style={{ fontSize: '12px', fontWeight: 600, color: inkSub, margin: '3px 0 0' }}>{arrivalTime} 등원</p>}
          </div>
        </div>

        <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />

        {/* 학습 범위 */}
        {(textbook || unit || pages) && (
          <>
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 6px' }}>학습 범위</p>
              {textbook && <p style={{ fontSize: '12px', fontWeight: 700, color: navy, margin: '0 0 2px', wordBreak: 'keep-all' }}>{textbook}</p>}
              {unit && <p style={{ fontSize: '12px', color: inkSub, margin: '0 0 1px' }}>{unit}</p>}
              {pages && <p style={{ fontSize: '12px', color: inkMute, margin: 0 }}>{pages}</p>}
            </div>
            <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
          </>
        )}

        {/* 시험 결과 — 진단 배지는 2026-07-30 결정으로 학부모 화면(미리보기 포함) 비노출 */}
        {hasTest && testName && (
          <>
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 8px' }}>TEST RESULT</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '28px', fontWeight: 800, color: navy, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{testScore || '-'}<span style={{ fontSize: '13px', fontWeight: 600, color: inkMute, marginLeft: '2px' }}>점</span></p>
                <p style={{ fontSize: '12px', color: inkSub, margin: 0 }}>{testName}</p>
              </div>
            </div>
            <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
          </>
        )}

        {/* TEACHER'S NOTE */}
        {teacherNote && (
          <>
            <div style={{ borderLeft: `3px solid ${gold}`, paddingLeft: '13px', marginBottom: '18px' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: goldText, letterSpacing: '0.12em', margin: '0 0 7px' }}>TEACHER'S NOTE</p>
              {teacherNote.split('\n').filter(Boolean).map((para, i, arr) => (
                <p key={i} style={{ fontSize: '13px', color: ink, margin: i === arr.length - 1 ? '0' : '0 0 10px', lineHeight: 1.9, fontWeight: 500 }}>{para}</p>
              ))}
            </div>
            <div style={{ height: '1px', background: rule, marginBottom: '18px' }} />
          </>
        )}

        {/* 다음 수업 */}
        {nextPlan && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 4px' }}>NEXT CLASS</p>
              <p style={{ fontSize: '13px', fontWeight: 700, color: navy, margin: 0 }}>{nextPlan}</p>
              {nextPlanDetail && <p style={{ fontSize: '12px', color: inkSub, margin: '2px 0 0' }}>{nextPlanDetail}</p>}
            </div>
            <div style={{ width: '28px', height: '28px', background: `${navy}14`, borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: navy, fontSize: '14px', flexShrink: 0 }}>→</div>
          </div>
        )}

        {/* 학부모 질문하기 — PublicReport엔 항상 있는 섹션이라 미리보기에서도 보여줌(안내용, 비활성) */}
        <div style={{ height: '1px', background: rule, margin: '18px 0' }} />
        <div>
          <p style={{ fontSize: '10px', fontWeight: 700, color: inkMute, letterSpacing: '0.08em', margin: '0 0 10px' }}>궁금한 점이 있으신가요?</p>
          <p style={{ fontSize: '11px', color: inkMute, margin: 0, fontStyle: 'italic' }}>학부모가 리포트 페이지에서 직접 질문을 남길 수 있어요</p>
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
    <div style={{ background: TOKENS.bg, borderRadius: `${RADIUS2.card}px`, padding: '16px', border: `1px solid ${TOKENS.border}` }}>
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
  return <p style={{ fontSize: '11px', color: TOKENS.textSub, fontWeight: 700, margin: '0 0 5px' }}>{children}</p>;
}

// 1d 확정안 — 필수 카드 안의 "100px 라벨 + 입력" 한 줄. 모바일(!wide)에선 라벨이 위로 올라감
function FieldRow({ wide, label, sub, disabled, children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: wide ? '100px minmax(0,1fr)' : '1fr', gap: wide ? '16px' : '8px',
      alignItems: 'start', opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : 'auto',
    }}>
      <div style={{ paddingTop: wide ? '8px' : 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: TOKENS.text, display: 'block' }}>{label}</span>
        {sub && <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.5, color: 'rgba(55,56,60,0.75)', display: 'block', marginTop: '4px' }}>{sub}</span>}
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

// 1d 선택 그룹 접기 카드 — 기본 접힘, 접힌 줄에 제목/힌트/상태 텍스트만 표시.
// 접혀 있으면 children을 아예 렌더하지 않음(상태는 전부 부모에 있어 유실 없음)
function FoldSection({ title, hint, state, stateColor, open, onToggle, children }) {
  return (
    <div style={{ border: '1px solid #E4E6EB', borderRadius: '12px', background: TOKENS.bg, overflow: 'hidden' }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{
          width: '100%', border: 'none', background: TOKENS.bg, padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: TOKENS.text }}>{title}</span>
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)' }}>{hint}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: stateColor || 'rgba(55,56,60,0.75)' }}>{state}</span>
          <span aria-hidden="true" style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(55,56,60,0.75)' }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ height: '1px', background: '#F1F1F4', marginBottom: '14px' }} />
          {children}
        </div>
      )}
    </div>
  );
}

// 필수/선택/마무리 그룹 구분 스트립 (1d의 "1 · 필수 ── 여기까지만 채우면 저장 가능" 줄)
function GroupDivider({ num, title, hint, tone = 'muted' }) {
  const ink = tone === 'brand' ? R.navy : 'rgba(55,56,60,0.75)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '2px 4px 0' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.4px', color: ink, whiteSpace: 'nowrap' }}>{num} · {title}</span>
      <div style={{ flex: 1, height: '1px', background: '#E4E6EB' }} />
      {hint && <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(55,56,60,0.75)', whiteSpace: 'nowrap' }}>{hint}</span>}
    </div>
  );
}

// 1d 확정안의 10칸 점수 그리드 — 기존 range 슬라이더 대체. 값까지 채움(≤value) 방식,
// 같은 칸 재클릭 시 해제(미입력), 키보드 1~9=10~90% / 0=100%
function ScoreGrid({ wide, label, value, onChange }) {
  const handleKey = (e) => {
    if (e.key >= '1' && e.key <= '9') { onChange(Number(e.key) * 10); e.preventDefault(); }
    else if (e.key === '0') { onChange(100); e.preventDefault(); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onKeyDown={handleKey}>
      <span style={{ minWidth: '34px', fontSize: '12px', fontWeight: 600, color: 'rgba(55,56,60,0.75)', flexShrink: 0 }}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0,1fr))', gap: '4px' }}>
        {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(n => {
          const filled = value != null && n <= value;
          return (
            <button type="button" key={n} role="radio" aria-checked={value === n}
              aria-label={`${n}%`}
              onClick={() => onChange(value === n ? null : n)}
              style={{
                minWidth: 0, height: wide ? '34px' : '44px', padding: 0,
                border: `1px solid ${filled ? R.navy : '#DCDFE4'}`, borderRadius: '6px',
                background: filled ? R.navy : '#fff', color: filled ? '#fff' : 'rgba(55,56,60,0.75)',
                fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
              }}>{n}</button>
          );
        })}
      </div>
      <span style={{ minWidth: '52px', fontSize: '14px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: value != null ? R.navy : TOKENS.textMute }}>
        {value != null ? `${value}%` : '미입력'}
      </span>
    </div>
  );
}

// 네이티브 <input type="time">는 오전/오후 세그먼트를 정밀 클릭해야 해서 터치로 조작하기 불편하고
// 브라우저마다 표시(시계 아이콘 등)가 달라 오전/오후 · 시 · 분을 각각 버튼/셀렉트로 분리
function TimeField({ wide, value, onChange }) {
  const [hh, mm] = (value || '15:30').split(':').map(Number);
  const isPM = hh >= 12;
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  const cellH = wide ? '36px' : '44px';
  const setPart = (nextHour12, nextIsPM, nextMinute) => {
    const h24 = nextIsPM ? (nextHour12 % 12) + 12 : (nextHour12 % 12);
    onChange(`${String(h24).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`);
  };
  const minuteOptions = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minuteOptions.includes(mm)) { minuteOptions.push(mm); minuteOptions.sort((a, b) => a - b); }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ display: 'flex', border: `1px solid ${TOKENS.border}`, borderRadius: `${RADIUS2.chip}px`, overflow: 'hidden', flexShrink: 0 }}>
        {['오전', '오후'].map((label, i) => {
          const active = isPM === (i === 1);
          return (
            <button type="button" key={label} onClick={() => setPart(hour12, i === 1, mm)}
              style={{
                padding: '0 12px', height: cellH, fontSize: '13px', fontWeight: active ? 700 : 500,
                border: 'none', background: active ? TOKENS.infoBg : TOKENS.bg, color: active ? TOKENS.infoDark : TOKENS.textSub,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{label}</button>
          );
        })}
      </div>
      <select value={hour12} onChange={(e) => setPart(Number(e.target.value), isPM, mm)}
        style={{ ...selectStyle, height: cellH, width: '62px', minWidth: '62px', paddingLeft: '8px', paddingRight: '22px', textAlign: 'center' }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}시</option>)}
      </select>
      <select value={mm} onChange={(e) => setPart(hour12, isPM, Number(e.target.value))}
        style={{ ...selectStyle, height: cellH, width: '68px', minWidth: '68px', paddingLeft: '8px', paddingRight: '22px', textAlign: 'center' }}>
        {minuteOptions.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>)}
      </select>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 11px', fontSize: '16px',
  border: `1px solid ${TOKENS.border}`, borderRadius: `${RADIUS2.input}px`,
  background: TOKENS.bgSoft, outline: 'none',
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
  fontWeight: 500, color: TOKENS.text, letterSpacing: '-0.02em', boxSizing: 'border-box',
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
  borderRadius: `${RADIUS2.chip}px`, border: `1px solid ${active ? TOKENS.info : TOKENS.border}`,
  background: active ? TOKENS.infoBg : TOKENS.bg, color: active ? TOKENS.infoDark : TOKENS.textSub,
  cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.02em',
});
const tagStyle = (color, active) => {
  const c = { warn: { bg: TOKENS.warnBg, border: TOKENS.warnBorder, text: TOKENS.warnText }, danger: { bg: TOKENS.dangerBg, border: TOKENS.dangerBorder, text: TOKENS.danger }, success: { bg: TOKENS.successBg, border: TOKENS.success, text: TOKENS.successDark } }[color] || {};
  return { padding: '4px 9px', fontSize: '12px', fontWeight: 600, borderRadius: `${RADIUS2.chip}px`, border: `1px solid ${active ? c.border : TOKENS.border}`, background: active ? c.bg : TOKENS.bg, color: active ? c.text : TOKENS.textSub, cursor: 'pointer', fontFamily: 'inherit' };
};
const toggleStyle = (active) => ({
  flex: 1, padding: '7px', fontSize: '12px', fontWeight: active ? 700 : 500,
  border: 'none', borderRadius: `${RADIUS2.chip}px`, background: active ? TOKENS.bg : 'transparent',
  color: active ? TOKENS.infoDark : TOKENS.textSub, cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
});
const suggestionStyle = { padding: '7px 12px', fontSize: '12px', fontWeight: 500, borderRadius: `${RADIUS2.chip}px`, border: 'none', background: TOKENS.brandLight, color: TOKENS.brand, cursor: 'pointer', fontFamily: 'inherit', minHeight: '32px' };
const aiButtonStyle = (disabled) => ({
  marginTop: '8px', width: '100%', padding: '9px', fontSize: '12px', fontWeight: 700,
  borderRadius: `${RADIUS2.input}px`, border: `1px solid ${disabled ? TOKENS.border : TOKENS.success}`,
  background: disabled ? TOKENS.bgSoft : TOKENS.bg, color: disabled ? TOKENS.textMute : TOKENS.success,
  cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: '5px', fontFamily: 'inherit',
});
// 메인 액션(저장/발송) — Primary Navy 전용. padding은 스펙 섹션 5 "Primary 버튼 padding: 16px(수직)/20px(수평)" 그대로
const submitButtonStyle = (valid) => ({
  padding: '16px 20px', fontSize: '14px', fontWeight: 700, borderRadius: `${RADIUS2.input}px`, border: 'none',
  background: valid ? TOKENS.brand : TOKENS.border, color: valid ? '#fff' : TOKENS.textMute, cursor: valid ? 'pointer' : 'not-allowed',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
  fontFamily: 'inherit', boxShadow: valid ? '0 4px 14px rgba(13,45,107,0.28)' : 'none',
});
const addStudentButtonStyle = {
  marginTop: '8px', width: '100%', padding: '10px', fontSize: '13px', fontWeight: 700,
  borderRadius: `${RADIUS2.input}px`, border: `1px dashed ${TOKENS.brand}`, background: TOKENS.brandLight, color: TOKENS.brand,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: '5px', fontFamily: 'inherit',
};

