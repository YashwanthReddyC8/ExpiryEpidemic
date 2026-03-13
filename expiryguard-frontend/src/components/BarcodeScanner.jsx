/**
 * BarcodeScanner — camera-based QR / barcode scanner using html5-qrcode.
 *
 * Props:
 *   onScan(text: string)  — called once per successful decode
 *   onClose()             — called when the user closes the scanner
 *   label                 — optional header label
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

  useEffect(() => {
    let instance = null;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        instance = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = instance;

        await instance.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            // qrbox controls the scanning region — no extra overlay from us needed
            qrbox: { width: 260, height: 160 },
            aspectRatio: 1.5,
            // Disables the verbose shaded region so we only see 1 camera view
            disableFlip: false,
          },
          (decoded) => {
            if (cooldown.current) return;
            cooldown.current = true;
            setLastScan(decoded);
            onScan(decoded);
            setTimeout(() => { cooldown.current = false; }, 1500);
          },
          () => {} // ignore per-frame errors
        );

        setStarted(true);
        setError('');
      } catch (err) {
        const msg = String(err);
        if (msg.includes('permission') || msg.includes('NotAllowed')) {
          setError('Camera access denied. Please allow camera in browser settings.');
        } else {
          setError('Could not start camera. ' + msg);
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

        {/* Camera viewport — html5-qrcode injects the video + scanning box here */}
        <div className="relative bg-black">
          {/* Loading state — shown before camera starts */}
          {!started && !error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 min-h-[240px]">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-400 border-t-transparent" />
              <p className="mt-3 text-sm text-gray-400">Starting camera…</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex flex-col items-center justify-center bg-gray-900 p-8 text-center min-h-[240px]">
              <CameraOff className="mb-3 h-12 w-12 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/*
            html5-qrcode renders the camera video + its own scanning box overlay
            into this div. We keep it simple — no extra overlay divs on top.
          */}
          <div
            id={SCANNER_ID}
            className="w-full [&>video]:w-full [&>video]:rounded-none [&_img]:hidden"
          />
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
              Point camera at a QR code or barcode
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
