import { GrnMaterialType } from '../../warehouse/types/grnTypes';
import { SamplingInfo } from '../types/qcTypes';

/**
 * MIL-STD-105E General Inspection Level II (Normal Single Sampling Table)
 */
interface MilStdRow {
  minLot: number;
  maxLot: number;
  codeLetter: string;
  sampleSize: number;
}

const MIL_STD_105E_LEVEL_II_TABLE: MilStdRow[] = [
  { minLot: 2, maxLot: 8, codeLetter: 'A', sampleSize: 2 },
  { minLot: 9, maxLot: 15, codeLetter: 'B', sampleSize: 3 },
  { minLot: 16, maxLot: 25, codeLetter: 'C', sampleSize: 5 },
  { minLot: 26, maxLot: 50, codeLetter: 'D', sampleSize: 8 },
  { minLot: 51, maxLot: 90, codeLetter: 'E', sampleSize: 13 },
  { minLot: 91, maxLot: 150, codeLetter: 'F', sampleSize: 20 },
  { minLot: 151, maxLot: 280, codeLetter: 'G', sampleSize: 32 },
  { minLot: 281, maxLot: 500, codeLetter: 'H', sampleSize: 50 },
  { minLot: 501, maxLot: 1200, codeLetter: 'J', sampleSize: 80 },
  { minLot: 1201, maxLot: 3200, codeLetter: 'K', sampleSize: 125 },
  { minLot: 3201, maxLot: 10000, codeLetter: 'L', sampleSize: 200 },
  { minLot: 10001, maxLot: 35000, codeLetter: 'M', sampleSize: 315 },
  { minLot: 35001, maxLot: 150000, codeLetter: 'N', sampleSize: 500 },
  { minLot: 150001, maxLot: 500000, codeLetter: 'P', sampleSize: 800 },
  { minLot: 500001, maxLot: Infinity, codeLetter: 'Q', sampleSize: 1250 },
];

export const calculateSamplingPlan = (
  materialType: GrnMaterialType,
  totalQuantity: number,
  containerCount: number,
  unit: string,
  containerType: string
): SamplingInfo => {
  if (materialType === 'packaging') {
    // MIL-STD-105E Level II based on Total Quantity (Pcs)
    const lotSize = Math.max(1, Math.round(totalQuantity));
    const matchedRow =
      MIL_STD_105E_LEVEL_II_TABLE.find(
        (row) => lotSize >= row.minLot && lotSize <= row.maxLot
      ) || MIL_STD_105E_LEVEL_II_TABLE[MIL_STD_105E_LEVEL_II_TABLE.length - 1];

    const actualSampleSize = Math.min(lotSize, matchedRow.sampleSize);

    return {
      materialType: 'packaging',
      totalQuantity,
      totalContainers: containerCount,
      unit,
      containerType,
      samplingStandard: 'MIL-STD-105E General Inspection Level II (Normal)',
      sampleSizeCodeLetter: matchedRow.codeLetter,
      sampleSizeQuantity: actualSampleSize,
      sampleUnit: 'pcs',
      samplingDescription: `Sesuai standar MIL-STD-105E Level II untuk lot ${lotSize.toLocaleString('id-ID')} pcs (Code Letter: ${matchedRow.codeLetter}), ambil ${actualSampleSize} pcs sampel secara acak representatif dari ${containerCount} koli.`,
    };
  } else {
    // Raw Material CPKB Formula: n = 1 + √N (N = number of containers)
    const N = Math.max(1, containerCount);
    let sampleContainers = 1;

    if (N <= 4) {
      sampleContainers = N; // If 4 or fewer containers, sample 100%
    } else {
      sampleContainers = 1 + Math.ceil(Math.sqrt(N));
    }

    return {
      materialType: 'raw',
      totalQuantity,
      totalContainers: containerCount,
      unit,
      containerType,
      samplingStandard: 'n = 1 + √N',
      sampleSizeQuantity: sampleContainers,
      sampleUnit: 'wadah/drum',
      samplingDescription: `Berdasarkan pedoman CPKB (n = 1 + √N) untuk ${N} wadah yang diterima, dilakukan pengambilan contoh pada ${sampleContainers} wadah acak di Ruang Sampling Bahan Baku.`,
    };
  }
};
