// Vercel Serverless — /api/og-preview?kind=report|story|award&id=...
// Firebase Admin 없이 Firestore REST API 사용.
// report-og.js/story-og.js/award-og.js 세 파일이 kind별 분기만 다르고 거의 동일해서 하나로
// 합침 — Vercel Hobby 플랜 서버리스 함수 12개 제한 때문에(CLAUDE.md 참고), api/cron-daily.js를
// 추가하면서 슬롯을 확보하기 위한 정리.

import { fetchAcademyName } from './_lib/academyName.js';
import { fetchAcademyIdFromIndex, fetchAcademyDocFields, fetchReportDateRange, renderOgShell, sendOgHtml } from './_lib/ogHelpers.js';

function fmtMonthDay(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

async function loadReportPreview(id) {
  let studentName = '학생', dateStr = '', teacherNote = '', unit = '', academyName = null;
  const academyId = await fetchAcademyIdFromIndex('reportIndex', id);
  if (academyId) {
    academyName = await fetchAcademyName(academyId);
    const f = await fetchAcademyDocFields(academyId, `reports/${encodeURIComponent(id)}`);
    if (f) {
      studentName = f.studentName?.stringValue || '학생';
      unit        = f.unit?.stringValue || '';
      teacherNote = f.teacherNote?.stringValue || '';
      const ts = f.createdAt?.timestampValue;
      if (ts) {
        const d = new Date(ts);
        dateStr = `${d.getMonth() + 1}월 ${d.getDate()}일`;
      }
    }
  }
  const unitText = unit ? ` · ${unit}` : '';
  return {
    academyName,
    title: `${studentName} 학생의 수업 리포트${dateStr ? ` · ${dateStr}` : ''}`,
    desc: teacherNote
      ? `"${teacherNote.slice(0, 60)}${teacherNote.length > 60 ? '...' : ''}"`
      : '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.',
    ogTitle: `${studentName} 학생 리포트`,
    ogSub: `${dateStr}${unitText}`,
    redirectPath: `/report/${id}`,
    loadingText: '리포트로 이동 중...',
  };
}

async function loadStudentNamePreview(id, { title, ogTitleSuffix, ogSub, redirectPrefix, loadingText }) {
  let studentName = '학생', academyName = null;
  const academyId = await fetchAcademyIdFromIndex('studentIndex', id);
  if (academyId) {
    academyName = await fetchAcademyName(academyId);
    const fields = await fetchAcademyDocFields(academyId, `students/${encodeURIComponent(id)}`);
    studentName = fields?.name?.stringValue || '학생';
  }
  return {
    academyId,
    academyName,
    title: title(studentName),
    desc: '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.',
    ogTitle: `${studentName}${ogTitleSuffix}`,
    ogSub,
    redirectPath: `${redirectPrefix}/${id}`,
    loadingText,
  };
}

// 파트너 랜딩(/partner)은 학생/리포트별 데이터가 없는 정적 마케팅 페이지라 Firestore 조회
// 없이 고정 문구만 반환 — 아래 KIND_LOADERS 시그니처(id 인자 하나)를 맞추기 위해 인자는 받되 씀
async function loadPartnerPreview() {
  return {
    academyName: null,
    title: '데일리 리포트 시스템 — 학원 파트너',
    desc: '아이의 하루를 이만큼 자세히 적어주는 학원은 흔치 않습니다. 학원 등록은 무료, 쓴 만큼만 냅니다.',
    ogTitle: '학원 파트너 모집',
    ogSub: '쓴 만큼만 냅니다 · 월 약정 없음',
    redirectPath: '/partner',
    loadingText: '학원 파트너 페이지로 이동 중...',
  };
}

const KIND_LOADERS = {
  report: (id) => loadReportPreview(id),
  partner: () => loadPartnerPreview(),
  story: async (id) => {
    const base = await loadStudentNamePreview(id, {
      title: (name) => `${name}의 성장 포트폴리오`,
      ogTitleSuffix: ' 성장 포트폴리오',
      ogSub: 'GROWTH PORTFOLIO',
      redirectPrefix: '/story',
      loadingText: '성장 포트폴리오로 이동 중...',
    });
    // 기간(예: "6월 24일 – 7월 30일 · 17회 수업")을 카톡 미리보기 설명란에 노출 — 실패해도
    // 기본 미리보기(base)는 그대로 유지(필수 아님, 학생 이름/이동 리다이렉트가 더 중요)
    try {
      if (base.academyId) {
        const range = await fetchReportDateRange(base.academyId, id);
        if (range) {
          base.desc = `${fmtMonthDay(range.first)} – ${fmtMonthDay(range.last)} · ${range.count}회 수업`;
        }
      }
    } catch (e) { console.error('성장 포트폴리오 기간 조회 실패(기본 미리보기 유지):', e.message); }
    return base;
  },
  award: (id) => loadStudentNamePreview(id, {
    title: (name) => `${name} 학생 성장 시상장`,
    ogTitleSuffix: ' 성장 시상장',
    ogSub: 'GROWTH AWARD',
    redirectPrefix: '/award',
    loadingText: '성장 시상으로 이동 중...',
  }),
};

export default async function handler(req, res) {
  const { kind, id } = req.query;
  // Object.prototype 상속 속성(constructor/toString 등)이 kind로 들어오면 KIND_LOADERS[kind]가
  // truthy를 반환해 화이트리스트를 우회할 수 있어 hasOwnProperty로 실제 등록된 키인지 확인
  const loader = Object.prototype.hasOwnProperty.call(KIND_LOADERS, kind) ? KIND_LOADERS[kind] : null;
  // partner는 id 없이 정적 문구만 쓰므로 id 필수 체크에서 예외
  if (!loader || (!id && kind !== 'partner')) return res.status(400).send('Bad Request');

  let preview;
  try {
    preview = await loader(id);
  } catch (e) {
    console.error('Firebase fetch error:', e);
    preview = { academyName: null, title: '학생 리포트', desc: '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.', ogTitle: '학생 리포트', ogSub: '', redirectPath: '/', loadingText: '이동 중...' };
  }

  const siteName = preview.academyName ? `${preview.academyName} 데일리 리포트` : '데일리 리포트 시스템';
  const ogImg = `https://dailyreportsystem.co.kr/api/og?title=${encodeURIComponent(preview.ogTitle)}&sub=${encodeURIComponent(preview.ogSub)}&academyName=${encodeURIComponent(preview.academyName || '데일리 리포트 시스템')}`;

  const html = renderOgShell({
    title: preview.title,
    desc: preview.desc,
    siteName,
    ogImg,
    ogUrl: `https://dailyreportsystem.co.kr${preview.redirectPath}`,
    redirectPath: preview.redirectPath,
    loadingText: preview.loadingText,
  });

  sendOgHtml(res, html);
}
