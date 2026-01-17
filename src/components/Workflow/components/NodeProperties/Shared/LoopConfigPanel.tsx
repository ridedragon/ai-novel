import { Plus, Repeat, X } from 'lucide-react';
import { LoopInstruction } from '../../../../../types';
import { WorkflowNodeData } from '../../../types';
import { SharedInput } from '../../Shared/SharedInput';

interface LoopConfigProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  isMobile?: boolean;
}

export const LoopConfigPanel = ({ data, onUpdate, isMobile = false }: LoopConfigProps) => {
  return (
    <div
      className={isMobile ? 'space-y-4 pt-4 border-t border-gray-800' : 'space-y-4 pt-6 border-t border-gray-700/30'}
    >
      <label className="text-[10px] font-bold text-sky-500 uppercase tracking-widest flex items-center gap-2">
        <Repeat className="w-3.5 h-3.5" /> 循环控制器配置
      </label>
      <div
        className={
          isMobile
            ? 'bg-sky-500/10 border border-sky-500/20 rounded-2xl p-4 space-y-3'
            : 'space-y-3 bg-sky-500/10 border border-sky-500/20 rounded-lg p-4'
        }
      >
        <div className="space-y-1">
          <label className="text-[10px] text-sky-300 font-bold uppercase">循环次数</label>
          <SharedInput
            type="number"
            min="1"
            max="100"
            value={data.loopConfig?.count || 1}
            onValueChange={val => {
              const count = parseInt(val) || 1;
              onUpdate({
                loopConfig: {
                  ...(data.loopConfig || { enabled: true }),
                  count,
                  enabled: true,
                },
              });
            }}
            className={
              isMobile
                ? 'w-full bg-gray-800 border border-sky-500/30 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-sky-500'
                : 'w-full bg-[#161922] border border-sky-500/30 rounded px-3 py-2 text-sm text-white outline-none focus:border-sky-500'
            }
          />
        </div>
        <div className="text-[10px] text-sky-400/70 leading-relaxed">
          {isMobile ? (
            '此节点作为循环控制器。当执行到此节点时，如果未达到指定次数，将跳转回循环起始位置（通过连线闭环）。可以使用 {{loop_index}} 变量。'
          ) : (
            <>
              * 此节点将作为循环的起点/终点连接器。
              <br />
              * 当流程执行到此节点时，如果未达到指定次数，将跳转回循环起始位置（通过连线闭环）。
              <br />* 系统变量 <code>{'{{loop_index}}'}</code> 可在循环内的任何节点中使用。
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const LoopInstructionsPanel = ({ data, onUpdate, isMobile = false }: LoopConfigProps) => {
  return (
    <div
      className={isMobile ? 'space-y-4 pt-4 border-t border-gray-800' : 'space-y-4 pt-6 border-t border-gray-700/30'}
    >
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
          <Repeat className="w-3.5 h-3.5" /> 循环特定指令 {isMobile ? '' : '(Loop Instructions)'}
        </label>
        <button
          onClick={() => {
            const currentInstructions = (data.loopInstructions as LoopInstruction[]) || [];
            const nextIndex =
              currentInstructions.length > 0 ? Math.max(...currentInstructions.map(i => i.index)) + 1 : 1;
            const newInstructions = [...currentInstructions, { index: nextIndex, content: '' }];
            onUpdate({ loopInstructions: newInstructions });
          }}
          className={
            isMobile
              ? 'px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1'
              : 'p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider'
          }
        >
          <Plus className="w-3 h-3" /> 添加轮次
        </button>
      </div>

      {((data.loopInstructions as LoopInstruction[]) || []).map((inst, idx) => (
        <div
          key={idx}
          className={
            isMobile
              ? 'bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden'
              : 'bg-[#161922] border border-gray-700/50 rounded-lg overflow-hidden flex flex-col'
          }
        >
          <div
            className={
              isMobile
                ? 'flex items-center justify-between px-3 py-2 bg-gray-700/30 border-b border-gray-700/50'
                : 'flex items-center justify-between bg-gray-800/50 px-3 py-1.5 border-b border-gray-700/30'
            }
          >
            <span
              className={
                isMobile ? 'text-[10px] font-bold text-gray-400' : 'text-[10px] font-bold text-gray-400 uppercase'
              }
            >
              第 {inst.index} 次循环{isMobile ? '' : '时发送'}
            </span>
            <button
              onClick={() => {
                const newInstructions = ((data.loopInstructions as LoopInstruction[]) || []).filter(
                  (_, i) => i !== idx,
                );
                onUpdate({ loopInstructions: newInstructions });
              }}
              className="text-gray-500 hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <textarea
            value={inst.content}
            onChange={e => {
              const newInstructions = [...((data.loopInstructions as LoopInstruction[]) || [])];
              newInstructions[idx] = { ...inst, content: e.target.value };
              onUpdate({ loopInstructions: newInstructions });
            }}
            placeholder={isMobile ? '输入该轮次特定指令...' : '输入该轮次特定的额外指令...'}
            className={
              isMobile
                ? 'w-full h-20 bg-transparent p-3 text-xs text-gray-300 focus:text-white outline-none resize-none'
                : 'w-full h-20 bg-transparent p-3 text-xs text-gray-300 focus:text-white outline-none resize-none'
            }
          />
        </div>
      ))}
      {(!data.loopInstructions || data.loopInstructions.length === 0) && (
        <div
          className={
            isMobile
              ? ''
              : 'text-center py-4 text-[10px] text-gray-600 italic border border-dashed border-gray-700/50 rounded-lg'
          }
        >
          {!isMobile && '未配置循环特定指令，每次循环将使用通用指令。'}
        </div>
      )}
    </div>
  );
};
