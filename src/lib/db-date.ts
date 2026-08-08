/**
 * MySQL DATETIME 列不携带时区信息。MySQL @@global.time_zone = +08:00，
 * NOW() 返回北京时间。但 mysql2 驱动将无时区的 DATETIME 字符串按 UTC
 * 解析，导致 JavaScript Date 比实际北京时间提前 8 小时。
 *
 * 此模块提供修正函数，将 Prisma 返回的 Date 统一减去 8 小时，
 * 使其代表正确的 UTC 瞬时，最终在前端 toLocaleString() 时显示正确的北京时间。
 */

import { NextResponse } from 'next/server';

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000; // +08:00 → UTC

/** 将 Prisma 返回的 "假 UTC" Date 修正为正确的 UTC 瞬时 */
export function fixDbDate(d: Date | string | null | undefined): Date | null {
  if (d == null) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return null;
  return new Date(date.getTime() - BEIJING_OFFSET_MS);
}

/**
 * 递归修正对象中所有 Date 实例（深层遍历），
 * 修正后 Date 变为 ISO 字符串以避免 JSON.stringify 再次序列化。
 */
function fixDatesDeep(obj: unknown): unknown {
  if (obj instanceof Date) {
    return new Date(obj.getTime() - BEIJING_OFFSET_MS).toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(fixDatesDeep);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = fixDatesDeep(value);
    }
    return result;
  }
  return obj;
}

/**
 * 与 NextResponse.json 用法相同，但自动修正所有 Date 的时区偏移。
 * 用法：return jsonFixed(data) 替代 return NextResponse.json(data)
 */
export function jsonFixed(data: unknown, init?: ResponseInit) {
  return NextResponse.json(fixDatesDeep(data), init);
}

/**
 * 修正从 API JSON 反序列化后的日期字符串。
 * fetch → json() 后 Date 变成了 ISO string，前端调用此函数
 * 创建正确的 Date（减去 8 小时偏移），然后 toLocaleString() 即可显示北京时间。
 */
export function parseFixedDate(isoString: string): Date {
  const d = new Date(isoString);
  return new Date(d.getTime() - BEIJING_OFFSET_MS);
}
