export interface ProviderPreset {
  label: string;
  baseURL: string;
  model: string;
  visionModel?: string;
  supportsVision: boolean;
}

export const PRESETS: Record<string, ProviderPreset> = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    supportsVision: false,
  },
  doubao: {
    label: '豆包',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-pro-32k-250115',
    visionModel: 'doubao-1-5-vision-pro-250315',
    supportsVision: true,
  },
  qwen: {
    label: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    visionModel: 'qwen-vl-plus',
    supportsVision: true,
  },
  zhipu: {
    label: '智谱',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    visionModel: 'glm-4v-plus',
    supportsVision: true,
  },
  custom: {
    label: '自定义',
    baseURL: '',
    model: '',
    supportsVision: false,
  },
};

export function getPreset(key: string): ProviderPreset {
  return PRESETS[key] ?? PRESETS.custom;
}