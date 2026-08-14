'use client';

import JSZip from 'jszip';

/** 清理文件名中的非法字符 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || '导出';
}

/** 触发浏览器下载 Blob */
export function downloadBlob(data: string | Blob, filename: string, mime: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 下载单个 Markdown 文件 */
export function downloadMarkdown(filename: string, content: string) {
  downloadBlob(content, `${sanitizeFilename(filename)}.md`, 'text/markdown');
}

/** 打包多个 Markdown 文件为 zip 并下载 */
export async function downloadZip(filename: string, files: { name: string; content: string }[]) {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(`${sanitizeFilename(f.name)}.md`, f.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${sanitizeFilename(filename)}.zip`, 'application/zip');
}
