import { Edit2, MessageSquare, Plus, Trash2, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { GeneratorPrompt } from '../../../../../types';
import { WorkflowNodeData } from '../../../types';

interface PromptEditorProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  isMobile?: boolean;
}

export const PromptEditor = ({ data, onUpdate, isMobile = false }: PromptEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);

  // 如果没有提示词条目，尝试使用 systemPrompt 或初始化为空
  const promptItems =
    (data.promptItems as GeneratorPrompt[]) ||
    (data.systemPrompt ? [{ id: 'default', role: 'system', content: data.systemPrompt as string, enabled: true }] : []);

  const handleUpdateItem = (idx: number, updates: Partial<GeneratorPrompt>) => {
    const newItems = [...promptItems];
    newItems[idx] = { ...newItems[idx], ...updates };
    onUpdate({ promptItems: newItems });
  };

  const handleAddItem = () => {
    const newItems = [
      ...promptItems,
      { id: `prompt-${Date.now()}`, role: 'user' as const, content: '', enabled: true },
    ];
    onUpdate({ promptItems: newItems });
  };

  const handleDeleteItem = (idx: number) => {
    if (confirm('确定要删除此提示词条目吗？')) {
      const newItems = promptItems.filter((_, i) => i !== idx);
      onUpdate({ promptItems: newItems });
    }
  };

  // 简略视图（嵌入在面板中）
  const renderPreview = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          className={
            isMobile ? 'text-[10px] text-gray-400 uppercase tracking-widest' : 'text-[10px] text-gray-400 uppercase'
          }
        >
          对话提示词 (Prompts)
        </label>
        <button
          onClick={e => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className={
            isMobile
              ? 'text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold p-2 -m-2'
              : 'text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold'
          }
        >
          <Edit2 className="w-3 h-3" /> {isMobile ? '编辑管理' : `编辑条目 (${promptItems.length})`}
        </button>
      </div>
      <div
        onClick={() => setIsEditing(true)}
        className={
          isMobile
            ? 'w-full h-24 bg-gray-800 border border-gray-700 rounded-2xl p-4 text-xs text-gray-400 overflow-hidden font-mono'
            : 'w-full h-20 bg-[#161922] border border-gray-700 rounded-lg p-3 text-xs text-gray-400 hover:border-gray-600 cursor-pointer overflow-hidden font-mono'
        }
      >
        {promptItems.length > 0 ? (
          promptItems.map((p, i) => (
            <div key={i} className="truncate mb-1 last:mb-0">
              <span className="text-indigo-500 font-bold">[{p.role}]</span> {p.content}
            </div>
          ))
        ) : (
          <span className="italic opacity-50">未设置提示词，点击编辑...</span>
        )}
      </div>
    </div>
  );

  // 全屏/模态编辑视图
  const renderModal = () => (
    <div
      className={
        isMobile
          ? 'fixed inset-0 z-[160] flex flex-col bg-[#1e2230] animate-in slide-in-from-right duration-300'
          : 'fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200'
      }
    >
      {!isMobile && <div className="absolute inset-0" onClick={() => setIsEditing(false)} />}

      <div
        className={
          isMobile
            ? 'flex-1 flex flex-col'
            : 'relative w-full max-w-[700px] bg-[#1e2230] rounded-2xl shadow-2xl border border-gray-700 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200'
        }
      >
        {/* Header */}
        <div
          className={
            isMobile
              ? 'p-4 bg-[#1a1d29] border-b border-gray-700/50 flex items-center justify-between sticky top-0 z-10'
              : 'p-5 border-b border-gray-700/50 flex items-center justify-between bg-[#1a1d29]'
          }
        >
          <div
            className={
              isMobile ? 'flex items-center gap-2.5 text-indigo-400' : 'flex items-center gap-2.5 text-indigo-400'
            }
          >
            <Wand2 className="w-5 h-5" />
            <span className={isMobile ? 'font-bold text-gray-100 text-base' : 'font-bold text-gray-100 text-lg'}>
              编辑对话提示词
            </span>
          </div>
          <button
            onClick={() => setIsEditing(false)}
            className={
              isMobile
                ? 'flex flex-col items-center justify-center p-1.5 bg-gray-700 rounded-xl text-gray-400'
                : 'p-1.5 hover:bg-gray-700/50 rounded-md text-gray-400 hover:text-white transition-all'
            }
          >
            <X className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
            {isMobile && <span className="text-[8px] font-bold mt-0.5">返回</span>}
          </button>
        </div>

        {/* Content */}
        <div
          className={
            isMobile
              ? 'flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#1e2230] pb-24'
              : 'flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[#1e2230]'
          }
        >
          {promptItems.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-gray-800 rounded-2xl">
              <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">暂无自定义提示词条目</p>
            </div>
          )}

          {promptItems.map((item, idx) => (
            <div
              key={item.id || idx}
              className={
                isMobile
                  ? 'bg-[#161922] border border-gray-700 rounded-xl overflow-hidden shadow-lg'
                  : 'bg-[#161922] border border-gray-700 rounded-xl overflow-hidden group/item'
              }
            >
              <div
                className={
                  isMobile
                    ? 'flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-gray-700/50'
                    : 'flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-700/50'
                }
              >
                <div className="flex items-center gap-3">
                  <select
                    value={item.role}
                    onChange={e => handleUpdateItem(idx, { role: e.target.value as any })}
                    className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/30 rounded px-2 py-1 outline-none"
                  >
                    <option value="system">System</option>
                    <option value="user">User</option>
                    <option value="assistant">Assistant</option>
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer active:opacity-70">
                    <input
                      type="checkbox"
                      checked={item.enabled !== false}
                      onChange={e => handleUpdateItem(idx, { enabled: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">启用</span>
                  </label>
                </div>
                <button
                  onClick={() => handleDeleteItem(idx)}
                  className="p-1 text-gray-500 active:text-red-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={item.content}
                onChange={e => handleUpdateItem(idx, { content: e.target.value })}
                placeholder="输入内容... 支持 {{context}} 变量"
                className={
                  isMobile
                    ? 'w-full h-32 bg-transparent p-4 text-sm text-gray-300 focus:text-white outline-none resize-none font-mono leading-relaxed'
                    : 'w-full h-24 bg-transparent p-4 text-xs text-gray-300 focus:text-white outline-none resize-none font-mono leading-relaxed'
                }
              />
            </div>
          ))}

          <button
            onClick={handleAddItem}
            className={
              isMobile
                ? 'w-full py-5 border-2 border-dashed border-gray-700 rounded-2xl text-gray-500 active:text-indigo-400 active:border-indigo-500/50 active:bg-indigo-500/5 transition-all flex items-center justify-center gap-2 font-bold text-sm'
                : 'w-full py-4 border-2 border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all flex items-center justify-center gap-2 font-bold text-sm'
            }
          >
            <Plus className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
            {isMobile ? '添加提示词条目' : '添加新的提示词条目'}
          </button>
        </div>

        {/* Footer */}
        <div
          className={
            isMobile
              ? 'p-6 bg-[#1a1d29] border-t border-gray-700/50 sticky bottom-0 z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]'
              : 'p-5 border-t border-gray-700/50 bg-[#1a1d29] flex justify-end'
          }
        >
          <button
            onClick={() => setIsEditing(false)}
            className={
              isMobile
                ? 'w-full py-4 bg-indigo-600 active:bg-indigo-500 text-white rounded-2xl text-base font-bold shadow-lg shadow-indigo-900/40 transition-all active:scale-95'
                : 'px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-900/20 transition-all active:scale-95'
            }
          >
            完成{isMobile && '编辑'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {renderPreview()}
      {isEditing && renderModal()}
    </>
  );
};
