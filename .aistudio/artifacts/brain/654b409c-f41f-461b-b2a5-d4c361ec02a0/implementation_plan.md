# Rencana Audit Mendalam & Solusi Permanen Penyimpanan Hasil Uji QC (Lot LBB2610050)

Rencana aksi komprehensif untuk menginvestigasi kegagalan penyimpanan hasil analisa pengujian mutu pada Lot **LBB2610050**, menerapkan arsitektur penyimpanan ganda yang tahan gagal (*fault-tolerant*), mengaktifkan *auto-save draf real-time*, serta memulihkan data lot agar siap diuji tanpa risiko kehilangan data lagi.

## Keputusan & Validasi Pengguna

> [!IMPORTANT]
> Berdasarkan klarifikasi pengguna pada fase investigasi:
> - **Titik Kegagalan**: Terjadi setelah analis mengklik simpan dan memasukkan kata sandi otorisasi tanda tangan digital.
> - **Mekanisme Pengamanan**: Menerapkan *auto-save draf real-time* serta integrasi persistensi permanen ke tabel dedicated `qc_inspection_reports` di Cloudflare D1 SQLite.
> - **Status Lot LBB2610050**: Memulihkan dan meregistrasi lot LBB2610050 ke dalam sistem agar form hasil analisa langsung dapat diinput kembali oleh analis dengan aman.

---

## 1. Temuan Audit Teknis (Root Cause Analysis)

Dari audit menyeluruh pada berkas database dan logika transaksi:

1. **Kegagalan Single-Point-of-Failure pada `warehouse_grn.notes`**:
   - Selama ini hasil analisa QC tidak disimpan ke tabel fisik `qc_inspection_reports`, melainkan hanya di-serialize ke dalam komentar tersembunyi `<!--QC_PAYLOAD_START-->...<!--QC_PAYLOAD_END-->` di kolom `notes` tabel `warehouse_grn`.
   - Endpoint `/api/qc` dan tabel `qc_inspection_reports` di SQLite D1 sudah ada di skema, namun belum pernah dipanggil oleh `qualityService.ts`.
2. **Kelemahan Validasi UUID pada `syncQcReportToSupabase`**:
   - Di `src/core/utils/qcStorageSync.ts`, fungsi pencocokan remote menguji `isUuid(targetId)`. Karena ID D1 berformat teks standar (contoh: `grn-261009-05` atau `qc-rep-...`), logika tersebut mengabaikan pencocokan ID dan beralih ke `grn_number`. Jika terjadi perbedaan penomoran internal lot dengan nomor GRN asli, proses `UPDATE` menghasilkan 0 baris terpengaruh tanpa melemparkan error yang terlihat oleh analis.
3. **Ketiadaan Auto-Save Draf Real-time**:
   - Komponen `QcInspectionModal` hanya menyimpan nilai parameter di memori React (`useState`). Jika terjadi penolakan kata sandi atau kendala jaringan saat otorisasi, seluruh isian parameter terhapus.
4. **Ketidaksesuaian Registrasi Lot LBB2610050**:
   - Lot `LBB2610050` belum memiliki record GRN aktif atau terputus relasinya di SQLite D1 lokal, sehingga sistem gagal menautkan payload pengujian ke entitas fisik gudang.

---

## 2. Solusi Arsitektur & Strategi Persistensi Data

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       QC Lab Analyst Testing Interface                      │
│                           (QcInspectionModal.tsx)                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            │ 1. Auto-Save Real-time Draf (Setiap ketikan input)  │
            │ 2. Submit Final Analisa (Verifikasi Sandi Digital)  │
            └──────────────────────────┬──────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Dual-Layer Resilient Persistence Engine                   │
│                            (qualityService.ts)                              │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ Layer A: Tabel Fisik Resmi           │ Layer B: Warehouse GRN Mirror        │
│ POST/PUT /api/qc                     │ PUT /api/grn/:id                     │
│ (qc_inspection_reports)              │ (warehouse_grn.notes & lot_number)   │
│ - parameters_json                    │ - internal_lot_number = LBB2610050   │
│ - staff_signature_json               │ - qc_status = AWAITING_QM            │
│ - ai_assessment                      │ - qc_payload packed backup           │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### Komponen Pengamanan Baru:
1. **Dedicated Table Persistence**:
   - Mengaktifkan penulisan dan pembacaan langsung ke tabel `qc_inspection_reports` di D1 melalui `/api/qc`.
   - Data parameter uji (`parameters_json`), tanda tangan digital (`staff_signature_json`), dan status tidak lagi hanya menumpang di kolom `notes` gudang.
2. **Auto-Save Draft Engine**:
   - Menyimpan draf parameter uji secara otomatis ke `localStorage` (sebagai cache instan per-lot) dan sync periodik ke backend saat modal sedang aktif.
   - Tombol manual **"Simpan Draf Pengujian"** agar analis dapat menyimpan progres pengujian sebelum melakukan otorisasi kata sandi.
3. **Idempotent Matcher**:
   - Memperbaiki `qcStorageSync.ts` dan `qualityService.ts` agar mendukung pencocokan multi-key: `id`, `grn_number`, dan `lot_internal_number` tanpa membatasi hanya pada format UUID.
4. **Data Recovery Lot LBB2610050**:
   - Memasukkan entri resmi untuk Lot LBB2610050 (Bahan Baku) ke dalam database D1 lengkap dengan parameter monografi CPKB standar, sehingga analis dapat langsung membuka antrean dan mengisi hasil uji lab.

---

## 3. Rencana Langkah Implementasi

### Tahap 1: Backend & Endpoint API QC (`server.ts`)
- Memperluas endpoint `GET /api/qc` dan `POST /api/qc` agar mendukung `UPSERT` berdasarkan `lot_internal_number` atau `grn_number`.
- Menambahkan endpoint `PUT /api/qc/draft` untuk auto-save draf pengujian tanpa memerlukan verifikasi kata sandi manajer.

### Tahap 2: Layanan Mutu & Penyimpanan Ganda (`qualityService.ts` & `qcStorageSync.ts`)
- Memperbaiki `syncQcReportToSupabase` dan `syncGrnStatus` untuk menghapus batasan `isUuid` yang salah.
- Menghubungkan penyimpanan pengujian ke tabel `qc_inspection_reports` di D1 sebagai sumber data primer dan `warehouse_grn` sebagai mirror gudang.
- Mengintegrasikan fungsi `saveInspectionDraft(reportId, parameters, notes)`.

### Tahap 3: Antarmuka Input QC Lab (`QcInspectionModal.tsx`)
- Menambahkan auto-save lokal/server setiap ada perubahan nilai parameter dengan debounce 800ms.
- Menambahkan indikator status penyimpanan draf (*"Draf tersimpan otomatis"*).
- Menambahkan tombol aksi eksplisit **"Simpan Draf"** di samping tombol **"Simpan & Ajukan ke QM"**.
- Memastikan peringatan konfirmasi jika pengguna menutup modal saat ada data yang belum tersimpan.

### Tahap 4: Pemulihan Data Lot LBB2610050
- Meregistrasikan batch bahan baku untuk Lot `LBB2610050` ke dalam database Cloudflare D1 (`warehouse_grn` & `qc_inspection_reports`).
- Menyiapkan parameter spesifikasi monografi CPKB lengkap (Pemerian, pH, Bobot Jenis, Kadar Aktif, dsb.).
- Memastikan lot ini langsung muncul di tab **Proses Uji Lab** atau **Antrean Karantina** siap diisi.

### Tahap 5: Verifikasi & Kompilasi
- Menjalankan `compile_applet` untuk memastikan nol error TypeScript.
- Melakukan pengujian simulasi simpan draf, verifikasi tanda tangan digital, dan reload browser untuk memverifikasi ketahanan data.
