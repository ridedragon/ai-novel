import { useState, useEffect, useCallback } from 'react';
import { skillRegistry } from '../skills/SkillRegistry';
import { Skill } from '../skills/types';
import SkillEditor from './SkillEditor';
import SkillInstaller from './SkillInstaller';
import { loadSkillsFromFolder, getSkillFilePath } from '../skills/builtinSkills';

interface SkillManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SkillManager({ isOpen, onClose }: SkillManagerProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showInstaller, setShowInstaller] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const loadSkills = useCallback(() => {
    setSkills(skillRegistry.getAllSkills());
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSkills();
      const unsubscribe = skillRegistry.onChange(loadSkills);
      
      let lastKnownFiles: string[] = [];
      
      const checkForChanges = async () => {
        try {
          const response = await fetch('/api/skills/list');
          if (response.ok) {
            const files = await response.json() as string[];
            const hasChanged = JSON.stringify(files.sort()) !== JSON.stringify(lastKnownFiles.sort());
            
            if (hasChanged || lastKnownFiles.length === 0) {
              lastKnownFiles = files;
              await loadSkillsFromFolder();
              loadSkills();
            }
          }
        } catch (e) {
          console.error('Error checking for skills changes:', e);
        }
      };
      
      checkForChanges();
      const interval = setInterval(checkForChanges, 3000);
      
      return () => {
        unsubscribe();
        clearInterval(interval);
      };
    }
  }, [isOpen, loadSkills]);

  const handleToggleSkill = (skillName: string) => {
    skillRegistry.toggleSkill(skillName);
  };

  const handleDeleteSkill = (skillName: string) => {
    if (window.confirm(`确定要删除 Skill "${skillName}" 吗？此操作不可撤销。`)) {
      skillRegistry.unregisterSkill(skillName);
      if (selectedSkill?.name === skillName) {
        setSelectedSkill(null);
        setShowEditor(false);
      }
    }
  };

  const handleExportSkill = (skillName: string) => {
    const exported = skillRegistry.exportSkill(skillName);
    if (exported) {
      const blob = new Blob([exported], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${skillName}.skill.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleEditSkill = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowEditor(true);
  };

  const handleCreateNewSkill = () => {
    setSelectedSkill(null);
    setShowEditor(true);
    setShowActionsMenu(false);
  };

  const handleImportSkill = () => {
    setShowInstaller(true);
    setShowActionsMenu(false);
  };

  const handleLoadFromFolder = async () => {
    try {
      const count = await loadSkillsFromFolder();
      if (count > 0) {
        loadSkills();
        alert(`成功从 skills/ 文件夹加载了 ${count} 个 Skill`);
      } else {
        alert('未能从 skills/ 文件夹加载任何 Skill，请确保文件夹中存在有效的 .md 文件');
      }
    } catch (error) {
      console.error('Failed to load skills from folder:', error);
      alert('加载失败，请检查控制台错误信息');
    }
    setShowActionsMenu(false);
  };

  const handleOpenFolder = () => {
    alert(`Skills 文件夹位置：\n${window.location.origin}/skills/\n\n请在项目根目录的 skills/ 文件夹中编辑 Skill 文件，然后点击"从文件夹加载"按钮同步。`);
    setShowActionsMenu(false);
  };

  const filteredSkills = skills.filter(skill => {
    const matchesSearch = searchQuery === '' ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'enabled' && skill.enabled) ||
      (filterStatus === 'disabled' && !skill.enabled);

    return matchesSearch && matchesFilter;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-5xl max-h-[95vh] md:max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            {isMobile && selectedSkill && (
              <button
                onClick={() => {
                  setSelectedSkill(null);
                  setShowSidebar(true);
                }}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors mr-1"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white">Skills 管理</h2>
              <p className="text-xs md:text-sm text-gray-400 mt-0.5 md:mt-1">
                管理你的 AI 创作技能包，共 {skills.length} 个技能
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 md:gap-3 p-3 md:p-4 border-b border-gray-700 shrink-0">
          <div className="flex-1 min-w-[140px] relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="搜索 Skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">全部</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已禁用</option>
          </select>

          <button
            onClick={handleCreateNewSkill}
            className="px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1 md:gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">新建 Skill</span>
            <span className="sm:hidden">新建</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="px-3 md:px-4 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center gap-1 md:gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
              <span className="hidden sm:inline">更多操作</span>
            </button>
            
            {showActionsMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowActionsMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={handleImportSkill}
                    className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    导入 Skill
                  </button>
                  <button
                    onClick={handleLoadFromFolder}
                    className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    从文件夹加载
                  </button>
                  <button
                    onClick={handleOpenFolder}
                    className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    查看路径
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          <div className={`${isMobile && selectedSkill ? 'hidden' : 'block'} w-full md:w-72 lg:w-80 border-r border-gray-700 overflow-y-auto bg-gray-900 shrink-0`}>
            {filteredSkills.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="text-sm">暂无 Skills</p>
                <p className="text-xs mt-1">点击"新建 Skill"或"导入 Skill"开始</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {filteredSkills.map(skill => (
                  <div
                    key={skill.id}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedSkill?.id === skill.id
                        ? 'bg-gray-800'
                        : 'hover:bg-gray-800/50'
                    }`}
                    onClick={() => {
                      setSelectedSkill(skill);
                      if (isMobile) setShowSidebar(false);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-white truncate">
                            {skill.name}
                          </h3>
                          <span className={`px-1.5 py-0.5 text-xs rounded shrink-0 ${
                            skill.enabled
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {skill.enabled ? '启用' : '禁用'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {skill.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                        skill.source === 'builtin'
                          ? 'bg-blue-500/20 text-blue-400'
                          : skill.source === 'imported'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {skill.source === 'builtin' ? '内置' : skill.source === 'imported' ? '导入' : '自定义'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${isMobile && !selectedSkill ? 'hidden' : 'flex-1'} overflow-y-auto p-3 md:p-4 bg-gray-900`}>
            {selectedSkill ? (
              <div className="space-y-3 md:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base md:text-lg font-semibold text-white">{selectedSkill.name}</h3>
                    <p className="text-xs md:text-sm text-gray-400 mt-1">{selectedSkill.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleToggleSkill(selectedSkill.name)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        selectedSkill.enabled
                          ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      }`}
                    >
                      {selectedSkill.enabled ? '禁用' : '启用'}
                    </button>
                    <button
                      onClick={() => handleEditSkill(selectedSkill)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleExportSkill(selectedSkill.name)}
                      className="px-3 py-1.5 bg-gray-800 border border-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
                    >
                      导出
                    </button>
                    <button
                      onClick={() => handleDeleteSkill(selectedSkill.name)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="border border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-800 border-b border-gray-700">
                    <h4 className="text-sm font-medium text-white">Skill 内容</h4>
                  </div>
                  <pre className="p-3 md:p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-48 md:max-h-96 overflow-y-auto bg-gray-900">
                    {selectedSkill.content}
                  </pre>
                </div>

                {selectedSkill.files.length > 0 && (
                  <div className="border border-gray-700 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-800 border-b border-gray-700">
                      <h4 className="text-sm font-medium text-white">附加文件 ({selectedSkill.files.length})</h4>
                    </div>
                    <div className="divide-y divide-gray-700">
                      {selectedSkill.files.map((file, index) => (
                        <div key={index} className="p-3 flex items-center justify-between bg-gray-900">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{file.name}</p>
                            <p className="text-xs text-gray-400 truncate">{file.path}</p>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 ml-2">
                            {(file.content.length / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 md:gap-3 text-sm">
                  <div className="p-2 md:p-3 bg-gray-800 rounded-lg">
                    <p className="text-gray-400 text-xs">安装时间</p>
                    <p className="text-white mt-1 text-xs md:text-sm">
                      {new Date(selectedSkill.installedAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="p-2 md:p-3 bg-gray-800 rounded-lg">
                    <p className="text-gray-400 text-xs">来源</p>
                    <p className="text-white mt-1 text-xs md:text-sm capitalize">
                      {selectedSkill.source || '自定义'}
                    </p>
                  </div>
                </div>

                <div className="p-2 md:p-3 bg-gray-800 rounded-lg">
                  <p className="text-gray-400 text-xs text-sm">文件路径</p>
                  <p className="text-white text-xs md:text-sm mt-1 font-mono break-all">
                    {getSkillFilePath(selectedSkill.name)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    在项目根目录的 skills/ 文件夹中编辑此文件
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <svg className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">选择一个 Skill 查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditor && (
        <SkillEditor
          skill={selectedSkill}
          onClose={() => {
            setShowEditor(false);
            setSelectedSkill(null);
          }}
          onSave={() => {
            setShowEditor(false);
            setSelectedSkill(null);
            loadSkills();
          }}
        />
      )}

      {showInstaller && (
        <SkillInstaller
          onClose={() => setShowInstaller(false)}
          onInstall={() => {
            setShowInstaller(false);
            loadSkills();
          }}
        />
      )}
    </div>
  );
}
