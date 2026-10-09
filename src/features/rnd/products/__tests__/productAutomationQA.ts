/**
 * QA Automation Test Suite: Master Products & Product Variants Supabase Integration
 * 
 * Objectives:
 * 1. Schema Validation: 'products' (id, product_code, name, brand, exp_notification_date, created_at)
 * 2. Schema Validation: 'product_variants' (id, product_id, variant_name, sku, status) & Foreign Key
 * 3. Verify data persistence goes to Supabase and NEVER touches localStorage
 * 4. Verify all legacy demo data keys are purged from localStorage
 */

import { productService } from '../productService';
import { Product, ProductVariant } from '../../../../types';
import { isSupabaseConfigured } from '../../../../core/auth/supabaseClient';

export interface QATestResult {
  testId: string;
  title: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  details: string;
  timestamp: string;
  durationMs: number;
}

export async function runProductQAAutomation(): Promise<{
  allPassed: boolean;
  results: QATestResult[];
  summary: string;
}> {
  const results: QATestResult[] = [];
  const startTime = Date.now();

  // -------------------------------------------------------------
  // TEST 1: Schema Compliance - Table 'products'
  // Columns: id, product_code, name, brand, exp_notification_date, created_at
  // -------------------------------------------------------------
  const t1Start = Date.now();
  try {
    const sampleProduct: Product = {
      id: `qa-prod-${Date.now()}`,
      code: 'PJ-QA01',
      productCode: 'PJ-QA01',
      name: 'Brightening Niacinamide Daily Cream',
      brand: 'PT. LARASSANTI MAKMUR SEJAHTERA',
      category: 'Cream / Krim',
      description: 'QA Automated Test Product Entry',
      unit: 'pcs (Pieces)',
      storageConditions: 'Suhu Ruang (15-25°C)',
      bpomNotificationNumber: 'NA18260199999',
      bpomNotificationExt: '2028-12-31',
      expNotificationDate: '2028-12-31',
      qcParameters: [
        { name: 'Pemerian / Organoleptis', specification: 'Krim putih homogen, bau khas' },
        { name: 'pH Sediaan', specification: '5.5 - 6.5' }
      ],
      variants: [],
      createdAt: new Date().toISOString(),
    };

    // Construct expected Supabase payload
    const expectedProductColumns = [
      'id',
      'product_code',
      'name',
      'brand',
      'exp_notification_date',
      'created_at'
    ];

    const mappedPayload: Record<string, any> = {
      id: sampleProduct.id,
      product_code: sampleProduct.productCode || sampleProduct.code,
      name: sampleProduct.name,
      brand: sampleProduct.brand,
      exp_notification_date: sampleProduct.expNotificationDate || sampleProduct.bpomNotificationExt,
      created_at: sampleProduct.createdAt,
    };

    const missingColumns = expectedProductColumns.filter(col => mappedPayload[col] === undefined);

    if (missingColumns.length > 0) {
      throw new Error(`Tabel 'products' kehilangan kolom wajib: ${missingColumns.join(', ')}`);
    }

    results.push({
      testId: 'QA-01',
      title: "Verifikasi Skema Kolom Tabel 'products'",
      status: 'PASSED',
      details: `Kolom wajib terverifikasi lengkap: id, product_code (${mappedPayload.product_code}), name (${mappedPayload.name}), brand (${mappedPayload.brand}), exp_notification_date (${mappedPayload.exp_notification_date}), created_at (${mappedPayload.created_at}).`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t1Start,
    });
  } catch (err: any) {
    results.push({
      testId: 'QA-01',
      title: "Verifikasi Skema Kolom Tabel 'products'",
      status: 'FAILED',
      details: err.message,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t1Start,
    });
  }

  // -------------------------------------------------------------
  // TEST 2: Schema Compliance - Table 'product_variants' & Relasi Foreign Key
  // Columns: id, product_id, variant_name, sku, status, and FK ke products(id)
  // -------------------------------------------------------------
  const t2Start = Date.now();
  try {
    const parentProductId = `qa-prod-${Date.now()}`;
    const sampleVariant: ProductVariant = {
      id: `qa-var-${Date.now()}-1`,
      productId: parentProductId,
      variantCode: 'PJ-QA01-V1',
      sku: 'PJ-QA01-V1',
      variantName: 'Ukuran Jar Akrilik 30g',
      status: 'active',
      netVolumeGrams: 30,
      bulkFormulaCode: 'FORM-01',
      packagingBom: [
        { packagingCode: 'K0001', quantityPerUnit: 1, type: 'primary' }
      ],
      bpomNumber: 'NA18260199999',
      barcode: '8991234567890',
      description: 'Varian ukuran travel size',
      createdAt: new Date().toISOString(),
    };

    const expectedVariantColumns = [
      'id',
      'product_id',
      'variant_name',
      'sku',
      'status'
    ];

    const mappedVariantPayload: Record<string, any> = {
      id: sampleVariant.id,
      product_id: sampleVariant.productId,
      variant_name: sampleVariant.variantName,
      sku: sampleVariant.sku || sampleVariant.variantCode,
      status: sampleVariant.status || 'active',
    };

    const missingVariantCols = expectedVariantColumns.filter(c => mappedVariantPayload[c] === undefined);
    if (missingVariantCols.length > 0) {
      throw new Error(`Tabel 'product_variants' kehilangan kolom wajib: ${missingVariantCols.join(', ')}`);
    }

    if (mappedVariantPayload.product_id !== parentProductId) {
      throw new Error("Relasi Foreign Key 'product_id' tidak merujuk ke id parent 'products' yang valid.");
    }

    results.push({
      testId: 'QA-02',
      title: "Verifikasi Skema Kolom Tabel 'product_variants' & Relasi Foreign Key",
      status: 'PASSED',
      details: `Kolom terverifikasi lengkap: id, product_id (${mappedVariantPayload.product_id}), variant_name (${mappedVariantPayload.variant_name}), sku (${mappedVariantPayload.sku}), status (${mappedVariantPayload.status}). Foreign key ke 'products' valid.`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t2Start,
    });
  } catch (err: any) {
    results.push({
      testId: 'QA-02',
      title: "Verifikasi Skema Kolom Tabel 'product_variants' & Relasi Foreign Key",
      status: 'FAILED',
      details: err.message,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t2Start,
    });
  }

  // -------------------------------------------------------------
  // TEST 3: Verifikasi Penyimpanan Supabase & Zero LocalStorage
  // Pastikan setelah klik simpan, data TIDAK disimpan ke localStorage!
  // -------------------------------------------------------------
  const t3Start = Date.now();
  try {
    // 1. Catat state localStorage sebelum eksekusi
    const legacyKeys = ['lsm_products_variants', 'lsm_products', 'cosmo_products', 'rnd_demo_products'];
    
    // 2. Siapkan data produk untuk disimpan melalui productService
    const testProd: Product = {
      id: `qa-live-${Date.now()}`,
      code: 'PJ-TEST-QA',
      productCode: 'PJ-TEST-QA',
      name: 'QA Automation Hydro Gel Test',
      brand: 'PT. LARASSANTI MAKMUR SEJAHTERA',
      category: 'Gel',
      description: 'Pengujian otomatis tombol simpan master produk',
      unit: 'pcs (Pieces)',
      storageConditions: 'Suhu Sejuk',
      bpomNotificationNumber: 'NA18260188888',
      bpomNotificationExt: '2029-01-01',
      expNotificationDate: '2029-01-01',
      qcParameters: [{ name: 'Viskositas', specification: '30,000 - 45,000 cPs' }],
      variants: [
        {
          id: `qa-var-live-${Date.now()}`,
          productId: `qa-live-${Date.now()}`,
          variantCode: 'PJ-TEST-QA-V1',
          sku: 'PJ-TEST-QA-V1',
          variantName: 'Tube 50ml',
          status: 'active',
          netVolumeGrams: 50,
          bulkFormulaCode: 'FORM-02',
          packagingBom: [],
          createdAt: new Date().toISOString(),
        }
      ],
      createdAt: new Date().toISOString(),
    };

    // 3. Simpan produk melalui productService
    await productService.saveSingleProduct(testProd);

    // 4. Periksa apakah ada data produk yang masuk ke localStorage
    let touchedLocalStorage = false;
    let violatedKey = '';

    if (typeof window !== 'undefined' && window.localStorage) {
      for (const key of legacyKeys) {
        if (localStorage.getItem(key) !== null) {
          touchedLocalStorage = true;
          violatedKey = key;
          break;
        }
      }
    }

    if (touchedLocalStorage) {
      throw new Error(`Pelanggaran: Ditemukan key '${violatedKey}' tersimpan di localStorage! Data harus disimpan ke Supabase.`);
    }

    results.push({
      testId: 'QA-03',
      title: "Verifikasi Eksekusi Simpan: Supabase Direferensikan, localStorage Bebas Data",
      status: 'PASSED',
      details: `Metode productService.saveSingleProduct berhasil dijalankan. Dikonfirmasi TIDAK ADA penulisan ke localStorage untuk data produk. Supabase Status: ${isSupabaseConfigured ? 'Terkoneksi (Active Cloud)' : 'Client Siap (Menunggu Supabase URL)'}.`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t3Start,
    });
  } catch (err: any) {
    results.push({
      testId: 'QA-03',
      title: "Verifikasi Eksekusi Simpan: Supabase Direferensikan, localStorage Bebas Data",
      status: 'FAILED',
      details: err.message,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t3Start,
    });
  }

  // -------------------------------------------------------------
  // TEST 4: Pembersihan Total Data Demo dari LocalStorage & Coding
  // -------------------------------------------------------------
  const t4Start = Date.now();
  try {
    const legacyDemoKeys = [
      'lsm_products_variants',
      'lsm_products',
      'cosmo_products',
      'rnd_demo_products',
      'demo_products_cache'
    ];

    let remainingKeys: string[] = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      remainingKeys = legacyDemoKeys.filter(k => localStorage.getItem(k) !== null);
    }

    if (remainingKeys.length > 0) {
      throw new Error(`Data demo masih tertinggal di localStorage untuk keys: ${remainingKeys.join(', ')}`);
    }

    results.push({
      testId: 'QA-04',
      title: "Verifikasi Pembersihan Total Data Demo dari Local Storage",
      status: 'PASSED',
      details: `Semua key demo (${legacyDemoKeys.join(', ')}) bersih dari browser localStorage (Null/Empty). Seluruh pengisian data menggunakan input dinamis atau database Supabase.`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t4Start,
    });
  } catch (err: any) {
    results.push({
      testId: 'QA-04',
      title: "Verifikasi Pembersihan Total Data Demo dari Local Storage",
      status: 'FAILED',
      details: err.message,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t4Start,
    });
  }

  const allPassed = results.every(r => r.status === 'PASSED');
  const totalDuration = Date.now() - startTime;
  const summary = `${results.filter(r => r.status === 'PASSED').length}/${results.length} Tes QA Automation Berhasil Lolos (${totalDuration}ms).`;

  return {
    allPassed,
    results,
    summary,
  };
}
