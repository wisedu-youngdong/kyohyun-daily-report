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

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 모달 포커스 가두기 — active인 동안 Tab/Shift+Tab이 모달 패널(containerRef) 밖으로 못 나가게
// 첫/끝 포커스 가능 요소에서 반대쪽으로 감아준다. 여는 시점에 패널 안에 포커스가 없으면(마우스로
// 열었을 때 등) 첫 번째 요소로 옮겨줘서 키보드 사용자가 모달 맨 위부터 시작하게 함.
// useEscapeClose와 동일한 규칙: 호출부는 항상 최상위에서 무조건 호출, active로 열림 여부만 전달.
export function useFocusTrap(containerRef, active = true) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const getFocusable = () => [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
      .filter(el => el.offsetParent !== null); // 화면에 실제로 보이는 것만

    const list = getFocusable();
    if (list.length && !container.contains(document.activeElement)) {
      list[0].focus();
    }

    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
  }, [active, containerRef]);
}
