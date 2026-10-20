# Rencana Penyesuaian Modul Deviasi Berdasarkan 12 Tahapan SOP Resmi

## Tujuan
Menyelaraskan alur kerja (workflow), tab navigasi, dan penanggung jawab di Modul Deviasi dengan 12 tahapan SOP resmi:
1. Pelaporan dan registrasi penyimpangan (Departemen pelapor / QA)
2. Uraian kejadian dan persyaratan yang tidak terpenuhi (Departemen pelapor)
3. Tindakan segera dan pengamanan produk/proses (Departemen terkait)
4. Klasifikasi kategori dan tingkat risiko (QA)
5. Kajian departemen terkait sesuai kategori penyimpangan (Departemen yang ditunjuk)
6. Investigasi dan pengumpulan bukti (Departemen terkait bersama QA)
7. Analisis akar penyebab (Departemen penyebab / terkait bersama QA)
8. Penilaian dampak dan keputusan terhadap produk (QA bersama departemen terkait)
9. Penyusunan dan persetujuan CAPA (Departemen penanggung jawab dan QA)
10. Pelaksanaan CAPA (PIC yang ditetapkan)
11. Verifikasi efektivitas CAPA (QA dan departemen terkait)
12. Kesimpulan dan penutupan laporan (QA / pejabat berwenang)

## Rencana Perubahan
1. **Pembaruan Workflow / Tahapan di UI (`DeviationDetailModal.tsx`)**:
   - Menata ulang tab atau tahapan alur deviasi agar mencerminkan 12 tahapan SOP dengan jelas beserta penanggung jawab (PIC) di setiap tahapnya.
   - Menyediakan status pelacakan (tracking status) untuk setiap tahapan (Belum Dimulai, Sedang Berjalan, Selesai/Diverifikasi).

2. **Penyempurnaan Struktur Data (`deviationTypes.ts` & `deviationService.ts`)**:
   - Mendukung pencatatan status per tahapan SOP (1 sampai 12) beserta PIC dan catatan verifikasinya.

3. **Verifikasi Build & Linting**:
   - Memastikan kompilasi sukses dan bersih dari error.
