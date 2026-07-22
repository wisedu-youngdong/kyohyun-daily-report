import React, { useState, useEffect } from 'react';
import { useMediaQuery } from '../hooks.js';

// 신규 학원 시작 가이드 — 가입 승인 직후 첫 로그인에서 한 번 뜨고, 건너뛰어도 완전히 사라지지
// 않고 화면 구석 위젯으로 남아있다가(재오픈 가능) 7일 경과 또는 4단계 모두 완료 시 위젯도
// 숨겨진다(완전 삭제 아님 — 설정의 "가이드 다시 보기"로 언제든 재오픈 가능, forceOpenSignal로 제어).
// 색상은 기존 브랜드 톤(네이비/골드) 그대로 사용.

const NAVY = '#0D2D6B';
const NAVY_DARK = '#081D47';
const NAVY_SOFT = '#E7EBF4';
const GOLD = '#C9A227';
const SUCCESS = '#009652';
const CARD_BG = '#FFFFFF';
const BORDER = '#E5E7EB';
const BORDER_SOFT = '#EEF0EE';
const TEXT = '#181B1F';
const TEXT_SUB = '#5B6470';
const TEXT_MUTE = '#6B7785';
const OVERLAY = 'rgba(11,16,26,0.5)';
const SHADOW_MODAL = '0 24px 60px -12px rgba(13,45,107,0.35), 0 4px 16px rgba(0,0,0,0.08)';

const HIDE_AFTER_DAYS = 7;

export default function OnboardingGuide({
  isDirector, promptShown, academyId, academyCreatedAt,
  students = [], reports = [], reportViews = [], logoUrl,
  forceOpenSignal = 0, onDismissPrompt, onNavigate,
}) {
  const [view, setView] = useState('hidden'); // 'hidden' | 'prompt' | 'checklist' | 'widget'
  // PC(≥900px)는 App.jsx가 상단 탭으로 바뀌면서 하단 탭 바가 없어짐 — 위젯이 비울 필요 없음
  const isPc = useMediaQuery('(min-width: 900px)');

  const items = [
    { key: 'student', title: '학생 등록하기', hint: '학생 정보와 담당 반을 먼저 등록해요', go: '학생 관리로 →', done: students.length > 0, nav: { tab: 'manage', sub: 'students' } },
    { key: 'report', title: '첫 리포트 작성해보기', hint: '사진 한 장으로 채점 결과를 바로 분석해요', go: '리포트 작성으로 →', done: reports.some(r => !r.isDraft), nav: { tab: 'write' } },
    { key: 'logo', title: '로고·스킨 설정하기', hint: '학원 로고를 올리면 학부모 화면에 바로 반영돼요', go: '설정으로 →', done: !!logoUrl, nav: { tab: 'manage', sub: 'settings' } },
    { key: 'share', title: '학부모에게 링크 공유하기', hint: '카카오톡으로 리포트 링크를 보내보세요', go: '기록 보관소로 →', done: reportViews.length > 0, nav: { tab: 'record', sub: 'history' } },
  ];
  const doneCount = items.filter(it => it.done).length;
  const pct = Math.round(doneCount / items.length * 100);

  const daysSinceCreated = academyCreatedAt ? (Date.now() / 1000 - academyCreatedAt) / 86400 : 0;
  const shouldStayHidden = doneCount === items.length || daysSinceCreated > HIDE_AFTER_DAYS;

  // "네/아니요"를 누르면 onDismissPrompt()가 Firestore에 onboardingPromptShown:true를 쓰고,
  // 그 변경이 onSnapshot으로 돌아와 promptShown prop이 바뀌면서 이 아래 useEffect가 다시
  // 실행돼 방금 연 checklist를 widget으로 덮어써버리는 문제가 있었음 — 사용자가 이미 이번
  // 세션에서 직접 조작했으면(userInteracted) 그 이후의 promptShown 변화는 무시하도록 방지
  const userInteracted = React.useRef(false);
  useEffect(() => {
    if (!isDirector) { setView('hidden'); return; }
    if (userInteracted.current) return;
    if (!promptShown) { setView('prompt'); return; }
    setView(shouldStayHidden ? 'hidden' : 'widget');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirector, promptShown]);

  // 설정의 "가이드 다시 보기" — 숨김 조건과 무관하게 강제로 체크리스트를 다시 연다
  useEffect(() => {
    if (forceOpenSignal > 0) { userInteracted.current = true; setView('checklist'); }
  }, [forceOpenSignal]);

  if (!isDirector || view === 'hidden') return null;

  const dismissPromptTo = (next) => {
    userInteracted.current = true;
    if (!promptShown) onDismissPrompt?.();
    setView(next);
  };

  const goToItem = (item) => {
    userInteracted.current = true;
    onNavigate?.(item.nav.tab, item.nav.sub);
    setView(shouldStayHidden ? 'hidden' : 'widget');
  };

  const modalBase = {
    width: '100%', maxWidth: '340px', background: CARD_BG, borderRadius: '16px',
    boxShadow: SHADOW_MODAL, padding: '26px 24px 22px', textAlign: 'center', boxSizing: 'border-box',
  };
  const btnPrimary = {
    width: '100%', padding: '12px', fontSize: '13.5px', fontWeight: 700, fontFamily: 'inherit',
    border: 'none', borderRadius: '9px', background: NAVY, color: '#fff', cursor: 'pointer',
  };
  const btnGhost = {
    width: '100%', padding: '11px', fontSize: '12.5px', fontWeight: 700, fontFamily: 'inherit',
    border: 'none', background: 'transparent', color: TEXT_MUTE, cursor: 'pointer', marginTop: '6px',
  };

  if (view === 'prompt') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: OVERLAY, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 2000 }}>
        <div style={modalBase}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: NAVY_SOFT, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', margin: '0 auto 14px' }}>🧭</div>
          <h2 style={{ fontSize: '16.5px', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.01em', color: TEXT }}>처음이신가요?</h2>
          <p style={{ fontSize: '12.5px', color: TEXT_SUB, lineHeight: 1.65, margin: '0 0 20px' }}>학생 등록부터 첫 리포트 발송까지, 4단계로 짧게 안내해드릴게요. 1분이면 충분해요.</p>
          <button style={btnPrimary} onClick={() => dismissPromptTo('checklist')}>네, 안내 받을게요</button>
          <button style={btnGhost} onClick={() => dismissPromptTo('widget')}>아니요, 건너뛸게요</button>
        </div>
      </div>
    );
  }

  if (view === 'checklist') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: OVERLAY, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 2000 }}>
        <div style={{ ...modalBase, maxWidth: '380px', textAlign: 'left', padding: '22px 22px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
            <h2 style={{ fontSize: '15.5px', fontWeight: 800, margin: 0, color: TEXT }}>시작 가이드</h2>
            <button onClick={() => dismissPromptTo('widget')} title="나중에 계속하기"
              style={{ width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: BORDER_SOFT, color: TEXT_SUB, fontSize: '12px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>✕</button>
          </div>
          <p style={{ fontSize: '11.5px', color: TEXT_SUB, margin: '0 0 16px', lineHeight: 1.6 }}>순서는 자유예요 — 완료한 항목은 자동으로 체크돼요.</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: BORDER_SOFT, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${NAVY}, ${GOLD})`, borderRadius: '3px', transition: 'width .35s ease' }} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: TEXT_SUB, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{doneCount} / {items.length}</span>
          </div>

          <div>
            {items.map((it, i) => (
              <div key={it.key} onClick={() => goToItem(it)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 4px', borderBottom: i < items.length - 1 ? `1px solid ${BORDER_SOFT}` : 'none', cursor: 'pointer' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${it.done ? SUCCESS : BORDER}`, background: it.done ? SUCCESS : 'transparent',
                  color: it.done ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px',
                }}>✓</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 2px', color: it.done ? TEXT_MUTE : TEXT, textDecoration: it.done ? 'line-through' : 'none', textDecorationColor: BORDER }}>{it.title}</p>
                  <p style={{ fontSize: '11px', color: TEXT_MUTE, margin: 0 }}>{it.hint}</p>
                </div>
                {!it.done && <span style={{ fontSize: '11px', fontWeight: 800, color: NAVY, flexShrink: 0, whiteSpace: 'nowrap' }}>{it.go}</span>}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            {doneCount < items.length && (
              <button onClick={() => dismissPromptTo('widget')}
                style={{ padding: '11px 16px', fontSize: '12.5px', fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: '9px', background: 'transparent', color: TEXT_SUB, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
                나중에 계속하기
              </button>
            )}
            {doneCount === items.length && (
              <button style={{ ...btnPrimary, flex: 1 }} onClick={() => setView('hidden')}>완료! 시작할게요 🎉</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // view === 'widget'
  return (
    <div onClick={() => setView('checklist')}
      style={{
        position: 'fixed', right: '16px', bottom: isPc ? '20px' : 'calc(80px + env(safe-area-inset-bottom))', zIndex: 500,
        display: 'flex', alignItems: 'center', gap: '10px', background: CARD_BG, border: `1px solid ${BORDER}`,
        borderRadius: '100px', padding: '8px 16px 8px 8px', boxShadow: '0 8px 24px -6px rgba(13,45,107,0.28)', cursor: 'pointer',
      }}>
      <div style={{ width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${NAVY} ${pct}%, ${BORDER_SOFT} 0)` }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: CARD_BG }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <span style={{ fontSize: '11.5px', fontWeight: 800, color: TEXT }}>시작 가이드</span>
        <span style={{ fontSize: '10px', color: TEXT_MUTE, fontVariantNumeric: 'tabular-nums' }}>{doneCount}/{items.length} 완료 · 이어하기</span>
      </div>
    </div>
  );
}
