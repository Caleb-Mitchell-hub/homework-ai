import { NextResponse } from 'next/server';

// 运行时信息端点：供 Serviced-MP 管理平台拉取
// 规范见 E:\WorkSpace\Project\Serviced_MP\API文档-服务注册规范.md
export async function GET() {
  return NextResponse.json({
    status: 'running',
    pid: process.pid,
    urls: [
      { name: 'Web 界面', url: 'http://localhost:3000' },
      { name: 'API', url: 'http://localhost:3000/api' },
    ],
  });
}
