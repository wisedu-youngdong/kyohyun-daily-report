import { useEffect } from 'react';
import { R } from '../tokens.jsx';

// 학원 파트너 모집 랜딩 페이지(/partner) — 공개, 비로그인 접근.
// 디자인 근거: design_handoff_partner_landing_2a(Partner-2A.dc.html + README) "안 2A" 확정본.
// 목표 액션은 하나 — 학원 등록 신청(/signup). 모든 CTA가 그리로 연결된다.
// 실사 캡처 슬롯(히어로/STEP1~4/두 화면 맛보기)은 가명 캡처가 준비될 때까지 플레이스홀더 —
// "전부 실제 사용 화면입니다" 카피가 있으므로 캡처를 채우기 전에는 홍보 배포하지 않는 전제.
// 핸드오프의 요금표(500건 50,000원)는 이후 실제 정책 변경(500회 75,000원, "건"→"회")으로
// 낡은 값이 됐다 — 여기 숫자는 views/SettingsView.jsx의 PACKAGE_PRICES가 소스.

const INK_STRONG = '#171719';
const INK_BODY = '#37383C';
const INK_SUB = '#5A6472';
const INK_WEAK = '#8A8F98';
const INK_FAINT = '#A2A6AD';
const RULE = '#E8E6E0';
const RULE_SOFT = '#F0EEE9';
const OFFWHITE = '#FBFBF9';
const PAPER = '#F5F5F0';
const BLUE_TINT = '#EDF2FB';
const GOLD_TINT = '#FBF3DA';
const NAVY_DEEP = '#081D47';
const PADX = 'clamp(20px, 5vw, 40px)';

// 실사 캡처가 들어갈 자리 — 가명 캡처 준비 전까지의 임시 표시
function ShotPlaceholder({ label, radius = 16 }) {
  return (
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      border: `1.5px dashed #D6D3CB`, borderRadius: `${radius}px`, background: '#FAFAF8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '16px', color: INK_WEAK, fontSize: '12px', fontWeight: 600, lineHeight: 1.6,
    }}>
      {label}
    </div>
  );
}

function CtaButton({ href, children, size = 'md' }) {
  const pad = size === 'lg' ? '16px 30px' : size === 'md' ? '15px 28px' : '9px 18px';
  const fs = size === 'lg' ? '15px' : size === 'md' ? '15px' : '13px';
  return (
    <a href={href}
      onMouseEnter={(e) => { e.currentTarget.style.background = NAVY_DEEP; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = R.navy; }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px', background: R.navy,
        color: '#fff', fontSize: fs, fontWeight: size === 'sm' ? 700 : 800, padding: pad,
        borderRadius: '999px', textDecoration: 'none', transition: 'background .2s ease',
      }}>
      {children}
    </a>
  );
}

function StepRow({ step, roleLabel, roleColor, roleBg, title, body, shotLabel, reverse, first }) {
  return (
    <div style={{
      display: 'flex', flexWrap: reverse ? 'wrap-reverse' : 'wrap', gap: '32px', alignItems: 'center',
      marginTop: first ? '34px' : '40px',
      ...(first ? {} : { paddingTop: '40px', borderTop: `1px solid ${RULE_SOFT}` }),
    }}>
      {!reverse && (
        <div style={{ flex: '0 1 260px', height: '300px', position: 'relative' }}>
          <ShotPlaceholder label={shotLabel} />
        </div>
      )}
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{ fontSize: '11px', fontWeight: 800, color: R.gold, letterSpacing: '0.1em', margin: 0 }}>STEP {step}</p>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: roleColor, background: roleBg, padding: '3px 9px', borderRadius: '999px' }}>{roleLabel}</span>
        </div>
        <h3 style={{ fontFamily: R.body, fontSize: '20px', fontWeight: 700, color: R.navy, marginTop: '8px', marginBottom: 0 }}>{title}</h3>
        <p style={{ fontSize: '14.5px', lineHeight: 1.85, color: INK_SUB, marginTop: '10px', marginBottom: 0, maxWidth: '460px' }}>{body}</p>
      </div>
      {reverse && (
        <div style={{ flex: '0 1 260px', height: '300px', position: 'relative' }}>
          <ShotPlaceholder label={shotLabel} />
        </div>
      )}
    </div>
  );
}

export default function PartnerLanding() {
  useEffect(() => {
    const prev = document.title;
    document.title = '데일리 리포트 시스템 — 학원 파트너';
    return () => { document.title = prev; };
  }, []);

  const priceTiers = [
    // views/SettingsView.jsx PACKAGE_PRICES 기준 (2026-07-28 확정: 500회 75,000원)
    { count: 20, price: 5000, per: 250 },
    { count: 50, price: 10000, per: 200 },
    { count: 200, price: 30000, per: 150, featured: true },
    { count: 500, price: 75000, per: 150 },
  ];

  return (
    <div style={{ background: '#fff', color: INK_STRONG, fontFamily: R.body, WebkitFontSmoothing: 'antialiased' }}>
      <style>{`@keyframes plFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>

      {/* ── 상단 네비게이션 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        padding: `18px ${PADX}`, background: '#fff', borderBottom: `1px solid ${RULE}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '7px', background: R.navy, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '13px', fontWeight: 900, fontFamily: R.body,
          }}>D</div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: R.navy, whiteSpace: 'nowrap' }}>데일리 리포트 시스템</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: R.goldText, background: GOLD_TINT, padding: '3px 9px', borderRadius: '999px', marginLeft: '4px', whiteSpace: 'nowrap' }}>학원 파트너</span>
        </div>
        <CtaButton href="/signup" size="sm">무료 체험 신청</CtaButton>
      </div>

      {/* ── 히어로 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px', alignItems: 'center', padding: `64px ${PADX} 56px`, background: '#fff', maxWidth: '1080px', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.16em', color: R.goldText, margin: 0 }}>FOR ACADEMY PARTNERS</p>
          <h1 style={{
            fontFamily: R.body, fontSize: 'clamp(30px, 3vw, 42px)', fontWeight: 900, lineHeight: 1.34,
            color: R.navy, marginTop: '18px', marginBottom: 0, textWrap: 'balance',
          }}>아이의 하루를<br />이만큼 자세히 적어주는<br />학원은 흔치 않습니다</h1>
          <p style={{ fontSize: '16px', lineHeight: 1.85, color: INK_SUB, marginTop: '20px', marginBottom: 0, maxWidth: '480px', textWrap: 'pretty' }}>
            오늘 무엇을 알았고 어디서 걸렸는지, 채점한 시험지까지 그대로. 오른쪽은 편집 없는 실제 발송 화면입니다.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginTop: '30px' }}>
            <CtaButton href="/signup">무료 체험 시작하기 →</CtaButton>
            <a href="#howitworks" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid #D6D3CB',
              color: INK_BODY, fontSize: '14px', fontWeight: 600, padding: '14px 24px',
              borderRadius: '999px', textDecoration: 'none',
            }}>실제 리포트 더 보기</a>
          </div>
          <p style={{ fontSize: '12px', color: INK_WEAK, marginTop: '16px', marginBottom: 0 }}>설치할 앱도 계약서도 없습니다 · 학부모는 링크만 열면 됩니다</p>
        </div>
        <div style={{ flex: '0 1 320px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '290px', background: R.navy, borderRadius: '32px', padding: '10px 10px 12px',
            boxShadow: '0 30px 60px -18px rgba(13,45,107,0.55)', animation: 'plFadeUp 0.5s ease both', boxSizing: 'border-box',
          }}>
            <div style={{ position: 'relative', width: '100%', height: '400px', borderRadius: '24px', overflow: 'hidden', background: PAPER }}>
              <ShotPlaceholder label={'실제 리포트 화면 캡처\n(가명 · 고해상도 준비 중)'} radius={0} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '90px', background: 'linear-gradient(180deg, rgba(245,245,240,0), rgba(245,245,240,0.96))', pointerEvents: 'none' }} />
              <span style={{
                position: 'absolute', left: '50%', bottom: '14px', transform: 'translateX(-50%)',
                fontSize: '11px', fontWeight: 700, color: R.navy, background: '#fff',
                border: '1px solid #E1DED6', padding: '6px 14px', borderRadius: '999px', whiteSpace: 'nowrap',
              }}>아래로 계속 이어집니다</span>
            </div>
          </div>
          <p style={{ fontSize: '11.5px', color: INK_WEAK, margin: 0 }}>실제 발송 화면 · 학생 이름은 예시</p>
        </div>
      </div>

      {/* ── 팩트 스트립 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px', background: RULE, borderTop: `1px solid ${RULE}` }}>
        {[
          { big: '최대 5장', sub: '한 리포트에 올릴 수 있는 시험지 사진' },
          { big: '링크 하나', sub: '학부모는 설치도 로그인도 없이 열람' },
          { big: '매 수업', sub: '쓴 기록은 그대로 아이의 학습 이력이 됩니다' },
        ].map((f) => (
          <div key={f.big} style={{ flex: '1 1 240px', background: PAPER, padding: '26px 32px' }}>
            <p style={{ fontFamily: R.body, fontSize: '24px', fontWeight: 900, color: R.navy, margin: 0 }}>{f.big}</p>
            <p style={{ fontSize: '12.5px', color: INK_SUB, marginTop: '6px', marginBottom: 0, lineHeight: 1.6 }}>{f.sub}</p>
          </div>
        ))}
      </div>

      {/* ── 문제 공감 ── */}
      <div style={{ background: OFFWHITE, borderTop: `1px solid ${RULE}` }}>
        <div style={{ padding: `60px ${PADX}`, maxWidth: '1080px', margin: '0 auto', boxSizing: 'border-box' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.16em', color: R.goldText, margin: 0 }}>혹시 이런 하루를 보내고 계신가요</p>
          <h2 style={{ fontFamily: R.body, fontSize: '26px', fontWeight: 700, color: R.navy, lineHeight: 1.45, marginTop: '12px', marginBottom: 0 }}>
            열심히 가르치고도<br />전달이 안 되면 남는 게 없습니다
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '28px' }}>
            {[
              {
                icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={R.navy} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
                title: '수업 끝나면 연락이 밀립니다',
                body: '"오늘 어땠어요?" 한 명씩 답하다 보면 정작 다음 수업 준비할 시간이 없습니다.',
              },
              {
                icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={R.navy} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></svg>,
                title: '제대로 쓰자니 손이 많이 갑니다',
                body: '한 명 한 명 직접 쓰면 오래 걸리고, 대충 쓰자니 안 쓰느니만 못합니다.',
              },
              {
                icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={R.navy} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19h16" /><path d="M6 15l4-5 3 3 5-7" /></svg>,
                title: '성장을 보여줄 근거가 없습니다',
                body: '학부모는 아이가 얼마나 나아졌는지 알고 싶어 하는데, 그 근거를 만들기가 어렵습니다.',
              },
            ].map((c) => (
              <div key={c.title} style={{ flex: '1 1 280px', background: '#fff', border: `1px solid ${RULE}`, borderRadius: '16px', padding: '22px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: BLUE_TINT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {c.icon}
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: INK_STRONG, marginTop: '14px', marginBottom: 0 }}>{c.title}</h3>
                <p style={{ fontSize: '13px', lineHeight: 1.8, color: INK_SUB, marginTop: '8px', marginBottom: 0 }}>{c.body}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: R.navy, color: '#fff', fontSize: '13.5px', fontWeight: 700, padding: '13px 24px', borderRadius: '999px', textAlign: 'center' }}>
              데일리 리포트 시스템은 이 세 가지를 같이 풉니다
            </span>
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div id="howitworks" style={{ background: '#fff', borderTop: `1px solid ${RULE}` }}>
        <div style={{ padding: `60px ${PADX}`, maxWidth: '1080px', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
            <h2 style={{ fontFamily: R.body, fontSize: '26px', fontWeight: 700, color: R.navy, margin: 0 }}>수업이 끝나고, 화면 그대로</h2>
            <p style={{ fontSize: '13px', color: INK_WEAK, margin: 0 }}>아래 네 장면은 전부 실제 사용 화면입니다</p>
          </div>
          <StepRow first step={1} roleLabel="선생님" roleColor={R.navy} roleBg={BLUE_TINT}
            title="수업 기록" shotLabel={'STEP 1 · 수업 기록 화면 캡처\n(준비 중)'}
            body="오늘 나간 범위와 이해도를 남깁니다. 사진이 없어도 메모만으로 리포트가 만들어집니다." />
          <StepRow reverse step={2} roleLabel="AI 자동" roleColor={R.goldText} roleBg={GOLD_TINT}
            title="시험지 사진 업로드 · AI 채점 분석" shotLabel={'STEP 2 · 시험지 업로드/채점 화면 캡처\n(준비 중)'}
            body="채점한 시험지를 최대 5장까지 올리면, AI가 오답을 유형으로 묶어 정리합니다. 어긋난 부분은 선생님이 바로 고칠 수 있습니다." />
          <StepRow step={3} roleLabel="선생님" roleColor={R.navy} roleBg={BLUE_TINT}
            title="선생님 노트 다듬기" shotLabel={'STEP 3 · 코멘트 작성 화면 캡처\n(준비 중)'}
            body="AI 초안 위에 그날의 장면을 얹습니다. 아이를 본 사람만 쓸 수 있는 문장이 리포트의 핵심입니다." />
          <StepRow reverse step={4} roleLabel="학부모" roleColor="#00873A" roleBg="#E5F5EA"
            title="카카오톡으로 전달" shotLabel={'STEP 4 · 실제 카카오톡 발송 화면 캡처\n(준비 중)'}
            body="보낸 그대로, 학부모 카카오톡으로 도착합니다. 학부모는 설치도 로그인도 없이 링크만 열면 됩니다." />
        </div>
      </div>

      {/* ── 성장 이력 (타임라인) ── */}
      <div style={{ background: R.navy }}>
        <div style={{ padding: `60px ${PADX}`, maxWidth: '1080px', margin: '0 auto', boxSizing: 'border-box' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.16em', color: '#E4C87A', margin: 0 }}>쌓이는 기록</p>
          <h2 style={{ fontFamily: R.body, fontSize: '26px', fontWeight: 700, color: '#fff', lineHeight: 1.45, marginTop: '12px', marginBottom: 0 }}>
            매 수업의 기록이 그대로<br />아이의 성장 이력이 됩니다
          </h2>
          <p style={{ fontSize: '14px', lineHeight: 1.8, color: '#A9B3CC', marginTop: '12px', marginBottom: 0, maxWidth: '640px' }}>
            또래와 비교하지 않습니다. 이 학생이 무엇을 넘어섰고 무엇이 아직 남았는지, 상담 때 그대로 읽어줄 수 있는 기록입니다.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '28px' }}>
            <div style={{ flex: '1 1 min(420px, 100%)', minWidth: 0, maxWidth: '560px', background: PAPER, borderRadius: '18px', padding: '24px 22px', boxSizing: 'border-box' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: R.goldText, margin: 0 }}>리포트 타임라인 · 예시 화면</p>
              <h3 style={{ fontFamily: R.body, fontSize: '17px', color: R.navy, marginTop: '6px', marginBottom: 0 }}>김민준 학생 · 수학 고급반</h3>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: '18px' }}>
                {[
                  { date: '7월 22일', dot: R.gold, title: '이차함수 최댓값 — 정답 9 / 12', body: '정의역 제한 조건만 반복해서 놓침. 오늘은 스스로 다시 풀어봄.', line: true },
                  { date: '7월 15일', dot: R.navy, title: '그래프 해석 — 정답 8 / 12', body: '같은 유형이 3주째 등장. 다음 수업 복습 과제로 지정.', line: true },
                  { date: '7월 8일', dot: '#C7CBD2', title: '인수분해 복습 — 정답 10 / 12', body: '기본 유형은 안정적. 응용으로 넘어가도 좋겠다고 판단.', line: false },
                ].map((t) => (
                  <div key={t.date} style={{ display: 'flex', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '14px', flexShrink: 0 }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: t.dot, marginTop: '5px' }} />
                      {t.line && <span style={{ flex: 1, width: '1px', background: '#DFDCD4' }} />}
                    </div>
                    <div style={{ paddingBottom: t.line ? '18px' : 0 }}>
                      <p style={{ fontSize: '11px', color: INK_WEAK, margin: 0 }}>{t.date}</p>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: INK_STRONG, marginTop: '3px', marginBottom: 0 }}>{t.title}</p>
                      <p style={{ fontSize: '12.5px', lineHeight: 1.75, color: INK_SUB, marginTop: '5px', marginBottom: 0 }}>{t.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '11px', color: INK_WEAK, marginTop: '6px', marginBottom: 0 }}>* 실제 학생 데이터가 아닌 예시입니다</p>
            </div>
          </div>
          <p style={{ fontSize: '12.5px', color: 'rgba(169,179,204,0.85)', marginTop: '18px', marginBottom: 0 }}>기록이 쌓이면 성장 그래프로도 자동 정리됩니다.</p>
        </div>
      </div>

      {/* ── 두 화면 맛보기 ── */}
      <div style={{ background: '#fff' }}>
        <div style={{ padding: `60px ${PADX}`, maxWidth: '1080px', margin: '0 auto', boxSizing: 'border-box' }}>
          <h2 style={{ fontFamily: R.body, fontSize: '26px', fontWeight: 700, color: R.navy, lineHeight: 1.45, margin: 0 }}>
            선생님이 보는 화면과<br />학부모가 보는 화면은 다릅니다
          </h2>
          <p style={{ fontSize: '14px', lineHeight: 1.8, color: INK_SUB, marginTop: '12px', marginBottom: 0, maxWidth: '560px' }}>
            맛보기로 일부만 보여드립니다. 전체 화면은 체험 계정에서 직접 눌러보세요.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '28px' }}>
            {[
              {
                badge: '원장 · 강사용', badgeColor: R.navy, badgeBg: BLUE_TINT,
                title: '학원 안에서만 보는 관리 화면',
                body: '누가 아직 리포트를 안 썼는지, 이 학생이 어떤 유형에서 반복해 걸리는지 — 상담 전에 열어두면 할 말이 정리됩니다.',
                shot: '선생님 화면 캡처 (준비 중)',
              },
              {
                badge: '학부모용', badgeColor: R.goldText, badgeBg: GOLD_TINT,
                title: '링크로 열어보는 오늘의 리포트',
                body: '점수와 선생님 노트, 채점된 시험지 사진까지 한 화면에. 궁금한 점은 아래 입력창으로 바로 물어봅니다.',
                shot: '학부모 화면 캡처 (준비 중)',
              },
            ].map((c) => (
              <div key={c.badge} style={{ flex: '1 1 min(420px, 100%)', minWidth: 0, border: `1px solid ${RULE}`, borderRadius: '18px', overflow: 'hidden', background: OFFWHITE, boxSizing: 'border-box' }}>
                <div style={{ padding: '18px 20px 14px' }}>
                  <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: 700, background: c.badgeBg, color: c.badgeColor, padding: '5px 11px', borderRadius: '999px' }}>{c.badge}</span>
                  <h3 style={{ fontFamily: R.body, fontSize: '18px', color: R.navy, marginTop: '12px', marginBottom: 0 }}>{c.title}</h3>
                  <p style={{ fontSize: '13px', lineHeight: 1.75, color: INK_SUB, marginTop: '8px', marginBottom: 0 }}>{c.body}</p>
                </div>
                <div style={{ position: 'relative', height: '260px', margin: '0 20px', borderRadius: '14px 14px 0 0', overflow: 'hidden' }}>
                  <ShotPlaceholder label={c.shot} radius={0} />
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '70px', background: `linear-gradient(180deg, rgba(251,251,249,0), ${OFFWHITE})`, pointerEvents: 'none' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 기능 요약 4카드 ── */}
      <div style={{ background: '#fff' }}>
        <div style={{ padding: `0 ${PADX} 56px`, maxWidth: '1080px', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            {[
              { title: '단원별 이해도 정리', sub: '상담 때 근거로 쓰는 누적 기록' },
              { title: '미작성 학생 표시', sub: '누가 빠졌는지 한눈에 확인' },
              { title: '리포트 아카이브', sub: '지난 기록을 언제든 다시 열람' },
              { title: '모바일 최적화', sub: '설치 없이 바로 쓰는 앱 화면' },
            ].map((f) => (
              <div key={f.title} style={{ flex: '1 1 220px', background: OFFWHITE, border: `1px solid ${RULE}`, borderRadius: '14px', padding: '18px 20px' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: R.navy, margin: 0 }}>{f.title}</p>
                <p style={{ fontSize: '12.5px', color: INK_SUB, marginTop: '6px', marginBottom: 0, lineHeight: 1.7 }}>{f.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 요금 ── */}
      <div style={{ background: PAPER, borderTop: `1px solid ${RULE}` }}>
        <div style={{ padding: `56px ${PADX}`, maxWidth: '1080px', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
            <h2 style={{ fontFamily: R.body, fontSize: '26px', fontWeight: 700, color: R.navy, margin: 0 }}>쓴 만큼만 냅니다</h2>
            <p style={{ fontSize: '13px', color: INK_WEAK, margin: 0 }}>AI 분석 횟수 기준 충전제 · 월 약정 없음</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '26px' }}>
            {priceTiers.map((t) => (
              <div key={t.count} style={{
                flex: '1 1 200px', background: t.featured ? '#FFFDF6' : '#fff',
                border: t.featured ? `1.5px solid ${R.gold}` : `1px solid ${RULE}`,
                borderRadius: '16px', padding: '22px', position: 'relative',
              }}>
                {t.featured && (
                  <span style={{ position: 'absolute', top: '-11px', left: '22px', background: R.gold, color: '#fff', fontSize: '11px', fontWeight: 800, padding: '4px 12px', borderRadius: '999px' }}>추천</span>
                )}
                <p style={{ fontSize: '13px', fontWeight: 700, color: t.featured ? R.goldText : INK_SUB, margin: 0 }}>AI 분석 {t.count}회</p>
                <p style={{ fontFamily: R.body, fontSize: '26px', fontWeight: 900, color: R.navy, marginTop: '8px', marginBottom: 0 }}>{t.price.toLocaleString()}원</p>
                <p style={{ fontSize: '12px', color: INK_WEAK, marginTop: '8px', marginBottom: 0 }}>회당 {t.per}원</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: INK_WEAK, marginTop: '16px', marginBottom: 0, lineHeight: 1.7 }}>
            시험지 사진을 AI로 분석한 횟수만큼 차감됩니다. 사진 없이 쓰는 리포트와 발송·열람은 무료이고, 쓰지 않은 달에는 비용이 발생하지 않습니다.
          </p>
        </div>
      </div>

      {/* ── 최종 CTA + 푸터 ── */}
      <div style={{ background: '#fff', borderTop: `1px solid ${RULE}` }}>
        <div style={{ textAlign: 'center', padding: `58px ${PADX} 64px`, maxWidth: '1080px', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: PAPER, borderRadius: '999px', padding: '8px 16px 8px 10px' }}>
            <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: R.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={R.gold} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6" /></svg>
            </span>
            <span style={{ fontSize: '12.5px', color: INK_BODY, textAlign: 'left' }}>저희도 매일 이 시스템으로 리포트를 씁니다 — <strong style={{ color: R.navy }}>교현학원</strong></span>
          </div>
          <h2 style={{ fontFamily: R.body, fontSize: '30px', fontWeight: 900, color: R.navy, lineHeight: 1.4, marginTop: '22px', marginBottom: 0 }}>
            우리 학원도 오늘부터<br />시작해볼까요
          </h2>
          <p style={{ fontSize: '13.5px', lineHeight: 1.8, color: INK_SUB, marginTop: '14px', marginBottom: 0 }}>신청서를 남겨주시면 검토 후 계정을 열어드립니다.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '26px' }}>
            <CtaButton href="/signup" size="lg">학원 등록 신청서 작성 →</CtaButton>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '18px', marginTop: '18px' }}>
            <span style={{ fontSize: '12px', color: INK_SUB }}>✓ 설치할 앱 없음</span>
            <span style={{ fontSize: '12px', color: INK_SUB }}>✓ 약정 기간 없음</span>
            <span style={{ fontSize: '12px', color: INK_SUB }}>✓ 언제든 중단 가능</span>
          </div>
          <p style={{ fontSize: '12.5px', color: INK_SUB, marginTop: '16px', marginBottom: 0 }}>궁금한 점은 신청 폼에 함께 남겨주세요.</p>
          <p style={{ fontSize: '11px', color: INK_FAINT, marginTop: '34px', marginBottom: 0, paddingTop: '20px', borderTop: `1px solid ${RULE}` }}>
            데일리 리포트 시스템 · 와이즈에듀 교현학원
          </p>
        </div>
      </div>
    </div>
  );
}
