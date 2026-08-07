import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Printer, X } from 'lucide-react';
import { RADIUS2, SHADOW } from '../tokens.jsx';
import { useEscapeClose, useFocusTrap } from '../hooks.js';

// ============================================================
// 학생별 QR 스티커 인쇄 — 자기기록 카드(종이) 식별용 QR을 반 단위로 모아 인쇄.
// (HANDOFF 없이 채팅으로 합의한 스펙, 2026-08-07)
// - QR 내용은 student.id 하나만 — 이름/학원명을 넣으면 QR이 촘촘해져서
//   18mm 칸에서 인식률이 떨어짐(파트너 확인)
// - errorCorrectionLevel: 'M' — ID만 넣으면 짧아서 M으로 올려도 격자가 안 촘촘해짐,
//   대신 카드가 접히거나 스티커가 긁혀도 읽힘
// - margin(quiet zone) 2모듈 — 0으로 두면 인식 안 됨. 전체 이미지를 18mm로 인쇄하면
//   여백 포함 18mm, 실제 데이터 영역은 약 15mm가 되도록 계산됨(라이브러리 margin은
//   모듈 단위라 정확히 15mm를 못 박진 못하지만 이 조합이 그 근처로 나옴)
// - 1차는 범용 그리드로 일반 A4에 인쇄 → 잘라서 붙이는 방식. 폼텍 등 특정 라벨지
//   규격은 실제 쓰는 제품이 정해지면 그 좌표에 맞춰 추가할 것(파트너 요청)
// ============================================================

const QR_MM = 18; // 여백 포함 전체 QR 이미지 인쇄 크기(모듈 margin:2로 데이터 영역은 이보다 작게 나옴)

export default function StudentQrPrint({ students, classes = [], academyName = null, onClose }) {
  const [classFilter, setClassFilter] = useState('all'); // 'all' | classId
  const [qrMap, setQrMap] = useState({}); // { [studentId]: dataURL }
  const panelRef = useRef(null);
  useEscapeClose(onClose);
  useFocusTrap(panelRef, true);

  const activeStudents = students.filter(s => !s.archived);
  const filtered = classFilter === 'all' ? activeStudents : activeStudents.filter(s => s.classId === classFilter);
  const sorted = [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // 필터가 바뀔 때마다 그 목록에 대해서만 QR 생성(전체 학생 미리 다 만들어두지 않음 —
  // 반이 많으면 불필요하게 오래 걸릴 수 있어서 필요한 만큼만)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const need = sorted.filter(s => !qrMap[s.id]);
      if (need.length === 0) return;
      const entries = await Promise.all(need.map(async s => {
        const dataUrl = await QRCode.toDataURL(s.id, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 300,
        });
        return [s.id, dataUrl];
      }));
      if (!cancelled) setQrMap(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .qr-print-portal, .qr-print-portal * { visibility: visible; }
          .qr-print-portal { position: absolute !important; inset: 0 !important; top: 0 !important; left: 0 !important; max-width: none !important; max-height: none !important; background: none !important; padding: 0 !important; backdrop-filter: none !important; box-shadow: none !important; overflow: visible !important; }
          .qr-no-print { display: none !important; }
          .qr-print-area { display: grid !important; }
          @page { margin: 10mm; }
        }
      `}</style>
      <div className="qr-print-portal" style={{ background: '#fff', borderRadius: `${RADIUS2.panel}px`, width: '100%', maxWidth: '720px', maxHeight: '90vh', overflow: 'auto', boxShadow: SHADOW[3], fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }} ref={panelRef}>
        <div className="qr-no-print" style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#1A1A1A' }}>학생 QR 스티커 인쇄</p>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>자기기록 카드에 붙일 학생 식별 QR — 반별로 골라 한 번에 인쇄</p>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'flex', padding: '4px' }}><X size={20} /></button>
        </div>

        <div className="qr-no-print" style={{ padding: '16px 22px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid #E5E7EB' }}>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
            style={{ padding: '9px 30px 9px 11px', fontSize: '13px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: `${RADIUS2.input}px`, background: '#F9FAFB', color: '#1A1A1A', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value="all">전체 학생 ({activeStudents.length}명)</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({activeStudents.filter(s => s.classId === c.id).length}명)</option>
            ))}
          </select>
          <button onClick={() => window.print()} disabled={sorted.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '13px', fontWeight: 700, color: '#fff', background: sorted.length === 0 ? '#C4C9D1' : '#0D2D6B', border: 'none', borderRadius: `${RADIUS2.input}px`, cursor: sorted.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            <Printer size={14} /> 인쇄 ({sorted.length}명)
          </button>
          <p style={{ fontSize: '11px', color: '#B45309', margin: 0, width: '100%' }}>
            ⚠️ 인쇄 대화상자에서 배율을 반드시 <strong>"100%"(실제 크기)</strong>로 설정하세요 — "자동"이나 "맞춤(용지에 맞게 축소)"으로 두면 QR이 18mm보다 작게 인쇄돼 인식이 안 될 수 있어요.
          </p>
        </div>

        {sorted.length === 0 ? (
          <p className="qr-no-print" style={{ padding: '40px 22px', textAlign: 'center', fontSize: '13px', color: '#6B7280' }}>이 반에 재원 중인 학생이 없어요.</p>
        ) : (
          <>
            {academyName && (
              <p style={{ padding: '14px 22px 0', margin: 0, fontSize: '11px', fontWeight: 700, color: '#6B7280' }}>{academyName}</p>
            )}
            <div className="qr-print-area" style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(32mm, 1fr))', gap: '4mm' }}>
            {sorted.map(s => (
              <div key={s.id} style={{ border: '1px dashed #D1D5DB', borderRadius: '4px', padding: '3mm', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2mm', breakInside: 'avoid' }}>
                {qrMap[s.id] ? (
                  <img src={qrMap[s.id]} alt={`${s.name} QR`} style={{ width: `${QR_MM}mm`, height: `${QR_MM}mm`, display: 'block' }} />
                ) : (
                  <div style={{ width: `${QR_MM}mm`, height: `${QR_MM}mm`, background: '#F3F4F6' }} />
                )}
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#1A1A1A', textAlign: 'center', lineHeight: 1.3 }}>{s.name}</span>
              </div>
            ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
