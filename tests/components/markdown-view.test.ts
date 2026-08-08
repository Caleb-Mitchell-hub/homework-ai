/**
 * MarkdownView 渲染测试 (核心 + 关键清洗逻辑)
 *
 * 完整组件渲染需要 React + happy-dom (太重),
 * 这里直接测核心转换函数: marked.parse + stripThinkTags
 */

import { describe, it, expect } from 'vitest';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';

function stripThinkTags(md: string): string {
  return md.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

const marked = new Marked();
marked.use({ gfm: true });
marked.use(markedKatex({ throwOnError: false }));

function md2html(md: string): string {
  const cleaned = stripThinkTags(md);
  return marked.parse(cleaned, { async: false }) as string;
}

describe('MarkdownView 核心', () => {
  it('剥离 <think>...</think> 思维链', () => {
    const input = '<think>The user is asking about closures</think>## 答案\n闭包是...';
    expect(md2html(input)).not.toContain('think');
    expect(md2html(input)).toContain('<h2');
  });

  it('剥离多个 think 块', () => {
    const input = '<think>foo</think>正文<think>bar</think>';
    const html = md2html(input);
    expect(html).not.toMatch(/think/i);
    expect(html).toContain('正文');
  });

  it('无 think 时输出原 markdown', () => {
    const input = '# Hello\n\n- a\n- b';
    const html = md2html(input);
    expect(html).toContain('<h1');
    expect(html).toContain('<ul>');
  });

  it('渲染代码块并保留语言标识', () => {
    const input = '```python\ndef f(): pass\n```';
    const html = md2html(input);
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('python');
  });

  it('渲染行内公式 $E=mc^2$', () => {
    const input = '爱因斯坦: $E=mc^2$';
    const html = md2html(input);
    expect(html).toMatch(/katex|math/);
  });

  it('渲染块级公式 $$...$$', () => {
    const input = '$$\\int_0^1 x dx = 1/2$$';
    const html = md2html(input);
    expect(html).toMatch(/katex-display|katex/);
  });

  it('渲染 GFM 表格', () => {
    const input = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = md2html(input);
    expect(html).toContain('<table>');
    expect(html).toContain('<th');
  });

  it('渲染任务列表', () => {
    const input = '- [x] done\n- [ ] todo';
    const html = md2html(input);
    expect(html).toContain('type="checkbox"');
  });

  it('空字符串返回空', () => {
    expect(md2html('')).toBe('');
  });

  it('纯 think 块返回空', () => {
    expect(md2html('<think>foo</think>')).toBe('');
  });
});

describe('wrapBareCodeBlocks', () => {
  function wrap(md: string): string {
    const langs = ['python', 'javascript', 'js', 'typescript', 'ts', 'bash', 'sh', 'shell', 'sql', 'java', 'cpp', 'c', 'go', 'rust', 'json', 'xml', 'html', 'css'];
    const langPattern = langs.join('|');
    let preprocessed = md.replace(
      new RegExp(`(^|\\n)([ \\t]*(${langPattern})[ \\t]+)([^\\n]+)`, 'gi'),
      (match, prefix, head, lang, code) => {
        const trimmed = code.trim();
        const codeSignals = /[=(){}\[\];:'"`<>]|import |from |const |let |var |function |def |class |return |if |for |while |echo |SELECT |#|\.|\$|->|interface |type |struct |fn |pub |impl |new |null |true |false/;
        const hasChinese = /[一-龥]/.test(trimmed);
        if (hasChinese) return match;
        const isLikelyCode = codeSignals.test(trimmed) && trimmed.length >= 4;
        if (!isLikelyCode) return match;
        return `${prefix}\`\`\`${lang.toLowerCase()}\n${trimmed}\n\`\`\``;
      }
    );
    const lines = preprocessed.split('\n');
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(new RegExp(`^\\s*(${langPattern})\\s*[:：]?\\s*$`, 'i'));
      if (m) {
        const lang = m[1].toLowerCase();
        const codeLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== '') {
          if (new RegExp(`^\\s*(${langPattern})\\s*[:：]?\\s*$`, 'i').test(lines[j])) break;
          codeLines.push(lines[j]);
          j++;
        }
        if (codeLines.length > 0) {
          out.push('```' + lang);
          out.push(...codeLines);
          out.push('```');
          out.push('');
          i = j;
          continue;
        }
      }
      out.push(line);
      i++;
    }
    return out.join('\n');
  }

  it('包裹独立 python 一行 + 多行代码', () => {
    const input = '题目描述\npython\nx = 1\ny = 2\n\n下一段';
    const out = wrap(input);
    expect(out).toContain('```python');
    expect(out).toContain('x = 1');
    expect(out).toContain('y = 2');
  });

  it('包裹 python: 写法', () => {
    const input = 'python:\nimport numpy as np';
    const out = wrap(input);
    expect(out).toContain('```python');
    expect(out).toContain('import numpy as np');
  });

  it('支持多种语言', () => {
    for (const lang of ['js', 'ts', 'bash', 'sql', 'go']) {
      const out = wrap(`${lang}\ncode here`);
      expect(out).toContain('```' + lang);
    }
  });

  it('没有代码头时不改写', () => {
    const input = 'just text\nmore text';
    expect(wrap(input)).toBe(input);
  });

  it('独立一行 lang 但下面没代码时不改', () => {
    const input = 'python\n\n下一段';
    expect(wrap(input)).toBe(input);
  });

  it('识别行内 `python X3 = np.hstack(...)` (用户实际场景)', () => {
    const input = '以下代码产生的拟合效果属于什么类型\npython X3 = np.hstack([X, X2, X3, X4, X5, X6, X7, X8, X9, X**10]) estimator.fit(X3, y)';
    const out = wrap(input);
    expect(out).toContain('```python');
    expect(out).toContain('X3 = np.hstack');
    expect(out).not.toMatch(/^python X3/m); // 不再保留裸的 "python X3 ="
  });

  it('识别 js / ts 行内代码', () => {
    expect(wrap('js const x = 1')).toContain('```js');
    expect(wrap('typescript interface Foo { x: number }')).toContain('```typescript');
  });

  it('不会误识别普通英文文本', () => {
    // 没有 lang 关键字 → 不动
    expect(wrap('python is great')).toBe('python is great');
    expect(wrap('javascript tutorial')).toBe('javascript tutorial');
  });
});