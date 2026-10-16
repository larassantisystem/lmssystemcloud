# Implementation Plan - Fix Raw Material QC Parameters Lookup (Bahan Baku)

## Problem Analysis
Similar to packaging materials, raw materials (`materialService`) had a hardcoded limit of `.limit(300)`, causing raw material codes further down alphabetically to be truncated and omitted from memory cache during QC inspection queue synchronization.

## Proposed Changes

### 1. Update `materialService.ts`
- Increase bulk fetch limit from `300` to `2000` in `materialService.getMaterials()`.
- Add `materialService.invalidateCache()` inside `saveMaterial()` or equivalent methods when raw materials are updated or created in RnD.

## Verification Plan
- Run `compile_applet` to verify compilation.
