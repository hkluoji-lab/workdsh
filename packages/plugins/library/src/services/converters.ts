import JSZip from 'jszip';
import type { LibraryAssetKind } from 'workdsh-contracts/library';

export interface ConversionResult {
  readonly markdown: string;
  readonly warnings: readonly string[];
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (value: string): string => value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
  if (code[0] !== '#') return entities[code] ?? whole;
  const point = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
  return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
});
const textNodes = (xml: string): string[] => [...xml.matchAll(/<(?:w:t|a:t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t)>/g)]
  .map((match) => decodeXml(match[1] ?? '').trim()).filter(Boolean);

async function docx(bytes: Uint8Array): Promise<ConversionResult> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('text');
  if (!xml) throw new Error('library/invalid-docx');
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
    .map((match) => textNodes(match[1] ?? '').join('')).filter(Boolean);
  return { markdown: `${paragraphs.join('\n\n')}\n`, warnings: ['复杂版式、图片和嵌入对象未写入检索文本。'] };
}

async function pptx(bytes: Uint8Array): Promise<ConversionResult> {
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
  if (!slides.length) throw new Error('library/invalid-pptx');
  const sections: string[] = [];
  for (let index = 0; index < slides.length; index += 1) {
    const xml = await zip.file(slides[index]!)!.async('text');
    const values = textNodes(xml);
    sections.push(`## 第 ${index + 1} 页${values[0] ? `：${values[0]}` : ''}\n\n${values.slice(values[0] ? 1 : 0).join('\n\n')}`);
  }
  return { markdown: `${sections.join('\n\n')}\n`, warnings: ['图片、图表、动画和空间布局未写入检索文本。'] };
}

async function pdf(bytes: Uint8Array): Promise<ConversionResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false }).promise;
  const sections: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => 'str' in item ? item.str : '').filter(Boolean).join(' ');
    sections.push(`## 第 ${pageNumber} 页\n\n${text}`);
  }
  return { markdown: `${sections.join('\n\n')}\n`, warnings: document.numPages && sections.every((section) => !section.trim()) ? ['文件可能是扫描件，首版未启用 OCR。'] : [] };
}

export async function convertToMarkdown(kind: LibraryAssetKind, bytes: Uint8Array): Promise<ConversionResult> {
  if (kind === 'markdown') return { markdown: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n'), warnings: [] };
  if (kind === 'text') return { markdown: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n'), warnings: [] };
  if (kind === 'docx') return docx(bytes);
  if (kind === 'pptx') return pptx(bytes);
  return pdf(bytes);
}

