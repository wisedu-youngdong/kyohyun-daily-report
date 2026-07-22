import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ensureAdminApp } from './_lib/adminApp.js';

function getAdminAuth() { ensureAdminApp(); return getAuth(); }
function getAdminDb() { ensureAdminApp(); return getFirestore(); }

// 이메일당 시간당 최대 요청 수 — rate limit 없으면 임의 주소로 재설정 메일을 무제한
// 발송시켜 메일 폭탄으로 악용될 수 있음. _rateLimits는 클라이언트 규칙이 없어(firestore.rules
// 에 미등록 = 기본 전면 차단) Admin SDK로만 접근 가능.
const RESET_RATE_LIMIT_MAX = 3;
const RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

async function checkAndBumpRateLimit(db, email) {
  const key = email.toLowerCase().trim();
  const ref = db.collection('_rateLimits').doc(`resetEmail_${key}`);
  const snap = await ref.get();
  const now = Date.now();
  if (snap.exists) {
    const data = snap.data();
    if (now - data.windowStart < RESET_RATE_LIMIT_WINDOW_MS) {
      if (data.count >= RESET_RATE_LIMIT_MAX) return false;
      await ref.update({ count: FieldValue.increment(1) });
      return true;
    }
  }
  await ref.set({ count: 1, windowStart: now });
  return true;
}

function buildResetEmailHtml({ resetLink }) {
  // 이메일 클라이언트(특히 Outlook)는 flexbox/grid를 못 받아서 <table> 기반으로 작성.
  // 폰트도 웹폰트가 대부분 걸러지므로 시스템 폰트 스택만 사용.
  const navy = '#0D2D6B';
  const ink = '#1A1A1A';
  const inkSoft = '#4B5563';
  const inkMute = '#6C7586';
  const line = '#E9EAEE';
  const amber = '#8A5A00';
  const amberBg = '#FFF8E7';
  const amberLine = '#F0D584';
  const fontStack = "-apple-system,BlinkMacSystemFont,'Malgun Gothic','Apple SD Gothic Neo','Segoe UI',Helvetica,Arial,sans-serif";

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F8FA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#FFFFFF;border:1px solid ${line};border-radius:4px;">
          <tr>
            <td style="padding:36px 36px 32px;font-family:${fontStack};">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:30px;">
                <tr>
                  <td style="width:26px;height:26px;border-radius:6px;overflow:hidden;">
                    <img src="https://dailyreportsystem.co.kr/kyohyun-logo.png" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border-radius:6px;" />
                  </td>
                  <td style="padding-left:9px;font-size:13px;font-weight:800;color:${ink};font-family:${fontStack};">데일리 리포트 시스템</td>
                </tr>
              </table>

              <h1 style="font-size:19px;font-weight:800;letter-spacing:-0.01em;margin:0 0 14px;line-height:1.4;color:${ink};font-family:${fontStack};">비밀번호 재설정을 요청하셨어요</h1>
              <p style="font-size:13.5px;line-height:1.75;color:${inkSoft};margin:0 0 26px;font-family:${fontStack};">
                비밀번호 재설정 요청이 접수됐어요.<br>
                아래 버튼을 눌러 새 비밀번호를 설정해주세요. 이 링크는 <b style="color:${ink};">1시간</b> 동안만 유효해요.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:26px;">
                <tr>
                  <td style="background:${navy};border-radius:8px;">
                    <a href="${resetLink}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;font-family:${fontStack};">비밀번호 재설정하기</a>
                  </td>
                </tr>
              </table>

              <p style="font-size:11.5px;color:${inkMute};line-height:1.7;margin:0 0 26px;word-break:break-all;font-family:${fontStack};">
                버튼이 안 눌리면 아래 링크를 주소창에 붙여넣어주세요.<br>
                <a href="${resetLink}" style="color:${navy};text-decoration:underline;">${resetLink}</a>
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${amberBg};border:1px solid ${amberLine};border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;">
                    <p style="margin:0;font-size:12px;color:${amber};line-height:1.65;font-family:${fontStack};">본인이 요청하지 않으셨다면 이 메일은 무시하셔도 괜찮아요. 비밀번호는 바뀌지 않아요.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${line};padding:18px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:${inkMute};line-height:1.7;font-family:${fontStack};">데일리 리포트 시스템 · dailyreportsystem.co.kr<br>이 메일은 발신 전용이에요.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: '이메일이 필요합니다.' });
    }

    const db = getAdminDb();
    const allowed = await checkAndBumpRateLimit(db, email);
    if (!allowed) {
      // 계정 존재 여부를 노출하지 않으려 미가입 이메일과 동일하게 성공 응답으로 위장
      console.error(`비밀번호 재설정 rate limit 초과: ${email}`);
      return res.status(200).json({ ok: true });
    }

    const auth = getAdminAuth();
    const actionCodeSettings = {
      // 새 비밀번호 입력을 처리하는 자체 브랜딩 페이지 — main.jsx의 /auth/action 라우트
      url: 'https://dailyreportsystem.co.kr/auth/action',
    };

    let resetLink;
    try {
      resetLink = await auth.generatePasswordResetLink(email, actionCodeSettings);
    } catch (e) {
      // 존재하지 않는 이메일이어도 있는 것처럼 응답 — 어떤 이메일이 가입돼 있는지
      // 외부에 노출하지 않기 위한 보안 관례(계정 존재 여부 열거 방지).
      // generatePasswordResetLink의 미가입 이메일 에러 코드는 auth/user-not-found가 아니라
      // auth/email-not-found — 에뮬레이터로 실제 호출해서 확인함(문서상 흔한 착오 포인트).
      if (e.code === 'auth/email-not-found') {
        return res.status(200).json({ ok: true });
      }
      throw e;
    }

    // generatePasswordResetLink가 돌려주는 링크는 Firebase 자체 호스팅 페이지
    // (*.firebaseapp.com/__/auth/action)로 연결되고, actionCodeSettings.url은 그 페이지의
    // continueUrl로만 쓰인다 — 우리 도메인으로 바로 연결하려면 콘솔의 "커스텀 작업 URL"
    // 설정이 필요한데, 이 설정 없이도 되도록 진짜 인증 토큰(oobCode)만 뽑아서
    // 우리 도메인 링크를 직접 구성한다(ResetPasswordScreen.jsx는 mode/oobCode만 있으면 됨).
    const oobCode = new URL(resetLink).searchParams.get('oobCode');
    const finalLink = `https://dailyreportsystem.co.kr/auth/action?mode=resetPassword&oobCode=${oobCode}`;

    const html = buildResetEmailHtml({ resetLink: finalLink });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: '데일리 리포트 시스템 <noreply@dailyreportsystem.co.kr>',
        to: email,
        subject: '[데일리 리포트 시스템] 비밀번호 재설정 안내',
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend 발송 실패:', resendRes.status, errText.slice(0, 300));
      return res.status(502).json({ error: '메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('비밀번호 재설정 메일 오류:', e.message);
    res.status(500).json({ error: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
}
