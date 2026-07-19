// Vercel Serverless — 학부모가 질문을 남기면 그 학원 원장님께 이메일로 알림
// PublicReport.jsx에서 fire-and-forget으로 호출(응답 대기/실패 여부와 무관하게 UX 진행)

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 환경변수가 설정되지 않았습니다.');
    const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

function buildNotifyEmailHtml({ studentName, questionText }) {
  const navy = '#0D2D6B';
  const ink = '#1A1A1A';
  const inkSoft = '#4B5563';
  const inkMute = '#9CA3AF';
  const line = '#E9EAEE';
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
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:26px;">
                <tr>
                  <td style="width:26px;height:26px;border-radius:6px;overflow:hidden;">
                    <img src="https://dailyreportsystem.co.kr/kyohyun-logo.png" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border-radius:6px;" />
                  </td>
                  <td style="padding-left:9px;font-size:13px;font-weight:800;color:${ink};font-family:${fontStack};">데일리 리포트 시스템</td>
                </tr>
              </table>

              <h1 style="font-size:19px;font-weight:800;letter-spacing:-0.01em;margin:0 0 14px;line-height:1.4;color:${ink};font-family:${fontStack};">새 질문이 도착했어요</h1>
              <p style="font-size:13.5px;line-height:1.75;color:${inkSoft};margin:0 0 20px;font-family:${fontStack};">
                <b style="color:${ink};">${studentName}</b> 학생 리포트에 학부모님이 질문을 남기셨어요.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F8FF;border:1px solid #C5D5F0;border-radius:8px;margin-bottom:26px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color:${ink};line-height:1.7;font-family:${fontStack};">${questionText}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${navy};border-radius:8px;">
                    <a href="https://dailyreportsystem.co.kr/" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;font-family:${fontStack};">로그인해서 답변하기</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${line};padding:16px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:${inkMute};line-height:1.7;font-family:${fontStack};">데일리 리포트 시스템 · dailyreportsystem.co.kr</p>
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
    const { academyId, studentName, questionText } = req.body || {};
    if (!academyId || !questionText) {
      return res.status(400).json({ error: '필수 정보가 없습니다.' });
    }

    const db = getAdminDb();
    const snap = await db.collection('users')
      .where('academyId', '==', academyId)
      .where('role', '==', 'director')
      .limit(1)
      .get();

    if (snap.empty || !snap.docs[0].data().email) {
      // 원장 이메일을 못 찾아도 학부모 쪽 질문 등록 자체는 이미 끝난 상태라 조용히 넘어감
      console.error(`알림 대상 원장 이메일 없음 (academyId=${academyId})`);
      return res.status(200).json({ ok: true, notified: false });
    }
    const directorEmail = snap.docs[0].data().email;

    const html = buildNotifyEmailHtml({ studentName: studentName || '학생', questionText });
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '데일리 리포트 시스템 <noreply@dailyreportsystem.co.kr>',
        to: directorEmail,
        subject: `[데일리 리포트 시스템] ${studentName || '학생'} 리포트에 질문이 왔어요`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('질문 알림 메일 발송 실패:', resendRes.status, errText.slice(0, 300));
      return res.status(200).json({ ok: true, notified: false });
    }

    res.status(200).json({ ok: true, notified: true });
  } catch (e) {
    console.error('질문 알림 처리 오류:', e.message);
    res.status(200).json({ ok: true, notified: false });
  }
}
