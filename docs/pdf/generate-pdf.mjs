import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'senlo-client-brief.html').replace(/\\/g, '/');
const pdfPath = path.join(__dirname, 'Senlo-Client-Brief-2026.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(`file:///${htmlPath}`, { waitUntil: 'networkidle', timeout: 30000 });

// Wait for fonts
await page.waitForTimeout(3000);

await page.pdf({
  path: pdfPath,
  width: '297mm',
  height: '210mm',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  preferCSSPageSize: true,
});

console.log(`PDF saved: ${pdfPath}`);
await browser.close();
