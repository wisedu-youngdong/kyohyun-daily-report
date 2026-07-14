import React from 'react';

// 자식 트리에서 발생한 렌더링 오류를 잡아 흰 화면 대신 복구 UI를 보여준다.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, () => this.setState({ error: null }));
      }
      return (
        <div style={{
          minHeight: this.props.minHeight ?? '100dvh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 20px', textAlign: 'center', gap: '10px',
          fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
        }}>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>일시적인 오류가 발생했습니다</p>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>새로고침해도 계속되면 관리자에게 문의해주세요.</p>
          <button onClick={() => window.location.reload()} style={{
            marginTop: '10px', padding: '10px 22px', background: '#0D2D6B', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
