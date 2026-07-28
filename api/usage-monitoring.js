// 플랫폼 관리자 전용 — 전체 학원의 사진분석(크레딧) 사용량을 월 단위로 집계.
// firestore.rules엔 creditUsage에 대한 collection-group 규칙이 없어 클라이언트에서 전체
// 학원을 한 번에 모아 읽을 수 없다 — Admin SDK(규칙 우회)로 학원별 서브컬렉션을 각각 읽어
// 서버에서 합산한다. 학원 수가 적어(수십 곳 이하) 학원별 병렬 조회로 충분.
import { verifyIdTokenHeader } from './_lib/verifyAuth.js';
import { ensureAdminApp } from './_lib/adminApp.js';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// cron-daily.js와 동일한 KST 환산 패턴 — Vercel 함수는 UTC로 돌기 때문에 "이번 달"을
// KST 캘린더 기준으로 판단하려면 이렇게 9시간을 더한 뒤 UTC 게터로 읽어야 한다.
function kstNow() { return new Date(Date.now() + 9 * 3600 * 1000); }
function kstDateStr(d) { return d.toISOString().split('T')[0]; }

const LOW_CREDIT_THRESHOLD = 5;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const decoded = await verifyIdTokenHeader(req);
  if (!decoded) return res.status(401).json({ error: '인증 정보가 없습니다.' });

  try {
    ensureAdminApp();
    const db = getFirestore();
    const callerSnap = await db.collection('users').doc(decoded.uid).get();
    if (!callerSnap.exists || callerSnap.data().isPlatformAdmin !== true) {
      return res.status(403).json({ error: '플랫폼 관리자만 볼 수 있습니다.' });
    }

    const now = kstNow();
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth(); // 0-based
    const monthParam = typeof req.query.month === 'string' ? req.query.month : null;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      year = y;
      month = m - 1;
    }
    // KST 캘린더 기준 월 경계를 UTC 계기(Timestamp)로 환산
    const monthStartKst = new Date(Date.UTC(year, month, 1));
    const nextMonthStartKst = new Date(Date.UTC(year, month + 1, 1));
    const rangeStart = Timestamp.fromDate(new Date(monthStartKst.getTime() - 9 * 3600 * 1000));
    const rangeEnd = Timestamp.fromDate(new Date(nextMonthStartKst.getTime() - 9 * 3600 * 1000));

    const academiesSnap = await db.collection('academies').get();
    const perAcademy = await Promise.all(academiesSnap.docs.map(async (a) => {
      const [usageSnap, billingSnap] = await Promise.all([
        db.collection('academies').doc(a.id).collection('creditUsage')
          .where('usedAt', '>=', rangeStart).where('usedAt', '<', rangeEnd).get(),
        db.collection('academies').doc(a.id).collection('private').doc('billing').get(),
      ]);
      const docs = usageSnap.docs.map(d => d.data());
      const billing = billingSnap.exists ? billingSnap.data() : {};
      return {
        id: a.id,
        academyName: a.data().academyName || a.id,
        count: docs.length,
        teacherUids: docs.map(d => d.teacherUid).filter(Boolean),
        usedAtList: docs.map(d => d.usedAt).filter(Boolean),
        creditBalance: typeof billing.creditBalance === 'number' ? billing.creditBalance : null,
        unlimited: billing.unlimited === true,
        excludeFromStats: billing.excludeFromStats === true,
      };
    }));

    // 통계 제외로 표시된 학원(예: 교현학원 자체 테스트용)은 헤드라인 집계·추이 그래프에서만
    // 빼고, 랭킹 목록에는 계속 남겨서 "(테스트)"로 표시 — 완전히 숨기면 관리자가 실제 사용
    // 여부 자체를 못 보게 되므로, 집계에서만 배제하고 원자료는 그대로 보여준다.
    const statsAcademies = perAcademy.filter(a => !a.excludeFromStats);

    const analysisCount = statsAcademies.reduce((sum, a) => sum + a.count, 0);
    const activeAcademyCount = statsAcademies.filter(a => a.count > 0).length;
    const activeTeacherCount = new Set(statsAcademies.flatMap(a => a.teacherUids)).size;
    const lowCreditAcademyCount = statsAcademies.filter(
      a => !a.unlimited && a.creditBalance !== null && a.creditBalance <= LOW_CREDIT_THRESHOLD
    ).length;

    const dailyMap = {};
    statsAcademies.forEach(a => {
      a.usedAtList.forEach(ts => {
        const dateStr = kstDateStr(new Date(ts.toMillis() + 9 * 3600 * 1000));
        dailyMap[dateStr] = (dailyMap[dateStr] || 0) + 1;
      });
    });
    const dailyTrend = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const ranking = perAcademy
      .map(a => ({
        academyId: a.id,
        academyName: a.academyName,
        count: a.count,
        teacherCount: new Set(a.teacherUids).size,
        creditBalance: a.creditBalance,
        unlimited: a.unlimited,
        excludeFromStats: a.excludeFromStats,
      }))
      .sort((a, b) => b.count - a.count);

    res.status(200).json({
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      totals: { analysisCount, activeAcademyCount, activeTeacherCount, lowCreditAcademyCount },
      dailyTrend,
      ranking,
    });
  } catch (e) {
    console.error('사용량 모니터링 조회 오류:', e.message);
    res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
}
