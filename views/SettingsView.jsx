import React from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Pencil, AlertTriangle, Check } from 'lucide-react';
import { T, C } from '../tokens.jsx';
import { PRESET_SKINS } from './shared.jsx';

const DEFAULT_SKIN_COLOR = '#1A2540';

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

export default function SettingsView({ students, onSaveStudent, teachers, onSaveTeacher, onDeleteTeacher, logoUrl, onSaveLogo, onDeleteLogo, academyId, academySkinColor }) {
  // academies/{academyId} 문서에 저장된 값이 있으면 그걸 기준으로, 없으면(마이그레이션 직후 등)
  // 예전 localStorage 값을 폴백으로 사용 — 기기별로 갈리던 색상을 학원 단위로 통일하는 과도기 처리
  const [globalColor, setGlobalColor] = React.useState(() => {
    return academySkinColor || localStorage.getItem('globalSkinColor') || DEFAULT_SKIN_COLOR;
  });
  React.useEffect(() => {
    if (academySkinColor) setGlobalColor(academySkinColor);
  }, [academySkinColor]);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const colorInputRef = React.useRef(null);
  const [logoUploading, setLogoUploading] = React.useState(false);
  const [showLogoDeleteConfirm, setShowLogoDeleteConfirm] = React.useState(false);
  const logoInputRef = React.useRef(null);

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
      // 1. Firebase Auth 계정 생성
      const cred = await createUserWithEmailAndPassword(auth, newTeacherEmail, newTeacherPassword);
      // 2. 학원 소속 teachers 서브컬렉션에 강사 추가
      const teacherRef = await addDoc(collection(db, 'academies', academyId, 'teachers'), { name: newTeacherName, createdAt: serverTimestamp() });
      // 3. users/{uid} 고정 경로에 role·academyId 저장 (uid를 문서 ID로 써야
      //    보안 규칙에서 "내 문서인지"를 get()으로 안전하게 확인할 수 있음 — 자동 ID였으면
      //    list 권한을 열어줘야 해서 다른 학원 직원 이메일까지 노출됐을 것)
      await setDoc(doc(db, 'users', cred.user.uid), { role: 'teacher', teacherId: teacherRef.id, academyId, email: newTeacherEmail, createdAt: serverTimestamp() });
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

  const saveGlobalColor = async () => {
    localStorage.setItem('globalSkinColor', globalColor); // 즉시 반영용 로컬 캐시, 진짜 저장은 아래 Firestore
    await setDoc(doc(db, 'academies', academyId), { globalSkinColor: globalColor }, { merge: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const derived = deriveColors(globalColor);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', boxSizing: 'border-box' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.02em' }}>스킨 설정</h2>
      <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '20px', fontWeight: 500 }}>학원 기본 색상을 설정하세요. 학생별로 다르게 설정할 수 있습니다.</p>

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
                  <button onClick={() => {
                    if (confirmingTeacherDelete === t.id) {
                      onDeleteTeacher(t.id); setConfirmingTeacherDelete(null);
                    } else {
                      setConfirmingTeacherDelete(t.id);
                      setTimeout(() => setConfirmingTeacherDelete(prev => prev === t.id ? null : prev), 3000);
                    }
                  }} style={{ background: confirmingTeacherDelete === t.id ? '#DC2626' : '#FEF2F2', color: confirmingTeacherDelete === t.id ? '#fff' : '#DC2626', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {confirmingTeacherDelete === t.id ? '확인 (재클릭)' : '삭제'}
                  </button>
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

      {/* 학생별 스킨 — 요약만. 전체 학생을 나열해봐야 여기선 아무것도 못 하고
          "학생 관리 탭에서 하세요"로 보내던 죽은 목록이라 요약 한 줄로 축약 */}
      {(() => {
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
