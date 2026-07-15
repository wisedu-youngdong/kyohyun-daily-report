import React from 'react';

// 관리자 화면(App.jsx) 팔레트
export const T = {
  brand: '#185FA5', brandLight: '#E6F1FB', brandBg: '#F0F7FC',
  text: '#1A1A1A', textSub: '#6B7280', textMute: '#9CA3AF',
  border: '#E5E7EB', bg: '#FFFFFF', bgSoft: '#F9FAFB',
};

// 학부모 리포트 화면(PublicReport/GrowthStory) 팔레트
export const R = {
  navy: '#0D2D6B', gold: '#C9A227', rule: '#E8E6E0',
  inkMute: '#98A1AC', inkSub: '#5A6472', ink: '#1A1A1A', positive: '#1E6B4E',
  serif: "'Noto Serif KR', serif",
  body: "'Pretendard Variable', Pretendard, sans-serif",
};

export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 20 };

export const FONT = {
  body: "'Pretendard Variable', Pretendard, sans-serif",
  serif: R.serif,
};

// 학부모 리포트 공용 카드 래퍼 — 연한 배경 위 중앙 정렬된 흰 카드
export function ReportCard({ children, maxWidth = '390px', fontFamily = R.body }) {
  return (
    <div style={{ background: '#F5F5F0', minHeight: '100dvh', padding: '24px 16px', display: 'flex', justifyContent: 'center', fontFamily }}>
      <div style={{ width: '100%', maxWidth }}>
        <div style={{ background: '#fff', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.10)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
