import { warehouseService } from '../src/features/warehouse/warehouseService';

async function checkRecord() {
  const records = await warehouseService.getGrnRecords();
  const record = records.find(r => r.grnNumber === 'GRN-BB-261009-03');
  console.log('DEBUG: Found record:', record);
  if (record) {
    console.log('DEBUG: QC Status:', record.qcStatus);
  }
}

checkRecord();
