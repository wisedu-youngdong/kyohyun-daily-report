// 리포트 집계·KST 날짜 헬퍼 공용 모듈

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase.js';

// 학원 브랜딩 문서 조회 — 공개 리포트/성장스토리/시상장 등 여러 화면이 academyId 확정 후
// 공통으로 academyName(및 향후 로고 등)을 읽어야 해서 중복 방지용으로 공용화.
// 문서가 없거나 읽기 실패해도 호출부가 안전하게 기본값으로 대체할 수 있도록 빈 객체 반환.
export async function fetchAcademyBranding(academyId) {
  if (!academyId) return {};
  try {
    const snap = await getDoc(doc(db, 'academies', academyId));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

// KST(UTC+9) 기준 날짜 문자열(YYYY-MM-DD) — Firestore createdAt.seconds 기준으로 "오늘" 판정에 사용
export function kstDay(seconds) {
  return new Date(seconds * 1000 + 9 * 3600 * 1000).toISOString().split('T')[0];
}

// KST 기준 요일(0=일...6=토) — new Date().getDay()는 로컬 타임존에 의존해 서버/클라이언트 간
// 어긋날 수 있어서, kstDay와 같은 shift-then-extract 방식으로 KST를 고정
export function kstWeekday(seconds) {
  return new Date(seconds * 1000 + 9 * 3600 * 1000).getUTCDay();
}

// 월요일 시작 기준 주간 범위 계산 — weekOffset 0=이번 주, 1=지난 주, 2=지지난 주...
// kstWeekday/kstDay와 동일한 "UTC로 +9h 시프트해서 KST 벽시계로 취급" 방식 사용.
// 원래 AnalysisView.jsx에만 로컬로 있었는데, 주간 리포트 작성/검토 화면도 같은 주간 경계
// 계산이 필요해서 공용화함.
export function getKstWeekRange(weekOffset) {
  const shiftedNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dow = shiftedNow.getUTCDay(); // 0=일 ... 6=토
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(shiftedNow);
  monday.setUTCDate(shiftedNow.getUTCDate() + mondayOffset - weekOffset * 7);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const toStr = (d) => d.toISOString().split('T')[0];
  const weekOfMonth = Math.ceil(monday.getUTCDate() / 7);
  return {
    startStr: toStr(monday),
    endStr: toStr(sunday),
    label: `${monday.getUTCMonth() + 1}월 ${weekOfMonth}주차`,
    rangeLabel: `${monday.getUTCMonth() + 1}/${monday.getUTCDate()} ~ ${sunday.getUTCMonth() + 1}/${sunday.getUTCDate()}`,
  };
}

// 리포트 발송 완료 판정 — 자동저장 draft(isDraft: true)는 코멘트가 채워져 있어도
// 아직 선생님이 최종 저장하지 않은 상태이므로 완료로 세지 않음
export function isReportSent(r) {
  return !!(r?.teacherNote && r.teacherNote.trim()) && !r?.isDraft;
}

// "오늘 처리됨" 판정 — 리포트가 발송됐거나(isReportSent), 결석이라 애초에 리포트를 안 써도
// 되는 경우(isDraft가 아닌 확정된 결석 기록). DiagnosticReportInput.jsx/DashboardView.jsx가
// 각자 동일한 로직을 복제해 갖고 있던 걸 공용화 — 드리프트 방지.
export function isHandledToday(r) {
  return isReportSent(r) || (r.attendance === '결석' && r.isDraft !== true);
}

// 경고/주의/안정 판정 기본값 — 학원이 설정에서 조정 안 했으면 이 값을 그대로 씀
export const DEFAULT_STATUS_THRESHOLDS = { warningAvg: 50, cautionAvg: 70, dropThreshold: 20 };

// 개념 이해도 경고/주의/안정 라벨 판정 — GrowthDashboard.jsx(기간 선택형)와 DirectorView.jsx
// ("관심이 필요한 학생" 통합 섹션, 고정 기간)가 서로 다른 기간의 리포트 배열로 같은 임계값
// 기준을 적용해야 해서 공용화(2026-08-03) — 판정식이 두 곳에서 따로 놀면 드리프트 위험이 큼.
// sortedReports는 호출부가 미리 필터링(!isDraft, conceptRating != null)·정렬(오래된순)·
// toPct 정규화까지 끝낸 배열이어야 함. 색상 등 표현은 호출부가 라벨만 보고 맡아서 정함.
export function conceptStatusLabel(sortedReports, statusThresholds) {
  const { warningAvg, cautionAvg, dropThreshold } = { ...DEFAULT_STATUS_THRESHOLDS, ...statusThresholds };
  if (!sortedReports.length) return '데이터없음';
  const n = sortedReports.length;
  const avg = sortedReports.reduce((sum, r) => sum + r.conceptRating, 0) / n;
  const trend3 = n >= 3 ? sortedReports[n - 1].conceptRating - sortedReports[n - 3].conceptRating
    : n >= 2 ? sortedReports[n - 1].conceptRating - sortedReports[n - 2].conceptRating : 0;
  if (trend3 <= -dropThreshold || avg < warningAvg) return '경고';
  if (trend3 < 0 || avg < cautionAvg) return '주의';
  return '안정';
}

// 주간형(reportType==='weekly') 리포트는 문서 1개 안에 여러 날짜의 sessions[]가 들어있고,
// homeworkRating/conceptRating/attendance/hasTest/testScore 같은 값은 세션마다 따로 있어서
// 최상위 필드엔 아예 없다("대표값이 없어서"). "리포트 문서 1개 = 하루치 기록 1개"를 전제로
// 최상위 필드만 읽는 집계 로직(평균·차트·추세 등)에 주간 리포트를 그대로 섞으면, 있는 데이터를
// 놓고도 없는 것처럼 0%/빈 값으로 나온다 — 예를 들어 AnalysisView.jsx가 이 문제를 겪었음.
// 매일형은 그대로 두고, 주간형만 세션 하나하나를 리포트 하나처럼 펼쳐서 나머지 집계 로직이
// 수정 없이 그대로 처리할 수 있게 한다(StudentProfileModal.jsx의 WeeklySummaryCard가 이미
// 쓰던 방식을 공용화 — 새로 만든 로직 아님).
export function flattenReportsForAnalysis(reports) {
  return reports.flatMap(r => {
    if (r.reportType !== 'weekly') return [r];
    return (r.sessions || []).map(s => ({
      ...s,
      id: `${r.id}-${s.date}`,
      studentId: r.studentId,
      teacherName: r.teacherName,
      teacherId: r.teacherId,
      isDraft: r.isDraft,
      reportType: 'weekly',
      createdAt: { seconds: Math.floor(new Date(`${s.date}T00:00:00+09:00`).getTime() / 1000) },
    }));
  });
}

// 과제/개념 평가 척도 변환 — 구 리포트(1~5)와 신규 리포트(0~100, 10단위)가 섞여 있음.
// 구 값은 항상 1~5, 신규 값은 항상 0 또는 10의 배수라 겹치지 않으므로 안전하게 구분 가능.
export function toPct(rating) {
  const n = Number(rating) || 0;
  if (n <= 0) return 0;
  return n <= 5 ? n * 20 : n;
}

// 학습 범위(pages)에 "쪽" 단위 붙이기 — 입력 필드 placeholder가 "24~32쪽"처럼 쪽까지
// 치라고 안내하고 있어서, 표시할 때 무조건 `${pages}쪽`을 붙이면 "24~32쪽쪽"이 됨.
// 이미 쪽/페이지/p 등으로 끝나면 그대로 두고, 순수 숫자 표기일 때만 붙인다.
export function fmtPages(pages) {
  if (!pages) return pages;
  const s = String(pages).trim();
  return /[쪽pP]\s*$|페이지\s*$/.test(s) ? s : `${s}쪽`;
}

// 0~100(%) → 5단계 정성 라벨 (구 1~5점 척도와 동일 구간)
const RATING_LABELS = ['노력 필요', '아쉬움', '보통', '잘함', '아주 잘함'];
export function ratingLabel(pct) {
  if (pct == null || pct < 0) return '';
  const idx = Math.min(5, Math.max(1, Math.ceil(pct / 20))) - 1;
  return RATING_LABELS[idx];
}

// 신규생/재학생 판정 — studentType이 명시돼 있으면 그대로, 없으면(레거시 학생) 리포트 수로 추정
export function isNewStudent(student, reportCount) {
  return student?.studentType ? student.studentType === 'new' : reportCount <= 5;
}
