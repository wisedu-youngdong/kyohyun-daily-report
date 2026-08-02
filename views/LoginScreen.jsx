import { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { R, C, RADIUS2 } from '../tokens.jsx';

// 로그인 화면 — "공식 문서·성적표 톤" 컨셉(레터헤드 + 네이비 상단 라인).
// 학부모 리포트 화면(R 팔레트: 네이비/골드/세리프)과 같은 브랜드 언어를 써서
// 로그인부터 리포트까지 하나의 톤으로 이어지게 함. logoUrl 실사진 배지는
// 아직 학원 로고 이미지가 없어(정사각형 파비콘 대기 중) 이번엔 자리만 비워둠 — 로고 확정되면 재도입.
// 로그인 전에는 어느 학원 계정인지 알 방법이 없어(URL/서브도메인 구분 없음) 학원명을
// 하드코딩하지 않고 중립 문구만 표시 — 실제 학원 브랜딩(로고/이름)은 로그인 후 대시보드에서 표시됨.
// 마지막으로 로그인 성공한 이메일을 기억해두는 로컬 키 — 비밀번호는 저장 안 함(브라우저
// 자체 비밀번호 관리자에 맡김, 아래 autoComplete 속성으로 그쪽도 같이 도와줌)
const LAST_EMAIL_KEY = 'dailyReportLastEmail';

export default function LoginScreen() {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(LAST_EMAIL_KEY) || ''; } catch { return ''; }
  });
  // 체크박스 기본값 true — "로그인 기억"류 체크박스는 보통 켜진 채로 시작해서
  // 끄고 싶을 때만 사용자가 직접 해제하는 게 익숙한 패턴이라 그대로 따름
  const [rememberEmail, setRememberEmail] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResetMessage('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      try {
        if (rememberEmail) localStorage.setItem(LAST_EMAIL_KEY, email);
        else localStorage.removeItem(LAST_EMAIL_KEY); // 체크 해제하고 로그인하면 이전에 기억해둔 것도 잊음
      } catch { /* 저장 실패해도 로그인 자체엔 지장 없음 */ }
    } catch (err) {
      // 이메일/비밀번호 오류는 계정 존재 여부가 드러나지 않게 일부러 뭉뚱그림(Firebase Auth
      // 자체도 auth/invalid-credential 하나로 통일해서 줌) — 다만 네트워크/과다시도처럼
      // "이메일·비밀번호와 무관한" 실패까지 똑같이 안내하면 엉뚱한 재입력만 반복하게 되므로 분리
      if (err.code === 'auth/too-many-requests') {
        setError('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('네트워크 연결을 확인해주세요.');
      } else {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      }
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('비밀번호를 재설정하려면 이메일을 먼저 입력해주세요.');
      return;
    }
    setResetLoading(true);
    setError('');
    setResetMessage('');
    try {
      const res = await fetch('/api/send-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || '재설정 이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setResetMessage('비밀번호 재설정 링크를 이메일로 보냈습니다. 메일함을 확인해주세요.');
    } catch (err) {
      // 서버가 준 구체적인 실패 사유가 있으면 그대로 보여줌 — 예전엔 원인과 무관하게 항상
      // "이메일 주소를 확인해주세요"로 뭉뚱그려서, 이메일을 맞게 썼는데도 계속 고쳐 쓰게 만들었음
      setError(err.message || '재설정 이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    setResetLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '13px 16px', fontSize: '16px', fontWeight: 500,
    fontFamily: R.body, color: R.ink, background: '#fff',
    border: `1px solid ${R.rule}`, borderRadius: `${RADIUS2.input}px`, outline: 'none',
    boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s',
  };
  const focusInput = (e) => { e.target.style.borderColor = R.navy; e.target.style.boxShadow = `0 0 0 3px ${R.navy}1A`; };
  const blurInput = (e) => { e.target.style.borderColor = R.rule; e.target.style.boxShadow = 'none'; };

  return (
    <div style={{
      minHeight: '100dvh', background: 'linear-gradient(180deg, #F8F7F3 0%, #F1EFE7 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: R.body, padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', background: '#fff',
        border: `1px solid ${R.rule}`, borderTop: `3px solid ${R.navy}`, borderRadius: `${RADIUS2.card}px`,
        boxShadow: `0 12px 40px ${R.navy}14, 0 2px 8px ${R.navy}0A`, overflow: 'hidden',
      }}>
        {/* 레터헤드 — 제목 블록만 가운데 정렬, 아래 입력 폼은 왼쪽 정렬 유지(절충안) */}
        <div style={{ padding: '36px 40px 30px', borderBottom: `1px solid ${R.rule}`, textAlign: 'center' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: R.inkMute, margin: '0 0 20px' }}>
            DAILY REPORT SYSTEM
          </p>
          <h1 style={{ fontFamily: R.serif, fontSize: '27px', fontWeight: 700, color: R.ink, letterSpacing: '-0.5px', margin: 0 }}>
            데일리 리포트
          </h1>
          <div style={{ width: '40px', height: '2px', background: R.gold, margin: '12px auto 10px' }} />
          <p style={{ fontSize: '12px', fontWeight: 500, color: R.inkSub, margin: 0 }}>
            학원 관리자 로그인
          </p>
        </div>

        {/* 입력 폼 */}
        <form onSubmit={handleLogin} style={{ padding: '32px 40px 36px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: R.ink, marginBottom: '8px' }}>이메일</label>
            <input
              type="email" name="email" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={focusInput} onBlur={blurInput}
              placeholder="이메일 입력" required
              style={inputStyle}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 500, color: R.inkSub, margin: '9px 0 0', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)}
                style={{ width: '14px', height: '14px', margin: 0, cursor: 'pointer', accentColor: R.navy }} />
              이메일 기억하기
            </label>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: R.ink, marginBottom: '8px' }}>비밀번호</label>
            <input
              type="password" name="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={focusInput} onBlur={blurInput}
              placeholder="비밀번호 입력" required
              style={inputStyle}
            />
          </div>
          {error && (
            <p style={{ fontSize: '12px', fontWeight: 600, color: C.errorDark, margin: '0 0 18px', background: '#FDEAEA', padding: '9px 13px', borderRadius: `${RADIUS2.input}px` }}>
              {error}
            </p>
          )}
          {resetMessage && (
            <p style={{ fontSize: '12px', fontWeight: 600, color: C.successDark, margin: '0 0 18px', background: C.successBg, padding: '9px 13px', borderRadius: `${RADIUS2.input}px` }}>
              {resetMessage}
            </p>
          )}
          <button type="submit" disabled={loading}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#0A2456'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = R.navy; }}
            style={{
              width: '100%', padding: '14px', fontSize: '14px', fontWeight: 700,
              fontFamily: R.body, border: 'none', borderRadius: `${RADIUS2.input}px`,
              background: loading ? R.inkMute : R.navy, color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer', marginTop: '8px',
              transition: 'background .15s',
            }}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
          <p style={{ textAlign: 'center', margin: '16px 0 0' }}>
            <button type="button" onClick={handleResetPassword} disabled={resetLoading}
              style={{
                background: 'none', border: 'none', padding: 0, fontSize: '12px', fontWeight: 600,
                color: R.inkMute, textDecoration: 'underline', cursor: resetLoading ? 'not-allowed' : 'pointer',
                fontFamily: R.body,
              }}>
              {resetLoading ? '발송 중...' : '비밀번호를 잊으셨나요?'}
            </button>
          </p>
          <p style={{ textAlign: 'center', margin: '12px 0 0' }}>
            <a href="/partner" style={{ fontSize: '12px', fontWeight: 600, color: R.inkMute, textDecoration: 'underline' }}>
              처음이신가요? 학원 파트너 안내 보기
            </a>
          </p>
          <p style={{ fontSize: '11px', fontWeight: 500, color: R.inkMute, textAlign: 'center', margin: '18px 0 0', paddingTop: '18px', borderTop: `1px dashed ${R.rule}`, letterSpacing: '0.02em' }}>
            학원 관리자 전용 시스템입니다
          </p>
        </form>
      </div>
    </div>
  );
}
