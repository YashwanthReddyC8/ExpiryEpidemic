/**
 * BarcodeScanner — camera-based QR / barcode scanner using html5-qrcode.
 *
 * Props:
 *   onScan(text: string)  — called once per successful decode
 *   onClose()             — called when the user closes the scanner
 *   label                 — optional header label
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ImageUp, RefreshCw, X, Zap } from 'lucide-react';

const SCANNER_ID = 'barcode-scanner-viewport';

function pickPreferredCamera(cameras = []) {
  if (!cameras.length) return null;
  return (
    cameras.find((camera) => /back|rear|environment/i.test(camera.label || '')) ||
    cameras[0]
  );
}

export default function BarcodeScanner({ onScan, onClose, label = 'Scan QR / Barcode' }) {
  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);
  const formatsRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const [lastScan, setLastScan] = useState('');
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const cooldown = useRef(false);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Ignore stop errors during rapid camera switching/unmount.
      }
    }
  };

  const handleDecoded = async (decoded) => {
    if (cooldown.current) return;
    cooldown.current = true;
    setLastScan(decoded);
    await stopScanner();
    onScan(decoded);
    setTimeout(() => { cooldown.current = false; }, 1500);
  };

  useEffect(() => {
    let disposed = false;

    const boot = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (disposed) return;

        formatsRef.current = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ];

        const cameraList = await Html5Qrcode.getCameras();
        if (disposed) return;
        setCameras(cameraList);
        const preferredCamera = pickPreferredCamera(cameraList);
        setCameraId(preferredCamera?.id || 'environment');
        setError('');
      } catch (err) {
        const msg = String(err);
        if (msg.includes('permission') || msg.includes('NotAllowed')) {
          setError('Camera access denied. Please allow camera in browser settings.');
        } else {
          setError('Could not access camera list. ' + msg);
        }
      }
    };

    boot();

    return () => {
      disposed = true;
      stopScanner().finally(() => {
        scannerRef.current = null;
      });
    };
  }, [reloadTick]);

  useEffect(() => {
    let cancelled = false;

    const startScanner = async () => {
      if (!cameraId || !formatsRef.current) return;
      setStarted(false);
      setError('');

      try {
        if (!scannerRef.current) {
          const { Html5Qrcode } = await import('html5-qrcode');
          if (cancelled) return;
          scannerRef.current = new Html5Qrcode(SCANNER_ID);
        }

        await stopScanner();
        if (cancelled) return;

        const cameraConfig = cameraId === 'environment' ? { facingMode: 'environment' } : cameraId;
        await scannerRef.current.start(
          cameraConfig,
          {
            fps: 8,
            qrbox: { width: 320, height: 120 },
            aspectRatio: 1.7778,
            formatsToSupport: formatsRef.current,
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true,
            },
            disableFlip: false,
          },
          (decoded) => {
            void handleDecoded(decoded);
          },
          () => {}
        );

        if (!cancelled) {
          setStarted(true);
          setError('');
        }
      } catch (err) {
        if (cancelled) return;
        const msg = String(err);
        if (msg.includes('permission') || msg.includes('NotAllowed')) {
          setError('Camera access denied. Please allow camera in browser settings.');
        } else {
          setError('Could not start camera. ' + msg);
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
    };
  }, [cameraId]);

  const handleClose = () => {
    stopScanner().finally(() => {
      scannerRef.current = null;
      onClose();
    });
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !scannerRef.current) return;

    setLoadingFile(true);
    setError('');
    try {
      const decoded = await scannerRef.current.scanFile(file, true);
      await handleDecoded(decoded);
    } catch {
      setError('Could not detect a barcode from that image. Try a sharper close-up photo.');
    } finally {
      setLoadingFile(false);
      event.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
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

        <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex flex-wrap gap-2 items-center">
          <select
            className="select flex-1 min-w-44"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
          >
            {!cameras.length && <option value="environment">Rear camera</option>}
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>{camera.label || `Camera ${camera.id}`}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setReloadTick((tick) => tick + 1)}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary flex items-center gap-2"
            disabled={loadingFile}
          >
            <ImageUp className="h-4 w-4" /> {loadingFile ? 'Scanning…' : 'Scan Photo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>

        <div className="relative bg-black">
          {!started && !error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 min-h-[320px]">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-400 border-t-transparent" />
              <p className="mt-3 text-sm text-gray-400">Starting camera…</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center bg-gray-900 p-8 text-center min-h-[320px]">
              <CameraOff className="mb-3 h-12 w-12 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div
            id={SCANNER_ID}
            className="w-full min-h-[320px] bg-black [&>video]:w-full [&>video]:min-h-[320px] [&>video]:object-contain [&>video]:rounded-none [&_img]:hidden"
          />
        </div>

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
              Use the rear camera, keep the full barcode inside the frame, and try Scan Photo if live scan is unstable
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
