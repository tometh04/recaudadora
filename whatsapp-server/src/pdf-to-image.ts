/**
 * pdf-to-image.ts
 *
 * Converts the first page of a PDF to a JPEG image using poppler-utils (pdftoppm).
 * This is needed because OpenAI Vision only accepts image formats, not PDFs.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';

/**
 * Convert first page of PDF to JPEG.
 * Returns the path to the generated JPEG file, or null on failure.
 */
export function convertPdfToJpeg(pdfPath: string): string | null {
  try {
    const dir = dirname(pdfPath);
    const base = basename(pdfPath, '.pdf');
    const outputPrefix = join(dir, `${base}_page`);

    // pdftoppm converts PDF pages to images
    // -jpeg: output as JPEG
    // -f 1 -l 1: only first page
    // -r 200: 200 DPI (good quality for OCR)
    execSync(
      `pdftoppm -jpeg -f 1 -l 1 -r 200 "${pdfPath}" "${outputPrefix}"`,
      { timeout: 30000, stdio: 'pipe' }
    );

    // pdftoppm adds page number suffix, find the output file
    const possibleNames = [
      `${outputPrefix}-1.jpg`,
      `${outputPrefix}-01.jpg`,
      `${outputPrefix}-001.jpg`,
    ];

    for (const name of possibleNames) {
      if (existsSync(name)) {
        console.log(`[PDF] Converted ${pdfPath} → ${name}`);
        return name;
      }
    }

    // Try finding any file matching the pattern
    const files = readdirSync(dir).filter(
      (f) => f.startsWith(`${base}_page`) && f.endsWith('.jpg')
    );

    if (files.length > 0) {
      const found = join(dir, files[0]);
      console.log(`[PDF] Converted ${pdfPath} → ${found}`);
      return found;
    }

    console.error(`[PDF] No output file found after conversion`);
    return null;
  } catch (err) {
    console.error(`[PDF] Conversion error:`, err);
    return null;
  }
}

/**
 * Read a file and return its base64 data URL.
 */
export function fileToBase64DataUrl(filePath: string, mimeType: string = 'image/jpeg'): string {
  const buffer = readFileSync(filePath);
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}
