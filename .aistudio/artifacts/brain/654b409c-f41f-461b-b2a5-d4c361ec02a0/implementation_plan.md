# Warehouse Stock Export Feature (Excel & PDF)

Add robust export capabilities for warehouse stock data in Excel (.xlsx) and PDF formats, allowing users to export all current inventory items directly from the Warehouse Stock view.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Format**: Both Excel (.xlsx) and PDF export options will be provided via a clean dropdown or button group in the Warehouse Stock toolbar.
> - **Confirmed Scope**: Exporting all current inventory stock items as requested by the user.

## 1. Overview & Core Concept

- **What It Does**: Adds "Export Excel" and "Export PDF" buttons to the Warehouse Stock management interface.
- **Key Value**: Enables warehouse managers and QC personnel to easily generate downloadable reports for inventory tracking, audits, and management review.

## 2. User Experience & Visual Design

- **Toolbar Integration**: Clean export dropdown menu or button group placed next to search/filter controls in the Warehouse Stock view.
- **Excel Export**: Generates a structured `.xlsx` workbook using `xlsx` (SheetJS) with professional headers, columns (Item Code, Name, Category, Stock Quantity, Unit, Location, Status, Last Updated), and formatted rows.
- **PDF Export**: Generates a clean printable PDF layout using browser print formatting (`window.print()` with dedicated `@media print` CSS or an auto-triggered print preview window) featuring company header, timestamp, and summary table.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Using SheetJS (`xlsx`) for Excel export.
  - *Why*: Already installed in `package.json`, highly reliable, robust client-side generation without backend roundtrips.
- **Decision 2**: Using styled HTML print layout for PDF export.
  - *Why*: Avoids external binary library bloat, renders crisp vector text and tables, and guarantees 100% reliable printing/PDF saving across all modern browsers.

## 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────┐
│ WarehousePage / Stock View                   │
│   [Export Excel]   [Export PDF]              │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌──────────────────┐       ┌──────────────────┐
│ exportUtils.ts   │       │ exportUtils.ts   │
│ (SheetJS .xlsx)  │       │ (Printable HTML) │
└──────────────────┘       └──────────────────┘
```

- **Data Source**: Current stock items from `warehouseService.getWarehouseStock()` or local state cache.
- **Implementation Steps**:
  1. Create `src/utils/exportUtils.ts` containing `exportStockToExcel()` and `exportStockToPDF()`.
  2. Integrate export buttons into `WarehousePage.tsx` (or the inventory/stock tab).
  3. Test compilation and export flows.
