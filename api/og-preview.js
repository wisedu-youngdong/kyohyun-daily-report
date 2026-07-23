// Vercel Serverless — /api/og-preview?kind=report|story|award&id=...
// Firebase Admin 없이 Firestore REST API 사용.
// report-og.js/story-og.js/award-og.js 세 파일이 kind별 분기만 다르고 거의 동일해서 하나로
// 합침 — Vercel Hobby 플랜 서버리스 함수 12개 제한 때문에(CLAUDE.md 참고), api/cron-daily.js를
// 추가하면서 슬롯을 확보하기 위한 정리.

import { fetchAcademyName } from './_lib/academyName.js';
import { fetchAcademyIdFromIndex, fetchAcademyDocFields, renderOgShell, sendOgHtml } from './_lib/ogHelpers.js';

async function loadReportPreview(id) {
  let studentName = '학생', dateStr = '', teacherNote = '', unit = '', academyName = null;
  const academyId = await fetchAcademyIdFromIndex('reportIndex', id);
  if (academyId) {
    academyName = await fetchAcademyName(academyId);
    const f = await fetchAcademyDocFields(academyId, `reports/${id}`);
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
    const fields = await fetchAcademyDocFields(academyId, `students/${id}`);
    studentName = fields?.name?.stringValue || '학생';
  }
  return {
    academyName,
    title: title(studentName),
    desc: '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.',
    ogTitle: `${studentName}${ogTitleSuffix}`,
    ogSub,
    redirectPath: `${redirectPrefix}/${id}`,
    loadingText,
  };
}

const KIND_LOADERS = {
  report: (id) => loadReportPreview(id),
  story: (id) => loadStudentNamePreview(id, {
    title: (name) => `${name}의 성장 포트폴리오`,
    ogTitleSuffix: ' 성장 포트폴리오',
    ogSub: 'GROWTH PORTFOLIO',
    redirectPrefix: '/story',
    loadingText: '성장 포트폴리오로 이동 중...',
  }),
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
  const loader = KIND_LOADERS[kind];
  if (!loader || !id) return res.status(400).send('Bad Request');

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
