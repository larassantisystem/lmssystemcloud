import { supabase } from '../src/core/auth/supabaseClient';
import { unpackGrnNotes } from '../src/core/utils/qcStorageSync';

async function checkAllGrn() {
  console.log('=== CHECKING ALL GRN RECORDS IN SUPABASE ===');

  const { data: rows, error } = await supabase
    .from('warehouse_grn')
    .select('id, grn_number, material_name, material_code, internal_lot_number, qc_status, updated_at, notes');

  if (error) {
    console.error('Error querying warehouse_grn:', error);
    return;
  }

  console.log(`Found ${rows?.length || 0} rows in warehouse_grn:`);
  rows?.forEach((r, idx) => {
    const { userNotes, qcPayload } = unpackGrnNotes(r.notes);
    console.log(`\n[${idx + 1}] GRN: ${r.grn_number} | Lot: ${r.internal_lot_number || 'N/A'} | Status DB: ${r.qc_status} | Updated: ${r.updated_at}`);
    console.log(`    Material: ${r.material_name} (${r.material_code})`);
    if (qcPayload) {
      console.log(`    Payload Status: ${qcPayload.status} | Decision: ${qcPayload.staffDecision || 'None'}`);
      console.log(`    Parameters count: ${qcPayload.parameters?.length || 0}`);
      qcPayload.parameters?.forEach((p: any, pi: number) => {
        console.log(`      Param ${pi + 1}: ${p.parameterName} = "${p.resultValue || ''}"`);
      });
    } else {
      console.log(`    No qcPayload in notes! Raw notes length: ${r.notes?.length || 0}`);
    }
  });
}

checkAllGrn().catch(console.error);
