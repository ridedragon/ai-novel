import { useState, useRef } from 'react';
import { skillRegistry } from '../skills/SkillRegistry';

interface SkillInstallerProps {
  onClose: () => void;
  onInstall: () => void;
}

export default function SkillInstaller({ onClose, onInstall }: SkillInstallerProps) {
  const [installMode, setInstallMode] = useState<'file' | 'text' | 'url'>('file');
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json') && !file.name.endsWith('.skill.json')) {
      setError('请上传 .json 或 .skill.json 格式的 Skill 文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setJsonInput(content);
      setError('');
    };
    reader.onerror = () => {
      setError('文件读取失败');
    };
    reader.readAsText(file);
  };

  const validateSkillJson = (json: string): boolean => {
    try {
      const data = JSON.parse(json);

      if (!data.name) {
        setError('缺少 name 字段');
        return false;
      }

      if (!data.description) {
        setError('缺少 description 字段');
        return false;
      }

      if (!data.content) {
        setError('缺少 content 字段');
        return false;
      }

      if (!data.frontmatter) {
        setError('缺少 frontmatter 字段');
        return false;
      }

      if (skillRegistry.hasSkill(data.name)) {
        setError(`Skill "${data.name}" 已存在，请先删除现有的`);
        return false;
      }

      return true;
    } catch (err) {
      setError('JSON 格式错误：' + (err instanceof Error ? err.message : '未知错误'));
      return false;
    }
  };

  const handleInstall = async () => {
    if (!jsonInput.trim()) {
      setError('请输入 Skill JSON 数据或上传文件');
      return;
    }

    if (!validateSkillJson(jsonInput)) {
      return;
    }

    setIsInstalling(true);
    setError('');
    setSuccess('');

    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      skillRegistry.importSkill(jsonInput);

      setSuccess('Skill 安装成功！');
      setTimeout(() => {
        onInstall();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '安装失败');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleLoadExample = () => {
    const exampleSkill = {
      name: 'chapter-writer',
      description: '当用户要求写小说章节、生成正文内容、续写故事时使用。适用场景：章节创作、情节展开、对话编写、场景描写',
      frontmatter: {
        name: 'chapter-writer',
        description: '当用户要求写小说章节、生成正文内容、续写故事时使用。适用场景：章节创作、情节展开、对话编写、场景描写',
        'user-invocable': true,
        'disable-model-invocation': false,
      },
      content: `---
name: chapter-writer
description: "当用户要求写小说章节、生成正文内容、续写故事时使用。适用场景：章节创作、情节展开、对话编写、场景描写"
user-invocable: true
disable-model-invocation: false
---

# 章节创作专家

## 工作流程
1. 读取当前章节的大纲和上下文
2. 分析角色设定和世界观
3. 按照大纲要求生成章节内容
4. 确保文风一致性和逻辑连贯性

## 写作规范
- 每章节 2000-3000 字
- 保持角色性格一致性
- 注意场景转换的自然性
- 对话要符合角色身份

## 参考资源
- 角色设定：读取 characterSets
- 世界观：读取 worldviewSets
- 大纲：读取 outlineSets
`,
      files: [],
    };

    setJsonInput(JSON.stringify(exampleSkill, null, 2));
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">导入 Skill</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="flex gap-2">
            <button
              onClick={() => setInstallMode('file')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                installMode === 'file'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-white hover:bg-gray-700'
              }`}
            >
              上传文件
            </button>
            <button
              onClick={() => setInstallMode('text')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                installMode === 'text'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-white hover:bg-gray-700'
              }`}
            >
              粘贴 JSON
            </button>
          </div>

          {installMode === 'file' && (
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer bg-gray-800/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.skill.json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-white mb-1">
                点击上传或拖拽文件到此处
              </p>
              <p className="text-xs text-gray-400">
                支持 .json 或 .skill.json 格式
              </p>
            </div>
          )}

          {installMode === 'text' && (
            <div>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder="在此粘贴 Skill 的 JSON 数据..."
                className="w-full h-64 p-4 bg-gray-800 border border-gray-600 rounded-lg text-xs text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono resize-none"
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-sm text-green-400">{success}</p>
            </div>
          )}

          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-white mb-2">Skill 格式说明</h4>
            <div className="p-3 bg-gray-800 rounded-lg text-xs text-gray-400 space-y-1">
              <p>导入的 JSON 应包含以下字段：</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li><code className="text-white">name</code> - Skill 唯一名称</li>
                <li><code className="text-white">description</code> - 触发描述</li>
                <li><code className="text-white">frontmatter</code> - YAML 元数据</li>
                <li><code className="text-white">content</code> - Skill 完整内容（含 frontmatter）</li>
                <li><code className="text-white">files</code> - 附加文件（可选）</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleLoadExample}
              className="text-sm text-blue-400 hover:underline"
            >
              加载示例 Skill
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors"
            disabled={isInstalling}
          >
            取消
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling || !jsonInput.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isInstalling ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                安装中...
              </>
            ) : (
              '安装 Skill'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
