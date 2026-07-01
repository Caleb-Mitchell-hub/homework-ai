import { Document, Packer, Paragraph, TextRun } from 'docx';

export async function generateDocxFixture(lines: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })),
    }],
  });
  return await Packer.toBuffer(doc);
}
