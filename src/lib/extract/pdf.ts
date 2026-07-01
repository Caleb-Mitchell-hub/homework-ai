import { PDFParse } from 'pdf-parse';

export async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { text } = await parser.getText();
    return text ?? '';
  } finally {
    await parser.destroy();
  }
}