import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';

/**
 * GET /api/admin/credits/export
 * Query: ?type=ledger|users&from=&to=&reason=
 *
 *  - type=ledger: 导出流水 CSV
 *  - type=users: 导出用户积分表 CSV
 *
 * CSV 用 UTF-8 BOM + Excel-friendly format
 */

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'ledger';
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';
    const reason = url.searchParams.get('reason') || '';

    let csv = '';
    let filename = '';

    if (type === 'users') {
      // ── 用户积分表 ──
      const users = await prisma.user.findMany({
        where: { isGuest: false },
        orderBy: { credits: 'desc' },
        select: {
          username: true,
          occupation: true,
          credits: true,
          disabled: true,
          createdAt: true,
          lastActiveAt: true,
          profession: { select: { name: true } },
          _count: { select: { creditLogs: true, explanations: true, checkIns: true } },
        },
      });
      csv =
        [
          ['用户名', '职业', '积分余额', '状态', '流水数', '签到次数', 'AI解析数', '注册时间', '最后活跃'].join(','),
          ...users.map((u) =>
            [
              csvEscape(u.username),
              csvEscape(u.occupation ?? u.profession?.name ?? ''),
              u.credits,
              u.disabled ? '停用' : '正常',
              u._count.creditLogs,
              u._count.checkIns,
              u._count.explanations,
              csvEscape(u.createdAt.toISOString().replace('T', ' ').slice(0, 19)),
              csvEscape(u.lastActiveAt?.toISOString().replace('T', ' ').slice(0, 19) ?? ''),
            ].join(',')
          ),
        ].join('\n');
      filename = `用户积分_${new Date().toISOString().slice(0, 10)}.csv`;
    } else {
      // ── 流水 ──
      const where: any = {};
      if (reason) where.reason = reason;
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) {
          const t = new Date(to);
          t.setHours(23, 59, 59, 999);
          where.createdAt.lte = t;
        }
      }

      const rows = await prisma.creditLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100000, // 安全上限
        include: {
          user: {
            select: {
              username: true,
              occupation: true,
              profession: { select: { name: true } },
            },
          },
        },
      });
      csv =
        [
          ['时间', '用户', '职业', '变动', '余额', '原因', '关联ID'].join(','),
          ...rows.map((r) =>
            [
              csvEscape(r.createdAt.toISOString().replace('T', ' ').slice(0, 19)),
              csvEscape(r.user.username),
              csvEscape(r.user.occupation ?? r.user.profession?.name ?? ''),
              r.delta,
              r.balance,
              csvEscape(r.reason),
              csvEscape(r.refId ?? ''),
            ].join(',')
          ),
        ].join('\n');
      filename = `积分流水_${new Date().toISOString().slice(0, 10)}.csv`;
    }

    // 加 UTF-8 BOM,Excel 才能正确识别中文
    const body = '﻿' + csv;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('导出失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
