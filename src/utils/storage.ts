import { del, get, set } from 'idb-keyval';
import terminal from 'virtual:terminal';
import { ChapterVersion, Novel } from '../types';

const NOVELS_KEY = 'novels';
const VERSIONS_PREFIX = 'versions_';

// 用于在内存中缓存章节内容的哈希或副本，实现脏检查，避免重复写入
const lastSavedContentCache = new Map<number, string>();
// 缓存上一次保存的主索引 JSON 字符串，用于脏检查
let lastSavedMetadataJson = '';

export const storage = {
  // 辅助函数：生成极简版元数据，仅包含影响结构和列表显示的必要字段
  _getStrippedMetadata(novels: Novel[]): string {
    return JSON.stringify(
      novels.map(novel => ({
        id: novel.id,
        title: novel.title,
        createdAt: novel.createdAt,
        systemPrompt: novel.systemPrompt,
        volumes: novel.volumes,
        // 只保留章节的核心元数据，剔除所有可能变动的正文、版本和临时状态
        chapters: novel.chapters.map(chapter => ({
          id: chapter.id,
          title: chapter.title,
          volumeId: chapter.volumeId,
          activeVersionId: chapter.activeVersionId,
          subtype: chapter.subtype,
          logicScore: chapter.logicScore,
          analysisResult: chapter.analysisResult?.substring(0, 10), // 仅比对摘要变化
        })),
        // 资料集仅比对核心结构
        worldviewSets: novel.worldviewSets?.map(s => ({ id: s.id, name: s.name, count: s.entries?.length })),
        characterSets: novel.characterSets?.map(s => ({ id: s.id, name: s.name, count: s.characters?.length })),
        outlineSets: novel.outlineSets?.map(s => ({ id: s.id, name: s.name, count: s.items?.length })),
      })),
    );
  },

  async getNovels(): Promise<Novel[]> {
    try {
      // 1. 先获取主索引数据
      const novels = await get<Novel[]>(NOVELS_KEY);

      if (novels) {
        // 初始化主索引缓存：必须使用与保存时相同的瘦身逻辑，否则首次比对必不相等
        lastSavedMetadataJson = this._getStrippedMetadata(novels);

        // --- 性能飞跃优化 ---
        // 核心改动：启动时只加载“书籍框架”，不再加载任何章节正文。
        // 正文加载将由 App.tsx 根据当前选中的书籍按需调用 loadNovelContent 进行。
        return novels;
      }

      // If not in IndexedDB, try localStorage (migration path)
      const localNovels = localStorage.getItem(NOVELS_KEY);
      if (localNovels) {
        try {
          const parsed = JSON.parse(localNovels);
          // Save to IndexedDB
          await set(NOVELS_KEY, parsed);
          // Clear from localStorage to free up space, but maybe keep it for safety until confirmed?
          // For now, let's just leave it or clear it.
          // Since QuotaExceededError is the issue, we should probably eventually clear it.
          // Let's clear it to ensure we don't hit the limit again with other keys.
          localStorage.removeItem(NOVELS_KEY);
          return parsed;
        } catch (e) {
          console.error('Failed to parse novels from localStorage', e);
          return [];
        }
      }

      return [];
    } catch (e) {
      console.error('Failed to load novels', e);
      return [];
    }
  },

  // 新增：按需加载特定小说的正文内容
  async loadNovelContent(novel: Novel): Promise<Novel> {
    const startTime = Date.now();
    terminal.log(`[STORAGE] 正在按需加载《${novel.title}》的正文内容 (${novel.chapters.length} 章节)...`);

    const contentPromises = novel.chapters.map(async chapter => {
      // 如果内存中已经有了，跳过读取
      if (chapter.content && lastSavedContentCache.has(chapter.id)) return;

      const content = await get<string>(`chapter_content_${chapter.id}`);
      if (content !== undefined) {
        chapter.content = content;
        // 同步到脏检查缓存
        lastSavedContentCache.set(chapter.id, content);
      }
    });

    await Promise.all(contentPromises);
    terminal.log(`[STORAGE] 《${novel.title}》正文加载完成，耗时: ${Date.now() - startTime}ms`);
    return novel;
  },

  async saveNovels(novels: Novel[]): Promise<void> {
    const startTime = Date.now();
    let contentWriteCount = 0;
    try {
      // 1. 章节内容增量存储
      for (const novel of novels) {
        for (const chapter of novel.chapters) {
          // 异步保存版本数据 (非常驻内存，无需等待)
          if (chapter.versions && chapter.versions.length > 0) {
            this.saveChapterVersions(chapter.id, chapter.versions);
          }

          // 核心优化：脏检查。
          // 关键：只有当 chapter.content 是字符串时，才说明该章节已被加载或有修改。
          // 如果是 undefined，说明该书处于“冷隔离”状态，绝对不能执行写入，否则会抹除数据库正文！
          if (typeof chapter.content === 'string') {
            const currentContent = chapter.content;
            if (currentContent !== lastSavedContentCache.get(chapter.id)) {
              await set(`chapter_content_${chapter.id}`, currentContent);
              lastSavedContentCache.set(chapter.id, currentContent);
              contentWriteCount++;
            }
          }
        }
      }

      const contentEndTime = Date.now();

      // 2. 剥离正文后的主索引瘦身保存
      const strippedNovels = novels.map(novel => ({
        ...novel,
        chapters: novel.chapters.map(chapter => {
          // 从主 JSON 中剥离 content 和 versions
          const { versions, content, ...rest } = chapter;
          return rest; // rest 只包含标题、ID、状态等元数据
        }),
      }));

      const serializeTime = Date.now();
      const currentMetadataJson = this._getStrippedMetadata(novels);
      let indexWriteCount = 0;
      let indexWriteTime = 0;

      // 核心优化：主索引脏检查
      // 只有当小说列表结构、标题、分卷状态等发生变化时，才写入 IndexedDB
      if (currentMetadataJson !== lastSavedMetadataJson) {
        await set(NOVELS_KEY, strippedNovels);
        lastSavedMetadataJson = currentMetadataJson;
        indexWriteCount = 1;
        indexWriteTime = Date.now() - serializeTime;
      }

      const endTime = Date.now();

      // 在 PowerShell 终端打印详细性能数据 (仅在有实际写入时打印，减少日志噪音)
      if (contentWriteCount > 0 || indexWriteCount > 0) {
        terminal.log(`
[PERF] storage.saveNovels (增量模式):
- 章节内容写入: ${contentWriteCount} 节 (耗时: ${contentEndTime - startTime}ms)
- 主表索引写入: ${indexWriteCount} 次 (耗时: ${indexWriteTime}ms)
- 总耗时: ${endTime - startTime}ms
        `);
      }
    } catch (e) {
      console.error('Failed to save novels to IndexedDB', e);
      throw e;
    }
  },

  async getChapterVersions(chapterId: number): Promise<ChapterVersion[]> {
    try {
      const versions = await get<ChapterVersion[]>(`${VERSIONS_PREFIX}${chapterId}`);
      return versions || [];
    } catch (e) {
      console.error('Failed to get chapter versions', e);
      return [];
    }
  },

  async saveChapterVersions(chapterId: number, versions: ChapterVersion[]): Promise<void> {
    try {
      await set(`${VERSIONS_PREFIX}${chapterId}`, versions);
    } catch (e) {
      console.error('Failed to save chapter versions', e);
    }
  },

  async deleteChapterVersions(chapterId: number): Promise<void> {
    try {
      await del(`${VERSIONS_PREFIX}${chapterId}`);
    } catch (e) {
      console.error('Failed to delete chapter versions', e);
    }
  },
};
