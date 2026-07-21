import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auth } from '../firebase';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { R } from '../tokens.jsx';

// 비밀번호 재설정 메일 링크의 착지 화면 — Firebase 기본 무브랜딩 페이지 대신
// LoginScreen.jsx와 동일한 레터헤드 톤으로 구성. api/send-reset-email.js의
// actionCodeSettings.url이 이 경로(/auth/action)를 가리켜야 여기로 옴.
export default function ResetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'invalid' | 'form' | 'submitting' | 'done'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'resetPassword' || !oobCode) { setStatus('invalid'); return; }
    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => { setEmail(verifiedEmail); setStatus('form'); })
      .catch(() => setStatus('invalid'));
  }, [mode, oobCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    if (password !== confirmPassword) { setError('입력하신 두 비밀번호가 일치하지 않습니다.'); return; }
    setStatus('submitting');
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus('done');
    } catch (err) {
      setError('비밀번호 변경에 실패했습니다. 링크가 만료됐을 수 있어요 — 다시 요청해주세요.');
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

  return (
    <div style={{
      minHeight: '100dvh', background: '#F5F5F0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: R.body, padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px', background: '#fff',
        border: `1px solid ${R.rule}`, borderTop: `3px solid ${R.navy}`, borderRadius: '4px',
        boxShadow: `0 2px 20px ${R.navy}12`, overflow: 'hidden',
      }}>
        <div style={{ padding: '26px 36px 22px', borderBottom: `1px solid ${R.rule}`, textAlign: 'center' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: R.inkMute, margin: '0 0 18px' }}>
            DAILY REPORT SYSTEM
          </p>
          <h1 style={{ fontFamily: R.serif, fontSize: '27px', fontWeight: 700, color: R.ink, letterSpacing: '-0.5px', margin: 0 }}>
            데일리 리포트
          </h1>
          <div style={{ width: '40px', height: '2px', background: R.gold, margin: '10px auto 8px' }} />
          <p style={{ fontSize: '12px', fontWeight: 500, color: R.inkSub, margin: 0 }}>
            {status === 'form' || status === 'submitting' ? `${email} 계정 비밀번호 재설정` : '비밀번호 재설정'}
          </p>
        </div>

        <div style={{ padding: '26px 36px 30px' }}>
          {status === 'verifying' && (
            <p style={{ fontSize: '13px', color: R.inkSub, textAlign: 'center', margin: 0 }}>링크를 확인하는 중...</p>
          )}

          {status === 'invalid' && (
            <>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#B92C2C', background: '#FDEAEA', padding: '10px 12px', borderRadius: '6px', margin: '0 0 16px', lineHeight: 1.6 }}>
                링크가 만료됐거나 이미 사용됐어요. 로그인 화면에서 재설정 메일을 다시 요청해주세요.
              </p>
              <a href="/" style={{
                display: 'block', textAlign: 'center', width: '100%', padding: '13px', fontSize: '14px', fontWeight: 700,
                fontFamily: R.body, borderRadius: '6px', background: R.navy, color: '#fff', textDecoration: 'none',
                boxSizing: 'border-box',
              }}>
                로그인 화면으로
              </a>
            </>
          )}

          {(status === 'form' || status === 'submitting') && (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: R.ink, marginBottom: '7px' }}>새 비밀번호</label>
                <input
                  type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput}
                  placeholder="6자 이상 입력" required
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: R.ink, marginBottom: '7px' }}>새 비밀번호 확인</label>
                <input
                  type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={focusInput} onBlur={blurInput}
                  placeholder="다시 한 번 입력" required
                  style={inputStyle}
                />
              </div>
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
                {status === 'submitting' ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          )}

          {status === 'done' && (
            <>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F6E56', background: '#E1F5EE', padding: '10px 12px', borderRadius: '6px', margin: '0 0 16px', textAlign: 'center' }}>
                비밀번호가 변경됐습니다.
              </p>
              <a href="/" style={{
                display: 'block', textAlign: 'center', width: '100%', padding: '13px', fontSize: '14px', fontWeight: 700,
                fontFamily: R.body, borderRadius: '6px', background: R.navy, color: '#fff', textDecoration: 'none',
                boxSizing: 'border-box',
              }}>
                로그인 화면으로
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
