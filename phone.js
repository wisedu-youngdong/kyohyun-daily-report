// 학부모 연락처 — 입력 포맷팅 + 형식 검증
// 학부모 발송(카톡 링크 전달)이 이 필드에 걸려 있어, "몰라요"/"010-1234" 같은
// 값이 그대로 저장되면 발송 시점에야 문제를 알게 됨. 입력 단계에서 잡는다.

// 입력값을 010-1234-5678 형태로 자동 정리 (숫자만 남기고 하이픈 삽입)
export function formatPhone(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  // 10자리(011-123-4567)와 11자리(010-1234-5678) 모두 대응
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// 유효한 휴대폰 번호인지 — 빈 값은 선택 입력이라 유효로 취급(호출부에서 필수 여부 결정)
export function isValidPhone(value) {
  const v = (value || '').trim();
  if (!v) return true;
  return /^01[016789]-?\d{3,4}-?\d{4}$/.test(v);
}
