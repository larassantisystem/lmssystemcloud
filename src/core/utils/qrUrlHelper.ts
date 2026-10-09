/**
 * Utility to generate public-accessible QR Code URLs for mobile camera scanning
 */
export const getQrTargetUrl = (lotOrGrn: string, status?: string, containerStr?: string): string => {
  if (typeof window === 'undefined') return '';
  let origin = window.location.origin;

  // Public shared URL yang dapat diakses publik oleh kamera ponsel tanpa sesi internal dev
  const PUBLIC_APP_URL = 'https://ais-pre-du6kirk5xft6s7zdx7hxwh-897867244394.asia-southeast1.run.app';

  // Jika sedang berjalan di localhost, 127.0.0.1, atau development private iframe, arahkan ke shared public URL
  if (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('ais-dev-')
  ) {
    origin = PUBLIC_APP_URL;
  }

  const lotQuery = encodeURIComponent(lotOrGrn);
  const statusQuery = status ? `&st=${encodeURIComponent(status)}` : '';
  const containerQuery = containerStr ? `&w=${encodeURIComponent(containerStr)}` : '';

  return `${origin}/?coa=${lotQuery}${statusQuery}${containerQuery}`;
};
