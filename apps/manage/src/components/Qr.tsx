import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR-Code als SVG: dunkel auf weiß und mit Rand, damit Kameras ihn zuverlässig lesen. */
export function Qr({ value, label }: { value: string; label?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#0b0d1c', light: '#ffffff' } })
      .then((s) => alive && setSvg(s));
    return () => { alive = false; };
  }, [value]);
  return <div className="qr" role="img" aria-label={label ?? 'QR-Code'} dangerouslySetInnerHTML={{ __html: svg }} />;
}
