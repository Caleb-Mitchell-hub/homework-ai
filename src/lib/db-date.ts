/**
 * MySQL DATETIME 列不携带时区信息。
 *
 * MySQL @@global.time_zone = +08:00，NOW() 返回北京时间。
 * mysql2 驱动已知 session timezone = +08:00，会自动将 DATETIME 值
 * 转换为正确的 UTC 瞬时（JS Date）。
 *
 * 因此 Prisma 返回的 Date 已经是正确的 UTC 时间，
 * 不需要额外修正。此模块仅作为 NextResponse.json 的透传封装。
 */

import { NextResponse } from 'next/server';

export function jsonFixed(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
