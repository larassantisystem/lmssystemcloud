import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

interface QrStickerProps {
  grn: string;
  code: string;
  name: string;
}

export const QrSticker: React.FC<QrStickerProps> = ({ grn, code, name }) => {
  return (
    <div className="w-[38mm] h-[18mm] p-1 flex items-center gap-1 border border-black overflow-hidden print:block hidden">
      <QRCodeCanvas value={`${grn}|${code}`} size={50} />
      <div className="text-[6px] font-mono leading-tight">
        <div className="font-bold">GRN: {grn}</div>
        <div>{code}</div>
        <div className="truncate w-20">{name}</div>
      </div>
    </div>
  );
};
