import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { R } from '../tokens.jsx';

// 로그인 화면 — "공식 문서·성적표 톤" 컨셉(레터헤드 + 네이비 상단 라인).
// 학부모 리포트 화면(R 팔레트: 네이비/골드/세리프)과 같은 브랜드 언어를 써서
// 로그인부터 리포트까지 하나의 톤으로 이어지게 함. logoUrl 실사진 배지는
// 아직 학원 로고 이미지가 없어(정사각형 파비콘 대기 중) 이번엔 자리만 비워둠 — 로고 확정되면 재도입.
// 로그인 전에는 어느 학원 계정인지 알 방법이 없어(URL/서브도메인 구분 없음) 학원명을
// 하드코딩하지 않고 중립 문구만 표시 — 실제 학원 브랜딩(로고/이름)은 로그인 후 대시보드에서 표시됨.
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    setLoading(false);
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
        {/* 레터헤드 — 제목 블록만 가운데 정렬, 아래 입력 폼은 왼쪽 정렬 유지(절충안) */}
        <div style={{ padding: '26px 36px 22px', borderBottom: `1px solid ${R.rule}`, textAlign: 'center' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: R.inkMute, margin: '0 0 18px' }}>
            DAILY REPORT SYSTEM
          </p>
          <h1 style={{ fontFamily: R.serif, fontSize: '27px', fontWeight: 700, color: R.ink, letterSpacing: '-0.5px', margin: 0 }}>
            데일리 리포트
          </h1>
          <div style={{ width: '40px', height: '2px', background: R.gold, margin: '10px auto 8px' }} />
          <p style={{ fontSize: '12px', fontWeight: 500, color: R.inkSub, margin: 0 }}>
            학원 관리자 로그인
          </p>
        </div>

        {/* 입력 폼 */}
        <form onSubmit={handleLogin} style={{ padding: '26px 36px 30px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: R.ink, marginBottom: '7px' }}>이메일</label>
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={focusInput} onBlur={blurInput}
              placeholder="이메일 입력" required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: R.ink, marginBottom: '7px' }}>비밀번호</label>
            <input
              type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={focusInput} onBlur={blurInput}
              placeholder="비밀번호 입력" required
              style={inputStyle}
            />
          </div>
          {error && (
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#B92C2C', margin: '0 0 16px', background: '#FDEAEA', padding: '8px 12px', borderRadius: '6px' }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={loading}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#0A2456'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = R.navy; }}
            style={{
              width: '100%', padding: '13px', fontSize: '14px', fontWeight: 700,
              fontFamily: R.body, border: 'none', borderRadius: '6px',
              background: loading ? R.inkMute : R.navy, color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer', marginTop: '6px',
              transition: 'background .15s',
            }}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
          <p style={{ fontSize: '11px', fontWeight: 500, color: R.inkMute, textAlign: 'center', margin: '20px 0 0', paddingTop: '16px', borderTop: `1px dashed ${R.rule}`, letterSpacing: '0.02em' }}>
            학원 관리자 전용 시스템입니다
          </p>
        </form>
      </div>
    </div>
  );
}
