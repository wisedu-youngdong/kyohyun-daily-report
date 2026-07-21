// Resend 발송 + 레터헤드 이메일 셸 공용 헬퍼 — 원래 notify.js에만 있었는데
// cron-daily.js(아침 브리핑/월말 어워드 메일)도 같은 셸이 필요해서 분리함.
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Malgun Gothic','Apple SD Gothic Neo','Segoe UI',Helvetica,Arial,sans-serif";
export const NAVY = '#0D2D6B';
export const INK = '#1A1A1A';
export const INK_SOFT = '#4B5563';
export const INK_MUTE = '#9CA3AF';
export const LINE = '#E9EAEE';

export function emailShell({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F8FA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#FFFFFF;border:1px solid ${LINE};border-radius:4px;">
          <tr>
            <td style="padding:36px 36px 32px;font-family:${FONT_STACK};">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:26px;">
                <tr>
                  <td style="width:26px;height:26px;border-radius:6px;overflow:hidden;">
                    <img src="https://dailyreportsystem.co.kr/kyohyun-logo.png" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border-radius:6px;" />
                  </td>
                  <td style="padding-left:9px;font-size:13px;font-weight:800;color:${INK};font-family:${FONT_STACK};">데일리 리포트 시스템</td>
                </tr>
              </table>
              <h1 style="font-size:19px;font-weight:800;letter-spacing:-0.01em;margin:0 0 14px;line-height:1.4;color:${INK};font-family:${FONT_STACK};">${title}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${LINE};padding:16px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:${INK_MUTE};line-height:1.7;font-family:${FONT_STACK};">데일리 리포트 시스템 · dailyreportsystem.co.kr</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function ctaButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0">
    <tr><td style="background:${NAVY};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;font-family:${FONT_STACK};">${label}</a>
    </td></tr>
  </table>`;
}

export async function sendViaResend({ to, subject, html }) {
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: '데일리 리포트 시스템 <noreply@dailyreportsystem.co.kr>', to, subject, html }),
  });
  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('Resend 발송 실패:', resendRes.status, errText.slice(0, 300));
    return false;
  }
  return true;
}
