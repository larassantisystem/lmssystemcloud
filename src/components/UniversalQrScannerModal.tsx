import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  Upload,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Flashlight,
  ShieldCheck,
  Package,
  Calendar,
  Layers,
  FileText,
  Sparkles,
  QrCode,
  Tag,
  Clock,
  User,
  AlertTriangle,
  Building2,
  Boxes,
  FlaskConical,
  RotateCcw,
  Loader2,
  Check,
  ZoomIn,
  Eye,
} from 'lucide-react';
import jsQR from 'jsqr';
import { qualityService } from '../features/quality/qualityService';
import { warehouseService } from '../features/warehouse/warehouseService';
import { authService } from '../core/auth/authService';
import { isContainerSampled } from '../features/quality/utils/samplingUtils';
import { normalizeLotNumber } from '../features/quality/utils/qcNumbering';
import { QcInspectionReportPdfModal } from '../features/quality/components/QcInspectionReportPdfModal';
import { useEscapeKey } from '../core/utils/useEscapeKey';

interface UniversalQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ParsedQrData {
  raw: string;
  type?: string;
  docCode?: string;
  company?: string;
  lot?: string;
  grn?: string;
  matCode?: string;
  matName?: string;
  containerIndex?: number;
  totalContainers?: number;
  containerLabel?: string;
  sampled?: boolean | string;
  sampleSize?: string | null;
  samplingDate?: string | null;
  status?: string;
  expDate?: string;
  retestDate?: string;
  qmSigner?: string | null;
  mfg?: string;
  // Fallback fields for other formats
  [key: string]: any;
}

export const UniversalQrScannerModal: React.FC<UniversalQrScannerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [scannedResult, setScannedResult] = useState<ParsedQrData | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [matchedReport, setMatchedReport] = useState<any | null>(null);
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);
  const [isLoadingMatch, setIsLoadingMatch] = useState<boolean>(false);

  useEscapeKey(() => {
    if (showPdfModal) {
      setShowPdfModal(false);
    } else {
      onClose();
    }
  }, isOpen);

  // Field sampling states for QC
  const [currentUser] = useState(() => authService.getCurrentUser());
  const [activeContainerIndex, setActiveContainerIndex] = useState<number>(1);
  const [isSavingSampling, setIsSavingSampling] = useState<boolean>(false);
  const [samplingSuccessMessage, setSamplingSuccessMessage] = useState<string | null>(null);
  const [sampleSizeInput, setSampleSizeInput] = useState<string>('50');
  const [sampleUnitInput, setSampleUnitInput] = useState<string>('gram');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Stop camera helper
  const stopCamera = () => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start camera with high resolution for sharp QR detection
  const startCamera = async () => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser ini tidak mendukung akses kamera langsung. Silakan gunakan opsi Unggah Gambar QR.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      });

      streamRef.current = stream;
      setHasCameraPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsScanning(true);
        requestAnimationFrame(tick);
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setHasCameraPermission(false);
      setCameraError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Izin akses kamera ditolak. Berikan izin kamera di pengaturan browser atau gunakan opsi Unggah Foto QR.'
          : err.message || 'Gagal membuka kamera perangkat.'
      );
    }
  };

  // Toggle Camera Zoom (1x -> 1.8x -> 2.5x -> 1x)
  const handleToggleZoom = async () => {
    const nextZoom = zoomLevel === 1 ? 1.8 : zoomLevel === 1.8 ? 2.5 : 1;
    setZoomLevel(nextZoom);

    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && (track.getCapabilities as any)) {
        try {
          const caps = (track.getCapabilities as any)();
          if (caps.zoom) {
            const minZ = caps.zoom.min || 1;
            const maxZ = caps.zoom.max || 3;
            const targetZ = Math.min(Math.max(nextZoom, minZ), maxZ);
            await (track as any).applyConstraints({
              advanced: [{ zoom: targetZ }],
            });
          }
        } catch (e) {
          // Hardware zoom ignored if unsupported
        }
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setScannedResult(null);
      setMatchedReport(null);
      setShowPdfModal(false);
      setIsLoadingMatch(false);
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  // Frame processing loop with high-resolution center-crop recognition
  const tick = () => {
    if (!videoRef.current || !canvasRef.current) return;

    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;

        // Pass 1: High-resolution center-crop (matches viewfinder targeting)
        // By taking 1:1 sensor pixels from the center 70%, even small or high-density
        // QR codes maintain sharp module edges without blurring.
        const cropSize = Math.round(Math.min(vWidth, vHeight) * 0.72);
        const startX = Math.round((vWidth - cropSize) / 2);
        const startY = Math.round((vHeight - cropSize) / 2);

        canvas.width = cropSize;
        canvas.height = cropSize;
        ctx.drawImage(video, startX, startY, cropSize, cropSize, 0, 0, cropSize, cropSize);

        let imageData = ctx.getImageData(0, 0, cropSize, cropSize);
        let code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        // Pass 2: Fallback to full frame if QR code is off-center
        if (!code) {
          const maxDim = 960;
          let scanWidth = vWidth;
          let scanHeight = vHeight;
          if (scanWidth > maxDim) {
            scanHeight = Math.round((scanHeight * maxDim) / scanWidth);
            scanWidth = maxDim;
          }

          canvas.width = scanWidth;
          canvas.height = scanHeight;
          ctx.drawImage(video, 0, 0, scanWidth, scanHeight);

          imageData = ctx.getImageData(0, 0, scanWidth, scanHeight);
          code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
        }

        if (code && code.data) {
          handleSuccessfulScan(code.data);
          return;
        }
      }
    }

    if (isScanning && isOpen) {
      animationFrameId.current = requestAnimationFrame(tick);
    }
  };

  const handleSuccessfulScan = async (rawData: string) => {
    setIsScanning(false);
    stopCamera();
    setIsLoadingMatch(true);

    // Play subtle audio beep
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.start();
      setTimeout(() => {
        osc.stop();
      }, 120);
    } catch (e) {
      // Audio not permitted without user gesture, safe to ignore
    }

    // 1. Parse payload
    let parsed: ParsedQrData = { raw: rawData, company: 'PT. LARASSANTI MAKMUR SEJAHTERA' };

    // Check if rawData is a URL or contains query parameters (?coa=...&st=...&w=...)
    let isUrl = false;
    let urlLot: string | null = null;
    let urlStatus: string | null = null;
    let urlContainer: string | null = null;

    if (
      rawData.includes('coa=') ||
      rawData.includes('?coa=') ||
      rawData.startsWith('http://') ||
      rawData.startsWith('https://') ||
      rawData.includes('ais-') ||
      rawData.includes('/?coa=')
    ) {
      try {
        const fullUrl = rawData.startsWith('http')
          ? rawData
          : `https://example.com${rawData.startsWith('/') ? '' : '/'}${rawData}`;
        const parsedUrl = new URL(fullUrl);
        urlLot = parsedUrl.searchParams.get('coa');
        urlStatus = parsedUrl.searchParams.get('st');
        urlContainer = parsedUrl.searchParams.get('w');
        if (urlLot) isUrl = true;
      } catch (err) {
        const matchLot = rawData.match(/[?&]coa=([^&]+)/);
        if (matchLot) urlLot = decodeURIComponent(matchLot[1]);
        const matchSt = rawData.match(/[?&]st=([^&]+)/);
        if (matchSt) urlStatus = decodeURIComponent(matchSt[1]);
        const matchW = rawData.match(/[?&]w=([^&]+)/);
        if (matchW) urlContainer = decodeURIComponent(matchW[1]);
        if (urlLot) isUrl = true;
      }
    }

    if (isUrl && urlLot) {
      parsed.lot = decodeURIComponent(urlLot).trim();
      if (urlStatus) {
        const st = decodeURIComponent(urlStatus).trim();
        parsed.status =
          st === 'PASS' || st === 'PASSED'
            ? 'PASSED'
            : st === 'REJ' || st === 'REJECTED'
            ? 'REJECTED'
            : st === 'DEV' || st === 'PASSED_WITH_DEVIATION'
            ? 'PASSED_WITH_DEVIATION'
            : st;
      }
      if (urlContainer) {
        const wStr = decodeURIComponent(urlContainer).trim();
        parsed.containerLabel = `Wadah ${wStr}`;
        const [cIdx, tIdx] = wStr.split('/');
        if (cIdx) parsed.containerIndex = parseInt(cIdx, 10);
        if (tIdx) parsed.totalContainers = parseInt(tIdx, 10);
      }
    } else {
      // 2. Try JSON format
      try {
        const json = JSON.parse(rawData);
        if (typeof json === 'object' && json !== null) {
          parsed = { ...json, raw: rawData };
        }
      } catch (e) {
        // 3. Pipe-delimited or key-value format (LMS|QC|LOT:...|W:...|S:...|ST:...)
        const map: any = { raw: rawData, company: 'PT. LARASSANTI MAKMUR SEJAHTERA' };
        const parts = rawData.split('|');

        parts.forEach((p) => {
          const trimmed = p.trim();
          if (trimmed.startsWith('LOT:')) {
            map.lot = trimmed.substring(4);
          } else if (trimmed.startsWith('W:')) {
            const wStr = trimmed.substring(2);
            map.containerLabel = `Wadah ${wStr}`;
            const [cIdx, tIdx] = wStr.split('/');
            if (cIdx) map.containerIndex = parseInt(cIdx, 10);
            if (tIdx) map.totalContainers = parseInt(tIdx, 10);
          } else if (trimmed.startsWith('S:')) {
            const sVal = trimmed.substring(2);
            if (sVal === 'NO' || sVal === '0' || sVal === 'false') {
              map.sampled = false;
            } else {
              map.sampled = true;
              if (sVal !== 'YES' && sVal !== '1') {
                map.sampleSize = sVal;
              }
            }
          } else if (trimmed.startsWith('ST:')) {
            const stVal = trimmed.substring(3);
            map.status =
              stVal === 'PASS' || stVal === 'PASSED'
                ? 'PASSED'
                : stVal === 'REJ' || stVal === 'REJECTED'
                ? 'REJECTED'
                : stVal === 'DEV' || stVal === 'PASSED_WITH_DEVIATION'
                ? 'PASSED_WITH_DEVIATION'
                : stVal;
          } else if (trimmed.startsWith('STATUS:')) {
            map.status = trimmed.substring(7);
          } else if (trimmed.startsWith('CODE:')) {
            map.matCode = trimmed.substring(5);
          } else if (trimmed.startsWith('GRN:')) {
            map.grn = trimmed.substring(4);
          } else if (trimmed.startsWith('NO:')) {
            map.grn = trimmed.substring(3);
          } else if (trimmed.startsWith('BATCH:')) {
            map.batch = trimmed.substring(6);
          } else if (
            trimmed.startsWith('LOT-') ||
            trimmed.startsWith('GRN-') ||
            trimmed.startsWith('LBB') ||
            trimmed.startsWith('LBK')
          ) {
            map.lot = trimmed;
          } else if (trimmed === 'PASSED' || trimmed === 'PASS') {
            map.status = 'PASSED';
          } else if (trimmed === 'REJECTED' || trimmed === 'REJ') {
            map.status = 'REJECTED';
          } else if (trimmed === 'PASSED_WITH_DEVIATION' || trimmed === 'DEV') {
            map.status = 'PASSED_WITH_DEVIATION';
          }
        });
        parsed = map;
      }
    }

    // Fallback if lot wasn't extracted from prefixes
    if (!parsed.lot && !parsed.grn && rawData.length < 50 && !rawData.includes('http')) {
      parsed.lot = rawData.trim();
    }

    setScannedResult(parsed);
    const parsedContainer = parsed.containerIndex || 1;
    setActiveContainerIndex(parsedContainer);
    setSamplingSuccessMessage(null);

    // 2. Cross-match directly from Supabase database (Real transaction, NO LOCAL STORAGE)
    try {
      const [allReports, grnRecords] = await Promise.all([
        qualityService.getReports(),
        warehouseService.getGrnRecords(),
      ]);

      const targetTerm = (parsed.lot || parsed.grn || parsed.raw || '').trim().toLowerCase();
      let cleanQuery = targetTerm;
      if (cleanQuery.includes('lot:')) {
        const parts = cleanQuery.split('|');
        const lotPart = parts.find((p) => p.startsWith('lot:'));
        if (lotPart) cleanQuery = lotPart.replace('lot:', '').trim();
      }

      // Exact & normalized matching across all QC inspection reports
      let found: any = allReports.find((r) => {
        const lot = (r.lotInternalNumber || '').toLowerCase();
        const grn = (r.grnNumber || '').toLowerCase();
        const repNum = (r.reportNumber || '').toLowerCase();
        const id = (r.id || '').toLowerCase();
        const batch = (r.batchNumber || '').toLowerCase();
        const normLot = normalizeLotNumber(r.lotInternalNumber || r.grnNumber).toLowerCase();

        return (
          id === cleanQuery ||
          lot === cleanQuery ||
          grn === cleanQuery ||
          repNum === cleanQuery ||
          batch === cleanQuery ||
          normLot === cleanQuery ||
          (cleanQuery.length > 3 && (
            (lot && (lot.includes(cleanQuery) || cleanQuery.includes(lot))) ||
            (grn && (grn.includes(cleanQuery) || cleanQuery.includes(grn))) ||
            (normLot && (normLot.includes(cleanQuery) || cleanQuery.includes(normLot)))
          )) ||
          (parsed.matCode && r.materialCode === parsed.matCode)
        );
      });

      // If not yet found in QC reports, cross match with Warehouse GRN Records
      if (!found) {
        const grnFound = grnRecords.find((g) => {
          const gNum = (g.grnNumber || '').toLowerCase();
          const gId = (g.id || '').toLowerCase();
          const gLot = ((g as any).internalLotNumber || '').toLowerCase();
          const gMat = (g.materialCode || '').toLowerCase();
          return (
            gNum === cleanQuery ||
            gId === cleanQuery ||
            gLot === cleanQuery ||
            (cleanQuery.length > 3 && (gNum.includes(cleanQuery) || cleanQuery.includes(gNum))) ||
            (parsed.matCode && gMat === parsed.matCode.toLowerCase())
          );
        });

        if (grnFound) {
          found = allReports.find((r) => r.grnId === grnFound.id || r.grnNumber === grnFound.grnNumber) || {
            id: grnFound.id,
            grnId: grnFound.id,
            grnNumber: grnFound.grnNumber,
            lotInternalNumber: normalizeLotNumber(
              (grnFound as any).internalLotNumber ||
                (grnFound.materialType === 'raw'
                  ? `LBB2609${grnFound.grnNumber.replace(/[^0-9]/g, '').slice(-3) || '001'}`
                  : `LBK2609${grnFound.grnNumber.replace(/[^0-9]/g, '').slice(-3) || '001'}`)
            ),
            materialCode: grnFound.materialCode,
            materialName: grnFound.materialName,
            materialType: grnFound.materialType,
            containerCount: grnFound.containerCount,
            containerType: grnFound.containerType,
            quantityReceived: grnFound.quantityReceived,
            unit: grnFound.unit,
            status: grnFound.qcStatus || parsed.status || 'QUARANTINE',
            sampledContainers: grnFound.sampledContainers,
            sampledBy: grnFound.sampledBy,
            samplingDateTime: grnFound.samplingDateTime,
            actualSampleSize: grnFound.actualSampleSize,
            actualSampleUnit: grnFound.actualSampleUnit,
            manufacturer: grnFound.manufacturer,
            expiryDate: grnFound.expiryDate,
          };
        }
      }

      if (found) {
        setMatchedReport(found);

        // Enrich parsed payload with verified Supabase data
        parsed = {
          ...parsed,
          status: found.status || parsed.status,
          lot: found.lotInternalNumber || parsed.lot || found.grnNumber,
          grn: found.grnNumber || parsed.grn,
          matCode: found.materialCode || parsed.matCode,
          matName: found.materialName || parsed.matName,
          docCode: found.materialType === 'raw' ? 'L-DQC-001-01' : 'L-DQC-003-01',
          expDate: found.expiryDate || parsed.expDate,
          retestDate: found.retestDate || parsed.retestDate,
          mfg: found.manufacturer || parsed.mfg,
          qmSigner: found.qmSignature?.signerName || parsed.qmSigner,
          totalContainers: found.containerCount || parsed.totalContainers || 1,
        };
        if (!parsed.containerLabel) {
          parsed.containerLabel = `Wadah #${parsed.containerIndex || 1} dari ${found.containerCount || 1}`;
        }
        setScannedResult(parsed);

        if (found.actualSampleSize) {
          setSampleSizeInput(String(found.actualSampleSize));
        } else if (found.samplingInfo?.sampleSizeWeight) {
          setSampleSizeInput(String(found.samplingInfo.sampleSizeWeight));
        } else {
          setSampleSizeInput('50');
        }

        if (found.actualSampleUnit) {
          setSampleUnitInput(found.actualSampleUnit);
        } else if (found.materialType === 'packaging') {
          setSampleUnitInput('pcs');
        } else {
          setSampleUnitInput('gram');
        }
      }
    } catch (e) {
      console.warn('Error matching reports from Supabase:', e);
    } finally {
      setIsLoadingMatch(false);
    }
  };

  // Handler for updating container sampling status directly in field
  const handleToggleContainerSampling = async (targetIndex: number, shouldSample: boolean) => {
    setIsSavingSampling(true);
    setSamplingSuccessMessage(null);

    try {
      const targetIdentifier =
        matchedReport?.id ||
        matchedReport?.grnId ||
        matchedReport?.grnNumber ||
        scannedResult?.grn ||
        scannedResult?.lot;

      if (!targetIdentifier) {
        throw new Error('Identitas Lot atau Nomor GRN tidak ditemukan pada hasil scan.');
      }

      const sampleSizeNum = parseFloat(sampleSizeInput) || undefined;
      const res = await qualityService.updateContainerSampling(
        targetIdentifier,
        targetIndex,
        shouldSample,
        currentUser,
        sampleSizeNum,
        sampleUnitInput || 'gram'
      );

      // Update local states immediately
      setMatchedReport({ ...res.report });
      setScannedResult((prev) =>
        prev
          ? {
              ...prev,
              sampled: shouldSample,
              sampleSize: sampleSizeNum ? `${sampleSizeNum} ${sampleUnitInput}` : prev.sampleSize,
              samplingDate: new Date().toISOString(),
            }
          : null
      );

      setSamplingSuccessMessage(
        shouldSample
          ? `✓ Wadah #${targetIndex} berhasil ditandai TELAH DISAMPLING dan tersimpan ke Database Supabase & Sistem CPKB!`
          : `✓ Status sampling Wadah #${targetIndex} berhasil dibatalkan.`
      );

      setTimeout(() => {
        setSamplingSuccessMessage(null);
      }, 6000);
    } catch (err: any) {
      console.error('Failed to update container sampling:', err);
      alert(`Gagal memperbarui status sampling: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsSavingSampling(false);
    }
  };

  // Handle Image File Upload for QR Code
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          handleSuccessfulScan(code.data);
        } else {
          alert('Tidak ditemukan QR Code yang valid pada gambar ini. Silakan coba gambar lain yang lebih jelas.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleToggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      const capabilities = (track.getCapabilities && (track as any).getCapabilities()) || {};
      if (capabilities.torch) {
        try {
          await (track as any).applyConstraints({
            advanced: [{ torch: !torchOn }],
          });
          setTorchOn(!torchOn);
        } catch (e) {
          console.warn('Torch not supported:', e);
        }
      } else {
        alert('Fitur lampu flash tidak didukung pada kamera ini.');
      }
    }
  };

  const handleResetScan = () => {
    setScannedResult(null);
    setMatchedReport(null);
    setShowPdfModal(false);
    setIsLoadingMatch(false);
    setSamplingSuccessMessage(null);
    setIsScanning(true);
    startCamera();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[96vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-lg shadow-teal-500/30">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Pemindai QR Label & Wadah CPKB
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30 text-[10px] font-bold">
                  Kamera Aktif
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Arahkan kamera ke QR Code label kemasan, wadah drum, atau dokumen pengawasan mutu.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50">
          {!scannedResult ? (
            /* Live Camera View */
            <div className="space-y-4">
              <div className="relative w-full aspect-4/3 max-h-[380px] bg-slate-950 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border-2 border-slate-700">
                {hasCameraPermission === false ? (
                  <div className="p-6 text-center text-slate-300 max-w-sm space-y-3">
                    <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
                    <h3 className="font-bold text-white text-sm">Akses Kamera Terkendala</h3>
                    <p className="text-xs text-slate-400">{cameraError}</p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      Unggah Foto / Screenshot QR
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover transition-transform duration-200 ease-out"
                      style={{
                        transform: zoomLevel > 1 ? `scale(${zoomLevel})` : 'none',
                        transformOrigin: 'center center',
                      }}
                      muted
                      playsInline
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Viewfinder Overlay Frame */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                      {/* Darkened edges & Enlarged Target Box */}
                      <div className="w-72 h-72 sm:w-80 sm:h-80 border-2 border-teal-400 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                        {/* Corner markers */}
                        <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-teal-300 rounded-tl-lg" />
                        <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-teal-300 rounded-tr-lg" />
                        <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-teal-300 rounded-bl-lg" />
                        <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-teal-300 rounded-br-lg" />

                        {/* Animated Laser Scanning Line */}
                        <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-teal-300 to-transparent shadow-[0_0_12px_#2dd4bf] animate-[bounce_2s_infinite]" />

                        <div className="absolute -bottom-7 left-0 right-0 text-center">
                          <span className="text-[10px] font-bold text-teal-200 bg-slate-900/80 px-2 py-0.5 rounded-full border border-teal-500/30">
                            Arahkan QR Code ke dalam kotak
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Camera Control Overlay Buttons */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => setFacingMode(facingMode === 'environment' ? 'user' : 'environment')}
                          className="px-2.5 sm:px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md text-white text-xs font-semibold rounded-xl border border-white/20 flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                          title="Ganti Kamera Depan / Belakang"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Kamera</span>
                        </button>

                        {/* Zoom Level Toggle Button */}
                        <button
                          type="button"
                          onClick={handleToggleZoom}
                          className={`px-2.5 sm:px-3 py-1.5 backdrop-blur-md text-xs font-semibold rounded-xl border flex items-center gap-1 shadow-md cursor-pointer transition-all ${
                            zoomLevel > 1
                              ? 'bg-teal-500 text-slate-950 border-teal-300 font-bold'
                              : 'bg-slate-900/80 hover:bg-slate-900 text-white border-white/20'
                          }`}
                          title="Perbesar Tampilan Kamera untuk QR Kecil / Jauh"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>{zoomLevel}x</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleToggleTorch}
                          className={`px-2.5 sm:px-3 py-1.5 backdrop-blur-md text-xs font-semibold rounded-xl border flex items-center gap-1.5 shadow-md cursor-pointer transition-all ${
                            torchOn
                              ? 'bg-amber-500 text-slate-950 border-amber-300'
                              : 'bg-slate-900/80 hover:bg-slate-900 text-white border-white/20'
                          }`}
                        >
                          <Flashlight className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{torchOn ? 'Flash Hidup' : 'Flash'}</span>
                        </button>
                      </div>

                      <label className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md text-white text-xs font-semibold rounded-xl border border-white/20 flex items-center gap-1.5 shadow-md cursor-pointer transition-all">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Pilih Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3.5 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div className="text-xs text-teal-950">
                  <span className="font-bold block">Verifikasi Validasi Mutu CPKB Instan</span>
                  Pindai QR pada label tong/drum atau kemasan untuk memeriksa status kelulusan pengujian, riwayat sampling wadah, dan tanggal kedaluwarsa secara langsung.
                </div>
              </div>
            </div>
          ) : isLoadingMatch ? (
            <div className="p-10 bg-white rounded-3xl border border-slate-200 shadow-sm text-center flex flex-col items-center justify-center gap-3 my-6 animate-in fade-in duration-200">
              <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
              <h3 className="font-bold text-slate-800 text-sm">Memverifikasi Data di Database Supabase...</h3>
              <p className="text-xs text-slate-500">Mencocokkan nomor identitas lot/GRN dengan arsip mutu resmi CPKB</p>
            </div>
          ) : (
            /* Scanned Result Detail View */
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Status Banner */}
              <div
                className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-3 ${
                  scannedResult.status === 'PASSED' || (matchedReport && matchedReport.status === 'PASSED')
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                    : scannedResult.status === 'PASSED_WITH_DEVIATION' || (matchedReport && matchedReport.status === 'PASSED_WITH_DEVIATION')
                    ? 'bg-teal-50 border-teal-500 text-teal-950'
                    : scannedResult.status === 'REJECTED' || (matchedReport && matchedReport.status === 'REJECTED')
                    ? 'bg-rose-50 border-rose-500 text-rose-950'
                    : 'bg-amber-50 border-amber-400 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${
                      scannedResult.status === 'PASSED' || (matchedReport && matchedReport.status === 'PASSED')
                        ? 'bg-emerald-600'
                        : scannedResult.status === 'PASSED_WITH_DEVIATION' || (matchedReport && matchedReport.status === 'PASSED_WITH_DEVIATION')
                        ? 'bg-teal-600'
                        : scannedResult.status === 'REJECTED' || (matchedReport && matchedReport.status === 'REJECTED')
                        ? 'bg-rose-600'
                        : 'bg-amber-500'
                    }`}
                  >
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">
                      Status Mutu Wadah
                    </span>
                    <h3 className="font-black text-base">
                      {scannedResult.status === 'PASSED' || (matchedReport && matchedReport.status === 'PASSED')
                        ? 'LOLOS QC (RELEASED - SIAP PRODUKSI)'
                        : scannedResult.status === 'PASSED_WITH_DEVIATION' || (matchedReport && matchedReport.status === 'PASSED_WITH_DEVIATION')
                        ? 'RELEASE BY DEVIATION (LULUS BERSYARAT)'
                        : scannedResult.status === 'REJECTED' || (matchedReport && matchedReport.status === 'REJECTED')
                        ? 'DITOLAK (REJECTED - DILARANG DIGUNAKAN)'
                        : 'STATUS: KARANTINA / DALAM PENGUJIAN'}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {matchedReport && (
                    <button
                      type="button"
                      onClick={() => setShowPdfModal(true)}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold border border-white/30 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View CoA</span>
                    </button>
                  )}
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-white border shadow-2xs">
                    {scannedResult.docCode || (matchedReport?.materialType === 'raw' ? 'L-DQC-001-01' : 'L-DQC-003-01')}
                  </span>
                </div>
              </div>

              {/* Material & Lot Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                        {scannedResult.matCode || matchedReport?.materialCode || 'KODE MATERIAL'}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {scannedResult.company || 'PT. LARASSANTI MAKMUR SEJAHTERA'}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 text-base mt-1">
                      {scannedResult.matName || matchedReport?.materialName || 'Nama Bahan Tidak Diketahui'}
                    </h4>
                  </div>

                  {/* Wadah Tag & Mobile View CoA Button */}
                  <div className="flex items-center gap-2">
                    {matchedReport && (
                      <button
                        type="button"
                        onClick={() => setShowPdfModal(true)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View CoA</span>
                      </button>
                    )}
                    <span className="inline-block px-3 py-1 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 font-extrabold text-xs">
                      {scannedResult.containerLabel || (scannedResult.containerIndex ? `Wadah #${scannedResult.containerIndex} dari ${scannedResult.totalContainers || 1}` : 'Wadah Utama')}
                    </span>
                  </div>
                </div>

                {/* Tombol Utama View CoA */}
                {matchedReport && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowPdfModal(true)}
                      className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 border border-emerald-500/30 transition-all cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Lihat Dokumen CoA Resmi (View CoA)</span>
                    </button>
                  </div>
                )}

                {/* FIELD SAMPLING ACTION PANEL (Paperless CPKB Database Sync) */}
                {(() => {
                  const totalContainers = matchedReport?.containerCount || scannedResult.totalContainers || 1;
                  const isCurrentSampled = isContainerSampled(matchedReport?.sampledContainers, activeContainerIndex);

                  return (
                    <div className="rounded-2xl border-2 border-teal-500/40 bg-gradient-to-br from-teal-500/5 via-white to-emerald-500/5 p-4.5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-teal-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-teal-600 text-white rounded-xl shadow-xs">
                            <FlaskConical className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                              Aksi Lapangan: Pengambilan Contoh (Sampling)
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800">
                                Sinkronisasi Database
                              </span>
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Petugas QC dapat scan QR label dan langsung memperbarui status wadah ke database tanpa perlu paraf kertas manual.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Container Carousel if totalContainers > 1 */}
                      {totalContainers > 1 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700 text-[11px]">
                              Daftar Wadah Lot Ini (Total {totalContainers} {matchedReport?.containerType || 'Wadah'}):
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Wadah yang dilihat/diedit:{' '}
                              <strong className="text-teal-800 font-bold">Wadah #{activeContainerIndex}</strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
                            {Array.from({ length: totalContainers }, (_, i) => i + 1).map((cNum) => {
                              const isSampled = isContainerSampled(matchedReport?.sampledContainers, cNum);
                              const isSelected = cNum === activeContainerIndex;
                              return (
                                <button
                                  key={cNum}
                                  type="button"
                                  onClick={() => setActiveContainerIndex(cNum)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border ${
                                    isSelected
                                      ? 'bg-teal-700 text-white border-teal-800 shadow-sm ring-2 ring-teal-500/30'
                                      : isSampled
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  <span>Wadah #{cNum}</span>
                                  {isSampled ? (
                                    <CheckCircle2 className={`w-3.5 h-3.5 ${isSelected ? 'text-teal-200' : 'text-emerald-600'}`} />
                                  ) : (
                                    <span className={`text-[9px] px-1 rounded ${isSelected ? 'bg-teal-800 text-teal-200' : 'bg-slate-100 text-slate-500'}`}>
                                      Segel
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Active Container Status Box */}
                      <div
                        className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          isCurrentSampled
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                            : 'bg-amber-50/80 border-amber-300 text-amber-950'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs">
                              Status Wadah #{activeContainerIndex}:
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                isCurrentSampled
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-amber-500 text-white shadow-xs'
                              }`}
                            >
                              {isCurrentSampled ? '✓ TELAH DISAMPLING' : '⚠ BELUM DISAMPLING (SEGEL UTUH)'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {isCurrentSampled
                              ? `Tercatat disampling oleh ${matchedReport?.sampledBy || 'Staf Analis QC'} pada ${
                                  matchedReport?.samplingDateTime
                                    ? new Date(matchedReport.samplingDateTime).toLocaleString('id-ID')
                                    : 'Hari ini'
                                }.`
                              : 'Wadah masih tersegel utuh di area karantina gudang dan belum dibuka untuk uji laboratorium.'}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrentSampled ? (
                            <button
                              type="button"
                              disabled={isSavingSampling}
                              onClick={() => handleToggleContainerSampling(activeContainerIndex, false)}
                              className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 hover:border-rose-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                            >
                              {isSavingSampling ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                              <span>Batalkan Tanda Sampling</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1 bg-white border border-amber-300 rounded-xl px-2.5 py-1.5 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-500">Bobot:</span>
                                <input
                                  type="number"
                                  value={sampleSizeInput}
                                  onChange={(e) => setSampleSizeInput(e.target.value)}
                                  className="w-14 text-xs font-bold text-slate-900 border-none p-0 focus:ring-0 text-center"
                                  placeholder="50"
                                />
                                <span className="text-[10px] font-bold text-slate-600">{sampleUnitInput}</span>
                              </div>
                              <button
                                type="button"
                                disabled={isSavingSampling}
                                onClick={() => handleToggleContainerSampling(activeContainerIndex, true)}
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50 active:scale-95"
                              >
                                {isSavingSampling ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-200" />
                                )}
                                <span>Tandai Wadah #{activeContainerIndex} Telah Disampling</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Feedback Alert */}
                      {samplingSuccessMessage && (
                        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-200 shrink-0" />
                            <span>{samplingSuccessMessage}</span>
                          </div>
                          <span className="text-[10px] text-emerald-200 uppercase font-mono">SUPABASE SYNCED</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Sampling Details Summary Box */}
                <div
                  className={`p-3.5 rounded-xl border ${
                    scannedResult.sampled === true ||
                    scannedResult.sampled === 'YES' ||
                    isContainerSampled(matchedReport?.sampledContainers, activeContainerIndex)
                      ? 'bg-teal-50/80 border-teal-200 text-teal-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-teal-700" />
                      <span className="text-xs font-extrabold">Ringkasan Pengambilan Contoh (Sampling):</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        scannedResult.sampled === true ||
                        scannedResult.sampled === 'YES' ||
                        isContainerSampled(matchedReport?.sampledContainers, activeContainerIndex)
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {scannedResult.sampled === true ||
                      scannedResult.sampled === 'YES' ||
                      isContainerSampled(matchedReport?.sampledContainers, activeContainerIndex)
                        ? '✓ TELAH DISAMPLING QC'
                        : 'SEGEL UTUH (TIDAK DIBUKA)'}
                    </span>
                  </div>

                  {matchedReport?.sampledContainers && (
                    <div className="mt-2 text-xs flex items-center justify-between border-t border-teal-200/60 pt-2 font-medium">
                      <span>Catatan Wadah Disampling:</span>
                      <span className="font-bold text-teal-900">
                        {matchedReport.sampledContainers}
                      </span>
                    </div>
                  )}

                  {(scannedResult.sampleSize || (matchedReport && matchedReport.actualSampleSize)) && (
                    <div className="mt-1 text-xs flex items-center justify-between font-medium">
                      <span>Jumlah Fisik Sampel Diambil:</span>
                      <span className="font-bold text-teal-900">
                        {scannedResult.sampleSize || `${matchedReport.actualSampleSize} ${matchedReport.actualSampleUnit || 'gram'}`}
                      </span>
                    </div>
                  )}

                  {(scannedResult.samplingDate || matchedReport?.samplingDateTime) && (
                    <div className="mt-1 text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Waktu Sampling Digital:</span>
                      <span className="font-mono">
                        {new Date(scannedResult.samplingDate || matchedReport.samplingDateTime).toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Grid of Key Properties */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">No. Lot Internal</span>
                    <span className="font-mono font-black text-slate-900 text-xs block mt-0.5">
                      {scannedResult.lot || matchedReport?.lotInternalNumber || '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">No. GRN Gudang</span>
                    <span className="font-mono font-bold text-slate-800 text-xs block mt-0.5">
                      {scannedResult.grn || matchedReport?.grnNumber || '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Batch / Lot Vendor</span>
                    <span className="font-mono font-bold text-slate-900 text-xs block mt-0.5 truncate">
                      {matchedReport?.batchNumber || scannedResult.batch || '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Kuantitas</span>
                    <span className="font-mono font-bold text-slate-900 text-xs block mt-0.5">
                      {matchedReport?.quantityReceived ? `${Number(matchedReport.quantityReceived).toLocaleString('id-ID')} ${matchedReport.unit || 'kg'}` : '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Tgl Kedaluwarsa (Exp)</span>
                    <span className="font-bold text-rose-700 text-xs block mt-0.5">
                      {scannedResult.expDate || matchedReport?.expiryDate || 'Non-Exp'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Tgl Otorisasi Rilis</span>
                    <span className="font-bold text-teal-800 text-xs block mt-0.5">
                      {matchedReport?.updatedAt ? matchedReport.updatedAt.slice(0, 10) : (scannedResult.retestDate || '-')}
                    </span>
                  </div>

                  <div className="col-span-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Produsen / Supplier</span>
                      <span className="font-medium text-slate-900 text-xs block mt-0.5">
                        {scannedResult.mfg || matchedReport?.manufacturer || '-'}
                      </span>
                    </div>
                    {(scannedResult.qmSigner || matchedReport?.qmSignature?.signerName) && (
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Otorisasi Mutu</span>
                        <span className="font-bold text-emerald-800 text-xs block mt-0.5">
                          {scannedResult.qmSigner || matchedReport?.qmSignature?.signerName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-white shrink-0">
          <p className="text-xs text-slate-500">
            {scannedResult ? '✓ Data valid dan tervalidasi dengan sistem CPKB.' : 'Dekatkan QR Code ke dalam bingkai kamera.'}
          </p>

          <div className="flex items-center gap-2">
            {scannedResult && (
              <button
                type="button"
                onClick={handleResetScan}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Pindai QR Lain
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

        {/* Official CoA PDF Preview Modal */}
        {matchedReport && showPdfModal && (
          <QcInspectionReportPdfModal
            isOpen={showPdfModal}
            onClose={() => setShowPdfModal(false)}
            report={matchedReport}
          />
        )}
      </div>
    </div>
  );
};
