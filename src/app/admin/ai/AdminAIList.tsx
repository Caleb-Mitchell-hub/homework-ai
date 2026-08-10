'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AiProviderModal from '@/components/admin/AiProviderModal';

interface Provider {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  apiKeyLast4: string;
  model: string;
  visionModel: string | null;
  supportsVision: boolean;
  isActive: boolean;
  createdAt: string;
}

export default function AdminAIList() {
  const { token } = useAdminAuth();
  const [list, setList] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch('/api/admin/ai/providers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setList(data.providers ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const onTest = async (id: string) => {
    const res = await fetch(`/api/admin/ai/providers/${id}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok) {
      const parts = [
        `✓ 连接成功`,
        `Ping: ${data.results?.ping?.latencyMs ?? '?'}ms`,
        `Stream: ${data.results?.stream?.latencyMs ?? '?'}ms`,
        data.results?.jsonMode
          ? `JSON模式: ${data.results.jsonMode.latencyMs}ms`
          : 'JSON模式: 不支持',
        `模型: ${data.model}`,
      ];
      if (data.warnings?.length) {
        parts.push(`\n⚠ ${data.warnings.join('\n')}`);
      }
      alert(parts.join(' · '));
    } else {
      const errParts = [`✗ 失败`];
      if (data.results?.ping?.error) errParts.push(`Ping: ${data.results.ping.error}`);
      if (data.results?.stream?.error) errParts.push(`Stream: ${data.results.stream.error}`);
      if (!data.results?.ping?.error && !data.results?.stream?.error && data.error) {
        errParts.push(data.error);
      }
      alert(errParts.join('\n'));
    }
  };

  const onActivate = async (id: string) => {
    await fetch('/api/admin/ai/active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ providerId: id }),
    });
    load();
  };

  const onDelete = async (id: string) => {
    if (!confirm('确认删除该厂商?')) return;
    await fetch(`/api/admin/ai/providers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">AI 厂商配置</h1>
          <p className="text-sm text-slate-500 mt-1">管理系统用于题目解析的 AI 厂商与 API 凭据</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-medium"
        >
          + 新增厂商
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-slate-500">还没有配置任何 AI 厂商</p>
          <p className="text-xs text-slate-400 mt-1">用户上传题目后,本地解析仍可作为兜底</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <div
              key={p.id}
              className={`p-4 rounded-xl border bg-white ${
                p.isActive ? 'border-sky-300 shadow-sm ring-1 ring-sky-100' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="font-medium text-slate-800">{p.name}</span>
                    {p.isActive && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[11px] rounded-full">激活中</span>
                    )}
                  </div>
                  <div className="text-[12px] text-slate-500 font-mono truncate">
                    {p.model} · {p.baseURL}
                  </div>
                  <div className="text-[12px] text-slate-400 mt-1">
                    视觉: {p.supportsVision ? `✓ ${p.visionModel}` : '✗'}
                    <span className="ml-3">Key: ****{p.apiKeyLast4}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => onTest(p.id)} className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded">测试连接</button>
                  {!p.isActive && (
                    <button onClick={() => onActivate(p.id)} className="px-2.5 py-1 text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded">设为激活</button>
                  )}
                  <button onClick={() => setEditing(p)} className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded">编辑</button>
                  <button onClick={() => onDelete(p.id)} className="px-2.5 py-1 text-[11px] bg-rose-100 hover:bg-rose-200 text-rose-700 rounded">删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <AiProviderModal
          provider={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
