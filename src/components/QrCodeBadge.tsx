import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeBadgeProps {
  value?: string;
  url?: string;
  size?: number;
  className?: string;
}

export const QrCodeBadge: React.FC<QrCodeBadgeProps> = ({
  value,
  url,
  size = 64,
  className = '',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const qrText = value || url || '';

  useEffect(() => {
    let isMounted = true;
    if (!qrText) return;

    QRCode.toDataURL(qrText, {
      width: Math.max(size * 16, 1200), // Ultra-high 1000+ DPI equivalent matrix for razor-sharp thermal micro-printing
      margin: 1, // Compact standard quiet zone
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H', // Level H (30% damage/stain tolerance) for high reliability scanning
    })
      .then((url) => {
        if (isMounted) {
          setDataUrl(url);
        }
      })
      .catch((err) => {
        console.error('Failed to generate QR Code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [qrText, size]);

  if (!dataUrl) {
    return (
      <div
        className={`bg-slate-100 rounded-lg border border-slate-200 animate-pulse flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt={`QR Code: ${qrText}`}
      width={size}
      height={size}
      className={`shrink-0 rounded-md object-contain bg-white border border-slate-200 shadow-2xs ${className}`}
      style={{ imageRendering: 'pixelated' }}
      referrerPolicy="no-referrer"
    />
  );
};
