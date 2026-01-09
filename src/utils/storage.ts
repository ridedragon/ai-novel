import { del, get, set } from 'idb-keyval';
import terminal from 'virtual:terminal';
import { ChapterVersion, Novel } from '../types';

const NOVELS_KEY = 'novels';
const WORKFLOWS_KEY = 'novel_workflows_idb';
const ACTIVE_WF_ID_KEY = 'active_workflow_id_idb';
const METADATA_PREFIX = 'novel_metadata_';
const VERSIONS_PREFIX = 'versions_';

// 新增拆分存储的前缀，用于将大对象从元数据中剥离
const WORLDVIEW_PREFIX = 'novel_worldview_';
const CHARACTERS_PREFIX = 'novel_characters_';
const OUTLINE_PREFIX = 'novel_outline_';
const PLOT_OUTLINE_PREFIX = 'novel_plot_outline_';
const REFERENCE_PREFIX = 'novel_reference_';
const INSPIRATION_PREFIX = 'novel_inspiration_';

// 用于在内存中缓存内容的哈希或副本，实现脏检查，避免重复写入
const lastSavedContentCache = new Map<number, string>();
// 缓存章节版本的脏检查，彻底消除重复的磁盘 I/O
const lastSavedVersionsCache = new Map<number, string>();
// 缓存单本书元数据的脏检查 (仅包含章节索引和分卷，不含重型设定)
const lastSavedMetadataCache = new Map<string, string>();
// 缓存拆分部分的脏检查，彻底避免重型对象的重复序列化和写入
const lastSavedWorldviewCache = new Map<string, string>();
const lastSavedCharactersCache = new Map<string, string>();
const lastSavedOutlineCache = new Map<string, string>();
const lastSavedPlotOutlineCache = new Map<string, string>();
const lastSavedReferenceCache = new Map<string, string>();
const lastSavedInspirationCache = new Map<string, string>();

// 缓存全局书籍列表的脏检查
let lastSavedNovelsJson = '';

// 引入序列化锁，确保工作流保存操作按顺序执行，防止异步写入竞态导致的旧数据覆盖新数据
let workflowSaveQueue: Promise<void> = Promise.resolve();

export const storage = {
  // 辅助函数：生成单本小说的结构化索引元数据（极简，不含重型设定集）
  _getNovelMetadataJson(novel: Novel): string {
    return JSON.stringify({
      chapters: (novel.chapters || []).map(chapter => ({
        id: chapter.id,
        title: chapter.title,
        volumeId: chapter.volumeId,
        activeVersionId: chapter.activeVersionId,
        subtype: chapter.subtype,
        logicScore: chapter.logicScore,
        summaryRange: chapter.summaryRange,
        analysisResult: chapter.analysisResult?.substring(0, 20),
      })),
      volumes: novel.volumes || [],
    });
  },

  // 辅助脏检查函数：针对拆分块
  _getWorldviewJson(novel: Novel): string {
    return JSON.stringify(novel.worldviewSets || []);
  },
  _getCharactersJson(novel: Novel): string {
    return JSON.stringify(novel.characterSets || []);
  },
  _getOutlineJson(novel: Novel): string {
    return JSON.stringify(novel.outlineSets || []);
  },
  _getPlotOutlineJson(novel: Novel): string {
    return JSON.stringify(novel.plotOutlineSets || []);
  },
  _getReferenceJson(novel: Novel): string {
    return JSON.stringify({ f: novel.referenceFiles || [], d: novel.referenceFolders || [] });
  },
  _getInspirationJson(novel: Novel): string {
    return JSON.stringify(novel.inspirationSets || []);
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

  // 核心优化：按需加载特定小说的结构元数据 (原子化加载 + 并行化)
  async loadNovelContent(novel: Novel): Promise<Novel> {
    const startTime = Date.now();
    terminal.log(`[STORAGE] 正在按需加载《${novel.title}》的数据 (原子化并行模式)...`);

    // 1. 并行读取所有潜在的存储块
    const [metadata, wv, char, out, plot, ref, insp] = await Promise.all([
      get<any>(`${METADATA_PREFIX}${novel.id}`),
      get<any>(`${WORLDVIEW_PREFIX}${novel.id}`),
      get<any>(`${CHARACTERS_PREFIX}${novel.id}`),
      get<any>(`${OUTLINE_PREFIX}${novel.id}`),
      get<any>(`${PLOT_OUTLINE_PREFIX}${novel.id}`),
      get<any>(`${REFERENCE_PREFIX}${novel.id}`),
      get<any>(`${INSPIRATION_PREFIX}${novel.id}`),
    ]);

    if (metadata) {
      Object.assign(novel, metadata);

      // --- 双轨兼容逻辑：如果新 Key 有值则优先使用，否则沿用 Metadata 里的旧值 (实现无损平滑迁移) ---
      if (wv) novel.worldviewSets = wv;
      if (char) novel.characterSets = char;
      if (out) novel.outlineSets = out;
      if (plot) novel.plotOutlineSets = plot;
      if (ref) {
        novel.referenceFiles = ref.f;
        novel.referenceFolders = ref.d;
      }
      if (insp) novel.inspirationSets = insp;

      // 初始化所有脏检查缓存，防止首次保存时触发误判
      lastSavedMetadataCache.set(novel.id, this._getNovelMetadataJson(novel));
      lastSavedWorldviewCache.set(novel.id, this._getWorldviewJson(novel));
      lastSavedCharactersCache.set(novel.id, this._getCharactersJson(novel));
      lastSavedOutlineCache.set(novel.id, this._getOutlineJson(novel));
      lastSavedPlotOutlineCache.set(novel.id, this._getPlotOutlineJson(novel));
      lastSavedReferenceCache.set(novel.id, this._getReferenceJson(novel));
      lastSavedInspirationCache.set(novel.id, this._getInspirationJson(novel));
    }

    // 2. 加载章节正文 (保持并行)
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

  // 终极优化：原子化存储 + 真正并行化，目标将日常保存压缩至 30ms 以内
  // 监控写入频率
  _lastSaveTime: 0,
  _saveCountInWindow: 0,

  async saveNovels(novels: Novel[]): Promise<void> {
    const startTime = Date.now();

    // 验证假设：检测高频写入
    if (startTime - this._lastSaveTime < 500) {
      this._saveCountInWindow++;
      if (this._saveCountInWindow > 5) {
        terminal.warn(
          `[FREQ ALERT] storage.saveNovels 触发频率过高: 500ms内达 ${this._saveCountInWindow} 次 (建议检查组件更新源)`,
        );
      }
    } else {
      this._saveCountInWindow = 0;
    }
    this._lastSaveTime = startTime;

    const tasks: Promise<any>[] = []; // 并行任务清单

    let contentWriteCount = 0;
    let versionsWriteCount = 0;
    let metadataUpdateCount = 0;

    try {
      // 监控缓存 Map 的大小
      const totalCacheEntries =
        lastSavedContentCache.size +
        lastSavedVersionsCache.size +
        lastSavedMetadataCache.size +
        lastSavedWorldviewCache.size +
        lastSavedCharactersCache.size +
        lastSavedOutlineCache.size +
        lastSavedPlotOutlineCache.size +
        lastSavedReferenceCache.size +
        lastSavedInspirationCache.size;

      if (totalCacheEntries > 500) {
        terminal.log(`[MEM] 当前 storage 内存缓存项总数: ${totalCacheEntries} (注意：长期运行可能导致内存持续增加)`);
      }

      for (const novel of novels) {
        // 核心安全检查：只有加载过章节（非 Skeleton 状态）的书籍才触发原子化保存
        if (!novel.chapters || novel.chapters.length === 0) continue;

        // --- 1. 原子化脏检查与异步任务分发 ---

        // 1.1 索引元数据 (Metadata: 章节索引、分卷)
        const currentMetaJson = this._getNovelMetadataJson(novel);
        if (currentMetaJson !== lastSavedMetadataCache.get(novel.id)) {
          tasks.push(
            set(`${METADATA_PREFIX}${novel.id}`, {
              chapters: novel.chapters.map(({ versions, content, analysisResult, ...rest }) => ({
                ...rest,
                analysisResult: analysisResult?.substring(0, 100), // 仅保留摘要，防止元数据膨胀
              })),
              volumes: novel.volumes || [],
            }),
          );
          lastSavedMetadataCache.set(novel.id, currentMetaJson);
          metadataUpdateCount++;
          terminal.log(`[STORAGE] 更新元数据: 《${novel.title}》`);
        }

        // 1.2 世界观拆分块 (Worldview)
        if (novel.worldviewSets) {
          const currentWvJson = this._getWorldviewJson(novel);
          if (currentWvJson !== lastSavedWorldviewCache.get(novel.id)) {
            tasks.push(set(`${WORLDVIEW_PREFIX}${novel.id}`, novel.worldviewSets));
            lastSavedWorldviewCache.set(novel.id, currentWvJson);
            metadataUpdateCount++;
            terminal.log(`[STORAGE] 更新世界观: 《${novel.title}》`);
          }
        }

        // 1.3 角色集拆分块 (Characters)
        if (novel.characterSets) {
          const currentCharJson = this._getCharactersJson(novel);
          if (currentCharJson !== lastSavedCharactersCache.get(novel.id)) {
            tasks.push(set(`${CHARACTERS_PREFIX}${novel.id}`, novel.characterSets));
            lastSavedCharactersCache.set(novel.id, currentCharJson);
            metadataUpdateCount++;
            terminal.log(`[STORAGE] 更新角色集: 《${novel.title}》`);
          }
        }

        // 1.4 大纲集拆分块 (Outline)
        if (novel.outlineSets) {
          const currentOutJson = this._getOutlineJson(novel);
          if (currentOutJson !== lastSavedOutlineCache.get(novel.id)) {
            tasks.push(set(`${OUTLINE_PREFIX}${novel.id}`, novel.outlineSets));
            lastSavedOutlineCache.set(novel.id, currentOutJson);
            metadataUpdateCount++;
            terminal.log(`[STORAGE] 更新大纲: 《${novel.title}》`);
          }
        }

        // 1.5 剧情粗纲拆分块 (Plot Outline)
        if (novel.plotOutlineSets) {
          const currentPlotJson = this._getPlotOutlineJson(novel);
          if (currentPlotJson !== lastSavedPlotOutlineCache.get(novel.id)) {
            tasks.push(set(`${PLOT_OUTLINE_PREFIX}${novel.id}`, novel.plotOutlineSets));
            lastSavedPlotOutlineCache.set(novel.id, currentPlotJson);
            metadataUpdateCount++;
            terminal.log(`[STORAGE] 更新剧情粗纲: 《${novel.title}》`);
          }
        }

        // 1.6 资料库拆分块 (Reference)
        if (novel.referenceFiles || novel.referenceFolders) {
          const currentRefJson = this._getReferenceJson(novel);
          if (currentRefJson !== lastSavedReferenceCache.get(novel.id)) {
            tasks.push(
              set(`${REFERENCE_PREFIX}${novel.id}`, {
                f: novel.referenceFiles || [],
                d: novel.referenceFolders || [],
              }),
            );
            lastSavedReferenceCache.set(novel.id, currentRefJson);
            metadataUpdateCount++;
            terminal.log(`[STORAGE] 更新资料库: 《${novel.title}》`);
          }
        }

        // 1.7 灵感集拆分块 (Inspiration)
        if (novel.inspirationSets) {
          const currentInspJson = this._getInspirationJson(novel);
          if (currentInspJson !== lastSavedInspirationCache.get(novel.id)) {
            tasks.push(set(`${INSPIRATION_PREFIX}${novel.id}`, novel.inspirationSets));
            lastSavedInspirationCache.set(novel.id, currentInspJson);
            metadataUpdateCount++;
            terminal.log(`[STORAGE] 更新灵感集: 《${novel.title}》`);
          }
        }

        // --- 2. 章节正文增量保存 (纳入并行清单) ---
        for (const chapter of novel.chapters) {
          // 修正隐患：版本历史现在也纳入并行保存队列
          if (chapter.versions && chapter.versions.length > 0) {
            const currentVersionsJson = JSON.stringify(chapter.versions);
            if (currentVersionsJson !== lastSavedVersionsCache.get(chapter.id)) {
              tasks.push(this.saveChapterVersions(chapter.id, chapter.versions));
              lastSavedVersionsCache.set(chapter.id, currentVersionsJson);
              versionsWriteCount++;
              terminal.log(`[STORAGE] 更新章节版本: ChapterID=${chapter.id}`);
            }
          }

          if (typeof chapter.content === 'string') {
            const currentContent = chapter.content;
            if (currentContent !== lastSavedContentCache.get(chapter.id)) {
              tasks.push(set(`chapter_content_${chapter.id}`, currentContent));
              lastSavedContentCache.set(chapter.id, currentContent);
              contentWriteCount++;
              terminal.log(`[STORAGE] 更新章节正文: ChapterID=${chapter.id}, 长度=${currentContent.length}`);
            }
          }
        }
      }

      // --- 3. 全局书籍列表 (Skeleton) 并行保存 ---
      const strippedNovels = novels.map(
        ({
          chapters,
          worldviewSets,
          characterSets,
          outlineSets,
          plotOutlineSets,
          referenceFolders,
          referenceFiles,
          inspirationSets,
          worldview,
          characters,
          outline,
          ...rest
        }) => ({ ...rest, volumes: rest.volumes || [] }),
      );

      const currentNovelsJson = JSON.stringify(strippedNovels);
      let novelsWriteCount = 0;

      if (currentNovelsJson !== lastSavedNovelsJson) {
        tasks.push(set(NOVELS_KEY, strippedNovels));
        lastSavedNovelsJson = currentNovelsJson;
        novelsWriteCount = 1;
      }

      // --- 终极并发提交：利用 Promise.all 让所有任务并排过桥 ---
      const commitStartTime = Date.now();
      await Promise.all(tasks);
      const endTime = Date.now();

      if (tasks.length > 0) {
        terminal.log(`
[PERF] storage.saveNovels (原子化并行模式):
- 写入任务数: ${tasks.length} (并发提交)
- 正文写入: ${contentWriteCount} 节
- 版本更新: ${versionsWriteCount} 节
- 元数据/设定更新项: ${metadataUpdateCount} (拆分存储)
- 全局列表更新: ${novelsWriteCount}
- 数据库 I/O 耗时: ${endTime - commitStartTime}ms
- 总执行耗时: ${endTime - startTime}ms
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

  async deleteChapterContent(chapterId: number): Promise<void> {
    try {
      await del(`chapter_content_${chapterId}`);
      lastSavedContentCache.delete(chapterId);
    } catch (e) {
      console.error('Failed to delete chapter content', e);
    }
  },

  // --- 工作流持久化增强 ---
  async getWorkflows(): Promise<any[]> {
    try {
      // 1. 优先从 IndexedDB 获取
      let workflows = await get<any[]>(WORKFLOWS_KEY);

      if (workflows) {
        return workflows;
      }

      // 2. 兜底与迁移：从 localStorage 获取旧数据
      const legacyWorkflows = localStorage.getItem('novel_workflows');
      if (legacyWorkflows) {
        try {
          const parsed = JSON.parse(legacyWorkflows);
          // 异步搬迁到 IndexedDB，但不删除旧数据以防万一
          await set(WORKFLOWS_KEY, parsed);
          terminal.log('[STORAGE] 已成功从 localStorage 迁移工作流数据到 IndexedDB');
          return parsed;
        } catch (e) {
          console.error('Failed to parse legacy workflows', e);
        }
      }

      // 3. 兼容更久以前的版本
      const veryOldWorkflow = localStorage.getItem('novel_workflow');
      if (veryOldWorkflow) {
        try {
          const { nodes, edges } = JSON.parse(veryOldWorkflow);
          const initialWf = [
            {
              id: 'default',
              name: '默认工作流',
              nodes: nodes || [],
              edges: edges || [],
              lastModified: Date.now(),
            },
          ];
          await set(WORKFLOWS_KEY, initialWf);
          return initialWf;
        } catch (e) {}
      }

      return [];
    } catch (e) {
      console.error('Failed to load workflows from IDB', e);
      return [];
    }
  },

  async saveWorkflows(workflows: any[]): Promise<void> {
    // 将新的写入请求排入队列，通过 Promise 链实现串行化
    workflowSaveQueue = workflowSaveQueue.then(async () => {
      try {
        // 防御性处理：确保传入的数据是可克隆的。
        // 如果数据中包含 React 组件或 Symbol，JSON 序列化会将其过滤掉或抛出错误，
        // 从而避免 IndexedDB 的 DataCloneError 导致应用崩溃。
        const serializableWorkflows = JSON.parse(JSON.stringify(workflows));

        // 核心修复：使用 IndexedDB 存储，彻底解决 5MB 限制
        await set(WORKFLOWS_KEY, serializableWorkflows);
      } catch (e) {
        terminal.error(`[STORAGE] 工作流保存至 IndexedDB 失败 (队列执行): ${e}`);
        // 这里不抛出异常，防止某个任务失败导致后续队列永久中断，仅记录错误
      }
    });

    return workflowSaveQueue;
  },

  async getActiveWorkflowId(): Promise<string | null> {
    try {
      return (await get<string>(ACTIVE_WF_ID_KEY)) || localStorage.getItem('active_workflow_id');
    } catch (e) {
      return localStorage.getItem('active_workflow_id');
    }
  },

  async setActiveWorkflowId(id: string): Promise<void> {
    try {
      await set(ACTIVE_WF_ID_KEY, id);
      localStorage.setItem('active_workflow_id', id); // 保持同步以兼容
    } catch (e) {}
  },
};
