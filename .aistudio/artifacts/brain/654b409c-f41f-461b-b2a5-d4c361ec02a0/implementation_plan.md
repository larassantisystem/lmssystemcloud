# Rencana Implementasi: Optimasi Master Data dengan Server-Side Pagination & Query Projection

Dokumen ini menguraikan langkah-langkah implementasi server-side pagination, pemfilteran di level database, dan eliminasi full-table scan pada master data (Bahan Baku, Bahan Kemas, dan Produk).

---

## 1. Analisis Masalah Saat Ini

1. **Auto-Batching While Loop (Full Table Scan ke Memori)**:
   - `materialService.ts` (`raw_materials`) dan `packagingService.ts` (`packaging_materials`) saat ini melakukan perulangan `while (hasMore)` dengan `limit(1000)` hingga **seluruh baris tabel** (ribuan row) terunduh ke RAM browser.
   - Setiap kali halaman dibuka atau cache kedaluwarsa, ribuan baris dibaca ulang dari database.
2. **Pengambilan Kolom JSON Berat**:
   - Kolom `qc_parameters`, `technical_specifications`, dan `supplier_info` ikut terbaca untuk setiap baris di tabel ringkasan awal.
3. **Pemuatan Berantai (*Fan-Out*) ke Modul Lain**:
   - Modul Gudang (GRN), QC, dan Formula memanggil data master secara penuh hanya untuk mengisi opsi dropdown pencarian.

---

## 2. Strategi Arsitektur & Perubahan

### A. Server-Side Pagination pada Service Master Data
- Menambahkan metode kueri terpaginasi di setiap service:
  - `materialService.getMaterialsPaginated({ page, pageSize, search, category })`
  - `packagingService.getPackagingMaterialsPaginated({ page, pageSize, search, type })`
  - `productService.getProductsPaginated({ page, pageSize, search, category })`
- Menggunakan klausul kueri efisien:
  - `.select(...)` dengan kolom minimal untuk daftar tabel.
  - `.range(offset, offset + pageSize - 1)` (hanya membaca 15–25 baris per halaman alih-alih ribuan).
  - Filter pencarian langsung di database (`ilike` atau `.or(...)` pada `code` dan `name`).

### B. Pemisahan Endpoint/Metode untuk Dropdown & Lookups
- Untuk formulir yang hanya membutuhkan referensi (seperti form GRN atau pilihan material):
  - Disediakan metode ringan `searchMaterialOptions(query, limit = 20)` yang hanya mengembalikan `id, code, name` dengan batasan ketat.
  - Menghindari pemuatan ribuan baris saat user hanya butuh memilih satu material.

### C. Pembaruan Komponen Antarmuka (UI Tables & Lists)
- Memperbarui tabel Master Data (`RawMaterialsList`, `PackagingMaterialsList`, `ProductList`):
  - Mengintegrasikan server-side pagination dengan kontrol navigasi halaman (First, Prev, Page Numbers, Next, Last) serta informasi total item/halaman.
  - Input pencarian menggunakan *debounce* (300-400ms) agar tidak memicu kueri beruntun pada setiap ketukan keyboard.
  - Menampilkan skeleton / loading state yang halus saat beralih halaman.

### D. Lazy Loading untuk Detail & Parameter QC
- Detail lengkap (termasuk JSON `qc_parameters`) hanya diambil *on-demand* ketika modal detail atau formulir edit dibuka (`getMaterialById(id)` / `getPackagingMaterialById(id)`).

---

## 3. Tahapan Eksekusi

1. **Fase 1: Backend & Service Layer**
   - Perbarui `materialService.ts`: buat `getMaterialsPaginated()` dan `searchMaterials()`.
   - Perbarui `packagingService.ts`: buat `getPackagingMaterialsPaginated()` dan `searchPackagingMaterials()`.
   - Perbarui `productService.ts`: buat `getProductsPaginated()` dan `searchProducts()`.
   - Pertahankan metode lama dengan cache atau deprecation yang aman agar tidak merusak modul lain.

2. **Fase 2: Komponen UI Master Data**
   - Hubungkan `RawMaterialsList` / modul bahan baku ke pagination server.
   - Hubungkan `PackagingMaterialsList` / modul bahan kemas ke pagination server.
   - Hubungkan `ProductList` / modul produk ke pagination server.
   - Pastikan pagination responsif dan ramah pengguna.

3. **Fase 3: Optimasi Dropdown & Pemanggilan Antar-Modul**
   - Periksa pemanggilan di modul Gudang (GRN) dan QC agar menggunakan pencarian ringkas/terbatas alih-alih `getAll()`.

4. **Fase 4: Verifikasi & Pengujian**
   - Jalankan `compile_applet` dan `lint_applet` untuk memastikan tidak ada pemutusan dependensi atau error tipe TypeScript.
   - Verifikasi bahwa jumlah baris yang dibaca berkurang drastis dari ribuan baris menjadi hanya sejumlah halaman aktif (misal 20-50 baris).

---

## 4. Hasil yang Diharapkan
- **Pengurangan Rows Read**: Penurunan >95% pada setiap akses awal halaman master data.
- **Waktu Muat (Load Time)**: Jauh lebih cepat dan hemat memori pada browser pengguna.
- **Skalabilitas**: Sistem tetap ringan dan cepat meskipun data bertambah hingga puluhan ribu baris.
