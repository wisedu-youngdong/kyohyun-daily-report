import { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { Camera, X } from 'lucide-react';
import { RADIUS2, SHADOW } from '../tokens.jsx';
import { useEscapeClose, useFocusTrap } from '../hooks.js';

// ============================================================
// QR 실시간 스캔 — 자기기록 카드 스티커를 카메라에 비추면 학생을 자동 특정.
// (2026-08-07) 정적 사진 한 장에서 QR을 디코딩하는 방식은 실측 테스트에서 카드가
// 8도만 기울어도 인식 실패로 뚝 떨어지는 걸 확인해서 채택 안 함(자세한 근거는
// project_paper_selfcheck_card_plan.md 참고) — 대신 실시간 프레임을 계속 스캔해서
// 사용자가 눈으로 각도를 맞추는 동안 잘 맞는 프레임 하나가 나오면 그걸로 인식.
// QR에는 학생 고유 ID만 들어있음(StudentQrPrint.jsx와 짝) — 디코딩된 값이 실제로
// 이 학원의 students 목록에 있는 ID일 때만 인식으로 인정(엉뚱한 QR 오인식 방지).
// ============================================================

export default function QrScanCapture({ students, onDetected, onClose }) {
  const [status, setStatus] = useState('starting'); // 'starting' | 'scanning' | 'denied' | 'error'
  const [unknownFlash, setUnknownFlash] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const panelRef = useRef(null);
  const detectedRef = useRef(false); // 콜백 중복 방지(다음 프레임이 이미 스케줄된 상태에서 연속 인식되는 것 막음)
  useEscapeClose(onClose);
  useFocusTrap(panelRef, true);

  const studentIds = useRef(new Set());
  studentIds.current = new Set(students.map(s => s.id));

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imgData.data, imgData.width, imgData.height);

      if (result && !detectedRef.current) {
        if (studentIds.current.has(result.data)) {
          detectedRef.current = true;
          onDetected(result.data);
          return; // 루프 종료 — 부모가 onClose까지 처리
        } else {
          // 등록 안 된 QR(다른 학원 카드 등) — 스캔은 계속하되 잠깐 안내만 표시
          setUnknownFlash(true);
          setTimeout(() => setUnknownFlash(false), 1500);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        console.error('카메라 접근 실패:', e);
        setStatus(e.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#111', borderRadius: `${RADIUS2.panel}px`, width: '100%', maxWidth: '420px', overflow: 'hidden', boxShadow: SHADOW[3], fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }} ref={panelRef}>
        <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={16} style={{ color: '#fff' }} />
            <p style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: '#fff' }}>학생 QR 스캔</p>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', display: 'flex', padding: '4px' }}><X size={20} /></button>
        </div>

        <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#000' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: status === 'scanning' ? 'block' : 'none' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {status === 'starting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '13px' }}>카메라를 여는 중...</div>
          )}
          {status === 'denied' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#ccc', fontSize: '13px', padding: '20px', textAlign: 'center' }}>
              <span>카메라 권한이 거부됐어요.</span>
              <span style={{ fontSize: '12px', color: '#888' }}>브라우저 주소창 옆 카메라 아이콘에서 권한을 허용한 뒤 다시 열어주세요.</span>
            </div>
          )}
          {status === 'error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '13px', padding: '20px', textAlign: 'center' }}>카메라를 열 수 없어요. 다른 기기에서 시도해주세요.</div>
          )}
          {status === 'scanning' && (
            <div style={{ position: 'absolute', inset: '15%', border: '2px solid rgba(255,255,255,0.6)', borderRadius: '12px', pointerEvents: 'none' }} />
          )}
          {unknownFlash && (
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', right: '10px', background: 'rgba(180,83,9,0.9)', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '8px 10px', borderRadius: '8px', textAlign: 'center' }}>
              등록되지 않은 QR이에요
            </div>
          )}
        </div>

        <p style={{ padding: '14px 18px', margin: 0, fontSize: '12px', color: '#999', textAlign: 'center' }}>
          카드 우상단의 QR을 사각형 안에 비춰주세요
        </p>
      </div>
    </div>
  );
}
