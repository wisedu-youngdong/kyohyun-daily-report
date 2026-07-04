import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { calculateTotalPoints, getStageInfo } from './growth.js';

const RATING_EMOJI = { 5: '🌟', 4: '😊', 3: '🙂', 2: '😐', 1: '😟' };

const DIAGNOSIS_TAGS_MAP = {
  calc:    { label: '계산 실수', bg: '#FEF2F2', border: '#FCA5A5', color: '#DC2626' },
  concept: { label: '개념 누락', bg: '#EFF6FF', border: '#93C5FD', color: '#1D4ED8' },
  apply:   { label: '응용 부족', bg: '#FFFBEB', border: '#FCD34D', color: '#D97706' },
  time:    { label: '시간 부족', bg: '#F5F3FF', border: '#C4B5FD', color: '#7C3AED' },
  perfect: { label: '개념 완벽', bg: '#ECFDF5', border: '#6EE7B7', color: '#059669' },
};

export default function PublicReport() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [allStudentReports, setAllStudentReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const rSnap = await getDoc(doc(db, 'reports', reportId));
        if (!rSnap.exists()) { setError('리포트를 찾을 수 없습니다.'); setLoading(false); return; }
        const r = { id: rSnap.id, ...rSnap.data() };
        setReport(r);

        // 같은 학생의 전체 리포트 — 성장 단계 계산용
        const q = query(collection(db, 'reports'), where('studentId', '==', r.studentId));
        const snap = await getDocs(q);
        setAllStudentReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        setError('리포트를 불러오지 못했습니다.');
      }
      setLoading(false);
    })();
  }, [reportId]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontFamily: 'Pretendard, sans-serif' }}>
      <p style={{ color: '#6B7280', fontSize: '14px' }}>리포트를 불러오는 중...</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontFamily: 'Pretendard, sans-serif' }}>
      <p style={{ color: '#9CA3AF', fontSize: '14px' }}>{error}</p>
    </div>
  );

  const r = report;
  const date = r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '날짜 없음';

  const stageInfo = getStageInfo(calculateTotalPoints(allStudentReports));

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '480px', background: '#fff', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>

        {/* 이미지 저장 카드와 동일한 본문 */}
        <div style={{ padding: '20px', background: '#fff' }}>

          {/* 카드 헤더 */}
          <div style={{ background: '#F0F7FC', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#185FA5', fontWeight: 700, margin: '0 0 4px' }}>교현학원 오늘의 학습 리포트</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 2px' }}>{r.studentName} 학생</p>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: 0, fontWeight: 700 }}>{date} · {r.teacherName}{/선생님?$/.test(r.teacherName || '') ? '' : ' 선생님'}</p>
          </div>

          {/* 성장 단계 */}
          <div style={{ background: 'linear-gradient(135deg, #F0E8FF, #F7F1FF)', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '30px' }}>{stageInfo.current.icon}</span>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#4A2E7A' }}>{stageInfo.current.label} 단계</p>
                <p style={{ fontSize: '10px', color: '#8A6BB5', fontWeight: 600, margin: '2px 0 0' }}>누적 {stageInfo.totalPoints}P{stageInfo.next ? ` · 다음 ${stageInfo.next.icon}${stageInfo.next.label}까지 ${stageInfo.next.min - stageInfo.totalPoints}P` : ' · 최고 단계 달성 🎉'}</p>
              </div>
            </div>
            <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: `conic-gradient(#6B3FA0 ${stageInfo.pct * 3.6}deg, #E5D6FA 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: '#6B3FA0' }}>{stageInfo.pct}%</div>
            </div>
          </div>

          {/* 문제집 사진 */}
          {r.photoUrls?.length > 0 && (
            <div style={{ background: '#F9FAFB', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', border: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 8px' }}>📷 오늘 푼 문제집</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(r.photoUrls.length, 3)}, 1fr)`, gap: '6px' }}>
                {r.photoUrls.map((url, i) => (
                  <img key={i} src={url} alt={`문제집 사진 ${i + 1}`} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                ))}
              </div>
            </div>
          )}

          {/* 출결 및 평가 */}
          <div style={{ background: '#F0F7FC', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
            <p style={{ fontSize: '11px', color: '#185FA5', fontWeight: 700, margin: '0 0 10px' }}>📋 출결 및 평가</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 600 }}>{r.attendance} · {r.arrivalTime}</span>
              <span style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 600 }}>과제 {RATING_EMOJI[r.homeworkRating]} {r.homeworkRating}점</span>
              <span style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 600 }}>개념 {RATING_EMOJI[r.conceptRating]} {r.conceptRating}점</span>
            </div>
          </div>

          {/* 테스트 */}
          {r.hasTest && r.testName && (
            <div style={{ background: '#FAEEDA', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: '#854F0B', fontWeight: 700, margin: '0 0 6px' }}>📝 테스트</p>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{r.testName}</p>
              {r.testScore && <p style={{ fontSize: '22px', fontWeight: 700, color: '#633806', margin: '4px 0 0' }}>{r.testScore}점</p>}
            </div>
          )}

          {/* 오늘 학습 */}
          {(r.textbook || r.unit) && (
            <div style={{ background: '#F9FAFB', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', border: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 6px' }}>📚 오늘 학습</p>
              {r.textbook && <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{r.textbook}</p>}
              {(r.unit || r.pages) && <p style={{ fontSize: '12px', color: '#6B7280', margin: '3px 0 0' }}>{r.unit}{r.unit && r.pages ? ' · ' : ''}{r.pages}</p>}
            </div>
          )}

          {/* 진단 태그 */}
          {r.diagnosis?.length > 0 && (
            <div style={{ background: '#FAEEDA', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: '#854F0B', fontWeight: 700, margin: '0 0 8px' }}>🎯 오늘의 진단</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {r.diagnosis.map((d, i) => {
                  const tag = DIAGNOSIS_TAGS_MAP[d.key] || {};
                  return (
                    <div key={i} style={{ background: '#fff', borderRadius: '10px', padding: '10px 12px' }}>
                      <span style={{ display: 'inline-block', background: tag.bg, border: `1px solid ${tag.border}`, color: tag.color, fontSize: '11px', padding: '2px 8px', borderRadius: '5px', fontWeight: 700, marginBottom: d.detail ? '5px' : 0 }}>
                        {tag.label}{d.unit ? ` · ${d.unit}` : ''}{d.pages ? ` ${d.pages}` : ''}
                      </span>
                      {d.detail && <p style={{ fontSize: '12px', color: '#633806', margin: 0, fontWeight: 500 }}>{d.detail}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 선생님 코멘트 */}
          {r.teacherNote && (
            <div style={{ background: '#F9FAFB', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px', border: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700, margin: '0 0 6px' }}>💬 선생님 한 마디</p>
              <p style={{ fontSize: '13px', color: '#1A1A1A', margin: 0, lineHeight: 1.7, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{r.teacherNote}</p>
            </div>
          )}

          {/* 다음 수업 */}
          {r.nextPlan && (
            <div style={{ background: '#E1F5EE', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: '#0F6E56', fontWeight: 700, margin: '0 0 6px' }}>➡️ 다음 수업 계획</p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#085041', margin: 0 }}>{r.nextPlan}</p>
              {r.nextPlanDetail && <p style={{ fontSize: '12px', color: '#0F6E56', margin: '3px 0 0' }}>{r.nextPlanDetail}</p>}
            </div>
          )}

          {/* 하단 서명 */}
          <div style={{ textAlign: 'center', padding: '10px 0 0', borderTop: '1px solid #E5E7EB', marginTop: '4px' }}>
            <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>교현학원 · 031-707-0591</p>
          </div>
        </div>
      </div>
    </div>
  );
}
