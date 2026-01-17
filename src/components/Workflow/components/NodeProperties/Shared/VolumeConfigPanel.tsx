import { FileText, Plus, Repeat, Trash2 } from 'lucide-react';
import { WorkflowNodeData } from '../../../types';
import { SharedInput } from '../../Shared/SharedInput';

interface VolumeConfigPanelProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  isMobile?: boolean;
}

export const VolumeConfigPanel = ({ data, onUpdate, isMobile = false }: VolumeConfigPanelProps) => {
  const containerClass = isMobile ? 'space-y-6' : 'grid grid-cols-2 gap-6';
  const rulesContainerClass = isMobile
    ? 'space-y-4 p-5 bg-teal-500/5 border border-teal-500/20 rounded-3xl'
    : 'space-y-4 col-span-2 p-5 bg-teal-500/5 border border-teal-500/20 rounded-xl';

  const ruleItemClass = isMobile
    ? 'bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 space-y-3'
    : 'grid grid-cols-12 gap-3 items-end bg-gray-900/40 p-3 rounded-lg border border-gray-700/30 group';

  const inputClass = isMobile
    ? 'w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none'
    : 'w-full bg-[#161922] border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-teal-500 transition-all';

  return (
    <div
      className={isMobile ? 'space-y-6 pt-6 border-t border-gray-800' : 'space-y-6 pt-6 border-t border-gray-700/30'}
    >
      <div className="space-y-3">
        <label className="text-[10px] font-bold text-teal-400 uppercase tracking-widest flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" /> 分卷规划内容 (AI 生成/可手动修改)
        </label>
        <textarea
          value={data.volumeContent || ''}
          onChange={e => onUpdate({ volumeContent: e.target.value })}
          placeholder="AI 生成的分卷规划内容将出现在这里，您也可以手动编辑以调整分卷..."
          className={
            isMobile
              ? 'w-full h-48 bg-gray-800 border border-teal-500/30 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed'
              : 'w-full h-48 bg-[#161922] border border-teal-500/30 rounded-lg p-4 text-sm text-gray-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 outline-none resize-none font-mono leading-relaxed transition-all'
          }
        />
      </div>

      <div className={containerClass}>
        {/* 多次分卷触发器 UI */}
        <div className={rulesContainerClass}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-teal-400 font-bold text-[10px] uppercase tracking-wider">
              <Repeat className="w-3.5 h-3.5" /> 自动分卷触发器 (支持多次)
            </div>
            <button
              onClick={() => {
                const currentRules = (data.splitRules || []) as any[];
                // 兼容 Legacy 数据迁移
                const legacyRule =
                  !currentRules.length && data.splitChapterTitle
                    ? [
                        {
                          id: 'legacy',
                          chapterTitle: data.splitChapterTitle,
                          nextVolumeName: data.nextVolumeName || '新分卷',
                        },
                      ]
                    : [];

                const nextRules = [
                  ...(currentRules.length ? currentRules : legacyRule),
                  { id: Date.now().toString(), chapterTitle: '', nextVolumeName: '新分卷' },
                ];
                onUpdate({
                  splitRules: nextRules,
                  // 迁移后清空旧字段以避免逻辑冲突
                  splitChapterTitle: '',
                  nextVolumeName: '',
                });
              }}
              className={
                isMobile
                  ? 'px-2.5 py-1.5 bg-teal-600/20 text-teal-400 rounded-xl text-[10px] font-bold border border-teal-500/30'
                  : 'px-2 py-1 bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 rounded-md text-[10px] font-bold border border-teal-500/30 transition-all'
              }
            >
              <Plus className="w-3 h-3 inline mr-1" /> {isMobile ? '添加规则' : '添加触发点'}
            </button>
          </div>

          <div className="space-y-3">
            {(() => {
              const rules = (data.splitRules || []) as any[];
              // 如果规则列表为空但有旧数据，渲染旧数据项
              if (rules.length === 0 && data.splitChapterTitle) {
                rules.push({
                  id: 'legacy',
                  chapterTitle: data.splitChapterTitle,
                  nextVolumeName: data.nextVolumeName || '新分卷',
                });
              }

              return rules.map((rule, idx) => (
                <div key={rule.id} className={ruleItemClass}>
                  {isMobile && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">规则 #{idx + 1}</span>
                      <button
                        onClick={() => {
                          const nextRules = rules.filter((_, i) => i !== idx);
                          onUpdate({ splitRules: nextRules });
                        }}
                        className="p-1 text-gray-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className={isMobile ? 'space-y-2' : 'col-span-5 space-y-1.5'}>
                    <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">触发章节 (如: 第一章/1)</label>
                    <SharedInput
                      value={rule.chapterTitle}
                      onValueChange={val => {
                        const nextRules = [...rules];
                        nextRules[idx] = { ...rule, chapterTitle: val };
                        onUpdate({ splitRules: nextRules });
                      }}
                      placeholder="例如: 第一章 或 1"
                      className={inputClass}
                    />
                  </div>
                  <div className={isMobile ? 'space-y-2' : 'col-span-5 space-y-1.5'}>
                    <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">新分卷命名</label>
                    <SharedInput
                      value={rule.nextVolumeName}
                      onValueChange={val => {
                        const nextRules = [...rules];
                        nextRules[idx] = { ...rule, nextVolumeName: val };
                        onUpdate({ splitRules: nextRules });
                      }}
                      placeholder={isMobile ? '例如：第二卷...' : '新分卷名称...'}
                      className={inputClass}
                    />
                  </div>
                  {!isMobile && (
                    <div className="col-span-2 flex justify-center pb-1">
                      <button
                        onClick={() => {
                          const nextRules = rules.filter((_, i) => i !== idx);
                          onUpdate({ splitRules: nextRules });
                        }}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ));
            })()}

            {(!data.splitRules || (data.splitRules as any[]).length === 0) && !data.splitChapterTitle && (
              <div
                className={
                  isMobile
                    ? 'text-center py-6 border border-dashed border-gray-700 rounded-3xl'
                    : 'text-center py-6 border border-dashed border-gray-700 rounded-xl'
                }
              >
                <p className="text-[10px] text-gray-600">
                  未设置自动分卷触发器{isMobile ? '。' : '，正文将全部存入初始目标分卷。'}
                </p>
              </div>
            )}
          </div>

          <p className="text-[9px] text-gray-600 leading-relaxed px-1">
            * 工作流运行中每当完成指定章节，将
            {isMobile ? '自动创建并切换至新分卷' : '立即创建新分卷并把后续章节保存至其中'}。
          </p>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 leading-relaxed">
        * 此节点之后生成的正文内容将自动保存到该分卷中，直到遇到下一个分卷节点。
      </p>
    </div>
  );
};
