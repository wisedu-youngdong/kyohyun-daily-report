// Vercel Serverless — 이메일 알림 발송. type으로 분기:
//   'question' (기본값, 인증 불필요) — 학부모가 질문을 남기면 그 학원 원장님께 알림
//     (PublicReport.jsx에서 fire-and-forget 호출)
//   'signup-approved' / 'signup-rejected' (플랫폼 관리자 인증 필요) — 학원 가입 신청 심사 결과를
//     신청자 본인에게 알림 (SettingsView.jsx "가입 신청 관리"에서 fire-and-forget 호출)
// Vercel Hobby 플랜 서버리스 함수 12개 제한 때문에 새 파일을 안 늘리고 기존 notify-question.js를
// 이 용도로 일반화함 — CLAUDE.md 참고.
import { getFirestore } from 'firebase-admin/firestore';
import { ensureAdminApp } from './_lib/adminApp.js';
import { verifyIdTokenHeader } from './_lib/verifyAuth.js';

function getAdminDb() { ensureAdminApp(); return getFirestore(); }

// 이메일 HTML에 그대로 꽂아 넣는 값(학생 이름/질문 내용 등 사용자 입력)은 <script>나 <a> 태그를
// 넣어 수신자 메일함에서 실행/피싱 링크로 악용될 수 있어 이스케이프 필요
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Malgun Gothic','Apple SD Gothic Neo','Segoe UI',Helvetica,Arial,sans-serif";
const NAVY = '#0D2D6B';
const INK = '#1A1A1A';
const INK_SOFT = '#4B5563';
const INK_MUTE = '#9CA3AF';
const LINE = '#E9EAEE';

function emailShell({ title, bodyHtml }) {
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

function ctaButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0">
    <tr><td style="background:${NAVY};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;font-family:${FONT_STACK};">${label}</a>
    </td></tr>
  </table>`;
}

function buildQuestionEmailHtml({ studentName, questionText }) {
  return emailShell({
    title: '새 질문이 도착했어요',
    bodyHtml: `
      <p style="font-size:13.5px;line-height:1.75;color:${INK_SOFT};margin:0 0 20px;font-family:${FONT_STACK};">
        <b style="color:${INK};">${escapeHtml(studentName)}</b> 학생 리포트에 학부모님이 질문을 남기셨어요.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F8FF;border:1px solid #C5D5F0;border-radius:8px;margin-bottom:26px;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:${INK};line-height:1.7;font-family:${FONT_STACK};">${escapeHtml(questionText)}</p>
        </td></tr>
      </table>
      ${ctaButton('https://dailyreportsystem.co.kr/', '로그인해서 답변하기')}`,
  });
}

function buildSignupApprovedEmailHtml({ academyName }) {
  return emailShell({
    title: '가입 신청이 승인됐어요',
    bodyHtml: `
      <p style="font-size:13.5px;line-height:1.75;color:${INK_SOFT};margin:0 0 26px;font-family:${FONT_STACK};">
        <b style="color:${INK};">${escapeHtml(academyName)}</b>의 데일리 리포트 시스템 가입 신청이 승인됐어요.<br>
        이제 신청하신 이메일과 비밀번호로 바로 로그인하실 수 있어요.
      </p>
      ${ctaButton('https://dailyreportsystem.co.kr/', '로그인하러 가기')}`,
  });
}

function buildSignupRejectedEmailHtml({ academyName }) {
  return emailShell({
    title: '가입 신청 검토 결과 안내',
    bodyHtml: `
      <p style="font-size:13.5px;line-height:1.75;color:${INK_SOFT};margin:0 0 10px;font-family:${FONT_STACK};">
        <b style="color:${INK};">${escapeHtml(academyName)}</b>의 데일리 리포트 시스템 가입 신청을 검토한 결과, 이번엔 승인해드리지 못했어요.
      </p>
      <p style="font-size:12.5px;line-height:1.75;color:${INK_MUTE};margin:0;font-family:${FONT_STACK};">
        문의사항이 있으시면 신청 시 남겨주신 연락처로 저희가 연락드리거나, 다시 신청해주셔도 괜찮아요.
      </p>`,
  });
}

async function sendViaResend({ to, subject, html }) {
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

async function handleQuestionNotify(req, res, db) {
  const { academyId, questionId } = req.body || {};
  if (!academyId || !questionId) return res.status(400).json({ error: '필수 정보가 없습니다.' });

  // 클라이언트가 보낸 studentName/questionText를 그대로 믿지 않고, 실제로 그 질문이 Firestore에
  // 저장돼 있는지 먼저 확인 + 내용도 저장된 값을 신뢰 소스로 사용 — 아무나 이 엔드포인트에 임의
  // 텍스트를 넣어 이메일을 지어보내는 걸 막는다(질문 자체를 Firestore에 실제로 만들어야만 알림이 나감).
  const qDoc = await db.collection('academies').doc(academyId).collection('reportQuestions').doc(questionId).get();
  if (!qDoc.exists) {
    console.error(`알림 대상 질문 문서 없음 (academyId=${academyId}, questionId=${questionId})`);
    return res.status(200).json({ ok: true, notified: false });
  }
  const qData = qDoc.data();
  const studentName = qData.studentName || '학생';
  const questionText = qData.questionText || '';

  // 간단한 남용 방지 — 짧은 시간에 같은 학원 앞으로 질문이 비정상적으로 많이 몰리면(스팸/메일폭탄
  // 의심) 메일 발송만 건너뜀. 질문 자체는 이미 저장돼 있어 원장님이 로그인하면 확인 가능하므로
  // 데이터 유실은 없음.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentSnap = await db.collection('academies').doc(academyId).collection('reportQuestions')
    .where('askedAt', '>=', oneHourAgo)
    .get();
  if (recentSnap.size > 30) {
    console.error(`알림 남용 의심 — academyId=${academyId} 최근 1시간 질문 ${recentSnap.size}건, 메일 발송 건너뜀`);
    return res.status(200).json({ ok: true, notified: false });
  }

  const snap = await db.collection('users').where('academyId', '==', academyId).where('role', '==', 'director').limit(1).get();
  if (snap.empty || !snap.docs[0].data().email) {
    console.error(`알림 대상 원장 이메일 없음 (academyId=${academyId})`);
    return res.status(200).json({ ok: true, notified: false });
  }
  const directorEmail = snap.docs[0].data().email;

  const ok = await sendViaResend({
    to: directorEmail,
    subject: `[데일리 리포트 시스템] ${studentName} 리포트에 질문이 왔어요`,
    html: buildQuestionEmailHtml({ studentName, questionText }),
  });
  res.status(200).json({ ok: true, notified: ok });
}

async function handleSignupDecisionNotify(req, res, db, type) {
  // 가입 승인/거절 결과 메일은 플랫폼 관리자만 트리거할 수 있어야 함(임의 이메일로
  // "승인/거절됐다"는 알림을 대신 보내는 악용 방지) — delete-signup-request.js와 동일한 검증.
  const decoded = await verifyIdTokenHeader(req);
  if (!decoded) return res.status(401).json({ error: '인증 정보가 없습니다.' });
  const callerSnap = await db.collection('users').doc(decoded.uid).get();
  if (!callerSnap.exists || callerSnap.data().isPlatformAdmin !== true) {
    return res.status(403).json({ error: '플랫폼 관리자만 발송할 수 있습니다.' });
  }

  const { email, academyName } = req.body || {};
  if (!email || typeof email !== 'string') return res.status(400).json({ error: '수신 이메일이 필요합니다.' });

  const html = type === 'signup-approved'
    ? buildSignupApprovedEmailHtml({ academyName })
    : buildSignupRejectedEmailHtml({ academyName });
  const subject = type === 'signup-approved'
    ? '[데일리 리포트 시스템] 가입 신청이 승인됐어요'
    : '[데일리 리포트 시스템] 가입 신청 검토 결과 안내';

  const ok = await sendViaResend({ to: email, subject, html });
  res.status(200).json({ ok: true, notified: ok });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const db = getAdminDb();
    const type = req.body?.type || 'question';

    if (type === 'signup-approved' || type === 'signup-rejected') {
      return await handleSignupDecisionNotify(req, res, db, type);
    }
    return await handleQuestionNotify(req, res, db);
  } catch (e) {
    console.error('알림 처리 오류:', e.message);
    res.status(200).json({ ok: true, notified: false });
  }
}
