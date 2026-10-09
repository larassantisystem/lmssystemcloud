import * as XLSX from 'xlsx';
import { MaterialStockSummary } from '../types/stockTypes';
import { formatToIsoDateString } from '../../../core/utils/dateUtils';

/**
/*******************************************************************************
 * STOCK OPNAME EXCEL TEMPLATE & PARSER
 *******************************************************************************/

export const downloadStockOpnameTemplate = (materials: MaterialStockSummary[] = []) => {
  const todayYYMMDD = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  
  const sampleRows = materials.length > 0
    ? materials.slice(0, 5).map((m) => ({
        'Kode Material': m.materialCode,
        'Nama Material': m.materialName,
        'Satuan': m.unit,
        'Saldo Fisik (Aktual)': m.stockReleased || 100,
        'Catatan / Alasan Opname': 'Opname Bulanan Routine',
        'Tandai Saldo Awal / Mixed Lot? (YA/TIDAK)': '',
        'Estimasi ED (YYYY-MM-DD)': '',
      }))
    : [
        {
          'Kode Material': 'B0001',
          'Nama Material': 'Aqua Demineralisata',
          'Satuan': 'kg',
          'Saldo Fisik (Aktual)': 500.5,
          'Catatan / Alasan Opname': 'Rekonsiliasi Timbang Akhir Bulan',
          'Tandai Saldo Awal / Mixed Lot? (YA/TIDAK)': 'TIDAK',
          'Estimasi ED (YYYY-MM-DD)': '',
        },
        {
          'Kode Material': 'K0001',
          'Nama Material': 'Pot Cream 12.5g Transparan',
          'Satuan': 'pcs',
          'Saldo Fisik (Aktual)': 1200,
          'Catatan / Alasan Opname': 'Input Data Awal / Hilang Identitas',
          'Tandai Saldo Awal / Mixed Lot? (YA/TIDAK)': 'YA',
          'Estimasi ED (YYYY-MM-DD)': '2026-12-31',
        },
      ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  
  // Auto-fit column widths
  worksheet['!cols'] = [
    { wch: 15 }, // Kode Material
    { wch: 35 }, // Nama Material
    { wch: 10 }, // Satuan
    { wch: 22 }, // Saldo Fisik
    { wch: 35 }, // Catatan
    { wch: 45 }, // Saldo Awal Indicator
    { wch: 25 }, // ED
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Opname');

  XLSX.writeFile(workbook, `Template_Stock_Opname_CPKB_${todayYYMMDD}.xlsx`);
};

const getRowVal = (row: any, ...aliases: string[]): any => {
  if (!row || typeof row !== 'object') return undefined;
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const matchedKey = keys.find(
      (k) => k.trim().toLowerCase() === alias.trim().toLowerCase()
    );
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
      return row[matchedKey];
    }
  }
  return undefined;
};

const parseNumVal = (val: any, fallback = 0): number => {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;

  let str = String(val).trim();
  if (!str) return fallback;

  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return isNaN(num) ? fallback : num;
};

export const parseStockOpnameExcel = (file: File): Promise<Array<{
  materialCode: string;
  materialName?: string;
  actualQuantity: number;
  reason?: string;
  unit?: string;
  lotInternalNumber?: string;
  isInitialStock?: boolean;
  initialStockExpiryDate?: string;
}>> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet);

        const parsed = rawJson.map((row) => {
          const rawCode = getRowVal(row, 'Kode Material', 'Kode Bahan', 'Kode', 'materialCode', 'Kode Barang', 'Kode_Material', 'Material Code', 'Kode_Bahan') ?? '';
          const materialCode = String(rawCode).trim();

          const rawName = getRowVal(row, 'Nama Material', 'Nama Bahan', 'Nama Barang', 'Nama', 'materialName', 'Nama_Material', 'Material Name', 'Bahan');
          const materialName = rawName ? String(rawName).trim() : undefined;

          const rawQty = getRowVal(row, 'Saldo Fisik (Aktual)', 'Saldo Fisik', 'Jumlah Fisik', 'actualQuantity', 'Qty', 'Jumlah', 'Saldo Aktual', 'Stock Fisik', 'Saldo', 'Fisik');
          const actualQuantity = parseNumVal(rawQty, 0);

          const rawReason = getRowVal(row, 'Catatan / Alasan Opname', 'Alasan Penyesuaian', 'Alasan', 'reason', 'Catatan', 'Keterangan', 'Notes', 'Alasan Opname');
          const reason = String(rawReason ?? 'Impor Opname Excel').trim();

          const rawUnit = getRowVal(row, 'Satuan', 'unit', 'SATUAN', 'Unit');
          const unit = String(rawUnit ?? 'kg').trim();

          const rawLot = getRowVal(row, 'No Lot Internal', 'No Lot', 'Lot Internal', 'lotInternalNumber', 'Lot', 'No. Lot');
          const lotInternalNumber = rawLot ? String(rawLot).trim() : undefined;

          const rawIsInitial = getRowVal(row, 'Tandai Saldo Awal / Mixed Lot? (YA/TIDAK)', 'Saldo Awal', 'Mixed Lot', 'isInitialStock');
          const isInitialStock = rawIsInitial ? String(rawIsInitial).trim().toUpperCase() === 'YA' : false;

          const rawED = getRowVal(row, 'Estimasi ED (YYYY-MM-DD)', 'ED', 'Expired Date', 'Estimasi ED');
          const initialStockExpiryDate = rawED ? formatToIsoDateString(rawED) : undefined;

          return { materialCode, materialName, actualQuantity, reason, unit, lotInternalNumber, isInitialStock, initialStockExpiryDate };
        }).filter((item) => item.materialCode !== '' && !isNaN(item.actualQuantity));

        resolve(parsed);
      } catch (err) {
        reject(new Error('Gagal membaca file Excel Stock Opname. Pastikan format kolom sesuai template.'));
      }
    };

    reader.onerror = () => reject(new Error('Gagal mengunggah file.'));
    reader.readAsArrayBuffer(file);
  });
};

/*******************************************************************************
 * STOCK DEDUCTION (POTONG STOK) EXCEL TEMPLATE & PARSER
 *******************************************************************************/

export const downloadStockDeductTemplate = (materials: MaterialStockSummary[] = []) => {
  const todayYYMMDD = new Date().toISOString().slice(2, 10).replace(/-/g, '');

  const sampleRows = materials.length > 0
    ? materials.slice(0, 5).map((m, idx) => ({
        'Kode Material': m.materialCode,
        'Nama Material': m.materialName,
        'No Lot Internal (Kosongkan utk FEFO)': m.lots[0]?.lotInternalNumber || '',
        'Jumlah Potong': 10,
        'Satuan': m.unit,
        'No SPK / Work Order': `SPK-2026-00${idx + 1}`,
        'Target Batch Produksi': 'BATCH-LOTION-01',
        'Catatan Penimbangan': 'Penimbangan R. Bersih A',
      }))
    : [
        {
          'Kode Material': 'B0001',
          'Nama Material': 'Aqua Demineralisata',
          'No Lot Internal (Kosongkan utk FEFO)': 'LBB260901-01',
          'Jumlah Potong': 25.5,
          'Satuan': 'kg',
          'No SPK / Work Order': 'SPK-2026-1001',
          'Target Batch Produksi': 'BATCH-CREAM-2609',
          'Catatan Penimbangan': 'Batching Mixing Shift 1',
        },
        {
          'Kode Material': 'K0001',
          'Nama Material': 'Pot Cream 12.5g Transparan',
          'No Lot Internal (Kosongkan utk FEFO)': '',
          'Jumlah Potong': 500,
          'Satuan': 'pcs',
          'No SPK / Work Order': 'SPK-2026-1002',
          'Target Batch Produksi': 'BATCH-CREAM-2609',
          'Catatan Penimbangan': 'Pengemasan Sekunder',
        },
      ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);

  worksheet['!cols'] = [
    { wch: 15 }, // Kode
    { wch: 30 }, // Nama
    { wch: 32 }, // No Lot
    { wch: 16 }, // Jumlah Potong
    { wch: 10 }, // Satuan
    { wch: 22 }, // SPK
    { wch: 25 }, // Target Batch
    { wch: 25 }, // Catatan
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Potong Stok');

  XLSX.writeFile(workbook, `Template_Potong_Stok_SPK_${todayYYMMDD}.xlsx`);
};

export const parseStockDeductExcel = (file: File): Promise<Array<{
  materialCode: string;
  lotInternalNumber?: string;
  deductQuantity: number;
  spkNumber?: string;
  batchTarget?: string;
  notes?: string;
  unit?: string;
}>> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet);

        const parsed = rawJson.map((row) => {
          const rawCode = getRowVal(row, 'Kode Material', 'Kode Bahan', 'Kode', 'materialCode', 'Kode Barang', 'Kode_Material', 'Material Code', 'Kode_Bahan') ?? '';
          const materialCode = String(rawCode).trim();

          const rawLot = getRowVal(row, 'No Lot Internal (Kosongkan utk FEFO)', 'No Lot Internal', 'No Lot', 'lotInternalNumber', 'Lot', 'No. Lot');
          const lotInternalNumber = rawLot ? String(rawLot).trim() : '';

          const rawDeduct = getRowVal(row, 'Jumlah Potong', 'Jumlah Pemakaian', 'Kuantitas', 'deductQuantity', 'Qty', 'Jumlah', 'Potong');
          const deductQuantity = parseNumVal(rawDeduct, 0);

          const rawSpk = getRowVal(row, 'No SPK / Work Order', 'No SPK', 'SPK', 'spkNumber', 'Work Order');
          const spkNumber = String(rawSpk ?? 'SPK-EXCEL').trim();

          const rawBatch = getRowVal(row, 'Target Batch Produksi', 'Target Batch', 'batchTarget', 'Batch Target', 'Batch');
          const batchTarget = String(rawBatch ?? 'BATCH-PROD').trim();

          const rawNotes = getRowVal(row, 'Catatan Penimbangan', 'Catatan', 'notes', 'Keterangan', 'Notes');
          const notes = String(rawNotes ?? 'Potong stok batch Excel').trim();

          const rawUnit = getRowVal(row, 'Satuan', 'unit', 'SATUAN', 'Unit');
          const unit = String(rawUnit ?? 'kg').trim();

          return {
            materialCode,
            lotInternalNumber,
            deductQuantity,
            spkNumber,
            batchTarget,
            notes,
            unit,
          };
        }).filter((item) => item.materialCode !== '' && !isNaN(item.deductQuantity) && item.deductQuantity > 0);

        resolve(parsed);
      } catch (err) {
        reject(new Error('Gagal membaca file Excel Potong Stok. Pastikan format kolom sesuai template.'));
      }
    };

    reader.onerror = () => reject(new Error('Gagal mengunggah file.'));
    reader.readAsArrayBuffer(file);
  });
};
