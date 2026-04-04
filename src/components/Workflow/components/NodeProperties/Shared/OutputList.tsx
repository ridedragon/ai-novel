import { ChevronDown, Expand, FileText, Plus, Trash2, Workflow, X } from 'lucide-react';
import { useState } from 'react';
import { OutputEntry, WorkflowNodeData } from '../../../types';
import { SharedInput } from '../../Shared/SharedInput';

interface OutputListProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  onPreview?: (entry: OutputEntry) => void;
  isMobile?: boolean;
}

export const OutputList = ({ data, onUpdate, onPreview, isMobile = false }: OutputListProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const handleUpdateEntry = (id: string, updates: Partial<OutputEntry>) => {
    const newEntries = (data.outputEntries || []).map(e => (e.id === id ? { ...e, ...updates } : e));
    onUpdate({ outputEntries: newEntries });
  };

  const handleDeleteEntry = (id: string) => {
    if (confirm(isMobile ? '确定要删除这条产出吗？' : '确定要删除这条内容吗？')) {
      const newEntries = (data.outputEntries || []).filter(e => e.id !== id);
      onUpdate({ outputEntries: newEntries });
    }
  };

  const handleAddEntry = () => {
    const newEntry: OutputEntry = {
      id: Date.now().toString(),
      title: '新条目',
      content: '',
    };
    onUpdate({ outputEntries: [...(data.outputEntries || []), newEntry] });
  };

  // 移动端简单列表视图
  if (isMobile) {
    return (
      <div className="space-y-4 pt-6 border-t border-gray-800">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            产出 ({(data.outputEntries || []).length})
          </label>
          <button
            onClick={handleAddEntry}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-xl text-[10px] font-bold"
          >
            <Plus className="w-3.5 h-3.5" /> 新增
          </button>
        </div>
        <div className="space-y-3">
          {data.outputEntries?.map((entry, idx) => {
            const isFirst = idx === 0;
            return (
              <div
                key={entry.id}
                className={`p-4 bg-gray-800 border border-gray-700 rounded-2xl flex items-center justify-between active:bg-gray-700 transition-all ${!isFirst ? 'opacity-80 scale-95' : ''}`}
                onClick={() => onPreview && onPreview(entry)}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-200 truncate">{entry.title}</div>
                    {!isFirst && <div className="text-[10px] text-gray-500 truncate">历史版本 (点击查看)</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteEntry(entry.id);
                    }}
                    className="p-2 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-600 transition-transform ${!isFirst ? '-rotate-90' : ''}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 桌面端手风琴视图
  return (
    <>
      <div className="space-y-4 pt-6 border-t border-gray-700/30">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Workflow className="w-3.5 h-3.5" /> 生成内容列表 (Output Entries)
          </label>
          <button
            onClick={handleAddEntry}
            className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
          >
            <Plus className="w-3 h-3" /> 新增条目
          </button>
        </div>

        <div className="space-y-4">
          {data.outputEntries?.map((entry) => {
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className="bg-[#161922] border border-gray-700/50 rounded-xl overflow-hidden shadow-lg group/entry transition-all"
              >
                <div
                  className="bg-[#1a1d29] px-4 py-2 border-b border-gray-700/50 flex items-center justify-between cursor-pointer hover:bg-[#202436]"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-gray-500 transition-transform ${!isExpanded ? '-rotate-90' : ''}`}
                    />
                    <SharedInput
                      value={entry.title}
                      onValueChange={val => handleUpdateEntry(entry.id, { title: val })}
                      className="bg-transparent border-none outline-none text-xs font-bold text-indigo-300 focus:text-white transition-colors flex-1"
                      placeholder="条目标题..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-600 font-mono">{entry.content.length}字</span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setExpandedEntryId(entry.id);
                      }}
                      className="p-1 text-gray-500 hover:text-amber-400 transition-colors opacity-0 group-hover/entry:opacity-100"
                      title="放大编辑"
                    >
                      <Expand className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteEntry(entry.id);
                      }}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover/entry:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div style={{ display: isExpanded ? 'block' : 'none' }}>
                  <textarea
                    value={entry.content}
                    onChange={e => handleUpdateEntry(entry.id, { content: e.target.value })}
                    placeholder="输入内容..."
                    className="w-full h-32 bg-transparent p-4 text-sm text-gray-300 focus:text-emerald-50 outline-none resize-none font-mono leading-relaxed"
                  />
                </div>
              </div>
            );
          })}
          {(!data.outputEntries || data.outputEntries.length === 0) && (
            <div className="text-center py-12 bg-[#161922] rounded-xl border border-dashed border-gray-700">
              <div className="inline-block p-3 bg-gray-800 rounded-full mb-3">
                <Workflow className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-sm text-gray-500">暂无生成产物，执行工作流或手动添加</p>
            </div>
          )}
        </div>
      </div>

      {expandedEntryId && (
        <EntryExpandedModal
          entry={data.outputEntries?.find(e => e.id === expandedEntryId)!}
          onClose={() => setExpandedEntryId(null)}
          onUpdate={updates => handleUpdateEntry(expandedEntryId, updates)}
        />
      )}
    </>
  );
};

interface EntryExpandedModalProps {
  entry: OutputEntry;
  onClose: () => void;
  onUpdate: (updates: Partial<OutputEntry>) => void;
}

const EntryExpandedModal = ({ entry, onClose, onUpdate }: EntryExpandedModalProps) => {
  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-[900px] h-[90vh] bg-[#1e2230] rounded-2xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-700/50 flex items-center justify-between bg-[#1a1d29] shrink-0">
          <div className="flex items-center gap-3 text-amber-400">
            <Expand className="w-6 h-6" />
            <span className="font-bold text-gray-100 text-xl">放大编辑产出条目</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-white transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[#1e2230]">
          <div className="bg-[#161922] border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-800/50 border-b border-gray-700/50">
              <input
                type="text"
                value={entry.title}
                onChange={e => onUpdate({ title: e.target.value })}
                placeholder="条目标题..."
                className="w-full bg-transparent border-none outline-none text-sm font-bold text-indigo-300 focus:text-white transition-colors"
              />
            </div>
            <textarea
              value={entry.content}
              onChange={e => onUpdate({ content: e.target.value })}
              placeholder="输入内容..."
              className="w-full h-[60vh] bg-transparent p-5 text-base text-gray-300 focus:text-white outline-none resize-none font-mono leading-relaxed"
            />
          </div>
        </div>

        <div className="p-5 border-t border-gray-700/50 bg-[#1a1d29] flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-base font-bold shadow-lg shadow-amber-900/20 transition-all active:scale-95"
          >
            完成编辑
          </button>
        </div>
      </div>
    </div>
  );
};
