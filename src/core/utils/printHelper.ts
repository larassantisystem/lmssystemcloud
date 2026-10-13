/**
 * Isolated Hidden Iframe Print Helper
 * Ensures 100% clean, unclipped, un-interfered printing for:
 * 1. A4 Official Documents (CoA, IPC Reports)
 * 2. Thermal Roll Labels (100mm x 100mm CPKB Labels)
 */
export function printHtmlElement(
  element: HTMLElement,
  options: {
    pageType: 'a4' | 'thermal';
    title?: string;
  }
) {
  // 1. Create isolated hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    window.print();
    return;
  }

  // 2. Collect all active style tags and stylesheets from head to ensure Tailwind & fonts are preserved
  const styleElements = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => el.outerHTML)
    .join('\n');

  // 3. Define dedicated print CSS for isolated document
  const isA4 = options.pageType === 'a4';

  const printCss = isA4
    ? `
      @page {
        size: A4 portrait;
        margin: 8mm 10mm 8mm 10mm;
      }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        font-family: inherit;
      }
      .no-print {
        display: none !important;
      }
      .print-page {
        box-sizing: border-box !important;
        width: 100% !important;
        min-height: 268mm !important;
        max-height: 278mm !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        page-break-before: auto !important;
        break-before: auto !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
        background: #ffffff !important;
        border: none !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
      .print-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .page-break-inside-avoid {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      table {
        border-collapse: collapse !important;
      }
    `
    : `
      @page {
        size: 100mm 100mm;
        margin: 0mm !important;
      }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        background: transparent !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100mm !important;
      }
      .no-print {
        display: none !important;
      }
      .print-page-wrapper {
        display: block !important;
        width: 100mm !important;
        height: 100mm !important;
        min-width: 100mm !important;
        min-height: 100mm !important;
        max-width: 100mm !important;
        max-height: 100mm !important;
        margin: 0 !important;
        padding: 0 !important;
        page-break-before: auto !important;
        break-before: auto !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }
      .print-page-wrapper:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .thermal-label-page {
        width: 100mm !important;
        height: 100mm !important;
        min-width: 100mm !important;
        min-height: 100mm !important;
        max-width: 100mm !important;
        max-height: 100mm !important;
        margin: 0 !important;
        padding: 3mm !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        overflow: hidden !important;
        border: 1.5px solid #000000 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
    `;

  // 4. Render markup into iframe
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${options.title || 'Dokumen Resmi CPKB'}</title>
        ${styleElements}
        <style>
          ${printCss}
        </style>
      </head>
      <body>
        ${element.outerHTML}
      </body>
    </html>
  `);
  iframeDoc.close();

  // 5. Trigger print after images load
  let isCleanedUp = false;
  const triggerPrint = () => {
    if (isCleanedUp) return;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('[printHelper] Print error:', err);
    } finally {
      setTimeout(() => {
        isCleanedUp = true;
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    }
  };

  const images = Array.from(iframeDoc.getElementsByTagName('img'));
  if (images.length === 0) {
    setTimeout(triggerPrint, 150);
  } else {
    let loadedCount = 0;
    const checkDone = () => {
      loadedCount++;
      if (loadedCount >= images.length) {
        setTimeout(triggerPrint, 120);
      }
    };
    images.forEach((img) => {
      if (img.complete) {
        checkDone();
      } else {
        img.onload = checkDone;
        img.onerror = checkDone;
      }
    });
    // Fallback timer if an image hangs
    setTimeout(triggerPrint, 800);
  }
}
