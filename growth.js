// ─────────────────────────────────────────────
// 성장 포인트 시스템
// 점수 산정은 오직 기존 확정 지표(과제/개념/출결/시험)로만 계산.
// 사진분석(photoAnalysis)은 서술형 코멘트 초안 용도이며 점수에 절대 반영하지 않음.
// ─────────────────────────────────────────────

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

// 과제 수행 평가(0~100%) → 포인트 (최대 5P, 1:1 비례 — 구 척도 1~5점과 동일 비율)
function homeworkPoints(pct) {
  return Math.round((pct / 100) * 5);
}

// 개념 이해 평가(0~100%) → 포인트 (최대 3P, 완만한 비례 — 구 척도 1~5점 구간과 동일)
function conceptPoints(pct) {
  return pct > 0 ? Math.ceil(pct / 40) : 0;
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

// 출결 → 포인트
const ATTENDANCE_POINTS = { '정시': 3, '지각': 1, '결석': 0, '조퇴': 1 };

// 시험 점수 → 포인트 (hasTest === true 인 경우만)
function testPoints(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  if (n >= 100) return 20;
  if (n >= 90) return 15;
  if (n >= 80) return 12;
  if (n >= 70) return 8;
  if (n >= 60) return 5;
  return 2; // 응시 자체에 대한 참여 포인트
}

/**
 * 리포트 1건 저장 시 적립되는 포인트 계산
 * (streak 보너스는 여기 포함 안 함 — 집계 시점에 별도 계산)
 */
export function calculateReportPoints(report) {
  const { homeworkRating, conceptRating, attendance, hasTest, testScore } = report;
  let pts = 0;
  pts += homeworkPoints(toPct(homeworkRating));
  pts += conceptPoints(toPct(conceptRating));
  pts += ATTENDANCE_POINTS[attendance] || 0;
  if (hasTest && testScore !== null && testScore !== undefined && testScore !== '') {
    pts += testPoints(testScore);
  }
  return pts;
}

/**
 * 연속 정시출석 스트릭 보너스 (4회 연속마다 +10, 1회성 아님 — 매 4배수 달성 시 누적 가산)
 * reports: 특정 학생의 리포트 배열 (날짜 오름차순 정렬되어 있어야 함)
 */
export function calculateStreakBonus(sortedReports) {
  let streak = 0;
  let bonus = 0;
  for (const r of sortedReports) {
    if (r.attendance === '정시') {
      streak += 1;
      if (streak % 4 === 0) bonus += 10;
    } else {
      streak = 0;
    }
  }
  return bonus;
}

/**
 * 학생의 전체 누적 포인트 계산
 * reports: 해당 학생의 전체 리포트 배열 (createdAt 기준 오름차순 정렬 필요)
 */
export function calculateTotalPoints(reports) {
  const sorted = [...reports].sort((a, b) => {
    const ta = a.createdAt?.seconds || 0;
    const tb = b.createdAt?.seconds || 0;
    return ta - tb;
  });
  const base = sorted.reduce((sum, r) => sum + (r.points ?? calculateReportPoints(r)), 0);
  const streakBonus = calculateStreakBonus(sorted);
  return base + streakBonus;
}

// 성장 단계 정의 (씨앗 → 새싹 → 나무 → 꽃 → 정상)
export const STAGES = [
  { key: 'seed',     label: '씨앗',   icon: '🌱', min: 0 },
  { key: 'sprout',   label: '새싹',   icon: '🌿', min: 20 },
  { key: 'tree',     label: '나무',   icon: '🌳', min: 50 },
  { key: 'flower',   label: '꽃',     icon: '🌸', min: 100 },
  { key: 'summit',   label: '정상',   icon: '🏆', min: 180 },
];

/**
 * 누적 포인트 → 현재 단계 + 다음 단계까지 진행률
 */
export function getStageInfo(totalPoints) {
  let current = STAGES[0];
  let next = STAGES[1];
  for (let i = 0; i < STAGES.length; i++) {
    if (totalPoints >= STAGES[i].min) {
      current = STAGES[i];
      next = STAGES[i + 1] || null;
    }
  }
  const pct = next
    ? Math.round(((totalPoints - current.min) / (next.min - current.min)) * 100)
    : 100;
  return { current, next, pct: Math.min(100, Math.max(0, pct)), totalPoints };
}
