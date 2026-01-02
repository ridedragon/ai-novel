import { Bot, ChevronDown, ChevronRight, Edit2, Save, Settings, X } from 'lucide-react';
import React, { useState } from 'react';
import { AgentManifest, AgentPromptConfig, Novel } from '../types';
import { AgentCoreState } from '../utils/AgentCore';

interface AgentControlPanelProps {
  novel: Novel;
  active: boolean;
  onClose: () => void;
  coreState: AgentCoreState;
  userInstruction: string;
  setUserInstruction: (val: string) => void;
  onStartPlanning: () => void;
  onStartExecution: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  onFullReset: () => void;
  onUpdateManifest: (manifest: AgentManifest) => void;
  agentPromptConfig: AgentPromptConfig;
  setAgentPromptConfig: (config: AgentPromptConfig) => void;
}

const AgentControlPanel: React.FC<AgentControlPanelProps> = ({
  active,
  onClose,
  coreState,
  userInstruction,
  setUserInstruction,
  onStartPlanning,
  onStartExecution,
  onResume,
  onStop,
  onReset,
  onFullReset,
  onUpdateManifest,
  agentPromptConfig,
  setAgentPromptConfig
}) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const [tempDesc, setTempDesc] = useState('');

  if (!active) return null;

  const handleEditTask = (index: number) => {
    if (!coreState.manifest) return;
    const task = coreState.manifest.tasks[index];
    setEditingTaskIndex(index);
    setTempTitle(task.title);
    setTempDesc(task.description);
  };

  const handleSaveTask = () => {
    if (!coreState.manifest || editingTaskIndex === null) return;
    const newManifest = { ...coreState.manifest };
    newManifest.tasks = [...newManifest.tasks];
    newManifest.tasks[editingTaskIndex] = {
      ...newManifest.tasks[editingTaskIndex],
      title: tempTitle,
      description: tempDesc
    };
    onUpdateManifest(newManifest);
    setEditingTaskIndex(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 w-full max-w-2xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-indigo-600 text-white">
          <h2 className="text-lg font-bold">🤖 Agent 协同创作中心</h2>
          <button onClick={onClose} className="hover:text-slate-200">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* User Instruction Input */}
          {coreState.status === 'IDLE' && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                最初的要求 (例如: "创作一篇48章的故事，关于星际探险")
              </label>
              <textarea
                value={userInstruction}
                onChange={(e) => setUserInstruction(e.target.value)}
                placeholder="请输入你的创作指令..."
                className="w-full h-24 p-3 text-sm border border-slate-300 rounded-lg bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
              />
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">当前状态:</span>
            <span className={`px-2 py-1 rounded text-xs font-bold ${
              coreState.status === 'EXECUTING' ? 'bg-green-100 text-green-700' :
              coreState.status === 'PLANNING' ? 'bg-blue-100 text-blue-700' :
              coreState.status === 'ERROR' ? 'bg-red-100 text-red-700' :
              coreState.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-700 font-bold animate-pulse' :
              'bg-slate-100 text-slate-700'
            }`}>
              {coreState.status === 'PAUSED' ? '已暂停 (需人工干预)' : coreState.status === 'EXECUTING' ? '正在执行' : coreState.status}
            </span>
          </div>

          {/* Progress */}
          {coreState.manifest && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>总进度: {coreState.currentTaskIndex} / {coreState.manifest.tasks.length}</span>
                <span>{Math.round((coreState.currentTaskIndex / coreState.manifest.tasks.length) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full transition-all duration-500"
                  style={{ width: `${(coreState.currentTaskIndex / coreState.manifest.tasks.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="bg-slate-900 text-green-400 p-3 rounded font-mono text-xs h-48 overflow-y-auto flex flex-col-reverse">
            {coreState.logs.map((log, i) => (
              <div key={i} className="mb-1">{log}</div>
            ))}
          </div>

          {/* Manifest Preview (Awaiting User) */}
          {coreState.status === 'AWAITING_USER' && coreState.manifest && (
            <div className="border border-slate-200 dark:border-slate-700 rounded p-3 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-sm mb-2 text-slate-800 dark:text-slate-200">导演已完成规划:</h3>
              <ul className="text-xs space-y-2">
                {coreState.manifest.tasks.map((task, i) => (
                  <li key={i} className="flex flex-col space-y-1 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500 dark:text-slate-400 w-8 font-mono">#{i+1}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 ${
                        task.type === 'chapter' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                      }`}>{task.type}</span>
                      
                      {editingTaskIndex === i ? (
                        <input
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs font-bold border-2 border-indigo-500 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none shadow-sm"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 truncate text-slate-700 dark:text-slate-300 font-medium">{task.title}</span>
                      )}

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingTaskIndex === i ? (
                          <>
                            <button onClick={handleSaveTask} className="p-1 text-green-600 hover:bg-green-50 rounded" title="保存">
                              <Save className="w-3 h-3" />
                            </button>
                            <button onClick={() => setEditingTaskIndex(null)} className="p-1 text-slate-400 hover:bg-slate-200 rounded" title="取消">
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => handleEditTask(i)} className="p-1 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded" title="编辑任务">
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {(editingTaskIndex === i || (task.description && task.description.length > 0)) && (
                      <div className="pl-10">
                        {editingTaskIndex === i ? (
                          <textarea
                            value={tempDesc}
                            onChange={(e) => setTempDesc(e.target.value)}
                            className="w-full h-40 p-3 text-xs border-2 border-indigo-500 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono outline-none resize-none shadow-inner leading-relaxed"
                            placeholder="任务描述（支持指令如 [ACTION:XXX]）"
                          />
                        ) : (
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-3 italic leading-relaxed">{task.description}</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Agent Prompt Settings */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900/30">
            <button
              onClick={() => setShowPromptSettings(!showPromptSettings)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Agent 初始提示词设置</span>
              </div>
              {showPromptSettings ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {showPromptSettings && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-700 space-y-4 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-3 h-3 text-indigo-400" />
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">导演 (规划) 提示词</label>
                  </div>
                  <textarea
                    value={agentPromptConfig.directorPrompt}
                    onChange={(e) => setAgentPromptConfig({ ...agentPromptConfig, directorPrompt: e.target.value })}
                    className="w-full h-40 p-3 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
                    placeholder="输入导演 Agent 的系统提示词..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-3 h-3 text-indigo-400" />
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">提示词 Agent (导师) 提示词 - 通用</label>
                  </div>
                  <textarea
                    value={agentPromptConfig.promptAgentPrompt}
                    onChange={(e) => setAgentPromptConfig({ ...agentPromptConfig, promptAgentPrompt: e.target.value })}
                    className="w-full h-32 p-3 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
                    placeholder="通用提示词（留空则使用内置默认指令）"
                  />
                </div>

                {[
                  { label: '灵感阶段 提示词', key: 'inspirationPrompt' },
                  { label: '世界观阶段 提示词', key: 'worldviewPrompt' },
                  { label: '粗纲阶段 提示词', key: 'plotOutlinePrompt' },
                  { label: '角色集阶段 提示词', key: 'characterPrompt' },
                  { label: '大纲阶段 提示词', key: 'outlinePrompt' }
                ].map((item) => (
                  <div key={item.key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Bot className="w-3 h-3 text-indigo-400" />
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</label>
                    </div>
                    <textarea
                      value={(agentPromptConfig as any)[item.key] || ''}
                      onChange={(e) => setAgentPromptConfig({ ...agentPromptConfig, [item.key]: e.target.value })}
                      className="w-full h-32 p-3 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
                      placeholder={`${item.label}（留空则使用内置对应阶段指令）`}
                    />
                  </div>
                ))}
                
                <p className="text-[10px] text-slate-500 italic">
                  💡 提示词修改后将立即生效于下次 Agent 任务。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Reset Confirmation Overlay */}
        {showResetConfirm && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>
            <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">确认重置流程？</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                这将清除当前所有的创作清单、进度记录和剧情摘要。此操作不可撤销。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    onFullReset();
                    setShowResetConfirm(false);
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-lg shadow-red-600/20"
                >
                  确认重置
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-3">
          {(coreState.status === 'COMPLETED' || coreState.status === 'ERROR' || coreState.status === 'PAUSED' || coreState.status === 'AWAITING_USER' || (coreState.status === 'IDLE' && coreState.manifest)) && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-sm font-medium mr-auto"
            >
              {coreState.status === 'AWAITING_USER' ? '❌ 拒绝并重置' : '🔄 开启新流程'}
            </button>
          )}

          {coreState.status === 'IDLE' && (
            <button
              onClick={onStartPlanning}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
              disabled={!userInstruction.trim()}
            >
              开始自动化创作
            </button>
          )}

          {coreState.status === 'AWAITING_USER' && (
            <button
              onClick={onStartExecution}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
            >
              确认清单并开始执行
            </button>
          )}

          {(coreState.status === 'EXECUTING' || coreState.status === 'PLANNING') && (
            <div className="flex space-x-3">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 text-sm font-medium"
              >
                重置
              </button>
              <button
                onClick={onStop}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
              >
                紧急停止
              </button>
            </div>
          )}

          {(coreState.status === 'PAUSED' || coreState.status === 'ERROR') && (
            <div className="flex space-x-3">
              <button
                onClick={onReset}
                className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 text-sm font-medium shadow-lg transition-transform active:scale-95"
              >
                修改指令
              </button>
              <button
                onClick={onResume}
                className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm font-medium shadow-lg transition-transform active:scale-95"
              >
                直接重试
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentControlPanel;