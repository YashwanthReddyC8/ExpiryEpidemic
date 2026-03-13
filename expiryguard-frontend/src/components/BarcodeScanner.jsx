/**
 * BarcodeScanner — camera-based QR / barcode scanner using html5-qrcode.
 *
 * Props:
 *   onScan(text: string)  — called once per successful decode
 *   onClose()             — called when the user closes the scanner
 *   label                 — optional header label (default "Scan QR / Barcode")
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, X, Zap } from 'lucide-react';

const SCANNER_ID = 'barcode-scanner-viewport';

export default function BarcodeScanner({ onScan, onClose, label = 'Scan QR / Barcode' }) {
  const scannerRef = useRef(null);
  const [started, setStarted]   = useState(false);
  const [error, setError]       = useState('');
  const [lastScan, setLastScan] = useState('');
  const cooldown = useRef(false);

  /* ── start scanner on mount ── */
  useEffect(() => {
    let instance = null;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        instance = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = instance;

        await instance.start(
          { facingMode: 'environment' },         // rear camera
          { fps: 12, qrbox: { width: 280, height: 180 } },
          (decoded) => {
            if (cooldown.current) return;        // debounce rapid fires
            cooldown.current = true;
            setLastScan(decoded);
            onScan(decoded);
            setTimeout(() => { cooldown.current = false; }, 1500);
          },
          () => {}                               // ignore frame errors silently
        );

        setStarted(true);
        setError('');
      } catch (err) {
        const msg = String(err);
        if (msg.includes('permission') || msg.includes('NotAllowed')) {
          setError('Camera access denied. Please allow camera permissions and try again.');
        } else {
          setError('Could not start camera: ' + msg);
        }
      }
    };

    start();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-indigo-600 px-5 py-4">
          <div className="flex items-center gap-2 text-white">
            <Camera className="h-5 w-5" />
            <span className="font-semibold">{label}</span>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-indigo-100 hover:bg-indigo-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative bg-black" style={{ minHeight: 280 }}>
          <div id={SCANNER_ID} className="w-full" />

          {/* Scanning overlay animation */}
          {started && !error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {/* corner markers */}
              <div className="relative" style={{ width: 280, height: 180 }}>
                {/* top-left */}
                <span className="absolute top-0 left-0  w-8 h-8 border-t-4 border-l-4 border-indigo-400 rounded-tl-md" />
                {/* top-right */}
                <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-400 rounded-tr-md" />
                {/* bottom-left */}
                <span className="absolute bottom-0 left-0  w-8 h-8 border-b-4 border-l-4 border-indigo-400 rounded-bl-md" />
                {/* bottom-right */}
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-400 rounded-br-md" />
                {/* scan line */}
                <div className="absolute left-0 right-0 h-0.5 bg-indigo-400 opacity-80 animate-scan-line" />
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-6 text-center">
              <CameraOff className="mb-3 h-12 w-12 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Loading state */}
          {!started && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-400 border-t-transparent" />
              <p className="mt-3 text-sm text-gray-400">Starting camera…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50 space-y-3">
          {lastScan ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
              <Zap className="h-4 w-4 text-green-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-green-600 font-medium">Last scanned</p>
                <p className="font-mono text-sm text-green-800 truncate">{lastScan}</p>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400">
              Point camera at any QR code or barcode
            </p>
          )}
          <button
            onClick={handleClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Close Scanner
          </button>
        </div>
      </div>
    </div>
  );
}
