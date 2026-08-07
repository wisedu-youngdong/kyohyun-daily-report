import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { PDFDocument, rgb } from 'pdf-lib';
import { Printer, Download, X } from 'lucide-react';
import { RADIUS2, SHADOW } from '../tokens.jsx';
import { useEscapeClose, useFocusTrap } from '../hooks.js';

// 자기기록 카드 양식(public/self-report-card.pdf, A4 1장에 카드 4개)의 "QR" 자리 좌표 —
// PDF 자체에 이미 빈 QR 박스가 디자인돼 있어(2026-08-07 다운로드 기능 추가 시 확정된 양식),
// 새로 그릴 필요 없이 그 자리에 학생 QR 이미지만 얹으면 된다. 좌표는 pdf2json으로 박스
// 도형(Fill)을 찾아 pdf-lib의 상향(y=0이 페이지 하단) 좌표계로 환산해 확정(2026-08-08,
// 테스트 오버레이로 정렬 확인 완료) — 양식 디자인이 바뀌면 이 좌표도 다시 맞춰야 함.
const CARD_QR_BOXES = [
  { x: 249.5, yTop: 11.9, w: 32.4, h: 33.1 },
  { x: 547.0, yTop: 11.9, w: 33.1, h: 33.1 },
  { x: 249.5, yTop: 432.4, w: 32.4, h: 33.1 },
  { x: 547.0, yTop: 432.4, w: 33.1, h: 33.1 },
];
const CARDS_PER_PAGE = CARD_QR_BOXES.length;

// "이름" 라벨+밑줄 좌표(같은 방식으로 pdf2json Fill에서 확정) — QR만 있으면 선생님이
// 스캔 전엔 누구 카드인지 못 알아봐서(2026-08-08 파트너 지적) 이름을 자동으로 얹는다.
// w는 밑줄 전체 폭(라벨 "이름" 글자까지 포함해서 하나의 줄로 이어짐, 21.7~155.1).
const CARD_NAME_LINES = [
  { x: 21.7, yTop: 75, w: 133.4 },
  { x: 319.3, yTop: 75, w: 133.4 },
  { x: 21.7, yTop: 495.5, w: 133.4 },
  { x: 319.3, yTop: 495.5, w: 133.4 },
];

// 이름 텍스트를 캔버스로 그려 PNG로 얹는다 — pdf-lib 기본 폰트는 한글을 지원하지 않아
// 커스텀 폰트(fontkit) 임베딩이 필요한데, 브라우저가 이미 렌더링 가능한 시스템/웹폰트를
// 캔버스로 그려 이미지화하는 쪽이 새 의존성 없이 더 가볍다. fontSize를 그대로 PDF pt로
// 써서(캔버스 css px = PDF pt) 별도 스케일 환산 없이 크기가 맞도록 함.
function nameToPngImage(name) {
  const fontSize = 12;
  const font = `600 ${fontSize}px "Pretendard Variable", "Noto Sans KR", sans-serif`;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const w = Math.ceil(measure.measureText(name).width) + 6;
  const h = Math.ceil(fontSize * 1.4);
  const scale = 4; // 저해상도 흐림 방지
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.font = font;
  ctx.fillStyle = '#171719';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, 3, fontSize + 1);
  return { dataUrl: canvas.toDataURL('image/png'), w, h };
}

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

export default function StudentQrPrint({ students, classes = [], academyName = null, onToast, onClose }) {
  const [classFilter, setClassFilter] = useState('all'); // 'all' | classId
  const [qrMap, setQrMap] = useState({}); // { [studentId]: dataURL }
  const [generatingPdf, setGeneratingPdf] = useState(false);
  // 체크박스로 개별 학생 선택 — 반 필터를 바꿔도 유지돼서, 서로 다른 반 학생을 섞어
  // "이 학생들만" 카드 PDF로 뽑을 수 있다(2026-08-08, 파트너 요청). 목록(sorted)은 계속
  // 반 필터를 따르는 "훑어보며 체크하는" 용도이고, 실제 선택 결과는 이 Set 하나로 누적.
  const [selectedIds, setSelectedIds] = useState(new Set());
  const panelRef = useRef(null);
  useEscapeClose(onClose);
  useFocusTrap(panelRef, true);

  const activeStudents = students.filter(s => !s.archived);
  const filtered = classFilter === 'all' ? activeStudents : activeStudents.filter(s => s.classId === classFilter);
  const sorted = [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAllVisible = () => setSelectedIds(prev => new Set([...prev, ...sorted.map(s => s.id)]));
  const clearSelection = () => setSelectedIds(new Set());

  // 카드 PDF 대상 — 체크된 학생이 있으면 반 필터와 무관하게 그 학생들만(다른 반 섞여도 됨),
  // 없으면 기존처럼 현재 반 필터 목록 전체. 스티커 인쇄(window.print()가 화면에 보이는
  // DOM을 그대로 찍는 방식)는 이 선택과 무관하게 지금 보이는 반 그대로 인쇄 — 여러 반에
  // 걸친 선택을 화면 하나에 동시에 보여주려면 브라우징용 그리드 자체를 바꿔야 해서
  // 복잡도 대비 이득이 낮음. 카드 PDF는 화면에 안 보여도 프로그램으로 만드는 거라 문제없음.
  const cardTargets = selectedIds.size > 0
    ? activeStudents.filter(s => selectedIds.has(s.id)).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    : sorted;

  // 필터가 바뀔 때마다 그 목록에 대해서만 QR 생성(전체 학생 미리 다 만들어두지 않음 —
  // 반이 많으면 불필요하게 오래 걸릴 수 있어서 필요한 만큼만). cardTargets도 함께
  // 대상에 넣어야, 다른 반에서 체크해둔 학생의 QR도 카드 PDF 생성 시점에 이미 준비돼 있음.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targets = [...sorted, ...cardTargets].filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);
      const need = targets.filter(s => !qrMap[s.id]);
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
  }, [classFilter, selectedIds]);

  // 개인화 카드 PDF — 스티커를 잘라 붙이는 대신, 양식 PDF에 학생별 QR을 바로 박아
  // 4명씩 한 장에 인쇄되도록 통짜 PDF로 다운로드(2026-08-08, 파트너 요청 — 학생이 많으면
  // 스티커 방식은 인쇄 후 한 명씩 골라 붙여야 해서 번거로움을 감수하기로 하고 이 방식 추가).
  // qrMap은 위 useEffect가 이미 만들어둔 걸 그대로 재사용 — 같은 QR을 스티커 시트와
  // 카드 양쪽에서 공유(내용은 학생 ID 하나로 동일).
  const handleDownloadCards = async () => {
    setGeneratingPdf(true);
    try {
      const templateBytes = await fetch('/self-report-card.pdf').then(r => r.arrayBuffer());
      const templateDoc = await PDFDocument.load(templateBytes);
      const pageHeight = templateDoc.getPages()[0].getHeight();
      const outDoc = await PDFDocument.create();
      for (let i = 0; i < cardTargets.length; i += CARDS_PER_PAGE) {
        const group = cardTargets.slice(i, i + CARDS_PER_PAGE);
        const [page] = await outDoc.copyPages(templateDoc, [0]);
        outDoc.addPage(page);
        for (let j = 0; j < group.length; j++) {
          const s = group[j];
          const dataUrl = qrMap[s.id];
          if (!dataUrl) continue; // 아직 생성 중이면 그 칸만 빈 채로 둠(발생하면 아래서 재시도 안내)
          const box = CARD_QR_BOXES[j];
          const img = await outDoc.embedPng(dataUrl.split(',')[1]);
          page.drawImage(img, { x: box.x, y: pageHeight - box.yTop - box.h, width: box.w, height: box.h });

          if (s.name) {
            const line = CARD_NAME_LINES[j];
            // "이름" 라벨과 이름이 겹쳐 보인다는 실측 피드백(2026-08-08) — 처음엔 라벨을
            // 피해 이름을 옆으로 붙이려 했지만 정확한 라벨 글자 폭을 알 수 없어 좌표를
            // 맞추기 어려웠음. 이름이 채워지면 "이름" 글자 자체가 필요 없어지므로(파트너
            // 지시) 라벨+밑줄 자리를 통째로 흰 사각형으로 지우고 그 위에 이름만 인쇄 —
            // 훨씬 견고하고, 명칭이 사라지는 건 이 다운로드 PDF에만 적용됨(양식 자체는 그대로).
            page.drawRectangle({ x: line.x - 5, y: pageHeight - line.yTop - 8, width: line.w + 10, height: 25, color: rgb(1, 1, 1), opacity: 1, borderWidth: 0 });
            const { dataUrl: nameUrl, w, h } = nameToPngImage(s.name);
            const nameImg = await outDoc.embedPng(nameUrl.split(',')[1]);
            page.drawImage(nameImg, { x: line.x + 15, y: pageHeight - line.yTop + 8, width: w, height: h });
          }
        }
      }
      const bytes = await outDoc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const label = selectedIds.size > 0 ? `선택${cardTargets.length}명` : (classFilter === 'all' ? '전체' : (classes.find(c => c.id === classFilter)?.name || '반'));
      a.href = url;
      a.download = `자기기록카드_${label}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('카드 PDF 생성 실패:', e);
      onToast?.('카드 PDF 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
    setGeneratingPdf(false);
  };

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
            <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>자기기록 카드에 붙일 학생 식별 QR — 스티커로 잘라 붙이거나, QR이 이미 박힌 카드 PDF로 바로 받을 수 있어요</p>
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
          <button onClick={() => window.print()} disabled={cardTargets.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '13px', fontWeight: 700, color: '#fff', background: cardTargets.length === 0 ? '#C4C9D1' : '#0D2D6B', border: 'none', borderRadius: `${RADIUS2.input}px`, cursor: cardTargets.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            <Printer size={14} /> 스티커 인쇄 ({cardTargets.length}명)
          </button>
          <button onClick={handleDownloadCards} disabled={cardTargets.length === 0 || generatingPdf}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '13px', fontWeight: 700, color: '#0D2D6B', background: '#fff', border: '1px solid #0D2D6B', borderRadius: `${RADIUS2.input}px`, cursor: (cardTargets.length === 0 || generatingPdf) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: generatingPdf ? 0.6 : 1 }}>
            <Download size={14} /> {generatingPdf ? '카드 PDF 생성 중…' : `카드 PDF로 받기 (${cardTargets.length}명)`}
          </button>
          <p style={{ fontSize: '11px', color: '#B45309', margin: 0, width: '100%' }}>
            ⚠️ 인쇄 대화상자에서 배율을 반드시 <strong>"100%"(실제 크기)</strong>로 설정하세요 — "자동"이나 "맞춤(용지에 맞게 축소)"으로 두면 QR이 18mm보다 작게 인쇄돼 인식이 안 될 수 있어요.
          </p>
          <div className="qr-no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <button onClick={selectAllVisible} disabled={sorted.length === 0}
              style={{ fontSize: '11.5px', fontWeight: 600, color: '#0D2D6B', background: 'none', border: 'none', padding: 0, cursor: sorted.length === 0 ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}>
              현재 목록 전체 선택
            </button>
            {selectedIds.size > 0 && (
              <>
                <span style={{ fontSize: '11.5px', color: '#374151' }}>· 선택됨 {selectedIds.size}명(다른 반 포함 가능) — 카드 PDF는 선택된 학생만 받아요</span>
                <button onClick={clearSelection}
                  style={{ fontSize: '11.5px', fontWeight: 600, color: '#B91C1C', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                  선택 해제
                </button>
              </>
            )}
          </div>
        </div>

        {academyName && cardTargets.length > 0 && (
          <p style={{ padding: '14px 22px 0', margin: 0, fontSize: '11px', fontWeight: 700, color: '#6B7280' }}>{academyName}</p>
        )}

        {/* 브라우징/체크용 — 항상 반 필터를 따름. 인쇄 대상은 아래 별도 그리드(cardTargets)로
            분리했으므로 이 그리드는 화면에만 보이고 인쇄되지 않음(qr-no-print) */}
        {sorted.length === 0 ? (
          <p className="qr-no-print" style={{ padding: '40px 22px', textAlign: 'center', fontSize: '13px', color: '#6B7280' }}>이 반에 재원 중인 학생이 없어요.</p>
        ) : (
          <div className="qr-no-print" style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(32mm, 1fr))', gap: '4mm' }}>
          {sorted.map(s => (
            <div key={s.id} style={{ position: 'relative', border: selectedIds.has(s.id) ? '1.5px solid #0D2D6B' : '1px dashed #D1D5DB', borderRadius: '4px', padding: '3mm', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2mm', breakInside: 'avoid' }}>
              <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)}
                aria-label={`${s.name} 선택`}
                style={{ position: 'absolute', top: '3px', left: '3px', width: '15px', height: '15px', cursor: 'pointer' }} />
              {qrMap[s.id] ? (
                <img src={qrMap[s.id]} alt={`${s.name} QR`} style={{ width: `${QR_MM}mm`, height: `${QR_MM}mm`, display: 'block' }} />
              ) : (
                <div style={{ width: `${QR_MM}mm`, height: `${QR_MM}mm`, background: '#F3F4F6' }} />
              )}
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#1A1A1A', textAlign: 'center', lineHeight: 1.3 }}>{s.name}</span>
            </div>
          ))}
          </div>
        )}

        {/* 인쇄 전용 — 화면엔 안 보이고(display:none) 인쇄할 때만 나타남(qr-print-area가
            @media print에서 display:grid로 강제됨). 선택된 학생이 있으면 반 무관 그 학생들만,
            없으면 현재 반 그대로 — "카드 PDF로 받기"와 같은 대상(cardTargets)을 스티커
            인쇄에도 반영해달라는 요청(2026-08-08) */}
        {cardTargets.length > 0 && (
          <div className="qr-print-area" style={{ display: 'none', padding: '20px 22px', gridTemplateColumns: 'repeat(auto-fill, minmax(32mm, 1fr))', gap: '4mm' }}>
          {cardTargets.map(s => (
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
        )}
      </div>
    </div>
  );
}
