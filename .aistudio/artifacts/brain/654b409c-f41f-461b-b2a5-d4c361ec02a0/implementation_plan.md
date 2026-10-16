# Implementation Plan - Fix Packaging Material QC Parameters Lookup (K1280)

## Problem Analysis
When conducting QC testing for packaging materials such as `K1280` (which has 15 parameters configured in Master Bahan Kemas), the inspection report shows 0 parameters.
Root Cause: `packagingService.getPackagingMaterials()` uses `.limit(300)`, causing packaging codes starting further down alphabetically (like `K1280`) to be truncated and omitted from the in-memory master data list. As a result, `qualityService` cannot find the matching packaging material record or its `qcParameters`.

## Proposed Changes

### 1. Fix Packaging & Raw Material Lookup in `qualityService.ts`
- Instead of relying on a pre-fetched list of 300 items that gets truncated, `qualityService.ts` will fetch packaging materials and raw materials specifically targeted by the GRN material codes/names present in the current queue, OR fetch without truncation / query matching records directly from Supabase by code/name.
- Add a direct lookup method in `packagingService` (e.g., `getPackagingMaterialByCode(code: string)`) and `materialService` (`getMaterialByCode(code: string)`) to query Supabase directly for the exact material when synchronizing QC inspection reports.

### 2. Update `qualityService.ts` Parameter Resolution
- For each GRN record, if `materialType` is packaging, query `packagingService.getPackagingMaterialByCode(grn.materialCode)` (with fallback to name search) to ensure the 15 parameters of `K1280` are retrieved 100% reliably regardless of total database size or sorting order.

## Verification Plan
- Verify that inspecting GRN for `K1280` correctly loads all 15 parameters configured in Master Bahan Kemas.
- Run `compile_applet` to ensure TypeScript compilation succeeds.
