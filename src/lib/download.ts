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

/** 打包多个 Markdown 文件为 zip 并下载（同名文件自动追加序号，避免 zip 内覆盖丢文件） */
export async function downloadZip(filename: string, files: { name: string; content: string }[]) {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    const base = sanitizeFilename(f.name);
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) {
      candidate = `${base} (${i})`;
      i++;
    }
    used.add(candidate);
    zip.file(`${candidate}.md`, f.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${sanitizeFilename(filename)}.zip`, 'application/zip');
}
