# Revised Implementation Plan - Modul Alur Proses Produksi & Batch Lifecycle Interaktif (CPKB)

## Tujuan
Mengembangkan modal detail batch produksi di Modul PPIC/Produksi dengan tahapan alur proses yang disempurnakan sesuai standar industri kosmetika (CPKB):
1. **Cetak Catatan Pengolahan Bets (Print Batch Record)**
2. **Penimbangan & Penyerahan Bahan Baku (Raw Material Dispensing)**
3. **Pencampuran & Pengolahan Ruahan (Mixing / Bulk Production)**
4. **Analisa Pengujian Ruahan (IPC Bulk Analysis)**
5. **Pengisian Sediaan ke Wadah Primer (Filling / Pengisian)**
6. **Penyerahan & Persiapan Bahan Kemas (Packaging Material Handover / Dispensing)**
7. **Pengemasan Sekunder & Pelabelan (Secondary Packaging & Labeling)**
8. **Pengujian Mutu Produk Jadi & Kemas (Finished Goods QC Inspection)**
9. **Pelulusan Mutu oleh Quality Manager (QM Release)**
10. **Serah Terima & Penerimaan Stok di Gudang (Warehouse Receipt)**

## Fitur Utama
- **Prosedural & Paralel:** Setiap tahap memiliki urutan logis (prosedural), namun mendukung pengaturan mode paralel untuk proses tertentu (misal: persiapan kemasan berjalan bersamaan dengan analisa ruahan).
- **Timestamp Tracking:** Pencatatan otomatis waktu mulai (*start timestamp*) dan waktu selesai (*finish timestamp*) untuk setiap tahap pengerjaan.
- **Form Detail Pekerjaan:** Klik pada masing-masing tahapan membuka pop-up form operasional (misalnya form pengujian lab ruahan, form cetak batch record, form verifikasi gudang, dll).

## Rencana Komponen & File
1. **`src/features/quality/components/ProductionBatchDetailModal.tsx`**:
   - Timeline interaktif 10 tahapan produksi dengan status pengerjaan, waktu mulai/selesai, tombol aksi modal sub-pekerjaan, serta indikator prosedural/paralel.
2. **`src/features/quality/components/ProductionStepModal.tsx`**:
   - Sub-modal dinamis untuk mengeksekusi aksi di tiap tahap.
3. **Pembaruan `PpicModule.tsx`**:
   - Integrasi klik nomor batch ke modal detail produksi komprehensif.

## Verifikasi
- Kompilasi build dengan `compile_applet`.
- Linting kode.
