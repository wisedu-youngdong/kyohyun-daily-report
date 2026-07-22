// Vercel Cron — 매일 08:00 KST(vercel.json의 "0 23 * * *"는 UTC 기준) 실행.
//   1) 아침 브리핑: 학원별로 오늘 수업 예정 학생 중 아직 리포트가 없는 학생 + 미답변 질문 수를
//      원장님께 메일로 안내
//   2) 월말 자동 어워드: 매월 1일에만, 지난달 리포트를 집계해 "이달의 우수 학생 후보"를 원장님께
//      추천 메일로 안내 (실제 시상장 데이터는 새로 만들지 않고, 이미 있는 /award/:studentId
//      라이브 페이지 링크만 보냄 — GrowthAward.jsx가 매 방문마다 최신 데이터로 직접 계산해서
//      보여주므로 별도 저장이 필요 없음)
// Vercel Hobby 플랜 서버리스 함수 12개 제한 때문에(CLAUDE.md 참고) 새 파일 하나로 두 작업을 묶음.
import { getFirestore } from 'firebase-admin/firestore';
import { ensureAdminApp } from './_lib/adminApp.js';
import { escapeHtml, INK, INK_SOFT, INK_MUTE, emailShell, ctaButton, sendViaResend } from './_lib/email.js';

// 학원마다 Firestore 조회 여러 번 + 이메일 발송을 순차로 반복하는 루프라, 학원 수가 늘면
// Vercel 기본 타임아웃(짧음)에 걸려 남은 학원들이 조용히 누락될 수 있음 — Hobby 플랜 상한인
// 60초까지 확보(polish.js 등 AI 호출 엔드포인트의 maxDuration=30과 같은 이유의 안전장치)
export const maxDuration = 60;

function getAdminDb() { ensureAdminApp(); return getFirestore(); }

// growth.js의 kstDay/kstWeekday와 같은 shift-then-extract 방식 — growth.js는 클라이언트
// Firestore SDK를 import하고 있어 서버리스 함수에서 그대로 재사용할 수 없어 여기서 다시 구현
function kstNow() { return new Date(Date.now() + 9 * 3600 * 1000); }
function kstDateStr(d) { return d.toISOString().split('T')[0]; }

async function getDirectorEmail(db, academyId) {
  const snap = await db.collection('users').where('academyId', '==', academyId).where('role', '==', 'director').limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data().email || null;
}

function buildBriefingEmailHtml({ todayStr, totalScheduled, pending, unanswered }) {
  const pendingListHtml = pending.length > 0
    ? `<ul style="margin:0 0 20px;padding-left:18px;">${pending.map(s => `<li style="font-size:13px;color:${INK};line-height:2;font-family:inherit;">${escapeHtml(s.name)}</li>`).join('')}</ul>`
    : `<p style="font-size:13px;color:${INK_SOFT};margin:0 0 20px;">오늘 예정된 학생 전원 리포트가 이미 완료됐어요.</p>`;
  return emailShell({
    title: `오늘(${todayStr}) 아침 브리핑`,
    bodyHtml: `
      <p style="font-size:13.5px;line-height:1.75;color:${INK_SOFT};margin:0 0 16px;">
        오늘 수업 예정 <b style="color:${INK};">${totalScheduled}명</b> 중 아직 리포트가 없는 학생이
        <b style="color:${INK};">${pending.length}명</b> 있어요.
      </p>
      ${pendingListHtml}
      ${unanswered > 0 ? `<p style="font-size:13px;line-height:1.75;color:${INK_SOFT};margin:0 0 26px;">답변 대기 중인 학부모 질문도 <b style="color:${INK};">${unanswered}건</b> 있어요.</p>` : ''}
      ${ctaButton('https://dailyreportsystem.co.kr/', '리포트 작성하러 가기')}`,
  });
}

export async function sendMorningBriefing(db, academyId, academy, todayStr, todayDow) {
  const directorEmail = await getDirectorEmail(db, academyId);
  if (!directorEmail) return false;

  const studentsSnap = await db.collection('academies').doc(academyId).collection('students').get();
  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.archived);
  const scheduledToday = students.filter(s => !s.scheduleDays || s.scheduleDays.length === 0 || s.scheduleDays.includes(todayDow));
  if (scheduledToday.length === 0) return false;

  const todayStartUTC = new Date(`${todayStr}T00:00:00+09:00`);
  const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 3600 * 1000);
  const reportsSnap = await db.collection('academies').doc(academyId).collection('reports')
    .where('createdAt', '>=', todayStartUTC)
    .where('createdAt', '<', todayEndUTC)
    .get();
  const handledIds = new Set();
  reportsSnap.docs.forEach(d => {
    const r = d.data();
    const sent = !!(r.teacherNote && r.teacherNote.trim()) && !r.isDraft;
    const excused = r.attendance === '결석' && r.isDraft !== true;
    if (sent || excused) handledIds.add(r.studentId);
  });
  const pending = scheduledToday.filter(s => !handledIds.has(s.id));

  // 전체 질문 이력을 매일 읽으면(where 없이 .get()) 질문이 쌓일수록 이 크론의 Firestore 읽기
  // 비용이 끝없이 늘어남 — 브리핑 목적상 "최근에 온 미답변 질문"만 알려주면 충분하므로 최근
  // 60일로만 창을 잡는다(그보다 오래 방치된 질문은 브리핑 집계에서만 빠질 뿐, 원장이 로그인하면
  // reportQuestions 화면에서 여전히 볼 수 있어 데이터 유실은 아님)
  const questionsCutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const qSnap = await db.collection('academies').doc(academyId).collection('reportQuestions')
    .where('askedAt', '>=', questionsCutoff)
    .get();
  const unanswered = qSnap.docs.filter(d => !d.data().answerText).length;

  if (pending.length === 0 && unanswered === 0) return false;

  const html = buildBriefingEmailHtml({ todayStr, totalScheduled: scheduledToday.length, pending, unanswered });
  return sendViaResend({ to: directorEmail, subject: `[데일리 리포트 시스템] 오늘(${todayStr}) 아침 브리핑`, html });
}

function buildAwardEmailHtml({ monthLabel, studentName, studentId }) {
  return emailShell({
    title: `${monthLabel} 이달의 우수 학생 후보`,
    bodyHtml: `
      <p style="font-size:13.5px;line-height:1.75;color:${INK_SOFT};margin:0 0 10px;">
        지난달 리포트를 살펴보니 <b style="color:${INK};">${escapeHtml(studentName)}</b> 학생이 이달의 우수 학생 후보로 좋아 보여요.
      </p>
      <p style="font-size:12.5px;line-height:1.75;color:${INK_MUTE};margin:0 0 26px;">
        '개념 완벽' 진단 횟수와 평균 이해도를 기준으로 자동 계산된 추천이에요 — 최종 시상 여부는 원장님이 확인 후 결정해주세요.
      </p>
      ${ctaButton(`https://dailyreportsystem.co.kr/award/${studentId}`, '시상장 미리보기')}`,
  });
}

export async function sendMonthlyAward(db, academyId, now) {
  const directorEmail = await getDirectorEmail(db, academyId);
  if (!directorEmail) return false;

  // now는 "KST 기준 현재 시각"을 UTC Date 객체에 담아둔 값(kstNow() 참고) — 여기서 연/월을
  // getUTCFullYear/getUTCMonth로 읽으면 KST 기준 연/월이 그대로 나온다
  const prevMonthStartKst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const thisMonthStartKst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startUTC = new Date(prevMonthStartKst.getTime() - 9 * 3600 * 1000);
  const endUTC = new Date(thisMonthStartKst.getTime() - 9 * 3600 * 1000);

  const reportsSnap = await db.collection('academies').doc(academyId).collection('reports')
    .where('createdAt', '>=', startUTC)
    .where('createdAt', '<', endUTC)
    .get();
  const sentReports = reportsSnap.docs.map(d => d.data())
    .filter(r => !!(r.teacherNote && r.teacherNote.trim()) && !r.isDraft && r.studentId);
  if (sentReports.length === 0) return false;

  const byStudent = new Map();
  sentReports.forEach(r => {
    const cur = byStudent.get(r.studentId) || { studentId: r.studentId, studentName: r.studentName || '학생', perfectCount: 0, ratingSum: 0, ratingN: 0 };
    if ((r.diagnosis || []).some(d => d.key === 'perfect')) cur.perfectCount++;
    if (typeof r.conceptRating === 'number') { cur.ratingSum += r.conceptRating; cur.ratingN++; }
    byStudent.set(r.studentId, cur);
  });
  const top = [...byStudent.values()]
    .map(s => ({ ...s, avgRating: s.ratingN ? s.ratingSum / s.ratingN : 0 }))
    .sort((a, b) => b.perfectCount - a.perfectCount || b.avgRating - a.avgRating)[0];
  if (!top || top.perfectCount === 0) return false;

  const monthLabel = `${prevMonthStartKst.getUTCFullYear()}년 ${prevMonthStartKst.getUTCMonth() + 1}월`;
  const html = buildAwardEmailHtml({ monthLabel, studentName: top.studentName, studentId: top.studentId });
  return sendViaResend({ to: directorEmail, subject: `[데일리 리포트 시스템] ${monthLabel} 이달의 우수 학생 후보`, html });
}

export default async function handler(req, res) {
  // Vercel Cron이 호출할 때 CRON_SECRET 환경변수가 설정돼 있으면 Authorization: Bearer
  // 헤더에 자동으로 실어 보내줌 — 이 값이 없거나 안 맞으면 아무나(URL을 아는 사람) 이 엔드포인트를
  // 두드려 대량 메일을 보낼 수 있으므로 반드시 검증
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const db = getAdminDb();
  const now = kstNow();
  const todayStr = kstDateStr(now);
  const todayDow = now.getUTCDay();
  const isFirstOfMonth = now.getUTCDate() === 1;

  const results = { briefingsSent: 0, awardsSent: 0, errors: [] };
  const academiesSnap = await db.collection('academies').get();

  for (const aDoc of academiesSnap.docs) {
    const academyId = aDoc.id;
    const academy = aDoc.data();
    if (academy.status === 'suspended') continue;

    try {
      if (await sendMorningBriefing(db, academyId, academy, todayStr, todayDow)) results.briefingsSent++;
    } catch (e) {
      console.error(`아침 브리핑 발송 실패 academyId=${academyId}:`, e.message);
      results.errors.push(`briefing:${academyId}`);
    }

    if (isFirstOfMonth) {
      try {
        if (await sendMonthlyAward(db, academyId, now)) results.awardsSent++;
      } catch (e) {
        console.error(`월말 어워드 발송 실패 academyId=${academyId}:`, e.message);
        results.errors.push(`award:${academyId}`);
      }
    }
  }

  res.status(200).json(results);
}
