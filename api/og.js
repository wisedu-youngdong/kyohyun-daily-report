// Vercel Serverless Function — 동적 OG 이미지 생성
// /api/og?title=학생+성장+리포트&sub=매+수업+후

export default function handler(req, res) {
  const title = req.query.title || '학생 성장 리포트';
  const sub   = req.query.sub   || '매 수업 후, 데이터와 선생님의 시선이 담긴 리포트';

  const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'NotoSansKR';
        src: url('https://fonts.gstatic.com/s/notosanskr/v36/PbykFmXiEBPT4ITbgNA5Cgm20xz64px_1hVWr0wuPNGmlQNMEfD4.0.woff2') format('woff2');
      }
      text { font-family: 'NotoSansKR', 'Apple SD Gothic Neo', sans-serif; }
    </style>
  </defs>
  <rect width="1200" height="630" fill="#0D2D6B"/>
  <rect width="1200" height="6" fill="#C9A227"/>
  <rect x="80" y="160" width="5" height="50" rx="2" fill="#C9A227"/>
  <text x="98" y="192" font-size="20" font-weight="700" fill="rgba(255,255,255,0.5)" letter-spacing="2">교현학원</text>
  <text x="80" y="310" font-size="90" font-weight="700" fill="#FFFFFF">${title.split(' ')[0]}</text>
  <text x="80" y="415" font-size="90" font-weight="700" fill="#C9A227">${title.split(' ').slice(1).join(' ') || ''}</text>
  <rect x="80" y="460" width="120" height="4" rx="2" fill="#C9A227"/>
  <text x="80" y="510" font-size="26" fill="rgba(255,255,255,0.65)">${sub}</text>
</svg>`.trim();

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(svg);
}
