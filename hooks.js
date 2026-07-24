import { useState, useEffect } from 'react';

// 뷰포트 폭 기준 매체 쿼리를 구독해 회전/리사이즈에도 반응하는 훅
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

// 모달/오버레이 공용 Escape 닫기 — active가 true인 동안만 리스너를 붙인다.
// onClose가 없으면(닫기 불가능한 상태 등) 아무 동작 안 함. 훅이라 호출부는 항상
// 컴포넌트 최상위에서 무조건 호출하고, 열림 여부는 active 인자로 전달할 것
// (조건부 렌더 클로저 안에서 호출하면 rules-of-hooks 위반).
export function useEscapeClose(onClose, active = true) {
  useEffect(() => {
    if (!active || !onClose) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, active]);
}
