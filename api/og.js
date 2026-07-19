export default function handler(req, res) {
  const title = req.query.title || '학생 성장 리포트';
  const sub   = req.query.sub   || '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.';
  const academyName = req.query.academyName || '데일리 리포트 시스템';

  const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0D2D6B"/>
  <rect width="1200" height="6" fill="#C9A227"/>
  <rect x="80" y="160" width="5" height="50" rx="2" fill="#C9A227"/>
  <text x="98" y="192" font-family="Apple SD Gothic Neo, Malgun Gothic, sans-serif" font-size="20" font-weight="700" fill="rgba(255,255,255,0.5)" letter-spacing="2">${academyName}</text>
  <text x="80" y="310" font-family="Apple SD Gothic Neo, Malgun Gothic, sans-serif" font-size="88" font-weight="700" fill="#FFFFFF">${title.split(' ').slice(0, 2).join(' ')}</text>
  <text x="80" y="410" font-family="Apple SD Gothic Neo, Malgun Gothic, sans-serif" font-size="88" font-weight="700" fill="#C9A227">${title.split(' ').slice(2).join(' ') || ''}</text>
  <rect x="80" y="460" width="120" height="4" rx="2" fill="#C9A227"/>
  <text x="80" y="500" font-family="Apple SD Gothic Neo, Malgun Gothic, sans-serif" font-size="26" fill="rgba(255,255,255,0.65)">${sub}</text>
</svg>`.trim();

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(svg);
}
