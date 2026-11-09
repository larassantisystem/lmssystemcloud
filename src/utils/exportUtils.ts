import * as XLSX from 'xlsx';
import { MaterialStockSummary } from '../features/warehouse/types/stockTypes';

/**
 * Export stock summaries to Excel (.xlsx) file
 */
export const exportStockToExcel = (materials: MaterialStockSummary[], title: string = 'Stock_Report') => {
  try {
    const dataToExport = materials.map((mat, index) => ({
      No: index + 1,
      'Kode Bahan': mat.materialCode,
      'Nama Bahan': mat.materialName,
      Kategori: mat.category,
      'Lokasi Penyimpanan': mat.storageLocation,
      'Stok Rilis (Released)': mat.stockReleased,
      'Stok Karantina (Quarantine)': mat.stockQuarantine,
      'Stok Reject': mat.stockRejected,
      'Total Akumulasi': mat.totalAccumulated,
      Satuan: mat.unit,
      'Minimum Stok (ROP)': mat.minimumStock,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Set column widths for professional formatting
    const colWidths = [
      { wch: 5 },  // No
      { wch: 15 }, // Kode
      { wch: 30 }, // Nama
      { wch: 20 }, // Kategori
      { wch: 30 }, // Lokasi
      { wch: 18 }, // Released
      { wch: 20 }, // Quarantine
      { wch: 15 }, // Reject
      { wch: 18 }, // Total
      { wch: 10 }, // Satuan
      { wch: 18 }, // ROP
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Report');

    const fileName = `${title}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  } catch (error) {
    console.error('Error exporting stock to Excel:', error);
    alert('Gagal mengekspor data ke Excel. Silakan coba lagi.');
  }
};

/**
 * Export stock summaries to PDF / Printable Report
 */
export const exportStockToPDF = (materials: MaterialStockSummary[], title: string = 'Laporan Saldo Stok Gudang') => {
  try {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up terblokir oleh browser. Harap izinkan pop-up untuk mencetak PDF.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - Larasanti Cosmetic Management System</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 20px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0f766e;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .brand {
              font-size: 20px;
              font-weight: 900;
              color: #0f766e;
            }
            .subtitle {
              font-size: 11px;
              color: #64748b;
              margin-top: 2px;
            }
            .meta {
              text-align: right;
              font-size: 11px;
              color: #64748b;
            }
            h1 {
              font-size: 18px;
              font-weight: 800;
              margin: 0 0 5px 0;
              color: #0f172a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
              font-size: 11px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 8px 10px;
              text-align: left;
            }
            th {
              background-color: #f1f5f9;
              color: #334155;
              font-weight: 700;
              text-transform: uppercase;
              font-size: 10px;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .footer {
              margin-top: 30px;
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: #64748b;
            }
            .signature-box {
              text-align: center;
              margin-top: 40px;
            }
            @media print {
              button { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">PT LARASANTI ANUGERAH KOSMETIKA</div>
              <div class="subtitle">Sistem Manajemen Mutu & Gudang CPKB (BPOM Standard)</div>
            </div>
            <div class="meta">
              <div>Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}</div>
              <div>Waktu: ${new Date().toLocaleTimeString('id-ID')}</div>
            </div>
          </div>

          <h1>${title}</h1>
          <p style="font-size: 11px; color: #475569; margin-bottom: 15px;">
            Total Item Barang: <strong>${materials.length}</strong> bahan / material terdaftar dalam sistem gudang.
          </p>

          <table>
            <thead>
              <tr>
                <th style="width: 30px;" class="text-center">No</th>
                <th>Kode</th>
                <th>Nama Bahan / Material</th>
                <th>Lokasi Rak</th>
                <th class="text-right">Rilis (Released)</th>
                <th class="text-right">Karantina</th>
                <th class="text-right">Reject</th>
                <th class="text-right">Total Akumulasi</th>
              </tr>
            </thead>
            <tbody>
              ${materials.map((m, i) => `
                <tr>
                  <td class="text-center">${i + 1}</td>
                  <td><strong>${m.materialCode}</strong></td>
                  <td>${m.materialName}</td>
                  <td>${m.storageLocation}</td>
                  <td class="text-right">${m.stockReleased.toLocaleString('id-ID', { minimumFractionDigits: 3 })} ${m.unit}</td>
                  <td class="text-right">${m.stockQuarantine.toLocaleString('id-ID', { minimumFractionDigits: 3 })} ${m.unit}</td>
                  <td class="text-right">${m.stockRejected.toLocaleString('id-ID', { minimumFractionDigits: 3 })} ${m.unit}</td>
                  <td class="text-right"><strong>${m.totalAccumulated.toLocaleString('id-ID', { minimumFractionDigits: 3 })} ${m.unit}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="display: flex; justify-content: space-between; margin-top: 40px;">
            <div style="text-align: center; width: 200px;">
              <div style="font-size: 11px; font-weight: bold; margin-bottom: 60px;">Dibuat Oleh,<br>Petugas Gudang Logistik</div>
              <div style="border-bottom: 1px solid #1e293b; width: 100%;"></div>
              <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Staff Warehouse</div>
            </div>
            <div style="text-align: center; width: 200px;">
              <div style="font-size: 11px; font-weight: bold; margin-bottom: 60px;">Disetujui Oleh,<br>Kepala Gudang / Logistik</div>
              <div style="border-bottom: 1px solid #1e293b; width: 100%;"></div>
              <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Supervisor / Manager</div>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  } catch (error) {
    console.error('Error exporting stock to PDF:', error);
    alert('Gagal mengekspor laporan ke PDF. Silakan coba lagi.');
  }
};
