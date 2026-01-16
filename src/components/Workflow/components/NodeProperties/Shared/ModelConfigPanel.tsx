import { ChevronDown, Settings2 } from 'lucide-react';
import { WorkflowNodeData } from '../../../types';
import { SharedInput } from '../../Shared/SharedInput';

interface ModelConfigPanelProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  globalConfig: any;
  allPresets: any;
  consolidatedModelList: string[];
  isMobile?: boolean;
}

export const ModelConfigPanel = ({
  data,
  onUpdate,
  globalConfig,
  allPresets,
  consolidatedModelList,
  isMobile = false
}: ModelConfigPanelProps) => {
  const containerClass = isMobile ? "space-y-4" : "grid grid-cols-2 gap-4";
  const inputClass = isMobile 
    ? "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-xs text-white outline-none"
    : "w-full bg-[#161922] border border-indigo-900/30 rounded-lg px-3 py-2 text-xs text-gray-100 outline-none focus:border-indigo-500 transition-all";
  
  const labelClass = isMobile 
    ? "text-[10px] text-gray-400 font-bold uppercase tracking-widest"
    : "text-[10px] text-indigo-400 font-bold uppercase";

  return (
    <div className={isMobile ? "space-y-5 bg-gray-800/30 p-4 rounded-3xl border border-gray-700/50" : "space-y-4"}>
      {/* API 快速选择器 */}
      <div className="space-y-2">
        <label className={labelClass}>
          {!isMobile && <Settings2 className="w-3 h-3 inline mr-1.5" />}
          快速同步 API 设置
        </label>
        <div className="relative">
          <select
            className={inputClass}
            value=""
            onChange={(e) => {
              const [key, url] = e.target.value.split('|');
              if (key && url) {
                onUpdate({ apiKey: key, baseUrl: url });
              }
            }}
          >
            <option value="" disabled>{isMobile ? "选择已有配置..." : "从现有配置中选择以自动填充..."}</option>
            {(() => {
              const apis: any[] = [];
              if (globalConfig?.apiKey) apis.push({ name: '主设置 API', key: globalConfig.apiKey, url: globalConfig.baseUrl });
              Object.values(allPresets).flat().forEach((p: any) => {
                if (p.apiConfig?.apiKey && p.apiConfig?.baseUrl) {
                  apis.push({ name: `预设: ${p.name}`, key: p.apiConfig.apiKey, url: p.apiConfig.baseUrl });
                }
              });
              // 去重
              return apis.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i).map((api, idx) => (
                <option key={idx} value={`${api.key}|${api.url}`}>{api.name} ({api.url})</option>
              ));
            })()}
          </select>
          {isMobile && <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />}
        </div>
      </div>

      <div className={containerClass}>
        <div className={`space-y-2 ${!isMobile ? "col-span-2" : ""}`}>
          <label className={labelClass}>API Key</label>
          <SharedInput
            type="password"
            value={data.apiKey || ''}
            onValueChange={(val) => onUpdate({ apiKey: val })}
            placeholder="不填则使用全局设置..."
            className={inputClass}
          />
        </div>
        <div className={`space-y-2 ${!isMobile ? "col-span-2" : ""}`}>
          <label className={labelClass}>API Base URL</label>
          <SharedInput
            value={data.baseUrl || ''}
            onValueChange={(val) => onUpdate({ baseUrl: val })}
            placeholder="例如: https://api.openai.com/v1"
            className={inputClass}
          />
        </div>
        <div className={`space-y-2 ${!isMobile ? "col-span-2" : ""}`}>
          <label className={labelClass}>执行模型 (Model ID)</label>
          <div className={isMobile ? "relative" : "flex gap-2"}>
            {!isMobile && (
              <SharedInput
                value={data.model || ''}
                onValueChange={(val) => onUpdate({ model: val })}
                placeholder="手动输入..."
                className="flex-1 bg-[#161922] border border-indigo-900/30 rounded-lg px-3 py-2 text-xs text-gray-100 outline-none focus:border-indigo-500 font-mono"
              />
            )}
            <select
              className={isMobile ? inputClass : "w-32 bg-[#161922] border border-gray-700 rounded-lg px-2 text-[10px] text-gray-400 outline-none cursor-pointer"}
              onChange={(e) => onUpdate({ model: e.target.value })}
              value={isMobile ? (data.model || '') : ""}
            >
              <option value="" disabled>{isMobile ? "选择模型..." : "快速选择..."}</option>
              {consolidatedModelList.map((m: any) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {isMobile && <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />}
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-[10px] text-gray-400 uppercase">多样性 (Temp): {data.temperature ?? 0.7}</label>
          <input
            type="range" min="0" max="2" step="0.1"
            value={data.temperature ?? 0.7}
            onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-gray-400 uppercase">核采样 (Top P): {data.topP ?? 1}</label>
          <input
            type="range" min="0" max="1" step="0.05"
            value={data.topP ?? 1}
            onChange={(e) => onUpdate({ topP: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-gray-400 uppercase">最大长度</label>
          <SharedInput
            type="number"
            value={data.maxTokens || ''}
            onValueChange={(val) => onUpdate({ maxTokens: parseInt(val) || undefined })}
            placeholder="默认"
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-gray-400 uppercase">Top K</label>
          <SharedInput
            type="number"
            value={data.topK || ''}
            onValueChange={(val) => onUpdate({ topK: parseInt(val) || undefined })}
            placeholder="默认"
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
};