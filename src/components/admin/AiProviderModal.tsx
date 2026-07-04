'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { PRESETS } from '@/lib/ai/providers-presets';

interface Provider {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  model: string;
  visionModel: string | null;
  supportsVision: boolean;
  isActive: boolean;
}

interface Props {
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function AiProviderModal({ provider, onClose, onSaved }: Props) {
  const { token } = useAdminAuth();
  const isEdit = !!provider;
  const [preset, setPreset] = useState(provider?.provider ?? 'deepseek');
  const [name, setName] = useState(provider?.name ?? '');
  const [baseURL, setBaseURL] = useState(provider?.baseURL ?? PRESETS.deepseek.baseURL);
  const [model, setModel] = useState(provider?.model ?? PRESETS.deepseek.model);
  const [apiKey, setApiKey] = useState('');
  const [visionModel, setVisionModel] = useState(provider?.visionModel ?? '');
  const [supportsVision, setSupportsVision] = useState(provider?.supportsVision ?? false);
  const [isActive, setIsActive] = useState(provider?.isActive ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isEdit) return;
    const p = PRESETS[preset];
    if (p) {
      setBaseURL(p.baseURL);
      setModel(p.model);
      setVisionModel(p.visionModel ?? '');
      setSupportsVision(p.supportsVision);
    }
  }, [preset, isEdit]);

  const onSubmit = async () => {
    setErr('');
    if (!name.trim()) { setErr('请输入名称'); return; }
    if (!isEdit && !apiKey.trim()) { setErr('请输入 API Key'); return; }
    setSaving(true);
    const body: Record<string, unknown> = {
      name, provider: preset, baseURL, model,
      visionModel: supportsVision ? visionModel : null,
      supportsVision, isActive,
    };
    if (!isEdit) body.apiKey = apiKey;
    else if (apiKey) body.apiKey = apiKey;

    const url = isEdit ? `/api/admin/ai/providers/${provider.id}` : '/api/admin/ai/providers';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? '保存失败');
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          {isEdit ? '编辑厂商' : '新增厂商'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">厂商</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              disabled={isEdit}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400"
            >
              {Object.entries(PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如 DeepSeek 主用"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">Base URL</label>
            <input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">模型</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">
              API Key {isEdit && <span className="text-slate-400">(留空不修改)</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit ? '****' : 'sk-...'}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sv"
              checked={supportsVision}
              onChange={(e) => setSupportsVision(e.target.checked)}
            />
            <label htmlFor="sv" className="text-[12px] text-slate-600">启用视觉模型(图片 OCR)</label>
          </div>
          {supportsVision && (
            <div>
              <label className="block text-[12px] text-slate-600 mb-1">视觉模型</label>
              <input
                value={visionModel ?? ''}
                onChange={(e) => setVisionModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ia"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="ia" className="text-[12px] text-slate-600">设为激活厂商</label>
          </div>
          {err && <div className="text-[12px] text-rose-600">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
          <button
            onClick={onSubmit}
            disabled={saving}
            className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
