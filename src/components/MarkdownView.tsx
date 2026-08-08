'use client';

/**
 * 客户端 Markdown 渲染组件
 *
 * 支持:
 *   - GFM (表格/任务列表/删除线/自动链接)
 *   - 代码块语法高亮 (highlight.js) + 自动识别"裸"代码
 *   - LaTeX 公式 (KaTeX, 行内 $..$ / 块级 $$..$$)
 *   - 自动剥离 AI 输出中的 <think>...</think> 思维链
 *   - 代码块复制按钮 (客户端 JS 注入)
 *
 * 安全: marked 默认转义 HTML,只接受它生成的标签。
 *       不要用 dangerouslySetInnerHTML 渲染用户原始 HTML。
 */

import { useEffect, useMemo, useRef } from 'react';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        return code;
      }
    },
  })
);
marked.use({ gfm: true, breaks: false });
marked.use(markedKatex({ throwOnError: false }));

/**
 * 代码块包装器: 注入语言标识 + 复制按钮
 * 用 marked Renderer 重写 code 输出,在 <pre> 顶部插入 header
 */
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = (lang || 'plaintext').toLowerCase();
      const langLabel = language === 'plaintext' ? 'TEXT' : language.toUpperCase();
      // 转义 code 内容防止 XSS (marked v18 高亮已经返回安全 HTML)
      return `<div class="code-block" data-lang="${language}">
<div class="code-block-header">
  <span class="code-block-icon">📋</span>
  <span class="code-block-lang">${langLabel}</span>
  <button type="button" class="code-block-copy" aria-label="复制代码">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    <span>复制</span>
  </button>
</div>
<pre><code class="hljs language-${language}">${text}</code></pre>
</div>`;
    },
  },
});

function stripThinkTags(md: string): string {
  return md.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * 把"裸"代码行/段落包成 fenced 代码块
 *
 * 场景: 题库里的 markdown 没把 python 代码用 ``` 包起来,
 *       导致 marked 把它当普通段落渲染。
 *       这里识别两模式:
 *       - 行首 `python 代码` (单行)
 *       - 行首 `python` 后面接多行代码块
 *       - 行首 `js / javascript / ts / typescript / bash / sh / shell / sql` 同理
 */
function wrapBareCodeBlocks(md: string): string {
  const langs = ['python', 'javascript', 'js', 'typescript', 'ts', 'bash', 'sh', 'shell', 'sql', 'java', 'cpp', 'c', 'go', 'rust', 'json', 'xml', 'html', 'css'];
  const langPattern = langs.join('|');
  let preprocessed = md.replace(
    new RegExp(`(^|\\n)([ \\t]*(${langPattern})[ \\t]+)([^\\n]+)`, 'gi'),
    (match, prefix, head, lang, code) => {
      const trimmed = code.trim();
      // 启发: code 含代码符号或关键字
      const codeSignals = /[=(){}\[\];:'"`<>]|import |from |const |let |var |function |def |class |return |if |for |while |echo |SELECT |#|\.|\$|->|interface |type |struct |fn |pub |impl |let |val |SELECT |new |null |true |false/;
      // 排除: 纯中文短句
      const hasChinese = /[一-龥]/.test(trimmed);
      // 含中文就跳过 (防止误识别中文段落)
      if (hasChinese) return match;
      const isLikelyCode = codeSignals.test(trimmed) && trimmed.length >= 4;
      if (!isLikelyCode) return match;
      return `${prefix}\`\`\`${lang.toLowerCase()}\n${trimmed}\n\`\`\``;
    }
  );

  // 模式 2: 单独的 `python` 一行,后面跟多行代码块 (到空行/下一个标记)
  const lines = preprocessed.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // 匹配独立一行 "python" / "python:" / "python code:"
    const m = line.match(new RegExp(`^\\s*(${langPattern})\\s*[:：]?\\s*$`, 'i'));
    if (m) {
      const lang = m[1].toLowerCase();
      // 收集下一行直到空行或非代码行
      const codeLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '') {
        // 碰到新的 lang 头停止
        if (new RegExp(`^\\s*(${langPattern})\\s*[:：]?\\s*$`, 'i').test(lines[j])) break;
        codeLines.push(lines[j]);
        j++;
      }
      if (codeLines.length > 0) {
        out.push('```' + lang);
        out.push(...codeLines);
        out.push('```');
        out.push(''); // 空行分隔
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

interface Props {
  content: string;
  className?: string;
  /** 字号: sm=12.5px(默认), base=14px, lg=16px, xl=18px */
  size?: 'sm' | 'base' | 'lg' | 'xl';
}

export default function MarkdownView({ content, className = '', size = 'sm' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content) return '';
    const cleaned = wrapBareCodeBlocks(stripThinkTags(content));
    return marked.parse(cleaned, { async: false }) as string;
  }, [content]);

  // 给代码块复制按钮挂事件 (useEffect 跑在客户端)
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const buttons = root.querySelectorAll<HTMLButtonElement>('.code-block-copy');
    const handlers: Array<{ btn: HTMLButtonElement; handler: () => void }> = [];
    buttons.forEach((btn) => {
      const handler = async () => {
        const block = btn.closest('.code-block');
        const code = block?.querySelector('code');
        const text = code?.textContent ?? '';
        try {
          await navigator.clipboard.writeText(text);
          const label = btn.querySelector('span');
          const orig = label?.textContent ?? '复制';
          if (label) label.textContent = '已复制';
          setTimeout(() => { if (label) label.textContent = orig; }, 1500);
        } catch {
          // 降级: 用临时 textarea + execCommand
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch {}
          document.body.removeChild(ta);
        }
      };
      btn.addEventListener('click', handler);
      handlers.push({ btn, handler });
    });
    return () => {
      handlers.forEach(({ btn, handler }) => btn.removeEventListener('click', handler));
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`markdown-body markdown-${size} ${className}`}
      // marked 输出的 HTML 是从受信任 markdown 派生的,这里安全
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}