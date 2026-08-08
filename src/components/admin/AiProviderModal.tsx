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
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelList, setModelList] = useState<{ id: string; tag?: string }[]>([]);
  const [fetchModelsErr, setFetchModelsErr] = useState('');

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

  const handleFetchModels = async () => {
    setFetchModelsErr('');
    setFetchingModels(true);
    setModelList([]);
    try {
      const body: Record<string, unknown> = { baseURL, apiKey };
      // 编辑模式: 传 providerId 让后端从 DB 解密密钥, 避免编辑时必须重输 API Key
      if (isEdit && provider) {
        body.providerId = provider.id;
      }
      const res = await fetch('/api/admin/ai/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchModelsErr(data.error ?? '拉取失败');
        return;
      }
      setModelList(data.models ?? []);
      // 如果当前 model 为空且拉到了模型,自动选第一个
      if (!model.trim() && data.models?.length > 0) {
        setModel(data.models[0].id);
      }
    } catch (e: any) {
      setFetchModelsErr(e?.message ?? '网络错误');
    } finally {
      setFetchingModels(false);
    }
  };

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
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] text-slate-600">模型</label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={!baseURL.trim() || (!isEdit && !apiKey.trim()) || fetchingModels}
                title={!baseURL.trim() ? '请先填写 Base URL' : !isEdit && !apiKey.trim() ? '请先填写 API Key' : '从厂商拉取可用模型列表'}
                className="text-[11px] text-sky-600 hover:text-sky-700 disabled:text-slate-300 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {fetchingModels ? (
                  <><span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" /> 拉取中…</>
                ) : (
                  <>📡 拉取模型</>
                )}
              </button>
            </div>
            {fetchModelsErr && (
              <div className="text-[11px] text-rose-500 mb-1">{fetchModelsErr}</div>
            )}
            {modelList.length > 0 && (
              <div className="text-[10px] text-slate-400 mb-1">已拉取 {modelList.length} 个模型,可从下拉选择或手动输入</div>
            )}
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              list="model-datalist"
              placeholder="模型 ID, 如 deepseek-chat"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
            />
            <datalist id="model-datalist">
              {modelList.map((m) => (
                <option key={m.id} value={m.id} label={m.tag ? `${m.tag} | ${m.id}` : m.id} />
              ))}
            </datalist>
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
                list="vision-model-datalist"
                placeholder="视觉模型 ID, 如 gpt-4o"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
              />
              <datalist id="vision-model-datalist">
                {modelList.filter((m) => m.tag?.includes('视觉')).map((m) => (
                  <option key={m.id} value={m.id} label={m.id} />
                ))}
              </datalist>
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
