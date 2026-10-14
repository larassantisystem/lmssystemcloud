# Rencana Implementasi: Direct Supabase Data Backup & Migration to D1

Integrasi migrasi data langsung dari Supabase ke database Cloudflare D1 untuk mentransfer seluruh dataset perusahaan (User Profile, Riwayat Kedatangan Gudang/GRN, Bahan Baku, Bahan Kemas, Produk Jadi, dan Formula) tanpa perlu input ulang manual.

### User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan konfirmasi pada sesi tanya jawab sebelumnya:
> - **Metode Transfer**: Menghubungkan langsung URL Proyek Supabase dan API Key (Anon / Service Role Key).
> - **Cakupan Data**: Menyeluruh (Tabel `profiles`, `warehouse_grn`, `raw_materials`, `packaging_materials`, `products`, `bulk_formulations`, dan relasi terkait).
> - **Strategi Penulisan**: Timpa bersih (Clean Wipe & Replace) agar seluruh data konsisten persis seperti di Supabase produksi.
> - **Opsi Alternatif**: Disediakan tab sekunder untuk unggah file dump SQL / JSON backup Supabase secara offline jika API Supabase dibatasi firewall/IP whitelist.

---

### 1. Overview & Core Concept

- **Apa yang Dibangun**: Modal wizard *"Direct Supabase Migration & Backup Restorer"* yang memungkinkan administrator memasukkan kredensial proyek Supabase lama, memverifikasi koneksi, meninjau jumlah baris per tabel, dan mengeksekusi transfer data lengkap ke database Cloudflare D1 dalam satu klik.
- **Pengguna Target**: Administrator Sistem, Manager RnD, Supervisor Gudang, dan QA/QC yang membutuhkan kesinambungan data master dan data transaksi riil.
- **Nilai Tambah**: Menghindari input manual ribuan master data kemasan/bahan baku dan riwayat kedatangan GRN, serta memulihkan seluruh akun login karyawan secara instan.

---

### 2. User Experience & Visual Design

- **Alur Pengguna**:
  1. Akses tombol **"Backup & Impor Data Supabase"** dari Menu Profil Admin di Header atau modul Pengaturan Database.
  2. **Langkah 1 (Koneksi)**: Masukkan `Supabase Project URL` (contoh: `https://xxxx.supabase.co`) dan `Supabase API Key` (Anon Key atau Service Role Key).
  3. **Langkah 2 (Pratinjau Data)**: Klik *"Uji & Hitung Baris Data"*. Sistem memeriksa koneksi dan menampilkan jumlah record per tabel secara real-time (`profiles`, `warehouse_grn`, `raw_materials`, `packaging_materials`, `products`, `bulk_formulations`).
  4. **Langkah 3 (Eksekusi Migrasi)**: Pilih mode *"Timpa Bersih (Fresh Overwrite)"* dan klik *"Mulai Migrasi Penuh"*.
  5. **Langkah 4 (Monitoring Real-time)**: Indikator progress bar dinamis dan log streaming menampilkan tabel yang sedang diproses baris demi baris hingga selesai 100%.
- **Desain & Tipografi**:
  - Tampilan modal bertingkat tunggal (*single elevation*) dengan palet warna slate gelap dan aksen emerald/indigo.
  - Nilai angka dan counter tabel diformat menggunakan `tabular-nums font-mono`.
  - Tidak ada pill badges dekoratif yang menumpuk; status ditampilkan melalui label teks ringkas dan indikator persentase yang jelas.
  - Tab sekunder untuk cadangan manual: unggah file `.json` atau `.sql` hasil ekspor dari Supabase Studio.

---

### 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: Backend Server-Side Proxy untuk Eksekusi Transfer**
  - *Pendekatan*: Request fetch ke Supabase dieksekusi di backend Express (`server.ts`), bukan di browser client.
  - *Alasan*: Menghindari pembatasan CORS browser, melindungi API Key Supabase agar tidak bocor di network tab browser, dan mencegah timeout saat transfer data dalam jumlah ribuan baris.
  - *Alternatif Ditolak*: Fetch langsung dari frontend React (rentan error CORS dan batas payload browser).

- **Keputusan 2: Penanganan Tipe Data JSON & Kolom Array**
  - *Pendekatan*: Parsing otomatis pada kolom relasional kompleks (`categories`, `qc_parameters`, `permissions_json`, `packaging_bom`) menjadi string JSON standar SQLite sebelum disimpan di D1.
  - *Alasan*: Memastikan kompatibilitas sempurna dengan mesin SQLite Cloudflare D1 tanpa kehilangan struktur array.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Frontend                        │
│   (SupabaseMigrationModal.tsx + DashboardLayout.tsx)        │
└──────────────────────────────┬──────────────────────────────┘
                               │ POST /api/supabase/test
                               │ POST /api/supabase/migrate-all
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express Backend (server.ts)              │
│  - Endpoint verifikasi kredensial Supabase                  │
│  - Pipeline ekstraksi data per tabel via PostgREST API      │
│  - Parser normalisasi tipe data & JSON formatting           │
└──────────────┬──────────────────────────────┬───────────────┘
               │ Fetch PostgREST               │ SQL Batch Insert
               ▼                               ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│      Remote Supabase DB     │  │   Cloudflare D1 Database   │
│  - profiles                 │  │  - profiles                │
│  - warehouse_grn            │  │  - warehouse_grn           │
│  - raw_materials            │  │  - raw_materials           │
│  - packaging_materials      │  │  - packaging_materials     │
│  - products                 │  │  - products                │
│  - bulk_formulations        │  │  - bulk_formulations       │
└─────────────────────────────┘  └────────────────────────────┘
```

#### Komponen Teknis yang Dikerjakan:
1. **Backend Endpoint (`server.ts`)**:
   - `POST /api/supabase/test`: Menguji koneksi dan menghitung jumlah record pada setiap tabel di Supabase.
   - `POST /api/supabase/migrate-all`: Menjalankan pipeline migrasi data terstruktur dengan batch transactions dan opsi `wipeExisting: true`.
2. **Frontend UI (`src/components/admin/SupabaseMigrationModal.tsx`)**:
   - Form input kredensial Supabase (`supabaseUrl`, `supabaseKey`).
   - Kartu pratinjau tabel dengan jumlah baris terdeteksi.
   - Progress bar multi-tahap dan jendela log monitor.
   - Tab cadangan upload JSON/SQL backup.
3. **Penyambungan Komponen (`src/core/ui-components/DashboardLayout.tsx`)**:
   - Memastikan tombol pemanggilan modal aktif di profil admin dan header navigasi.
