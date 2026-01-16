import {
  Handle,
  NodeProps,
  Position
} from '@xyflow/react';
import {
  CheckSquare,
  FolderPlus,
  Library,
} from 'lucide-react';
import { NODE_CONFIGS } from '../constants';
import { NodeTypeKey, WorkflowNode as WorkflowNodeType } from '../types';

export const WorkflowNode = ({ data, selected }: NodeProps<WorkflowNodeType>) => {
  const Icon = NODE_CONFIGS[data.typeKey as NodeTypeKey]?.icon;
  const color = data.color;

  const refCount = (data.selectedWorldviewSets?.length || 0) +
                   (data.selectedCharacterSets?.length || 0) +
                   (data.selectedOutlineSets?.length || 0) +
                   (data.selectedInspirationSets?.length || 0) +
                   (data.selectedReferenceFolders?.length || 0);

  const getStatusColor = () => {
    switch (data.status) {
      case 'executing': return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse';
      case 'completed': return data.skipped ? 'border-gray-500 opacity-60' : 'border-green-600/50 shadow-none';
      case 'failed': return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
      default: return selected ? 'border-[var(--theme-color)] ring-2 ring-[var(--theme-color)]/20 shadow-[var(--theme-color)]/10' : 'border-gray-700';
    }
  };

  return (
    <div className={`relative px-4 py-3 shadow-xl rounded-lg border-2 bg-gray-800 transition-all ${getStatusColor()}`} style={{ width: '280px' }}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-4 h-4 bg-gray-600 border-2 border-gray-800 z-50 absolute top-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
        style={{ left: '-10px' }}
        isConnectable={true}
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              {data.typeLabel}
              {data.skipped && <span className="text-[8px] bg-gray-700 px-1 rounded text-gray-400">已跳过</span>}
            </span>
            {data.status === 'executing' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>}
          </div>
          <div className="text-sm font-semibold text-gray-100 truncate">{data.label}</div>
        </div>
      </div>
      
      <div className="mt-2 pt-2 border-t border-gray-700/50 space-y-1.5">
        {data.folderName && (
          <div className="flex items-center gap-1.5 text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
            <FolderPlus className="w-3 h-3" />
            <span className="truncate">目录: {data.folderName}</span>
          </div>
        )}
        {refCount > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <Library className="w-3 h-3" />
            <span>引用了 {refCount} 个资料集</span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-4 h-4 bg-gray-600 border-2 border-gray-800 z-50 absolute top-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
        style={{ right: '-10px' }}
        isConnectable={true}
        id="source"
      />
    </div>
  );
};

export const MobileWorkflowNode = ({ data, selected }: NodeProps<WorkflowNodeType>) => {
  const Icon = NODE_CONFIGS[data.typeKey as NodeTypeKey]?.icon;
  const color = data.color;

  const refCount = (data.selectedWorldviewSets?.length || 0) +
                   (data.selectedCharacterSets?.length || 0) +
                   (data.selectedOutlineSets?.length || 0) +
                   (data.selectedInspirationSets?.length || 0) +
                   (data.selectedReferenceFolders?.length || 0);

  const getStatusColor = () => {
    switch (data.status) {
      case 'executing': return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse';
      case 'completed': return 'border-green-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]';
      case 'failed': return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
      default: return selected ? 'border-[var(--theme-color)] ring-2 ring-[var(--theme-color)]/20 shadow-[var(--theme-color)]/10' : 'border-gray-700';
    }
  };

  return (
    <div className={`px-3 py-2 shadow-xl rounded-lg border-2 bg-gray-800 transition-all ${getStatusColor()}`} style={{ width: '180px' }}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" isConnectable={true} />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-0.5 flex items-center justify-between">
            {data.typeLabel}
            {data.status === 'executing' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>}
            {data.status === 'completed' && <CheckSquare className="w-2.5 h-2.5 text-green-500" />}
          </div>
          <div className="text-[11px] font-semibold text-gray-100 truncate">{data.label}</div>
        </div>
      </div>
      
      {refCount > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-700/50 flex items-center gap-1 text-[8px] text-emerald-400">
          <Library className="w-2.5 h-2.5" />
          <span>引用 {refCount} 个资料集</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" id="source" isConnectable={true} />
    </div>
  );
};