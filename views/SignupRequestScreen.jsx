import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { R } from '../tokens.jsx';
import { formatPhone, isValidPhone } from '../phone.js';

// 학원 가입 신청 화면(/signup) — 공개, 비로그인 접근.
// 비밀번호를 Firestore에 남기지 않기 위해 제출 시점에 바로 Auth 계정을 만들고(비밀번호는
// Firebase Auth가 처리), users/{uid}엔 role 없이 status:'pending'만 기록해 로그인을 막아둔다.
// 승인은 SettingsView.jsx의 "가입 신청 관리"에서 플랫폼 관리자가 처리 — 이 계정을 그대로
// 활성화하는 방식이라, 여기서 만든 Auth 계정을 승인 시 다시 만들 필요가 없다.
export default function SignupRequestScreen() {
  const [status, setStatus] = useState('form'); // 'form' | 'submitting' | 'done'
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [applicantName, setApplicantName] = useState('');
  const [applicantPosition, setApplicantPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [academyPhone, setAcademyPhone] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [agreed, setAgreed] = useState(false);

  const isValid = email.trim() && password.length >= 6 && password === confirmPassword
    && applicantName.trim() && phone.trim() && isValidPhone(phone)
    && academyName.trim() && businessNumber.trim()
    && address.trim() && academyPhone.trim() && directorName.trim() && agreed;

  // 다음 우편번호 서비스 — API 키 없이 쓰는 공개 스크립트라 필요할 때(모달 열 때)만 1회 로드.
  // .open()은 window.open 팝업이라 카카오톡 인앱브라우저 등에서 막히는 사례가 있어(CLAUDE.md
  // 참고), 화면 안에 직접 그리는 .embed() 방식의 모달 오버레이로 구현
  const [showPostcode, setShowPostcode] = useState(false);
  const postcodeContainerRef = useRef(null);

  useEffect(() => {
    if (!showPostcode) return;
    const launch = () => {
      if (!postcodeContainerRef.current) return;
      new window.daum.Postcode({
        oncomplete: (data) => {
          setAddress(data.roadAddress || data.jibunAddress || '');
          setShowPostcode(false);
        },
        width: '100%', height: '100%',
      }).embed(postcodeContainerRef.current);
    };
    if (window.daum?.Postcode) { launch(); return; }
    const script = document.createElement('script');
    script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.onload = launch;
    document.body.appendChild(script);
  }, [showPostcode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isValid) { setError('필수 항목을 모두 올바르게 입력해주세요.'); return; }
    setStatus('submitting');
    let uid = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      uid = cred.user.uid;
      // users 문서는 role 없이 status만 — 기존 로그인 판정 로직이 이 상태를 "승인 대기"로 인식
      await setDoc(doc(db, 'users', uid), {
        email: email.trim(), status: 'pending', createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'academySignupRequests', uid), {
        uid, email: email.trim(),
        applicantName: applicantName.trim(), applicantPosition: applicantPosition.trim(), phone: phone.trim(),
        academyName: academyName.trim(), businessNumber: businessNumber.trim(),
        address: address.trim(), addressDetail: addressDetail.trim(),
        academyPhone: academyPhone.trim(), directorName: directorName.trim(),
        status: 'pending', createdAt: serverTimestamp(),
      });
      await signOut(auth);
      setStatus('done');
    } catch (err) {
      console.error('가입 신청 실패:', err);
      const msg = err.code === 'auth/email-already-in-use' ? '이미 사용 중인 이메일입니다.'
        : err.code === 'auth/weak-password' ? '비밀번호는 6자 이상이어야 합니다.'
        : err.code === 'auth/invalid-email' ? '이메일 형식이 올바르지 않습니다.'
        : '신청 접수 중 오류가 발생했습니다. 다시 시도해주세요.';
      setError(msg);
      setStatus('form');
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', fontSize: '16px', fontWeight: 500,
    fontFamily: R.body, color: R.ink, background: '#fff',
    border: `1px solid ${R.rule}`, borderRadius: '6px', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s',
  };
  const focusInput = (e) => { e.target.style.borderColor = R.navy; e.target.style.boxShadow = `0 0 0 3px ${R.navy}1A`; };
  const blurInput = (e) => { e.target.style.borderColor = R.rule; e.target.style.boxShadow = 'none'; };
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: R.ink, marginBottom: '7px' };
  const fieldWrap = { marginBottom: '16px' };
  const sectionTitle = { fontSize: '11px', fontWeight: 700, color: R.inkMute, letterSpacing: '0.08em', margin: '22px 0 12px', paddingTop: '18px', borderTop: `1px dashed ${R.rule}` };

  return (
    <div style={{
      minHeight: '100dvh', background: '#F5F5F0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: R.body, padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '440px', background: '#fff',
        border: `1px solid ${R.rule}`, borderTop: `3px solid ${R.navy}`, borderRadius: '4px',
        boxShadow: `0 2px 20px ${R.navy}12`, overflow: 'hidden',
      }}>
        <div style={{ padding: '26px 36px 22px', borderBottom: `1px solid ${R.rule}`, textAlign: 'center' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: R.inkMute, margin: '0 0 18px' }}>
            DAILY REPORT SYSTEM
          </p>
          <h1 style={{ fontFamily: R.serif, fontSize: '27px', fontWeight: 700, color: R.ink, letterSpacing: '-0.5px', margin: 0 }}>
            학원 등록 신청
          </h1>
          <div style={{ width: '40px', height: '2px', background: R.gold, margin: '10px auto 8px' }} />
          <p style={{ fontSize: '12px', fontWeight: 500, color: R.inkSub, margin: 0 }}>
            검토 후 승인되면 로그인할 수 있어요
          </p>
        </div>

        <div style={{ padding: '26px 36px 30px' }}>
          {status === 'done' ? (
            <>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F6E56', background: '#E1F5EE', padding: '12px 14px', borderRadius: '6px', margin: '0 0 16px', lineHeight: 1.7 }}>
                신청이 접수됐습니다.<br />검토 후 승인 안내를 드려요.
              </p>
              <a href="/" style={{
                display: 'block', textAlign: 'center', width: '100%', padding: '13px', fontSize: '14px', fontWeight: 700,
                fontFamily: R.body, borderRadius: '6px', background: R.navy, color: '#fff', textDecoration: 'none',
                boxSizing: 'border-box',
              }}>
                로그인 화면으로
              </a>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ fontSize: '11px', color: R.inkMute, margin: '0 0 4px' }}>* 표시는 필수 입력사항입니다.</p>

              <p style={sectionTitle}>계정 정보</p>
              <div style={fieldWrap}>
                <label style={labelStyle}>*이메일 (로그인 ID)</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput} placeholder="director@example.com" style={inputStyle} />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>*비밀번호</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput} placeholder="6자 이상" style={inputStyle} />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>*비밀번호 확인</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput} placeholder="다시 한 번 입력" style={inputStyle} />
              </div>

              <p style={sectionTitle}>신청자 정보</p>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>*신청자명</label>
                  <input value={applicantName} onChange={e => setApplicantName(e.target.value)}
                    onFocus={focusInput} onBlur={blurInput} placeholder="홍길동" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>직책 (선택)</label>
                  <input value={applicantPosition} onChange={e => setApplicantPosition(e.target.value)}
                    onFocus={focusInput} onBlur={blurInput} placeholder="원장 등" style={inputStyle} />
                </div>
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>*연락처</label>
                <input type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                  onFocus={focusInput} onBlur={blurInput} placeholder="010-0000-0000" style={inputStyle} />
              </div>

              <p style={sectionTitle}>학원 정보</p>
              <div style={fieldWrap}>
                <label style={labelStyle}>*학원명</label>
                <input value={academyName} onChange={e => setAcademyName(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput} placeholder="예: 교현학원" style={inputStyle} />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>*사업자등록번호</label>
                <input value={businessNumber} onChange={e => setBusinessNumber(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput} placeholder="000-00-00000" style={inputStyle} />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>*학원 주소</label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input value={address} readOnly onClick={() => setShowPostcode(true)}
                    placeholder="주소 검색을 눌러주세요" style={{ ...inputStyle, flex: 1, cursor: 'pointer', background: '#FAFAF8' }} />
                  <button type="button" onClick={() => setShowPostcode(true)}
                    style={{
                      flexShrink: 0, padding: '0 16px', fontSize: '13px', fontWeight: 700,
                      fontFamily: R.body, color: R.navy, background: '#fff',
                      border: `1px solid ${R.navy}`, borderRadius: '6px', cursor: 'pointer',
                    }}>주소 검색</button>
                </div>
                <input value={addressDetail} onChange={e => setAddressDetail(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput} placeholder="상세주소 (선택)" style={inputStyle} />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>*대표전화</label>
                <input value={academyPhone} onChange={e => setAcademyPhone(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput} placeholder="02-000-0000" style={inputStyle} />
              </div>
              <div style={fieldWrap}>
                <label style={labelStyle}>*원장명</label>
                <input value={directorName} onChange={e => setDirectorName(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput} placeholder="홍길동" style={inputStyle} />
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: R.inkSub, margin: '18px 0 16px', cursor: 'pointer', lineHeight: 1.6 }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: '2px', flexShrink: 0 }} />
                이용약관 및 개인정보처리방침에 동의합니다.
              </label>

              {error && (
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#B92C2C', margin: '0 0 16px', background: '#FDEAEA', padding: '8px 12px', borderRadius: '6px' }}>
                  {error}
                </p>
              )}

              <button type="submit" disabled={status === 'submitting'}
                onMouseEnter={(e) => { if (status !== 'submitting') e.currentTarget.style.background = '#0A2456'; }}
                onMouseLeave={(e) => { if (status !== 'submitting') e.currentTarget.style.background = R.navy; }}
                style={{
                  width: '100%', padding: '13px', fontSize: '14px', fontWeight: 700,
                  fontFamily: R.body, border: 'none', borderRadius: '6px',
                  background: status === 'submitting' ? R.inkMute : R.navy, color: '#fff',
                  cursor: status === 'submitting' ? 'not-allowed' : 'pointer', marginTop: '6px',
                  transition: 'background .15s',
                }}>
                {status === 'submitting' ? '접수 중...' : '가입 신청'}
              </button>
              <p style={{ textAlign: 'center', margin: '14px 0 0' }}>
                <a href="/" style={{ fontSize: '12px', fontWeight: 600, color: R.inkMute, textDecoration: 'underline' }}>
                  이미 계정이 있으신가요? 로그인
                </a>
              </p>
            </form>
          )}
        </div>
      </div>

      {showPostcode && (
        <div onClick={() => setShowPostcode(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: '420px', height: '480px', maxHeight: '80vh',
            background: '#fff', borderRadius: '8px', overflow: 'hidden', position: 'relative',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }}>
            <button type="button" onClick={() => setShowPostcode(false)} aria-label="닫기" style={{
              position: 'absolute', top: '8px', right: '8px', zIndex: 1,
              width: '28px', height: '28px', border: 'none', borderRadius: '6px',
              background: '#F3F3EF', color: R.ink, fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            }}>✕</button>
            <div ref={postcodeContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      )}
    </div>
  );
}
