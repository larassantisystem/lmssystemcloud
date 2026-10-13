import { QcInspectionReport, QcParameterResult } from '../types/qcTypes';

/**
 * AI Assistant for Smart Queue Optimization & QC Analytical Result Assessment
 */

export interface QueuePriorityAdvice {
  reportId: string;
  materialCode: string;
  materialName: string;
  priorityRank: 'URGENT' | 'HIGH' | 'MEDIUM' | 'NORMAL';
  priorityScore: number;
  reason: string;
  samplingUrgency: string;
}

export const analyzeQueuePriorities = (
  reports: QcInspectionReport[]
): QueuePriorityAdvice[] => {
  return reports.map((rep) => {
    let score = 50;
    const reasons: string[] = [];

    // Factor 1: Material sensitivity & storage conditions
    if (
      rep.storageConditions.toLowerCase().includes('dingin') ||
      rep.storageConditions.toLowerCase().includes('2 - 8') ||
      rep.materialName.toLowerCase().includes('retinol') ||
      rep.materialName.toLowerCase().includes('vitamin') ||
      rep.materialName.toLowerCase().includes('extract')
    ) {
      score += 25;
      reasons.push('Bahan aktif bernilai tinggi & sensitif terhadap stabilitas suhu');
    }

    // Factor 2: Raw Material vs Packaging
    if (rep.materialType === 'raw') {
      score += 15;
      reasons.push('Bahan Baku kritis untuk antrean formulasi & penimbangan PPIC');
    } else {
      score += 5;
      reasons.push('Bahan Kemas penunjang proses filling & packaging');
    }

    // Factor 3: Waiting time
    const receivedTime = new Date(rep.receivedDate).getTime();
    const now = Date.now();
    const daysWaiting = Math.max(0, (now - receivedTime) / (1000 * 60 * 60 * 24));
    if (daysWaiting >= 2) {
      score += 20;
      reasons.push(`Telah berada di karantina selama >${Math.round(daysWaiting)} hari`);
    } else if (daysWaiting >= 1) {
      score += 10;
      reasons.push('Karantina >24 jam, perlu segera sampling');
    }

    // Factor 4: Quantity volume
    if (rep.quantityReceived > 1000) {
      score += 10;
      reasons.push('Volume lot kedatangan besar');
    }

    score = Math.min(99, Math.max(10, score));

    let priorityRank: 'URGENT' | 'HIGH' | 'MEDIUM' | 'NORMAL' = 'NORMAL';
    let samplingUrgency = 'Jadwal Reguler';

    if (score >= 85) {
      priorityRank = 'URGENT';
      samplingUrgency = 'Segera ambil sampel dalam <4 jam';
    } else if (score >= 70) {
      priorityRank = 'HIGH';
      samplingUrgency = 'Prioritas sampling shift ini';
    } else if (score >= 50) {
      priorityRank = 'MEDIUM';
      samplingUrgency = 'Sampling terencana hari ini';
    }

    return {
      reportId: rep.id,
      materialCode: rep.materialCode,
      materialName: rep.materialName,
      priorityRank,
      priorityScore: score,
      reason: reasons.join(' • ') || 'Kedatangan bahan standar sesuai jadwal penerimaan',
      samplingUrgency,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore);
};

export const analyzeLabResults = (
  materialName: string,
  materialType: 'raw' | 'packaging',
  parameters: QcParameterResult[]
): {
  complianceScore: number;
  deviationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  suggestedAction: string;
} => {
  if (parameters.length === 0) {
    return {
      complianceScore: 100,
      deviationRisk: 'LOW',
      summary: 'Belum ada parameter pengujian yang diinput.',
      suggestedAction: 'Silakan isi hasil pengujian fisikokimia/organoleptis lab.',
    };
  }

  const passedCount = parameters.filter((p) => p.isCompliant).length;
  const failedCount = parameters.length - passedCount;
  const complianceScore = Math.round((passedCount / parameters.length) * 100);

  if (failedCount === 0) {
    return {
      complianceScore: 100,
      deviationRisk: 'LOW',
      summary: `Seluruh ${parameters.length} parameter pengujian ${materialName} memenuhi batas spesifikasi standar CPKB & CoA produsen.`,
      suggestedAction: 'Rekomendasi AI: Bahan siap diajukan untuk Otorisasi RELEASE oleh Quality Manager.',
    };
  } else if (failedCount === 1) {
    const failedParam = parameters.find((p) => !p.isCompliant);
    return {
      complianceScore,
      deviationRisk: 'MEDIUM',
      summary: `Terdapat 1 parameter deviasi minor pada "${failedParam?.parameterName}" (Hasil: ${failedParam?.resultValue}, Standar: ${failedParam?.specification}).`,
      suggestedAction: 'Rekomendasi AI: Jika tidak memengaruhi keamanan produk kritis, Quality Manager dapat mempertimbangkan RELEASE BY DEVIATION dengan catatan kajian risiko, atau lakukan uji ulang (re-test).',
    };
  } else {
    return {
      complianceScore,
      deviationRisk: 'HIGH',
      summary: `Ditemukan ${failedCount} parameter tidak memenuhi syarat (TMS) dari total ${parameters.length} parameter pengujian.`,
      suggestedAction: 'Rekomendasi AI: Berpotensi menimbulkan cacat mutu formula/stabilitas. Disarankan keputusan REJECT (Tolak) dan isolasi ke karantina retur pemasok.',
    };
  }
};
