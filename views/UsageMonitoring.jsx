import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { auth } from '../firebase';
import { T, C, RADIUS2 } from '../tokens.jsx';
import { StatCard } from './shared.jsx';

// SettingsView.jsx에서 React.lazy로만 불러오는 컴포넌트 — recharts를 여기 격리해서
// 일반 강사/원장이 설정 탭을 열어도 이 번들은 안 받게 함(플랫폼 관리자만 실제로 렌더링).

function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// api/usage-monitoring.js와 동일한 KST 환산 — "이번 달" 넘어가기 버튼을 막는 기준
function currentKstMonth() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

const navBtnStyle = {
  width: '26px', height: '26px', borderRadius: '8px', border: '1px solid #E5E7EB',
  background: '#fff', color: T.textSub, cursor: 'pointer', fontSize: '13px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default function UsageMonitoring({ month, onMonthChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    // 월 이동 시 이전 값을 안 지우면, 통계 카드는 로딩 중 "-"로 바뀌는데 그 아래 차트·순위는
    // 이전 달 데이터가 그대로 남아 화면 안에서 로딩 처리가 반쪽으로 섞여 보임
    setData(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/usage-monitoring?month=${month}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `서버 오류 (${res.status})`);
      setData(json);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const totals = data?.totals || {};
  const [y, m] = month.split('-');
  const isCurrentMonth = month >= currentKstMonth();

  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '18px', border: '1px solid #E5E7EB', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 700, color: T.text, margin: '0 0 2px' }}>사용량 모니터링</p>
          <p style={{ fontSize: '11px', color: T.textMute, margin: 0 }}>전체 학원의 사진분석 사용 현황</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => onMonthChange(shiftMonth(month, -1))} style={navBtnStyle}>‹</button>
          <span style={{ fontSize: '12px', fontWeight: 600, color: T.text, minWidth: '64px', textAlign: 'center' }}>
            {y}년 {parseInt(m, 10)}월
          </span>
          <button onClick={() => onMonthChange(shiftMonth(month, 1))} disabled={isCurrentMonth} style={{ ...navBtnStyle, opacity: isCurrentMonth ? 0.4 : 1, cursor: isCurrentMonth ? 'default' : 'pointer' }}>›</button>
          <button onClick={load} style={{ ...navBtnStyle, marginLeft: '4px' }} title="새로고침">↻</button>
        </div>
      </div>

      {error && <p style={{ fontSize: '12px', color: C.error, margin: '0 0 10px' }}>오류: {error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <StatCard label="총 분석 횟수" value={loading ? '-' : (totals.analysisCount ?? 0)} unit="회" color={T.brand} />
        <StatCard label="활동 학원 수" value={loading ? '-' : (totals.activeAcademyCount ?? 0)} unit="곳" color={C.success} />
        <StatCard label="활동 강사 수" value={loading ? '-' : (totals.activeTeacherCount ?? 0)} unit="명" color="#9B6FD4" />
        <StatCard
          label="크레딧 부족 학원"
          value={loading ? '-' : (totals.lowCreditAcademyCount ?? 0)}
          unit="곳"
          color={totals.lowCreditAcademyCount > 0 ? C.warning : T.textMute}
        />
      </div>

      <div style={{ height: '200px', marginBottom: '16px' }}>
        <ResponsiveContainer>
          <AreaChart data={data?.dailyTrend || []}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: `${RADIUS2.input}px` }} />
            <Area type="monotone" dataKey="count" name="분석 횟수" stroke={T.brand} fill={T.brandLight} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p style={{ fontSize: '12px', fontWeight: 700, color: T.text, margin: '0 0 4px' }}>학원별 사용량 랭킹</p>
      {(data?.ranking || []).some(a => a.excludeFromStats) && (
        <p style={{ fontSize: '10px', color: T.textMute, margin: '0 0 4px' }}>🧪 표시된 학원은 통계에서 제외돼 위 총계·그래프에는 반영되지 않았어요.</p>
      )}
      {(data?.ranking || []).some(a => a.textOnlyFlag) && (
        <p style={{ fontSize: '10px', color: T.textMute, margin: '0 0 8px' }}>🟡 표시된 학원은 리포트는 활발히 보내지만 사진 분석은 이번 달 0회예요 — 관찰 대상일 뿐 정책이 바뀐 건 아니에요.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(data?.ranking || []).map((a, i) => (
          <div key={a.academyId} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: a.excludeFromStats ? '#F8F7FC' : (a.textOnlyFlag ? '#FFFCF2' : '#F9FAFB'), borderRadius: '10px', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMute, width: '18px', flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.academyName}
              {a.excludeFromStats && <span style={{ fontSize: '10px', fontWeight: 700, color: '#8A6FD4', marginLeft: '5px' }}>🧪 테스트</span>}
              {a.textOnlyFlag && <span style={{ fontSize: '10px', fontWeight: 700, color: C.warning, marginLeft: '5px' }}>🟡 텍스트 전용 (리포트 {a.reportsThisMonth}건)</span>}
            </span>
            <span style={{ fontSize: '11px', color: T.textSub, flexShrink: 0 }}>분석 {a.count}회</span>
            <span style={{ fontSize: '11px', color: T.textSub, flexShrink: 0 }}>강사 {a.teacherCount}명</span>
            <span style={{
              fontSize: '11px', fontWeight: 700, flexShrink: 0,
              color: a.unlimited ? C.info : ((a.creditBalance ?? 0) <= 5 ? C.warning : T.textMute),
            }}>
              {a.unlimited ? '무제한' : `잔여 ${a.creditBalance ?? '-'}회`}
            </span>
          </div>
        ))}
        {!loading && data && data.ranking.length === 0 && (
          <p style={{ fontSize: '12px', color: T.textMute, textAlign: 'center', padding: '12px', margin: 0 }}>등록된 학원이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
