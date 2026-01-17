import { CheckSquare, Folder, FolderPlus, Square, X } from 'lucide-react';
import { Novel } from '../../../../../types';
import { NODE_CONFIGS } from '../../../constants';
import { NodeTypeKey, WorkflowNodeData } from '../../../types';
import { SharedInput } from '../../Shared/SharedInput';

interface BasicNodeInfoProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  activeNovel: Novel | undefined;
  isMobile?: boolean;
}

export const BasicNodeInfo = ({ data, onUpdate, activeNovel, isMobile = false }: BasicNodeInfoProps) => {
  const directoryOptions = Array.from(
    new Set([
      ...(activeNovel?.volumes?.map(v => v.title) || []),
      ...(activeNovel?.worldviewSets?.map(s => s.name) || []),
      ...(activeNovel?.characterSets?.map(s => s.name) || []),
      ...(activeNovel?.outlineSets?.map(s => s.name) || []),
    ]),
  ).filter(Boolean);

  const containerClass = isMobile ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-2 gap-6';
  const labelClass = isMobile
    ? 'text-[10px] font-bold text-gray-500 uppercase tracking-widest'
    : 'text-[10px] font-bold text-gray-500 uppercase tracking-widest';

  const inputClass = isMobile
    ? 'w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-primary shadow-inner'
    : 'w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none transition-all';

  return (
    <div className={containerClass}>
      <div className="space-y-2.5">
        <label className={labelClass}>模块显示名称</label>
        <SharedInput value={data.label} onValueChange={val => onUpdate({ label: val })} className={inputClass} />
      </div>
      <div
        className={`space-y-2.5 ${data.typeKey === 'createFolder' || data.typeKey === 'reuseDirectory' ? (isMobile ? '' : 'col-span-2') : ''}`}
      >
        <label className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
          {data.typeKey === 'createFolder' ? <FolderPlus className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
          {data.typeKey === 'createFolder'
            ? '创建并关联目录名'
            : data.typeKey === 'reuseDirectory'
              ? '选择或输入要复用的目录名'
              : '独立目录关联 (可选)'}
        </label>
        <div className="flex gap-2">
          <SharedInput
            value={data.folderName}
            onValueChange={val => onUpdate({ folderName: val })}
            placeholder={data.typeKey === 'createFolder' ? '输入要创建的项目文件夹名称...' : '输入或选择目录名...'}
            className={
              isMobile
                ? 'flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-primary'
                : 'flex-1 bg-[#161922] border border-primary/30 rounded-lg px-4 py-2.5 text-sm text-primary-light focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none transition-all'
            }
          />
          {data.typeKey === 'reuseDirectory' && activeNovel && (
            <select
              className={
                isMobile
                  ? 'bg-gray-800 border border-gray-700 rounded-2xl px-2 text-xs text-gray-300 outline-none'
                  : 'bg-[#161922] border border-gray-700 rounded-lg px-2 text-xs text-gray-300 outline-none'
              }
              onChange={e => onUpdate({ folderName: e.target.value })}
              value=""
            >
              <option value="" disabled>
                {isMobile ? '选择...' : '快速选择...'}
              </option>
              {directoryOptions.map(name => (
                <option key={name as string} value={name as string}>
                  {name as string}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
};

export const NodeHeader = ({
  data,
  onUpdate,
  onClose,
  isMobile = false,
}: {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  onClose: () => void;
  isMobile?: boolean;
}) => {
  const Icon = NODE_CONFIGS[data.typeKey as NodeTypeKey]?.icon;

  if (isMobile) {
    return (
      <div className="p-4 bg-gray-800 border-b border-gray-700 flex flex-col gap-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${data.color}20`, color: data.color }}>
              {Icon && <Icon className="w-5 h-5" />}
            </div>
            <h3 className="font-bold text-gray-100 truncate max-w-[150px]">{data.label}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdate({ skipped: !data.skipped })}
              className={`text-[10px] px-3 py-1.5 rounded-full transition-all font-bold uppercase tracking-wider flex items-center gap-1 ${data.skipped ? 'bg-gray-600 text-gray-300' : 'bg-primary/20 text-primary border border-primary/30'}`}
            >
              {data.skipped ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
              {data.skipped ? '已跳过' : '执行'}
            </button>
            <button
              onClick={onClose}
              className="flex flex-col items-center justify-center p-1.5 bg-gray-700 rounded-xl text-gray-400 ml-2"
            >
              <X className="w-4 h-4" />
              <span className="text-[8px] font-bold mt-0.5">返回</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 border-b border-gray-700/50 flex items-center justify-between bg-[#1a1d29]">
      <div className="flex items-center gap-4 text-primary">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="w-5 h-5" />}
          <span className="font-bold text-gray-100 text-lg">配置: {data.label}</span>
        </div>
        <button
          onClick={() => onUpdate({ skipped: !data.skipped })}
          className={`text-[10px] px-2 py-1 rounded transition-all font-bold uppercase tracking-wider flex items-center gap-1 ${data.skipped ? 'bg-gray-600 text-gray-300' : 'bg-primary/20 text-primary border border-primary/30'}`}
        >
          {data.skipped ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
          {data.skipped ? '已跳过' : '执行此节点'}
        </button>
      </div>
      <button
        onClick={onClose}
        className="p-1.5 hover:bg-gray-700/50 rounded-md text-gray-400 hover:text-white transition-all"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};
