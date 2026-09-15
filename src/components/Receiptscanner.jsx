import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseReceiptImage } from '../lib/ai';
import { useProStatus } from '../hooks/useProStatus';
import { useStore } from '../store/useStore';

const MAX_DIMENSION = 1600; // long-edge px cap before upload — plenty for OCR, keeps payload/cost small
const JPEG_QUALITY = 0.82;

// Downscales+recompresses a File to a JPEG data URL. Doing this
// client-side (rather than sending the raw multi-megapixel camera photo)
// is what keeps a "vision model" call affordable per-scan and fast over
// a mobile connection.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * A camera-icon button that lets the user photograph a receipt and gets
 * it parsed into transaction fields via `onScanned`.
 *
 * Implementation note — this uses a plain
 * `<input type="file" accept="image/*" capture="environment">` rather
 * than a hand-built `navigator.mediaDevices.getUserMedia` video preview.
 * That's a deliberate simplification: the file-input approach hands off
 * directly to the device's native camera app on every mobile browser
 * (including iOS Safari, where custom MediaStream camera UIs have more
 * quirks — permission prompts, orientation handling, stream cleanup),
 * needs no video-preview UI of our own to build or maintain, and the
 * end result for the user is identical: tap the button, take a photo,
 * done. A custom in-page viewfinder is a reasonable thing to build later
 * if you want a fully branded capture experience, but it's meaningfully
 * more code and more cross-browser edge cases for no functional gain
 * today — reach for it only if that branding matters to you.
 */
export default function ReceiptScanner({ onScanned }) {
  const { isPro } = useProStatus();
  const openUpgradeModal = useStore((s) => s.openUpgradeModal);
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    if (!isPro) return openUpgradeModal('Receipt Scanning');
    inputRef.current?.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;

    setLoading(true);
    try {
      const dataUrl = await compressImage(file);
      const result = await parseReceiptImage(dataUrl);
      onScanned(result);
      toast.success(`Scanned: ${result.description}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label="Scan a receipt"
        className="w-9 h-9 rounded-lg glass flex items-center justify-center text-slate-300 hover:text-slate-100 disabled:opacity-60"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
      </button>
    </>
  );
}