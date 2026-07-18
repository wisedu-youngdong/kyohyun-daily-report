import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Vercel 환경변수엔 JSON을 그대로 넣으면 개행(private_key의 \n)이 깨지기 쉬워서,
// 서비스 계정 JSON 전체를 base64로 인코딩해 하나의 문자열로 저장 — 여기서 디코드.
function getAdminAuth() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 환경변수가 설정되지 않았습니다.');
    const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getAuth();
}

function buildResetEmailHtml({ resetLink }) {
  // 이메일 클라이언트(특히 Outlook)는 flexbox/grid를 못 받아서 <table> 기반으로 작성.
  // 폰트도 웹폰트가 대부분 걸러지므로 시스템 폰트 스택만 사용.
  const navy = '#0D2D6B';
  const ink = '#1A1A1A';
  const inkSoft = '#4B5563';
  const inkMute = '#9CA3AF';
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
                  <td style="width:26px;height:26px;background:${navy};border-radius:6px;text-align:center;vertical-align:middle;">
                    <span style="color:#fff;font-size:13px;font-weight:800;font-family:${fontStack};">K</span>
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

    const auth = getAdminAuth();
    const actionCodeSettings = {
      // 재설정 완료 후 돌아올 주소 — 로그인 화면
      url: 'https://dailyreportsystem.co.kr/',
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

    const html = buildResetEmailHtml({ resetLink });

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
