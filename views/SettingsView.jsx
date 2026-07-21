import React from 'react';
import { db, auth, createUserWithoutSignIn } from '../firebase';
import { collection, addDoc, doc, getDoc, getDocs, setDoc, serverTimestamp, getCountFromServer, increment } from 'firebase/firestore';
import { Pencil, AlertTriangle, Check, HelpCircle, X } from 'lucide-react';
import { T, C } from '../tokens.jsx';
import { PRESET_SKINS } from './shared.jsx';

const DEFAULT_SKIN_COLOR = '#1A2540';

// ── 학원 ID 슬러그 제안/검증 — "새 학원 추가" 전용
function slugifyAcademyId(name) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || `academy-${Date.now().toString(36)}`;
}
function isValidAcademyId(id) {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(id) && !/^__.*__$/.test(id);
}

// "교현초 5학년" 형태의 school 문자열에서 학년 숫자만 찾아 +1 — DiagnosticReportInput.jsx의
// guessCourseKey와 동일한 급(초/중/고) 판별 규칙을 재사용해 일관성 유지.
// 초6/중3/고3(급 전환 대상 — 학교명 자체가 바뀌어야 함)은 건드리지 않고 null 반환.
function bumpGrade(school) {
  const m = school.match(/(\d)\s*학년/);
  if (!m) return null;
  const grade = parseInt(m[1], 10);
  const namePart = school.split(/\d/)[0];
  const lastCho = namePart.lastIndexOf('초');
  const lastJung = namePart.lastIndexOf('중');
  const lastGo = namePart.lastIndexOf('고');
  const maxIdx = Math.max(lastCho, lastJung, lastGo);
  const level = maxIdx < 0 ? null : maxIdx === lastGo ? '고' : maxIdx === lastJung ? '중' : '초';
  const maxGrade = level === '초' ? 6 : 3;
  if (!level || grade >= maxGrade) return null;
  return school.replace(/\d\s*학년/, `${grade + 1}학년`);
}

// ── 메인 컬러 → 파생 색상 자동 계산 — SettingsView 전용
function deriveColors(mainHex) {
  const r = parseInt(mainHex.slice(1,3),16);
  const g = parseInt(mainHex.slice(3,5),16);
  const b = parseInt(mainHex.slice(5,7),16);
  const toHex = (r,g,b) => '#' + [r,g,b].map(v =>
    Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')
  ).join('');
  const lum = 0.299*r + 0.587*g + 0.114*b;
  return {
    main:      mainHex,
    headerBg:  `linear-gradient(155deg, ${toHex(r-20,g-20,b-20)}, ${mainHex}, ${toHex(r+30,g+30,b+30)})`,
    cardDark:  mainHex,
    cardLight: toHex(r+140,g+140,b+140),
    textDark:  '#ffffff',
    textLight: lum > 128 ? '#1A1A1A' : toHex(r-60,g-60,b-60),
    subDark:   'rgba(255,255,255,0.55)',
    subLight:  toHex(r+60,g+60,b+60),
    nextBg:    mainHex,
    footerText: toHex(r+80,g+80,b+80),
    commentBorder: mainHex,
    commentBg: toHex(r+150,g+150,b+150),
    tagBg:     toHex(r+150,g+150,b+150),
    tagBorder: toHex(r+100,g+100,b+100),
    tagText:   lum > 128 ? '#1A1A1A' : toHex(r-40,g-40,b-40),
  };
}

export default function SettingsView({ students, onSaveStudent, teachers, onSaveTeacher, onDeleteTeacher, classes = [], onSaveClass, onDeleteClass, logoUrl, onSaveLogo, onDeleteLogo, academyId, academyPhone, academySkinColor, academySubjects, isPlatformAdmin = false, onToast }) {
  // 플랫폼 관리 섹션(가입신청/새학원/분양학원)이 늘어나면서 학원 설정과 한 페이지에 다 있으면
  // 스크롤이 너무 길어져 탭으로 분리 — 플랫폼 관리자가 아니면 애초에 두 번째 탭 내용이 없으니 탭 자체를 안 보여줌
  const [settingsTab, setSettingsTab] = React.useState('academy'); // 'academy' | 'platform'
  // academies/{academyId} 문서에 저장된 값이 있으면 그걸 기준으로, 없으면(마이그레이션 직후 등)
  // 예전 localStorage 값을 폴백으로 사용 — 기기별로 갈리던 색상을 학원 단위로 통일하는 과도기 처리
  const [globalColor, setGlobalColor] = React.useState(() => {
    return academySkinColor || localStorage.getItem('globalSkinColor') || DEFAULT_SKIN_COLOR;
  });
  React.useEffect(() => {
    if (academySkinColor) setGlobalColor(academySkinColor);
  }, [academySkinColor]);
  const [saved, setSaved] = React.useState(false);
  const colorInputRef = React.useRef(null);
  const [logoUploading, setLogoUploading] = React.useState(false);
  const [showLogoDeleteConfirm, setShowLogoDeleteConfirm] = React.useState(false);
  const logoInputRef = React.useRef(null);

  // 학원 연락처 — 리포트 작성 화면 미리보기 푸터에 표시(설정 안 하면 표시 안 함)
  const [phone, setPhone] = React.useState(academyPhone || '');
  const [phoneSaving, setPhoneSaving] = React.useState(false);
  const [phoneSaved, setPhoneSaved] = React.useState(false);
  React.useEffect(() => { setPhone(academyPhone || ''); }, [academyPhone]);

  // 과목 목록 — 리포트 작성 화면의 "과목" 선택 버튼에 그대로 반영됨. 미설정이면 기본값(수학/영어/기타).
  const [subjectsInput, setSubjectsInput] = React.useState((academySubjects || ['수학', '영어', '기타']).join(', '));
  const [subjectsSaving, setSubjectsSaving] = React.useState(false);
  const [subjectsSaved, setSubjectsSaved] = React.useState(false);
  React.useEffect(() => { setSubjectsInput((academySubjects || ['수학', '영어', '기타']).join(', ')); }, [academySubjects]);
  const saveSubjects = async () => {
    const list = subjectsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { onToast?.('과목을 하나 이상 입력해주세요.', 'error'); return; }
    setSubjectsSaving(true);
    try {
      await setDoc(doc(db, 'academies', academyId), { subjects: list }, { merge: true });
      setSubjectsSaved(true);
      setTimeout(() => setSubjectsSaved(false), 2000);
    } catch (e) {
      console.error('과목 목록 저장 실패:', e);
      onToast?.('과목 목록 저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
    setSubjectsSaving(false);
  };
  const savePhone = async () => {
    setPhoneSaving(true);
    try {
      await setDoc(doc(db, 'academies', academyId), { academyPhone: phone.trim() }, { merge: true });
      setPhoneSaved(true);
      setTimeout(() => setPhoneSaved(false), 2000);
    } catch (e) {
      console.error('전화번호 저장 실패:', e);
      onToast?.('전화번호 저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
    setPhoneSaving(false);
  };

  const handleLogoFile = async (file) => {
    if (!file) return;
    setLogoUploading(true);
    await onSaveLogo(file);
    setLogoUploading(false);
  };

  // 강사 이름 수정
  const [editingTeacherId, setEditingTeacherId] = React.useState(null);
  const [editingTeacherName, setEditingTeacherName] = React.useState('');
  const [confirmingTeacherDelete, setConfirmingTeacherDelete] = React.useState(null);

  // 강사 계정 생성
  const [newTeacherEmail, setNewTeacherEmail] = React.useState('');
  const [newTeacherPassword, setNewTeacherPassword] = React.useState('');
  const [newTeacherName, setNewTeacherName] = React.useState('');
  const [accountCreating, setAccountCreating] = React.useState(false);
  const [accountResult, setAccountResult] = React.useState('');
  const [accountSuccess, setAccountSuccess] = React.useState(false);

  // 반 이름 수정 + 생성
  const [editingClassId, setEditingClassId] = React.useState(null);
  const [editingClassName, setEditingClassName] = React.useState('');
  const [confirmingClassDelete, setConfirmingClassDelete] = React.useState(null);
  const [newClassName, setNewClassName] = React.useState('');
  const [newClassTeacherId, setNewClassTeacherId] = React.useState('');
  // 반이 처음 보는 학원(분양학원)엔 낯선 기능이라, 기본은 접어두고 필요할 때만 펼쳐보는 도움말
  const [showClassGuide, setShowClassGuide] = React.useState(false);

  const handleClassNameSave = async (cls) => {
    if (!editingClassName.trim()) return;
    await onSaveClass({ ...cls, name: editingClassName.trim() });
    setEditingClassId(null);
    setEditingClassName('');
  };
  const handleCreateClass = async () => {
    if (!newClassName.trim() || !newClassTeacherId) return;
    await onSaveClass({ name: newClassName.trim(), teacherId: newClassTeacherId });
    setNewClassName('');
    setNewClassTeacherId('');
  };

  // 새 학년도 — 학년 일괄 올리기
  const [gradeBumpPreview, setGradeBumpPreview] = React.useState(null); // null 또는 { changes, skipped }
  const [gradeBumping, setGradeBumping] = React.useState(false);
  const [gradeBumpResult, setGradeBumpResult] = React.useState('');

  const handlePreviewGradeBump = () => {
    setGradeBumpResult('');
    const activeStudents = students.filter(s => !s.archived);
    const changes = [];
    const skipped = [];
    activeStudents.forEach(s => {
      const to = bumpGrade(s.school || '');
      if (to) changes.push({ id: s.id, name: s.name, from: s.school, to });
      else skipped.push(s);
    });
    setGradeBumpPreview({ changes, skipped });
  };

  const handleApplyGradeBump = async () => {
    if (!gradeBumpPreview || gradeBumpPreview.changes.length === 0) return;
    setGradeBumping(true);
    await Promise.all(gradeBumpPreview.changes.map(c => onSaveStudent({ id: c.id, school: c.to })));
    setGradeBumping(false);
    setGradeBumpResult(`${gradeBumpPreview.changes.length}명의 학년을 올렸습니다.`);
    setGradeBumpPreview(null);
    setTimeout(() => setGradeBumpResult(''), 3000);
  };

  // 새 학원 추가 (플랫폼 관리자 전용)
  const [newAcademyName, setNewAcademyName] = React.useState('');
  const [newAcademyId, setNewAcademyId] = React.useState('');
  const [academyIdTouched, setAcademyIdTouched] = React.useState(false);
  const [newDirectorName, setNewDirectorName] = React.useState('');
  const [newDirectorEmail, setNewDirectorEmail] = React.useState('');
  const [newDirectorPassword, setNewDirectorPassword] = React.useState('');
  const [academyCreating, setAcademyCreating] = React.useState(false);
  const [academyResult, setAcademyResult] = React.useState('');
  const [academySuccess, setAcademySuccess] = React.useState(false);

  React.useEffect(() => {
    if (!academyIdTouched) setNewAcademyId(slugifyAcademyId(newAcademyName));
  }, [newAcademyName, academyIdTouched]);

  // 학원 가입 신청 목록 + 승인/거절 (플랫폼 관리자 전용).
  // 승인/거절 후에도 신청 당시 정보(사업자등록번호·주소 등 — 세금계산서 발행 때 다시 필요)를
  // 계속 조회할 수 있어야 해서, status로 걸러서 가져오지 않고 전체를 가져온 뒤 탭으로만 화면에서 나눔.
  const [signupRequests, setSignupRequests] = React.useState([]);
  const [signupTab, setSignupTab] = React.useState('pending'); // 'pending' | 'approved' | 'rejected'
  const [expandedRequestId, setExpandedRequestId] = React.useState(null);
  const [academyIdForApproval, setAcademyIdForApproval] = React.useState('');
  const [approving, setApproving] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [signupActionResult, setSignupActionResult] = React.useState('');

  const loadSignupRequests = React.useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'academySignupRequests'));
      setSignupRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (e) {
      console.error('가입 신청 목록 조회 실패:', e);
    }
  }, []);

  const toggleSignupRequest = (req) => {
    if (expandedRequestId === req.id) { setExpandedRequestId(null); return; }
    setExpandedRequestId(req.id);
    setAcademyIdForApproval(slugifyAcademyId(req.academyName || ''));
    setSignupActionResult('');
  };

  const handleApproveSignup = async (req) => {
    const trimmedId = academyIdForApproval.trim();
    if (!isValidAcademyId(trimmedId)) {
      setSignupActionResult('학원 ID는 영문 소문자/숫자/하이픈만, 3~63자로 입력해주세요.');
      return;
    }
    setApproving(true);
    setSignupActionResult('');
    try {
      // 1. ID 중복 체크
      const existing = await getDoc(doc(db, 'academies', trimmedId));
      if (existing.exists()) throw new Error('이미 사용 중인 학원 ID입니다.');
      // 2. academies/{id} 브랜딩 문서 — handleCreateAcademy와 동일한 형태
      await setDoc(doc(db, 'academies', trimmedId), {
        academyName: req.academyName, globalSkinColor: DEFAULT_SKIN_COLOR, createdAt: serverTimestamp(),
      });
      // 3. 원장 본인의 teachers 레코드
      const teacherRef = await addDoc(collection(db, 'academies', trimmedId, 'teachers'), {
        name: req.directorName, createdAt: serverTimestamp(),
      });
      // 4. users/{uid} — 신청 시점에 이미 만들어진 계정을 활성화(role/academyId 채워넣기).
      //    handleCreateAcademy와 달리 여기선 Auth 계정을 새로 만들지 않음(이미 있음).
      await setDoc(doc(db, 'users', req.uid), {
        role: 'director', teacherId: teacherRef.id, academyId: trimmedId, email: req.email,
        status: null, createdAt: serverTimestamp(),
      }, { merge: true });
      // 5. 신청 문서 상태 갱신 — academyId를 같이 남겨야 승인 후에도 "이 신청이 어느 학원이 됐는지" 추적 가능
      await setDoc(doc(db, 'academySignupRequests', req.uid), {
        status: 'approved', academyId: trimmedId, reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser?.email || null,
      }, { merge: true });
      setSignupActionResult(`${req.academyName} 승인 완료! (ID: ${trimmedId})`);
      setExpandedRequestId(null);
      loadSignupRequests();
      loadAcademies();
    } catch (e) {
      setSignupActionResult(`오류: ${e.message}`);
    }
    setApproving(false);
  };

  const handleRejectSignup = async (req) => {
    setRejecting(true);
    try {
      await setDoc(doc(db, 'academySignupRequests', req.uid), {
        status: 'rejected', reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser?.email || null,
      }, { merge: true });
      await setDoc(doc(db, 'users', req.uid), { status: 'rejected' }, { merge: true });
      setExpandedRequestId(null);
      loadSignupRequests();
    } catch (e) {
      setSignupActionResult(`오류: ${e.message}`);
    }
    setRejecting(false);
  };

  // 신청 삭제 — 아직 학원이 안 된 상태(대기/거절)만 대상. 승인된 건은 서버에서도 다시 막음.
  const [confirmingDeleteId, setConfirmingDeleteId] = React.useState(null);
  const [deletingRequestId, setDeletingRequestId] = React.useState(null);

  const handleDeleteSignupRequest = async (req) => {
    if (confirmingDeleteId !== req.id) {
      setConfirmingDeleteId(req.id);
      setTimeout(() => setConfirmingDeleteId(prev => prev === req.id ? null : prev), 3000);
      return;
    }
    setConfirmingDeleteId(null);
    setDeletingRequestId(req.id);
    setSignupActionResult('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/delete-signup-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: req.uid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
      setSignupActionResult(`${req.academyName} 신청 삭제 완료`);
      setExpandedRequestId(null);
      loadSignupRequests();
    } catch (e) {
      setSignupActionResult(`오류: ${e.message}`);
    }
    setDeletingRequestId(null);
  };

  // 분양 학원 목록 + 정지/해제 + 통계 (플랫폼 관리자 전용)
  const [academyList, setAcademyList] = React.useState([]);
  const [academyStats, setAcademyStats] = React.useState({});
  const [confirmingSuspend, setConfirmingSuspend] = React.useState(null);
  const [togglingAcademy, setTogglingAcademy] = React.useState(null);

  // 학원 크레딧 수동 지급 — 실제 PG 연동 전 임시 장부. 은행 입금 확인 후 관리자가 직접 반영.
  const PACKAGE_PRICES = { '20': 5000, '50': 10000, '200': 30000, '500': 50000 };
  const [academyBilling, setAcademyBilling] = React.useState({}); // { [academyId]: { balance, history } }
  const [billingLoading, setBillingLoading] = React.useState(null);
  const [creditFormOpen, setCreditFormOpen] = React.useState(null);
  const [creditPackage, setCreditPackage] = React.useState('20');
  const [creditAmount, setCreditAmount] = React.useState(String(PACKAGE_PRICES['20']));
  const [creditMemo, setCreditMemo] = React.useState('');
  const [creditGranting, setCreditGranting] = React.useState(false);

  const loadBilling = async (targetAcademyId) => {
    setBillingLoading(targetAcademyId);
    try {
      const [billingSnap, historySnap] = await Promise.all([
        getDoc(doc(db, 'academies', targetAcademyId, 'private', 'billing')),
        getDocs(collection(db, 'academies', targetAcademyId, 'paymentHistory')),
      ]);
      const history = historySnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.grantedAt?.seconds || 0) - (a.grantedAt?.seconds || 0));
      setAcademyBilling(prev => ({ ...prev, [targetAcademyId]: { balance: billingSnap.exists() ? (billingSnap.data().creditBalance || 0) : 0, history } }));
    } catch (e) {
      console.error('크레딧 정보 조회 실패:', e);
    }
    setBillingLoading(null);
  };

  const toggleCreditForm = (targetAcademyId) => {
    if (creditFormOpen === targetAcademyId) { setCreditFormOpen(null); return; }
    setCreditFormOpen(targetAcademyId);
    setCreditPackage('20'); setCreditAmount(String(PACKAGE_PRICES['20'])); setCreditMemo('');
    if (!academyBilling[targetAcademyId]) loadBilling(targetAcademyId);
  };

  const handleGrantCredit = async (targetAcademyId) => {
    const pkg = parseInt(creditPackage, 10);
    const amount = parseInt(creditAmount, 10);
    if (!pkg || !amount) return;
    setCreditGranting(true);
    try {
      await setDoc(doc(db, 'academies', targetAcademyId, 'private', 'billing'), {
        creditBalance: increment(pkg), creditPackage: pkg, updatedAt: serverTimestamp(),
      }, { merge: true });
      await addDoc(collection(db, 'academies', targetAcademyId, 'paymentHistory'), {
        packageSize: pkg, amount, method: 'bank_transfer', memo: creditMemo.trim(), grantedAt: serverTimestamp(),
      });
      await loadBilling(targetAcademyId);
      setCreditFormOpen(null);
    } catch (e) {
      console.error('크레딧 지급 실패:', e);
    }
    setCreditGranting(false);
  };

  const loadAcademies = React.useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'academies'));
      const academies = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAcademyList(academies);
      // 통계는 목록보다 느릴 수 있어 별도로 채워넣음 — 목록/토글은 통계 로딩과 무관하게 바로 동작
      // isDraft:true(자동저장 초안)는 실제 발송된 리포트가 아니므로 건수에서 제외 — 안 그러면
      // 회수제 청구 시 과다 청구될 수 있음. Firestore where('isDraft','==',false) 쿼리는 isDraft
      // 필드 자체가 없는 예전 리포트(기능 추가 이전 작성분)까지 통째로 빠뜨려서 오히려 과소 집계되므로,
      // 서버 집계 쿼리 대신 리포트를 받아와 클라이언트에서 isDraft !== true로 거른다.
      const monthStartSec = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; })();
      const stats = await Promise.all(academies.map(async (a) => {
        try {
          const [studentCount, teacherCount, reportsSnap] = await Promise.all([
            getCountFromServer(collection(db, 'academies', a.id, 'students')),
            getCountFromServer(collection(db, 'academies', a.id, 'teachers')),
            getDocs(collection(db, 'academies', a.id, 'reports')),
          ]);
          const realReports = reportsSnap.docs.map(d => d.data()).filter(r => r.isDraft !== true);
          const monthReports = realReports.filter(r => (r.createdAt?.seconds || 0) >= monthStartSec);
          return {
            id: a.id,
            students: studentCount.data().count,
            teachers: teacherCount.data().count,
            reports: realReports.length,
            reportsThisMonth: monthReports.length,
          };
        } catch (e) {
          console.error(`${a.id} 통계 조회 실패:`, e);
          return { id: a.id, students: null, teachers: null, reports: null, reportsThisMonth: null };
        }
      }));
      setAcademyStats(Object.fromEntries(stats.map(s => [s.id, s])));
    } catch (e) {
      console.error('학원 목록 조회 실패:', e);
    }
  }, []);

  React.useEffect(() => {
    if (isPlatformAdmin) { loadAcademies(); loadSignupRequests(); }
  }, [isPlatformAdmin, loadAcademies, loadSignupRequests]);

  const handleToggleSuspend = async (academy) => {
    const suspending = academy.status !== 'suspended';
    // 정지는 파급이 크니 재클릭 확인, 해제는 바로 실행
    if (suspending && confirmingSuspend !== academy.id) {
      setConfirmingSuspend(academy.id);
      setTimeout(() => setConfirmingSuspend(prev => prev === academy.id ? null : prev), 3000);
      return;
    }
    setConfirmingSuspend(null);
    setTogglingAcademy(academy.id);
    try {
      await setDoc(doc(db, 'academies', academy.id), { status: suspending ? 'suspended' : 'active' }, { merge: true });
      await loadAcademies();
    } catch (e) {
      console.error('학원 상태 변경 실패:', e);
    }
    setTogglingAcademy(null);
  };

  const handleTeacherNameSave = async (teacher) => {
    if (!editingTeacherName.trim()) return;
    await onSaveTeacher({ ...teacher, name: editingTeacherName.trim() });
    setEditingTeacherId(null);
    setEditingTeacherName('');
  };

  const handleCreateTeacherAccount = async () => {
    if (!newTeacherEmail || !newTeacherPassword || !newTeacherName) {
      setAccountResult('이름, 이메일, 비밀번호를 모두 입력해주세요.');
      setAccountSuccess(false);
      return;
    }
    setAccountCreating(true);
    setAccountResult('');
    try {
      // 1. Firebase Auth 계정 생성 — 관리자 본인 세션을 안 바꾸는 헬퍼 사용
      //    (createUserWithEmailAndPassword(auth, ...)를 그냥 쓰면 새로 만든 계정으로
      //    즉시 로그인 세션이 전환돼버리는 SDK 특성이 있어서, 별도 App 인스턴스로 우회)
      const newUid = await createUserWithoutSignIn(newTeacherEmail, newTeacherPassword);
      // 2. 학원 소속 teachers 서브컬렉션에 강사 추가
      const teacherRef = await addDoc(collection(db, 'academies', academyId, 'teachers'), { name: newTeacherName, createdAt: serverTimestamp() });
      // 3. users/{uid} 고정 경로에 role·academyId 저장 (uid를 문서 ID로 써야
      //    보안 규칙에서 "내 문서인지"를 get()으로 안전하게 확인할 수 있음 — 자동 ID였으면
      //    list 권한을 열어줘야 해서 다른 학원 직원 이메일까지 노출됐을 것)
      await setDoc(doc(db, 'users', newUid), { role: 'teacher', teacherId: teacherRef.id, academyId, email: newTeacherEmail, createdAt: serverTimestamp() });
      setAccountResult(`${newTeacherName} 강사 계정 생성 완료!`);
      setAccountSuccess(true);
      setNewTeacherEmail(''); setNewTeacherPassword(''); setNewTeacherName('');
    } catch (e) {
      const msg = e.code === 'auth/email-already-in-use' ? '이미 사용 중인 이메일입니다.' : e.message;
      setAccountResult(`오류: ${msg}`);
      setAccountSuccess(false);
    }
    setAccountCreating(false);
  };

  const handleCreateAcademy = async () => {
    const trimmedName = newAcademyName.trim();
    const trimmedId = newAcademyId.trim();
    if (!trimmedName || !trimmedId || !newDirectorName.trim() || !newDirectorEmail || !newDirectorPassword) {
      setAcademyResult('모든 항목을 입력해주세요.');
      setAcademySuccess(false);
      return;
    }
    if (!isValidAcademyId(trimmedId)) {
      setAcademyResult('학원 ID는 영문 소문자/숫자/하이픈만, 3~63자로 입력해주세요.');
      setAcademySuccess(false);
      return;
    }
    setAcademyCreating(true);
    setAcademyResult('');
    try {
      // 1. ID 중복 체크 — 가장 흔한 실수를 계정 생성(되돌리기 번거로움) 이전에 걸러냄
      const existing = await getDoc(doc(db, 'academies', trimmedId));
      if (existing.exists()) throw new Error('이미 사용 중인 학원 ID입니다.');
      // 2. 원장 Auth 계정 생성 — 실패 가능성이 가장 높은 단계를 Firestore 쓰기보다 먼저 수행해서,
      //    여기서 실패하면 Firestore에 아무 흔적도 안 남고 재시도가 항상 깨끗하게 시작되게 함
      const newUid = await createUserWithoutSignIn(newDirectorEmail, newDirectorPassword);
      // 3. academies/{id} 브랜딩 문서
      await setDoc(doc(db, 'academies', trimmedId), {
        academyName: trimmedName, globalSkinColor: DEFAULT_SKIN_COLOR, createdAt: serverTimestamp(),
      });
      // 4. 원장 본인의 teachers 레코드 — 리포트 작성 시 담당 강사(teacherId) 선택이 필수라서,
      //    직접 리포트를 쓰려면 원장도 강사 레코드가 있어야 함
      const teacherRef = await addDoc(collection(db, 'academies', trimmedId, 'teachers'), {
        name: newDirectorName.trim(), createdAt: serverTimestamp(),
      });
      // 5. users/{uid} — 이 문서가 있어야 로그인 시 unauthorized 화면을 벗어남
      await setDoc(doc(db, 'users', newUid), {
        role: 'director', teacherId: teacherRef.id, academyId: trimmedId, email: newDirectorEmail, createdAt: serverTimestamp(),
      });
      setAcademyResult(`${trimmedName} 학원 생성 완료! (ID: ${trimmedId})`);
      setAcademySuccess(true);
      setNewAcademyName(''); setNewAcademyId(''); setAcademyIdTouched(false);
      setNewDirectorName(''); setNewDirectorEmail(''); setNewDirectorPassword('');
      loadAcademies();
    } catch (e) {
      const msg = e.code === 'auth/email-already-in-use' ? '이미 사용 중인 이메일입니다.'
        : e.code === 'auth/weak-password' ? '비밀번호는 6자 이상이어야 합니다.' : e.message;
      setAcademyResult(`오류: ${msg}`);
      setAcademySuccess(false);
    }
    setAcademyCreating(false);
  };

  const saveGlobalColor = async () => {
    localStorage.setItem('globalSkinColor', globalColor); // 즉시 반영용 로컬 캐시, 진짜 저장은 아래 Firestore
    try {
      await setDoc(doc(db, 'academies', academyId), { globalSkinColor: globalColor }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      // 실패해도 로컬 캐시(localStorage)는 이미 바뀌어서 화면상 색은 바뀐 것처럼 보일 수 있음 —
      // Firestore 저장이 안 됐다는 걸 명확히 알려야 새로고침/다른 기기에서 안 바뀐 걸 보고 헷갈리지 않음
      console.error('스킨 색상 저장 실패:', e);
      onToast?.('색상 저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
  };

  const derived = deriveColors(globalColor);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', boxSizing: 'border-box' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.02em' }}>설정</h2>
      <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '16px', fontWeight: 500 }}>학원 기본 정보와 색상을 설정하세요. 학생별로 다르게 설정할 수 있습니다.</p>

      {isPlatformAdmin && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
          {[
            { key: 'academy', label: '학원 설정' },
            { key: 'platform', label: '플랫폼 관리' },
          ].map(t => (
            <button key={t.key} onClick={() => setSettingsTab(t.key)}
              style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '9px', cursor: 'pointer', fontFamily: 'inherit',
                border: settingsTab === t.key ? `1.5px solid ${C.primary}` : '1px solid #E5E7EB',
                background: settingsTab === t.key ? C.primaryLight : '#fff',
                color: settingsTab === t.key ? C.primary : '#6B7280',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {settingsTab === 'academy' && (<>

      {/* 학원 로고 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>학원 로고</p>
        <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 14px', lineHeight: 1.6 }}>
          앱 상단 헤더에 표시됩니다. 텍스트 없이 아이콘/마크만 있는 정사각형 이미지가 가장 깔끔하게 나옵니다.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: logoUrl ? 'transparent' : '#F9FAFB', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logoUrl
              ? <img src={logoUrl} alt="현재 로고" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '10px', color: '#9CA3AF' }}>미설정</span>}
          </div>
          <div style={{ flex: 1, display: 'flex', gap: '6px' }}>
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ''; }} />
            <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
              style={{ padding: '9px 16px', fontSize: '12px', fontWeight: 700, borderRadius: '9px', border: `1px solid ${C.primary}`, background: logoUploading ? '#F9FAFB' : C.primaryLight, color: logoUploading ? '#9CA3AF' : C.primary, cursor: logoUploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {logoUploading ? '업로드 중...' : logoUrl ? '로고 변경' : '로고 업로드'}
            </button>
            {logoUrl && (
              <button
                onClick={() => setShowLogoDeleteConfirm(true)}
                style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '9px', border: 'none', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 학원 연락처 — 리포트 작성 화면 미리보기 푸터에 표시. 미설정 시 그냥 표시 안 함 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>학원 연락처</p>
        <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 14px', lineHeight: 1.6 }}>
          리포트 작성 화면의 미리보기 카드 하단에 표시됩니다. 비워두면 표시되지 않습니다.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="예: 031-000-0000"
            style={{ flex: '1 1 160px', minWidth: 0, padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          <button onClick={savePhone} disabled={phoneSaving}
            style={{ flexShrink: 0, padding: '9px 16px', fontSize: '12px', fontWeight: 700, borderRadius: '9px', border: 'none', background: phoneSaving ? '#E5E7EB' : (phoneSaved ? C.success : C.primary), color: phoneSaving ? '#9CA3AF' : '#fff', cursor: phoneSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {phoneSaving ? '저장 중...' : phoneSaved ? '✓ 저장됨' : '저장'}
          </button>
        </div>
      </div>

      {/* 과목 목록 — 수학/영어 외 과목(국어, 과학 등)을 운영하는 학원을 위한 커스터마이즈.
          단, 표준 단원표(교재/단원 자동완성)는 수학·영어에만 있어 다른 과목은 직접 입력 방식으로 동작 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>과목 목록</p>
        <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 14px', lineHeight: 1.6 }}>
          리포트 작성 화면의 과목 선택 버튼에 표시됩니다. 쉼표(,)로 구분해서 입력하세요.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <input value={subjectsInput} onChange={(e) => setSubjectsInput(e.target.value)} placeholder="예: 수학, 영어, 국어, 기타"
            style={{ flex: '1 1 160px', minWidth: 0, padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          <button onClick={saveSubjects} disabled={subjectsSaving}
            style={{ flexShrink: 0, padding: '9px 16px', fontSize: '12px', fontWeight: 700, borderRadius: '9px', border: 'none', background: subjectsSaving ? '#E5E7EB' : (subjectsSaved ? C.success : C.primary), color: subjectsSaving ? '#9CA3AF' : '#fff', cursor: subjectsSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {subjectsSaving ? '저장 중...' : subjectsSaved ? '✓ 저장됨' : '저장'}
          </button>
        </div>
      </div>

      {/* 로고 삭제 확인 모달 — 헤더 전체에 반영되는 변화라 인라인 재클릭보다 명확하게 */}
      {showLogoDeleteConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowLogoDeleteConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '320px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEF2F2', border: '2px solid #DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '22px', color: '#DC2626', fontWeight: 700 }}>!</div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 6px' }}>학원 로고를 삭제할까요?</p>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 20px', lineHeight: 1.6 }}>삭제하면 앱 상단 헤더가 기본 아이콘으로 바뀝니다.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowLogoDeleteConfirm(false)}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                취소
              </button>
              <button onClick={() => { onDeleteLogo(); setShowLogoDeleteConfirm(false); }}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 학원 기본 스킨 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>학원 기본 스킨</p>
        <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 14px', lineHeight: 1.6 }}>
          리포트 작성 화면의 미리보기 카드 기본 색상입니다. 리포트 작성 시 "학원 기본" 스킨으로 표시되며,
          학생별 개별 색상이 설정된 학생에게는 개별 색상이 우선 적용됩니다.
        </p>

        {/* 프리셋 */}
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, marginBottom: '8px' }}>프리셋 선택</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {PRESET_SKINS.map(sk => (
            <div
              key={sk.key}
              onClick={() => setGlobalColor(sk.main)}
              style={{
                borderRadius: '10px', overflow: 'hidden', cursor: 'pointer',
                border: globalColor === sk.main ? `2.5px solid ${C.info}` : '2px solid #E5E7EB',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ height: '32px', background: sk.main }}></div>
              <div style={{ padding: '5px 4px', background: '#F9FAFB', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: globalColor === sk.main ? C.infoDark : '#6B7280' }}>{sk.name}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 커스텀 컬러피커 */}
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, marginBottom: '8px' }}>직접 선택</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F9FAFB', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
          <div style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '12px', background: globalColor, flexShrink: 0, border: '2px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <input ref={colorInputRef} type="color" value={globalColor} onChange={(e) => setGlobalColor(e.target.value)}
              style={{ position: 'absolute', inset: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', border: 'none', padding: 0, cursor: 'pointer', opacity: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 2px' }}>메인 컬러</p>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9B80C0', margin: 0, fontFamily: 'monospace' }}>{globalColor}</p>
          </div>
          <button
            onClick={() => colorInputRef.current?.click()}
            style={{ background: C.primaryLight, color: C.primary, border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            변경
          </button>
        </div>

        {/* 파생 색상 미리보기 */}
        <div style={{ background: '#F8F6FC', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
          <p style={{ fontSize: '9px', fontWeight: 700, color: '#B0A0C8', letterSpacing: '0.1em', marginBottom: '8px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>자동 파생 색상</p>
          {[
            { label: '헤더 배경', color: globalColor },
            { label: '다크 카드', color: globalColor },
            { label: '라이트 카드', color: derived.cardLight },
            { label: '텍스트 자동 대비', color: derived.textDark, text: '자동 계산' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: i < 3 ? '7px' : 0 }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: item.color, border: '1.5px solid rgba(0,0,0,0.06)', flexShrink: 0 }}></div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', flex: 1 }}>{item.label}</span>
              {item.text
                ? <span style={{ fontSize: '9px', fontWeight: 700, color: '#6B3FA0', background: '#F0E8FF', padding: '2px 7px', borderRadius: '6px' }}>{item.text}</span>
                : <span style={{ fontSize: '10px', fontWeight: 600, color: '#B0A0C8', fontFamily: 'monospace' }}>{item.color}</span>
              }
            </div>
          ))}
        </div>

        <button
          onClick={saveGlobalColor}
          style={{ width: '100%', background: saved ? C.success : C.primary, color: '#fff', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}>
          {saved ? '✓ 저장됐습니다!' : '학원 기본 스킨 저장'}
        </button>
      </div>

      {/* 강사 관리 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>강사 관리</p>
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: '14px' }}>강사 이름 수정 및 로그인 계정을 생성합니다.</p>

        {/* 강사 목록 + 이름 수정 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {teachers.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F6E56' }}>{t.name?.[0]}</span>
              </div>
              {editingTeacherId === t.id ? (
                <>
                  <input
                    value={editingTeacherName}
                    onChange={e => setEditingTeacherName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleTeacherNameSave(t)}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '16px', border: `1px solid ${C.primary}`, borderRadius: '8px', fontFamily: 'inherit', outline: 'none' }}
                    autoFocus
                  />
                  <button onClick={() => handleTeacherNameSave(t)} style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>저장</button>
                  <button onClick={() => setEditingTeacherId(null)} style={{ background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>{t.name}</span>
                  <button onClick={() => { setEditingTeacherId(t.id); setEditingTeacherName(t.name); }} style={{ background: C.primaryLight, color: C.primary, border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Pencil size={11} /> 수정
                  </button>
                  {(() => {
                    // 강사 삭제 전에 담당 학생이 몇 명인지 보여줘야 함 — 삭제해도 학생의
                    // assignedTeacherId는 그대로 남아 "삭제된 강사"를 가리키는 고아 상태가 됨
                    const assignedCount = students.filter(s => s.assignedTeacherId === t.id).length;
                    return (
                      <button onClick={() => {
                        if (confirmingTeacherDelete === t.id) {
                          onDeleteTeacher(t.id); setConfirmingTeacherDelete(null);
                        } else {
                          setConfirmingTeacherDelete(t.id);
                          setTimeout(() => setConfirmingTeacherDelete(prev => prev === t.id ? null : prev), 3000);
                        }
                      }} style={{ background: confirmingTeacherDelete === t.id ? '#DC2626' : '#FEF2F2', color: confirmingTeacherDelete === t.id ? '#fff' : '#DC2626', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {confirmingTeacherDelete === t.id
                          ? (assignedCount > 0 ? `확인 (담당 학생 ${assignedCount}명 남음)` : '확인 (재클릭)')
                          : (assignedCount > 0 ? `삭제 (담당 ${assignedCount}명)` : '삭제')}
                      </button>
                    );
                  })()}
                </>
              )}
            </div>
          ))}
        </div>

        {/* 강사 계정 생성 */}
        <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>새 강사 계정 생성</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} placeholder="강사 이름 (예: 영동 선생님)" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newTeacherEmail} onChange={e => setNewTeacherEmail(e.target.value)} placeholder="이메일" type="email" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newTeacherPassword} onChange={e => setNewTeacherPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" type="password" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={handleCreateTeacherAccount} disabled={accountCreating} style={{ background: accountCreating ? '#E5E7EB' : '#0F6E56', color: '#fff', border: 'none', borderRadius: '10px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: accountCreating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {accountCreating ? '생성 중...' : '강사 계정 생성'}
            </button>
            {accountResult && (
              <p style={{ fontSize: '12px', margin: 0, padding: '8px 12px', borderRadius: '8px', background: accountSuccess ? C.successBg : C.errorBg, color: accountSuccess ? C.successDark : C.errorDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                {accountSuccess ? <Check size={12} /> : <AlertTriangle size={12} />} {accountResult}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 반 관리 — 반을 만들고 담당 강사를 지정. 학생 등록/수정 시 이 반을 고르면 담당 강사가 자동으로 정해짐 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>반 관리</p>
          <button type="button" onClick={() => setShowClassGuide(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', color: showClassGuide ? C.primary : '#9CA3AF', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}>
            <HelpCircle size={13} /> 사용법
          </button>
        </div>
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: showClassGuide ? '10px' : '14px' }}>학생을 반으로 묶으면 담당 강사가 자동으로 지정됩니다.</p>

        {showClassGuide && (
          <div style={{ background: C.primaryLight, borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: C.primary, margin: 0 }}>반 사용법</p>
              <button type="button" onClick={() => setShowClassGuide(false)} title="닫기" style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', padding: '2px', display: 'flex' }}>
                <X size={14} />
              </button>
            </div>
            <ol style={{ margin: 0, padding: '0 0 0 18px', fontSize: '12px', color: '#1A1A1A', lineHeight: 1.9 }}>
              <li>아래 "새 반 만들기"에서 반 이름과 담당 강사를 정해서 반을 만드세요.</li>
              <li>학생 관리에서 학생을 등록/수정할 때 그 반을 선택하세요.</li>
              <li>그 학생의 담당 강사는 반의 담당 강사로 자동 지정돼요 — 따로 고를 필요 없어요.</li>
              <li>리포트 작성 화면의 학생 목록, 학습기록, 원장분석이 전부 반 단위로 묶여서 보여요.</li>
            </ol>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: '10px 0 0', lineHeight: 1.6 }}>
              반은 선택 사항이에요 — 하나도 안 만들어도 지금처럼 학생마다 담당 강사를 직접 골라 쓸 수 있어요.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {classes.length === 0 && (
            <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0 }}>등록된 반이 없습니다.</p>
          )}
          {classes.map(cls => {
            const classTeacher = teachers.find(t => t.id === cls.teacherId);
            const classStudentCount = students.filter(s => s.classId === cls.id).length;
            return (
              <div key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: C.primary }}>{cls.name?.[0]}</span>
                </div>
                {editingClassId === cls.id ? (
                  <>
                    <input
                      value={editingClassName}
                      onChange={e => setEditingClassName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleClassNameSave(cls)}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '16px', border: `1px solid ${C.primary}`, borderRadius: '8px', fontFamily: 'inherit', outline: 'none' }}
                      autoFocus
                    />
                    <button onClick={() => handleClassNameSave(cls)} style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>저장</button>
                    <button onClick={() => setEditingClassId(null)} style={{ background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A', margin: 0 }}>{cls.name}</p>
                      <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '2px 0 0' }}>{classTeacher ? `담당 ${classTeacher.name}` : '담당 강사 미지정(삭제된 강사)'} · 학생 {classStudentCount}명</p>
                    </div>
                    <button onClick={() => { setEditingClassId(cls.id); setEditingClassName(cls.name); }} style={{ background: C.primaryLight, color: C.primary, border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Pencil size={11} /> 수정
                    </button>
                    <button onClick={() => {
                      if (confirmingClassDelete === cls.id) {
                        onDeleteClass(cls.id); setConfirmingClassDelete(null);
                      } else {
                        setConfirmingClassDelete(cls.id);
                        setTimeout(() => setConfirmingClassDelete(prev => prev === cls.id ? null : prev), 3000);
                      }
                    }} style={{ background: confirmingClassDelete === cls.id ? '#DC2626' : '#FEF2F2', color: confirmingClassDelete === cls.id ? '#fff' : '#DC2626', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {confirmingClassDelete === cls.id
                        ? '확인 (재클릭)'
                        : (classStudentCount > 0 ? `삭제 (학생 ${classStudentCount}명 미배정 전환)` : '삭제')}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>새 반 만들기</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="반 이름 (예: 화목반)" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <select value={newClassTeacherId} onChange={e => setNewClassTeacherId(e.target.value)} style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', background: '#fff', color: '#374151' }}>
              <option value="">담당 강사 선택</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={handleCreateClass} disabled={!newClassName.trim() || !newClassTeacherId}
              style={{ background: (!newClassName.trim() || !newClassTeacherId) ? '#E5E7EB' : '#0F6E56', color: '#fff', border: 'none', borderRadius: '10px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: (!newClassName.trim() || !newClassTeacherId) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              반 만들기
            </button>
          </div>
        </div>
      </div>

      {/* 새 학년도 — 학년 일괄 올리기 */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>새 학년도 — 학년 일괄 올리기</p>
        <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: '14px', lineHeight: 1.6 }}>
          "학교" 항목에서 학년 숫자만 찾아 1씩 올려요. 초6·중3·고3처럼 학교를 옮겨야 하는 학생은 건드리지 않으니, 학교명은 직접 수정해주세요.
        </p>
        <button onClick={handlePreviewGradeBump}
          style={{ width: '100%', background: C.primaryLight, color: C.primary, border: `1px solid ${C.primary}`, borderRadius: '10px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          학년 올리기 미리보기
        </button>
        {gradeBumpResult && (
          <p style={{ fontSize: '12px', margin: '10px 0 0', padding: '8px 12px', borderRadius: '8px', background: C.successBg, color: C.successDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Check size={12} /> {gradeBumpResult}
          </p>
        )}
      </div>

      {/* 학년 올리기 미리보기 모달 */}
      {gradeBumpPreview && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px', backdropFilter: 'blur(4px)' }}
          onClick={() => !gradeBumping && setGradeBumpPreview(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px' }}>학년을 올릴까요?</p>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 14px', lineHeight: 1.6 }}>
              {gradeBumpPreview.changes.length}명의 학년이 아래처럼 바뀝니다.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: gradeBumpPreview.skipped.length > 0 ? '14px' : '18px' }}>
              {gradeBumpPreview.changes.length === 0 && (
                <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0 }}>학년을 올릴 학생이 없어요.</p>
              )}
              {gradeBumpPreview.changes.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB', borderRadius: '8px', padding: '8px 10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A' }}>{c.name}</span>
                  <span style={{ fontSize: '11px', color: '#6B7280' }}>{c.from} → <b style={{ color: '#1A1A1A' }}>{c.to}</b></span>
                </div>
              ))}
            </div>
            {gradeBumpPreview.skipped.length > 0 && (
              <div style={{ background: '#FFF8E7', border: '1px solid #F0D584', borderRadius: '10px', padding: '10px 12px', marginBottom: '18px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#8A5A00', margin: '0 0 4px' }}>건너뜀(최고학년이거나 학년 정보 없음) · {gradeBumpPreview.skipped.length}명</p>
                <p style={{ fontSize: '11px', color: '#8A5A00', margin: 0, lineHeight: 1.6 }}>{gradeBumpPreview.skipped.map(s => s.name).join(', ')} — 학교명을 직접 확인해주세요.</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setGradeBumpPreview(null)} disabled={gradeBumping}
                style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: gradeBumping ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                취소
              </button>
              <button onClick={handleApplyGradeBump} disabled={gradeBumping || gradeBumpPreview.changes.length === 0}
                style={{
                  flex: 1, padding: '11px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: 'none',
                  background: (gradeBumping || gradeBumpPreview.changes.length === 0) ? '#E5E7EB' : C.primary,
                  color: (gradeBumping || gradeBumpPreview.changes.length === 0) ? '#9CA3AF' : '#fff',
                  cursor: (gradeBumping || gradeBumpPreview.changes.length === 0) ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}>
                {gradeBumping ? '적용 중...' : `${gradeBumpPreview.changes.length}명 학년 올리기`}
              </button>
            </div>
          </div>
        </div>
      )}

      </>)}

      {/* 가입 신청 관리 — 플랫폼 관리자 전용. 목록만 먼저 보여주고 클릭하면 상세가 펼쳐지는
          패턴("분양 학원 관리"의 크레딧 지급 폼과 동일한 아코디언 방식). 승인/거절 후에도 탭을 옮기면
          신청 당시 정보(사업자등록번호·주소 등)를 계속 조회할 수 있음 — 세금계산서 발행 등에 필요 */}
      {settingsTab === 'platform' && isPlatformAdmin && signupRequests.length > 0 && (() => {
        const tabCounts = {
          pending: signupRequests.filter(r => r.status === 'pending').length,
          approved: signupRequests.filter(r => r.status === 'approved').length,
          rejected: signupRequests.filter(r => r.status === 'rejected').length,
        };
        const visibleRequests = signupRequests.filter(r => r.status === signupTab);
        return (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>가입 신청 관리</p>
            <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: '12px' }}>
              학원 등록 신청 내역입니다. 승인된 신청도 사업자등록번호·주소 등 원본 정보를 여기서 다시 볼 수 있어요.
            </p>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {[
                { key: 'pending', label: '대기' },
                { key: 'approved', label: '승인됨' },
                { key: 'rejected', label: '거절됨' },
              ].map(t => (
                <button key={t.key} onClick={() => { setSignupTab(t.key); setExpandedRequestId(null); }}
                  style={{
                    padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
                    border: signupTab === t.key ? `1.5px solid ${C.info}` : '1px solid #E5E7EB',
                    background: signupTab === t.key ? C.infoBg : '#fff',
                    color: signupTab === t.key ? C.infoDark : '#6B7280',
                  }}>
                  {t.label} {tabCounts[t.key]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visibleRequests.length === 0 && (
                <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0, textAlign: 'center', padding: '12px 0' }}>해당하는 신청이 없습니다</p>
              )}
              {visibleRequests.map(req => {
                const expanded = expandedRequestId === req.id;
                const badge = req.status === 'pending'
                  ? { label: '신청', bg: '#FFF8EC', color: '#8A5A00' }
                  : req.status === 'approved'
                  ? { label: '승인됨', bg: C.successBg, color: C.successDark }
                  : { label: '거절됨', bg: C.errorBg, color: C.errorDark };
                return (
                  <div key={req.id} style={{ background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
                    <div onClick={() => toggleSignupRequest(req)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A', margin: 0 }}>{req.academyName}</p>
                        <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>
                          {req.directorName} 원장 · {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('ko-KR') : ''}
                        </p>
                      </div>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: '6px', flexShrink: 0 }}>{badge.label}</span>
                    </div>

                    {expanded && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #E5E7EB', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ fontSize: '11px', color: '#374151', margin: 0 }}><strong>신청자</strong> {req.applicantName}{req.applicantPosition ? ` (${req.applicantPosition})` : ''} · {req.phone}</p>
                        <p style={{ fontSize: '11px', color: '#374151', margin: 0 }}><strong>사업자등록번호</strong> {req.businessNumber}</p>
                        <p style={{ fontSize: '11px', color: '#374151', margin: 0 }}><strong>주소</strong> {req.address} {req.addressDetail}</p>
                        <p style={{ fontSize: '11px', color: '#374151', margin: 0 }}><strong>대표전화</strong> {req.academyPhone} · <strong>이메일</strong> {req.email}</p>

                        {req.status === 'pending' && (
                          <>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                              <input value={academyIdForApproval} onChange={e => setAcademyIdForApproval(e.target.value)} placeholder="학원 ID (영문 소문자/숫자/하이픈)"
                                style={{ flex: 1, padding: '7px 9px', fontSize: '12px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'monospace', outline: 'none' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => handleApproveSignup(req)} disabled={approving || rejecting}
                                style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', border: 'none', background: approving ? '#E5E7EB' : C.primary, color: '#fff', cursor: approving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                                {approving ? '승인 중...' : '승인'}
                              </button>
                              <button onClick={() => handleRejectSignup(req)} disabled={approving || rejecting}
                                style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', border: 'none', background: '#FEF2F2', color: '#DC2626', cursor: rejecting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                                {rejecting ? '거절 중...' : '거절'}
                              </button>
                            </div>
                          </>
                        )}
                        {req.status !== 'pending' && (
                          <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '4px 0 0' }}>
                            {req.status === 'approved' ? `학원 ID: ${req.academyId}` : '거절됨'}
                            {req.reviewedBy ? ` · ${req.reviewedBy}` : ''}
                            {req.reviewedAt?.seconds ? ` · ${new Date(req.reviewedAt.seconds * 1000).toLocaleDateString('ko-KR')}` : ''}
                          </p>
                        )}
                        {/* 삭제는 대기/거절만 — 승인된 건(이미 실제 학원)은 여기서 못 지움, 서버에서도 재확인 */}
                        {req.status !== 'approved' && (
                          <button onClick={() => handleDeleteSignupRequest(req)} disabled={deletingRequestId === req.id}
                            style={{
                              alignSelf: 'flex-start', marginTop: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '7px',
                              border: 'none', background: confirmingDeleteId === req.id ? '#DC2626' : 'transparent',
                              color: confirmingDeleteId === req.id ? '#fff' : '#9CA3AF',
                              cursor: deletingRequestId === req.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                            }}>
                            {deletingRequestId === req.id ? '삭제 중...' : confirmingDeleteId === req.id ? '삭제 확인 (재클릭)' : '신청 삭제'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {signupActionResult && (
                <p style={{ fontSize: '12px', margin: 0, padding: '8px 12px', borderRadius: '8px', background: signupActionResult.startsWith('오류') ? C.errorBg : C.successBg, color: signupActionResult.startsWith('오류') ? C.errorDark : C.successDark, fontWeight: 600 }}>
                  {signupActionResult}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* 새 학원 추가 — 플랫폼 관리자 전용 */}
      {settingsTab === 'platform' && isPlatformAdmin && (
        <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>새 학원 추가</p>
          <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: '14px' }}>분양할 학원의 데이터 공간과 첫 원장 계정을 만듭니다.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={newAcademyName} onChange={e => setNewAcademyName(e.target.value)} placeholder="학원 이름 (예: 데카르트학원)" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newAcademyId} onChange={e => { setNewAcademyId(e.target.value); setAcademyIdTouched(true); }} placeholder="학원 ID (영문 소문자/숫자/하이픈)" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'monospace', outline: 'none' }} />
            <div style={{ height: '1px', background: '#F3F4F6', margin: '4px 0' }} />
            <input value={newDirectorName} onChange={e => setNewDirectorName(e.target.value)} placeholder="원장 이름" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newDirectorEmail} onChange={e => setNewDirectorEmail(e.target.value)} placeholder="원장 이메일" type="email" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newDirectorPassword} onChange={e => setNewDirectorPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" type="password" style={{ padding: '9px 12px', fontSize: '16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={handleCreateAcademy} disabled={academyCreating} style={{ background: academyCreating ? '#E5E7EB' : C.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: academyCreating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {academyCreating ? '생성 중...' : '학원 생성'}
            </button>
            {academyResult && (
              <p style={{ fontSize: '12px', margin: 0, padding: '8px 12px', borderRadius: '8px', background: academySuccess ? C.successBg : C.errorBg, color: academySuccess ? C.successDark : C.errorDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                {academySuccess ? <Check size={12} /> : <AlertTriangle size={12} />} {academyResult}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 분양 학원 관리 — 플랫폼 관리자 전용. 학원별 사용량 통계 + 미납 등으로 이용을 정지/재개하는 스위치 */}
      {settingsTab === 'platform' && isPlatformAdmin && academyList.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>분양 학원 관리</p>
          <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: '14px' }}>
            학원별 사용량입니다. 정지된 학원은 직원 로그인이 차단되며, 학부모에게 이미 공유된 리포트 링크는 계속 열립니다.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {academyList.map(a => {
              const isMine = a.id === academyId;
              const suspended = a.status === 'suspended';
              const stat = academyStats[a.id];
              const billing = academyBilling[a.id];
              const formOpen = creditFormOpen === a.id;
              return (
                <div key={a.id} style={{ background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {a.academyName || a.id}
                      {isMine && <span style={{ fontSize: '9px', fontWeight: 700, color: '#6B7280', background: '#E5E7EB', padding: '2px 6px', borderRadius: '5px' }}>내 학원</span>}
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: suspended ? '#FEF2F2' : '#E1F5EE', color: suspended ? '#DC2626' : '#0F6E56' }}>
                        {suspended ? '정지됨' : '이용 중'}
                      </span>
                    </p>
                    <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '2px 0 0', fontFamily: 'monospace' }}>{a.id}</p>
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '5px 0 0', fontWeight: 600 }}>
                      {stat
                        ? (stat.students === null
                            ? '통계 조회 실패'
                            : `학생 ${stat.students}명 · 강사 ${stat.teachers}명 · 이번 달 리포트 ${stat.reportsThisMonth}건 · 누적 ${stat.reports}건`)
                        : '통계 불러오는 중...'}
                    </p>
                  </div>
                  <button onClick={() => toggleCreditForm(a.id)}
                    style={{ background: formOpen ? C.primary : '#fff', color: formOpen ? '#fff' : C.primary, border: `1px solid ${C.primary}`, borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    {billing ? `크레딧 ${billing.balance}건` : '크레딧 지급'}
                  </button>
                  {!isMine && (
                    <button onClick={() => handleToggleSuspend(a)} disabled={togglingAcademy === a.id}
                      style={{
                        background: suspended ? '#E1F5EE' : (confirmingSuspend === a.id ? '#DC2626' : '#FEF2F2'),
                        color: suspended ? '#0F6E56' : (confirmingSuspend === a.id ? '#fff' : '#DC2626'),
                        border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 700,
                        cursor: togglingAcademy === a.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', flexShrink: 0,
                      }}>
                      {togglingAcademy === a.id ? '처리 중...' : suspended ? '이용 재개' : (confirmingSuspend === a.id ? '정지 확인 (재클릭)' : '이용 정지')}
                    </button>
                  )}
                </div>

                {/* 크레딧 지급 폼 + 이력 — 은행 입금 확인 후 관리자가 직접 반영하는 임시 장부(실제 PG 연동 전) */}
                {formOpen && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #E5E7EB' }}>
                    {billingLoading === a.id ? (
                      <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>불러오는 중...</p>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                          <select value={creditPackage} onChange={e => { setCreditPackage(e.target.value); setCreditAmount(String(PACKAGE_PRICES[e.target.value])); }}
                            style={{ padding: '7px 8px', fontSize: '12px', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', fontFamily: 'inherit' }}>
                            {Object.keys(PACKAGE_PRICES).map(p => <option key={p} value={p}>{p}건</option>)}
                          </select>
                          <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} placeholder="입금액(원)"
                            style={{ width: '90px', padding: '7px 8px', fontSize: '12px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }} />
                          <input value={creditMemo} onChange={e => setCreditMemo(e.target.value)} placeholder="메모(입금자명 등)"
                            style={{ flex: 1, padding: '7px 8px', fontSize: '12px', border: '1px solid #E5E7EB', borderRadius: '8px', fontFamily: 'inherit' }} />
                          <button onClick={() => handleGrantCredit(a.id)} disabled={creditGranting}
                            style={{ padding: '7px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '8px', border: 'none', background: creditGranting ? '#E5E7EB' : '#0F6E56', color: '#fff', cursor: creditGranting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            {creditGranting ? '지급 중...' : '지급'}
                          </button>
                        </div>
                        {billing?.history.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {billing.history.map(h => (
                              <p key={h.id} style={{ fontSize: '10px', color: '#9CA3AF', margin: 0 }}>
                                {h.grantedAt?.seconds ? new Date(h.grantedAt.seconds * 1000).toLocaleDateString('ko-KR') : ''} · {h.packageSize}건 · {h.amount?.toLocaleString()}원{h.memo ? ` · ${h.memo}` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 학생별 스킨 — 요약만. 전체 학생을 나열해봐야 여기선 아무것도 못 하고
          "학생 관리 탭에서 하세요"로 보내던 죽은 목록이라 요약 한 줄로 축약 */}
      {settingsTab === 'academy' && (() => {
        const activeStudents = students.filter(s => !s.archived);
        const customized = activeStudents.filter(s => s.skinColor);
        return (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: `1px solid ${T.border}` }}>
            <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>학생별 스킨 커스텀</p>
            <p style={{ fontSize: '11px', color: T.textSub, fontWeight: 500, marginBottom: '12px', lineHeight: 1.6 }}>
              {customized.length > 0
                ? <>전체 {activeStudents.length}명 중 <strong style={{ color: C.primary }}>{customized.length}명</strong>이 개별 색상을 쓰고 있어요. 나머지는 위 학원 기본 스킨을 따릅니다.</>
                : <>모든 학생이 위 학원 기본 스킨을 사용 중입니다. 특정 학생만 다른 색을 쓰려면 개별 설정할 수 있어요.</>}
            </p>
            {customized.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                {customized.map(s => (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: T.bgSoft, border: `1px solid ${T.border}`, borderRadius: '20px', padding: '4px 10px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: s.skinColor, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: T.text }}>{s.name}</span>
                  </span>
                ))}
              </div>
            )}
            <p style={{ fontSize: '11px', color: T.textMute, margin: 0 }}>학생 관리 탭 → 수정에서 개별 설정할 수 있습니다</p>
          </div>
        );
      })()}
    </div>
  );
}
