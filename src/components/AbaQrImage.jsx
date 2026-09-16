import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

/**
 * Renders a QR code client-side from a string value.
 * No image file needed — the QR is drawn onto a <canvas> in the browser.
 */
export default function AbaQrImage({ value, size = 224 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).catch((err) => console.error('[AbaQrImage]', err));
  }, [value, size]);

  if (!value) {
    return (
      <div
        className="bg-white/10 rounded-2xl flex items-center justify-center text-[10px] text-slate-400"
        style={{ width: size, height: size }}
      >
        QR not configured
      </div>
    );
  }

  return (
    <div className="bg-white p-3 rounded-2xl shadow-gilt">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}