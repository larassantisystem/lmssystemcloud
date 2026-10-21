import { warehouseService } from './src/features/warehouse/warehouseService';

async function checkGrn() {
  const records = await warehouseService.getGrnRecords();
  const grn = records.find(r => r.grnNumber === 'GRN-BK-261003-01');
  console.log(JSON.stringify(grn, null, 2));
}

checkGrn();
