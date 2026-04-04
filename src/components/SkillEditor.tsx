import { useState, useEffect } from 'react';
import { Skill, SkillInstallationData } from '../skills/types';
import { skillRegistry } from '../skills/SkillRegistry';

interface SkillEditorProps {
  skill: Skill | null;
  onClose: () => void;
  onSave: () => void;
}

const DEFAULT_SKILL_TEMPLATE = `---
name: my-new-skill
description: "当用户请求XXX时使用。描述触发条件，而非功能说明。"
user-invocable: true
disable-model-invocation: false
---

# Skill 名称

## 使用说明

在这里编写详细的指令内容...

## 工作流程

1. 第一步
2. 第二步
3. 第三步

## 注意事项

- 注意事项1
- 注意事项2
`;

export default function SkillEditor({ skill, onClose, onSave }: SkillEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [userInvocable, setUserInvocable] = useState(true);
  const [disableModelInvocation, setDisableModelInvocation] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (skill) {
      setName(skill.name);
      setDescription(skill.description);
      setContent(skill.content);
      setUserInvocable(skill.frontmatter['user-invocable'] !== false);
      setDisableModelInvocation(skill.frontmatter['disable-model-invocation'] === true);
    } else {
      setName('');
      setDescription('');
      setContent(DEFAULT_SKILL_TEMPLATE);
      setUserInvocable(true);
      setDisableModelInvocation(false);
    }
    setError('');
  }, [skill]);

  const validateSkill = (): boolean => {
    if (!name.trim()) {
      setError('Skill 名称不能为空');
      return false;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setError('Skill 名称只能包含字母、数字、下划线和连字符');
      return false;
    }

    if (!description.trim()) {
      setError('描述不能为空');
      return false;
    }

    if (!content.trim()) {
      setError('内容不能为空');
      return false;
    }

    if (!content.startsWith('---')) {
      setError('内容必须以 YAML frontmatter 开头（---）');
      return false;
    }

    if (!skill && skillRegistry.hasSkill(name)) {
      setError('该名称的 Skill 已存在');
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validateSkill()) return;

    try {
      const frontmatterContent = `---
name: ${name}
description: "${description.replace(/"/g, '\\"')}"
user-invocable: ${userInvocable}
disable-model-invocation: ${disableModelInvocation}
---

${content.includes('---') ? content.split('---').slice(2).join('---').trim() : content}`;

      const installationData: SkillInstallationData = {
        name,
        description,
        frontmatter: {
          name,
          description,
          'user-invocable': userInvocable,
          'disable-model-invocation': disableModelInvocation,
        },
        content: frontmatterContent,
        source: (skill?.source || 'user') as 'user' | 'imported',
      };

      if (skill) {
        skillRegistry.updateSkill(skill.name, frontmatterContent);
      } else {
        skillRegistry.registerSkill(installationData);
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);

    const match = newContent.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const frontmatterStr = match[1];
      const nameMatch = frontmatterStr.match(/name:\s*["']?([^"'\n]+)["']?/);
      const descMatch = frontmatterStr.match(/description:\s*["']?([^"'\n]+)["']?/);

      if (nameMatch && !skill) {
        setName(nameMatch[1].trim());
      }
      if (descMatch) {
        setDescription(descMatch[1].trim());
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">
            {skill ? '编辑 Skill' : '新建 Skill'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Skill 名称 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="例如：chapter-writer"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                disabled={!!skill}
              />
              <p className="text-xs text-gray-400 mt-1">
                只能包含字母、数字、下划线和连字符
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                描述 *
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述何时触发此 Skill"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                描述触发条件，而非功能说明
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={userInvocable}
                onChange={(e) => setUserInvocable(e.target.checked)}
                className="rounded bg-gray-800 border-gray-600 text-blue-600"
              />
              <span className="text-sm text-white">用户可手动调用</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={disableModelInvocation}
                onChange={(e) => setDisableModelInvocation(e.target.checked)}
                className="rounded bg-gray-800 border-gray-600 text-blue-600"
              />
              <span className="text-sm text-white">禁止 AI 自动触发</span>
            </label>

            <button
              onClick={() => setShowPreview(!showPreview)}
              className="ml-auto px-3 py-1.5 bg-gray-800 border border-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
            >
              {showPreview ? '编辑模式' : '预览模式'}
            </button>
          </div>

          <div className="flex-1 min-h-0">
            <label className="block text-sm font-medium text-white mb-2">
              Skill 内容 (Markdown) *
            </label>
            {showPreview ? (
              <div className="h-full p-4 bg-gray-800 border border-gray-600 rounded-lg overflow-y-auto whitespace-pre-wrap text-sm text-white">
                {content}
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="在此编写 Skill 的指令内容..."
                className="w-full h-full p-4 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono resize-none"
              />
            )}
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-white mb-2">编写提示</h4>
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-400">
              <div className="p-2 bg-gray-800 rounded">
                <p className="font-medium text-white mb-1">Frontmatter 格式</p>
                <p>以 --- 开始和结束，包含 name、description 等元数据</p>
              </div>
              <div className="p-2 bg-gray-800 rounded">
                <p className="font-medium text-white mb-1">描述写法</p>
                <p>写"何时使用"而非"是什么"，例如："当用户请求写小说章节时使用"</p>
              </div>
              <div className="p-2 bg-gray-800 rounded">
                <p className="font-medium text-white mb-1">内容结构</p>
                <p>包含工作流程、注意事项、示例等，建议不超过 500 行</p>
              </div>
              <div className="p-2 bg-gray-800 rounded">
                <p className="font-medium text-white mb-1">变量占位符</p>
                <p>使用 {'{{variable}}'} 格式，运行时会被实际值替换</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {skill ? '保存修改' : '创建 Skill'}
          </button>
        </div>
      </div>
    </div>
  );
}
