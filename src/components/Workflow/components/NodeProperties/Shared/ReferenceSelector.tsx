import { CheckSquare, File, Folder, Globe, ImageIcon, LayoutList, Lightbulb, Square, Users } from 'lucide-react';
import { Novel } from '../../../../../types';
import { WorkflowNodeData } from '../../../types';

interface ReferenceSelectorProps {
  data: WorkflowNodeData;
  activeNovel: Novel;
  pendingFolders: string[];
  onToggle: (type: 'worldview' | 'character' | 'outline' | 'inspiration' | 'folder', setId: string) => void;
  isMobile?: boolean;
}

export const ReferenceSelector = ({
  data,
  activeNovel,
  pendingFolders,
  onToggle,
  isMobile = false
}: ReferenceSelectorProps) => {
  const groups = [
    { label: '世界观设定', key: 'selectedWorldviewSets', type: 'worldview', sets: activeNovel.worldviewSets, icon: Globe, color: 'text-emerald-500', mobileColor: 'text-emerald-500', bgSelected: 'bg-emerald-500/20', textSelected: 'text-emerald-300', borderSelected: 'border-emerald-500/30' },
    { label: '角色档案集', key: 'selectedCharacterSets', type: 'character', sets: activeNovel.characterSets, icon: Users, color: 'text-orange-500', mobileColor: 'text-orange-500', bgSelected: 'bg-orange-500/20', textSelected: 'text-orange-300', borderSelected: 'border-orange-500/30' },
    { label: '剧情粗纲', key: 'selectedOutlineSets', type: 'outline', sets: activeNovel.outlineSets, icon: LayoutList, color: 'text-pink-500', mobileColor: 'text-pink-500', bgSelected: 'bg-pink-500/20', textSelected: 'text-pink-300', borderSelected: 'border-pink-500/30' },
    { label: '灵感脑洞集', key: 'selectedInspirationSets', type: 'inspiration', sets: activeNovel.inspirationSets, icon: Lightbulb, color: 'text-yellow-500', mobileColor: 'text-yellow-500', bgSelected: 'bg-yellow-500/20', textSelected: 'text-yellow-300', borderSelected: 'border-yellow-500/30' }
  ];

  const containerClass = isMobile ? "space-y-4" : "grid grid-cols-2 gap-4";
  const cardClass = isMobile 
    ? "bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 space-y-2"
    : "bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2";
  
  const headerClass = isMobile
    ? "text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30"
    : "text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30";

  return (
    <div className={isMobile ? "space-y-6 pt-6 border-t border-gray-800" : "space-y-4 pt-6 border-t border-gray-700/30"}>
      <label className={isMobile ? "text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2" : "text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2"}>
        <CheckSquare className="w-3.5 h-3.5" /> {isMobile ? "关联参考资料集" : "关联参考资料集 (Context)"}
      </label>
      
      <div className={containerClass}>
        {groups.map((group) => (
          <div key={group.key} className={cardClass}>
            <div className={headerClass}>
              <group.icon className={`w-3 h-3 ${group.color}`}/> {group.label}
            </div>
            <div className={isMobile ? "flex flex-wrap gap-2 pt-1" : "space-y-1 pt-1"}>
              {group.sets?.map((set: any) => {
                const isSelected = ((data[group.key as keyof WorkflowNodeData] || []) as string[]).includes(set.id);
                return (
                  <button
                    key={set.id}
                    onClick={() => onToggle(group.type as any, set.id)}
                    className={isMobile 
                      ? `px-3 py-2 rounded-xl text-xs transition-all border ${isSelected ? `bg-indigo-600/20 text-indigo-400 border-indigo-500/50 font-bold` : 'bg-gray-800 text-gray-500 border-gray-700'}`
                      : `w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? `${group.bgSelected} ${group.textSelected} border ${group.borderSelected} font-medium` : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`
                    }
                  >
                    {!isMobile && (isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />)}
                    {set.name}
                  </button>
                );
              })}
              {pendingFolders.filter(name => !group.sets?.some((s: any) => s.name === name)).map(name => {
                const pendingId = `pending:${name}`;
                const isSelected = ((data[group.key as keyof WorkflowNodeData] || []) as string[]).includes(pendingId);
                return (
                  <button
                    key={pendingId}
                    onClick={() => onToggle(group.type as any, pendingId)}
                    className={isMobile
                      ? `px-3 py-2 rounded-xl text-xs transition-all border border-dashed ${isSelected ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50 font-bold' : 'bg-gray-800/40 text-gray-500 border-gray-700'}`
                      : `w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? `${group.bgSelected.replace('/20', '/30')} text-gray-200 border border-dashed ${group.borderSelected} font-bold` : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-gray-700/30'}`
                    }
                  >
                     {!isMobile && (isSelected ? <CheckSquare className={`w-3.5 h-3.5 ${group.color}`} /> : <Square className="w-3.5 h-3.5" />)}
                    {name} (计划中)
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={!isMobile ? "mt-4 pt-4 border-t border-gray-700/30" : ""}>
        <div className={isMobile 
          ? "bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 space-y-2"
          : ""
        }>
          <div className={isMobile
            ? "text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30"
            : "text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-2"
          }>
            <Folder className="w-3 h-3 text-blue-500"/> 参考资料库文件夹
          </div>
          <div className={isMobile ? "flex flex-wrap gap-2 pt-1" : "grid grid-cols-2 gap-2"}>
            {activeNovel.referenceFolders?.map(folder => {
              const folderFiles = activeNovel.referenceFiles?.filter(f => f.parentId === folder.id) || [];
              const hasImages = folderFiles.some(f => f.type.startsWith('image/'));
              const hasPdf = folderFiles.some(f => f.type === 'application/pdf');
              const isSelected = ((data.selectedReferenceFolders || []) as string[]).includes(folder.id);
              
              if (isMobile) {
                return (
                  <button
                    key={folder.id}
                    onClick={() => onToggle('folder', folder.id)}
                    className={`px-3 py-2 rounded-xl text-xs transition-all border ${isSelected ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 font-bold' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                  >
                    {folder.name}
                  </button>
                );
              }

              return (
                <button
                  key={folder.id}
                  onClick={() => onToggle('folder', folder.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium' : 'bg-[#161922] hover:bg-gray-700 text-gray-400 border border-gray-700/50'}`}
                >
                  {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                    <span className="truncate">{folder.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {hasImages && <ImageIcon className="w-2.5 h-2.5 text-blue-400" />}
                      {hasPdf && <File className="w-2.5 h-2.5 text-red-400" />}
                    </div>
                  </div>
                </button>
              );
            })}
             {(!activeNovel.referenceFolders || activeNovel.referenceFolders.length === 0) && (
               <div className={isMobile ? "text-[10px] text-gray-600 italic" : "col-span-2 py-4 text-center text-[10px] text-gray-600 border border-dashed border-gray-700 rounded-lg"}>
                 资料库中暂无文件夹
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};