import { del, get, set } from 'idb-keyval';
import terminal from 'virtual:terminal';
import { ChapterVersion, Novel } from '../types';

const NOVELS_KEY = 'novels';
const METADATA_PREFIX = 'novel_metadata_';
const VERSIONS_PREFIX = 'versions_';

// 用于在内存中缓存内容的哈希或副本，实现脏检查，避免重复写入
const lastSavedContentCache = new Map<number, string>();
// 缓存单本书元数据的脏检查
const lastSavedMetadataCache = new Map<string, string>();
// 缓存全局书籍列表的脏检查
let lastSavedNovelsJson = '';

export const storage = {
  // 辅助函数：生成单本小说的结构化元数据（不含正文）
  _getNovelMetadataJson(novel: Novel): string {
    return JSON.stringify({
      chapters: novel.chapters.map(chapter => ({
        id: chapter.id,
        title: chapter.title,
        volumeId: chapter.volumeId,
        activeVersionId: chapter.activeVersionId,
        subtype: chapter.subtype,
        logicScore: chapter.logicScore,
        summaryRange: chapter.summaryRange,
        analysisResult: chapter.analysisResult?.substring(0, 20),
      })),
      worldviewSets: novel.worldviewSets,
      characterSets: novel.characterSets,
      outlineSets: novel.outlineSets,
      plotOutlineSets: novel.plotOutlineSets,
      referenceFolders: novel.referenceFolders,
      referenceFiles: novel.referenceFiles,
    });
  },

  async getNovels(): Promise<Novel[]> {
    try {
      // 1. 先获取主索引数据 (现在仅包含书籍基本信息)
      const novels = await get<Novel[]>(NOVELS_KEY);

      if (novels) {
        // 初始化全局书籍列表缓存
        lastSavedNovelsJson = JSON.stringify(novels);

        // --- 性能飞跃优化 ---
        // 核心改动：启动时只加载“书籍框架”，不再加载任何章节列表或正文。
        // 详细数据将由 App.tsx 根据当前选中的书籍按需调用 loadNovelContent 进行加载。
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

  // 新增：按需加载特定小说的结构元数据和正文内容
  async loadNovelContent(novel: Novel): Promise<Novel> {
    const startTime = Date.now();
    terminal.log(`[STORAGE] 正在按需加载《${novel.title}》的数据...`);

    // 1. 加载书籍结构元数据 (Metadata)
    const metadata = await get<any>(`${METADATA_PREFIX}${novel.id}`);
    if (metadata) {
      Object.assign(novel, metadata);
      // 初始化元数据脏检查缓存
      lastSavedMetadataCache.set(novel.id, this._getNovelMetadataJson(novel));
    }

    // 2. 加载章节正文
    const contentPromises = (novel.chapters || []).map(async chapter => {
      if (chapter.content && lastSavedContentCache.has(chapter.id)) return;
      const content = await get<string>(`chapter_content_${chapter.id}`);
      if (content !== undefined) {
        chapter.content = content;
        lastSavedContentCache.set(chapter.id, content);
      }
    });

    await Promise.all(contentPromises);
    terminal.log(
      `[STORAGE] 《${novel.title}》加载完成 (${novel.chapters?.length || 0} 章节)，耗时: ${Date.now() - startTime}ms`,
    );
    return novel;
  },

  async saveNovels(novels: Novel[]): Promise<void> {
    const startTime = Date.now();
    let contentWriteCount = 0;
    let metadataWriteCount = 0;
    let metadataWriteTime = 0;

    try {
      for (const novel of novels) {
        // 1. 结构元数据 (Metadata) 分离保存
        // 只有当章节列表已经加载（即长度 > 0 或 metadataCache 已存在）时才处理保存
        if (novel.chapters && novel.chapters.length > 0) {
          const metaStartTime = Date.now();
          const currentMetaJson = this._getNovelMetadataJson(novel);
          if (currentMetaJson !== lastSavedMetadataCache.get(novel.id)) {
            const {
              chapters,
              worldviewSets,
              characterSets,
              outlineSets,
              plotOutlineSets,
              referenceFolders,
              referenceFiles,
            } = novel;
            await set(`${METADATA_PREFIX}${novel.id}`, {
              chapters: chapters.map(({ versions, content, ...rest }) => rest), // 确保不含正文
              worldviewSets,
              characterSets,
              outlineSets,
              plotOutlineSets,
              referenceFolders,
              referenceFiles,
            });
            lastSavedMetadataCache.set(novel.id, currentMetaJson);
            metadataWriteCount++;
            metadataWriteTime += Date.now() - metaStartTime;
          }
        }

        // 2. 章节正文增量保存
        for (const chapter of novel.chapters || []) {
          if (chapter.versions && chapter.versions.length > 0) {
            this.saveChapterVersions(chapter.id, chapter.versions);
          }

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

      // 3. 全局书籍列表 (Skeletons) 瘦身保存
      // 现在的 novels 键只存书籍的基本信息，绝不包含章节列表
      const strippedNovels = novels.map(
        ({
          chapters,
          worldviewSets,
          characterSets,
          outlineSets,
          plotOutlineSets,
          referenceFolders,
          referenceFiles,
          worldview,
          characters,
          outline,
          ...rest
        }) => rest,
      );
      const currentNovelsJson = JSON.stringify(strippedNovels);
      let novelsWriteCount = 0;
      let novelsWriteTime = 0;

      if (currentNovelsJson !== lastSavedNovelsJson) {
        const nStartTime = Date.now();
        await set(NOVELS_KEY, strippedNovels);
        lastSavedNovelsJson = currentNovelsJson;
        novelsWriteCount = 1;
        novelsWriteTime = Date.now() - nStartTime;
      }

      const endTime = Date.now();

      if (contentWriteCount > 0 || metadataWriteCount > 0 || novelsWriteCount > 0) {
        terminal.log(`
[PERF] storage.saveNovels (二级拆分模式):
- 正文写入: ${contentWriteCount} 节
- 书籍元数据更新: ${metadataWriteCount} 次 (耗时: ${metadataWriteTime}ms)
- 全局列表更新: ${novelsWriteCount} 次 (耗时: ${novelsWriteTime}ms)
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
