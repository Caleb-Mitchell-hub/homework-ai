/**
 * 从 AI 返回的原始文本中提取并解析 JSON 对象。
 * AI 经常返回非标准 JSON（末尾多余文本、markdown 代码块包裹、被 maxTokens 截断、
 * 字符串值内含未转义双引号等），此函数尝试多种策略提取有效的 JSON。
 */

/** 修复 JSON 字符串值内未转义的双引号（如中文引号 "xxx"） */
function fixUnescapedQuotes(text: string): string {
  // 匹配模式：双引号前后是字母/数字/中文（不是 JSON 结构字符 :,{}[] 空白等）
  // 这类 " 大概率是内容中的引号而非 JSON 分隔符
  return text.replace(
    /([\w一-鿿　-〿＀-￯])"([\w一-鿿　-〿＀-￯])/g,
    '$1\\"$2',
  );
}

export function extractJson<T = any>(raw: string): T {
  // 策略1：直接解析
  try { return JSON.parse(raw) as T; } catch { /* 继续 */ }

  // 策略2：修复未转义引号后直接解析
  try { return JSON.parse(fixUnescapedQuotes(raw)) as T; } catch { /* 继续 */ }

  // 策略3：提取 markdown 代码块中的 JSON
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const block = codeBlockMatch[1].trim();
    try { return JSON.parse(block) as T; } catch {/* 继续 */}
    try { return JSON.parse(fixUnescapedQuotes(block)) as T; } catch {/* 继续 */}
  }

  // 策略4：找到第一个 { 和对应的 }，提取最外层 JSON 对象
  const firstBrace = raw.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0, inString = false, escape = false;
    for (let i = firstBrace; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"' && !inString) { inString = true; continue; }
      if (ch === '"' && inString) { inString = false; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = raw.slice(firstBrace, i + 1);
          try { return JSON.parse(candidate) as T; } catch {/* 继续 */}
          try { return JSON.parse(fixUnescapedQuotes(candidate)) as T; } catch { break; }
        }
      }
    }
  }

  // 策略5：截断修复 — AI 返回被 maxTokens 截断，补全缺失的 } ] "
  if (firstBrace !== -1) {
    const truncated = raw.slice(firstBrace);
    const needed: string[] = [];
    let inStr = false, esc = false;
    for (let i = 0; i < truncated.length; i++) {
      const ch = truncated[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') needed.push('}');
      else if (ch === '[') needed.push(']');
      else if (ch === '}') {
        if (needed[needed.length - 1] === '}') needed.pop();
      } else if (ch === ']') {
        if (needed[needed.length - 1] === ']') needed.pop();
      }
    }
    // 补全截断的字符串 + 缺失的闭合符号
    const suffix = (inStr ? '"' : '') + needed.reverse().join('');
    if (suffix) {
      const patched = truncated + suffix;
      try { return JSON.parse(patched) as T; } catch {/* 继续 */}
      try { return JSON.parse(fixUnescapedQuotes(patched)) as T; } catch {/* 继续 */}
    }
  }

  // 所有策略都失败
  throw new SyntaxError('AI 返回格式异常，请稍后重试');
}
