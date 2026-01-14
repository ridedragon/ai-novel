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

// 后端 API 地址 - 动态获取当前主机名，适配手机 Termux 或局域网访问
const getApiBaseUrl = () => {
  // 优先尝试从 URL 参数中获取远程存储地址（用于调试或特殊部署场景）
  const params = new URLSearchParams(window.location.search);
  const override = params.get('api_url');
  if (override) return override;

  // 默认逻辑：跟随当前页面主机名
  const hostname = window.location.hostname || 'localhost';
  return `${window.location.protocol}//${hostname}:3001/api/storage`;
};

const API_BASE_URL = getApiBaseUrl();
console.log(`[STORAGE] API Base URL initialized as: ${API_BASE_URL}`);

// 辅助 API 请求函数
async function fetchFromApi<T>(key: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(key)}`);
    if (response.status === 404 || response.status === 204) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    const json = await response.json();

    // 兼容性处理：如果返回的是包装过的对象，解包
    if (json && typeof json === 'object' && '__wrapped_value__' in json) {
      return json.__wrapped_value__ as T;
    }

    return json as T;
  } catch (e) {
    // console.warn(`[STORAGE] Failed to fetch key ${key} from API`, e);
    return null;
  }
}

async function saveToApi(key: string, value: any): Promise<void> {
  try {
    // 始终包装数据，避免顶层字符串导致的 body-parser 解析错误
    const payload = { __wrapped_value__: value };

    await fetch(`${API_BASE_URL}/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error(`[STORAGE] Failed to save key ${key} to API`, e);
  }
}

async function deleteFromApi(key: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.error(`[STORAGE] Failed to delete key ${key} from API`, e);
  }
}

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

  // 辅助函数：全量上报本地数据到服务器
  async _pushAllToRemote(novels: Novel[]) {
    if (!novels || novels.length === 0) return;

    // 1. 推送列表
    await saveToApi(NOVELS_KEY, novels);

    // 2. 遍历所有书籍，推送详情（如果服务器没有的话）
    for (const novel of novels) {
      const nid = novel.id;
      // 从 IDB 读取各个分块并上传
      const [meta, wv, char, out, plot, ref, insp] = await Promise.all([
        get(`${METADATA_PREFIX}${nid}`),
        get(`${WORLDVIEW_PREFIX}${nid}`),
        get(`${CHARACTERS_PREFIX}${nid}`),
        get(`${OUTLINE_PREFIX}${nid}`),
        get(`${PLOT_OUTLINE_PREFIX}${nid}`),
        get(`${REFERENCE_PREFIX}${nid}`),
        get(`${INSPIRATION_PREFIX}${nid}`),
      ]);

      const tasks = [];
      if (meta) tasks.push(saveToApi(`${METADATA_PREFIX}${nid}`, meta));
      if (wv) tasks.push(saveToApi(`${WORLDVIEW_PREFIX}${nid}`, wv));
      if (char) tasks.push(saveToApi(`${CHARACTERS_PREFIX}${nid}`, char));
      if (out) tasks.push(saveToApi(`${OUTLINE_PREFIX}${nid}`, out));
      if (plot) tasks.push(saveToApi(`${PLOT_OUTLINE_PREFIX}${nid}`, plot));
      if (ref) tasks.push(saveToApi(`${REFERENCE_PREFIX}${nid}`, ref));
      if (insp) tasks.push(saveToApi(`${INSPIRATION_PREFIX}${nid}`, insp));

      if (tasks.length > 0) {
        await Promise.all(tasks);
        terminal.log(`[STORAGE] 已上报《${novel.title}》的详情数据至服务器`);
      }
    }
    terminal.log('[STORAGE] 全量数据上报服务器完成');
  },

  async getNovels(): Promise<Novel[]> {
    try {
      // 1. 尝试从 IndexedDB 获取
      let novels = await get<Novel[]>(NOVELS_KEY);

      // 2. 尝试从 API 获取远程数据状态
      const remoteNovels = await fetchFromApi<Novel[]>(NOVELS_KEY);

      // 3. 同步与合并逻辑 (核心修复：解决多浏览器书籍数目不一致)
      let needsLocalSave = false;
      let needsRemoteSave = false;

      const mergedMap = new Map<string, Novel>();

      // 先放入本地数据
      if (novels && novels.length > 0) {
        novels.forEach(n => mergedMap.set(n.id, n));
      }

      // 再拉取远程数据进行合并
      if (remoteNovels && remoteNovels.length > 0) {
        remoteNovels.forEach(rn => {
          if (!mergedMap.has(rn.id)) {
            // 发现远程有本地没有的书籍
            mergedMap.set(rn.id, rn);
            needsLocalSave = true;
          }
        });

        // 反向检查：如果本地有的书籍远程没有，则需要触发远程同步
        if (novels) {
          const remoteIds = new Set(remoteNovels.map(rn => rn.id));
          for (const ln of novels) {
            if (!remoteIds.has(ln.id)) {
              needsRemoteSave = true;
              break;
            }
          }
        } else {
          // 本地原本完全为空，直接使用远程数据
          needsLocalSave = true;
        }
      } else if (novels && novels.length > 0) {
        // 远程完全为空，本地不为空，需要初始化远程
        needsRemoteSave = true;
      }

      // 如果产生变化，执行持久化
      if (needsLocalSave || needsRemoteSave) {
        const mergedList = Array.from(mergedMap.values());
        novels = mergedList;

        if (needsLocalSave) {
          await set(NOVELS_KEY, novels);
          terminal.log(`[STORAGE] 书籍列表已同步：本地发现缺失，已合并远程数据。当前总数: ${novels.length}`);
        }

        if (needsRemoteSave) {
          terminal.log(`[STORAGE] 书籍列表已同步：远程发现缺失，正在上报本地书籍...`);
          // 异步推送，不阻塞 UI 加载
          this._pushAllToRemote(novels).catch(e => console.error('[STORAGE] 远程上报失败', e));
        }
      }

      if (novels) {
        // 初始化全局书籍列表缓存
        lastSavedNovelsJson = JSON.stringify(novels);
        return novels;
      }

      // If not in IndexedDB or API, try localStorage (migration path)
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

    // 1. 并行读取所有潜在的存储块 (增加 API 回退)
    let [metadata, wv, char, out, plot, ref, insp] = await Promise.all([
      get<any>(`${METADATA_PREFIX}${novel.id}`),
      get<any>(`${WORLDVIEW_PREFIX}${novel.id}`),
      get<any>(`${CHARACTERS_PREFIX}${novel.id}`),
      get<any>(`${OUTLINE_PREFIX}${novel.id}`),
      get<any>(`${PLOT_OUTLINE_PREFIX}${novel.id}`),
      get<any>(`${REFERENCE_PREFIX}${novel.id}`),
      get<any>(`${INSPIRATION_PREFIX}${novel.id}`),
    ]);

    // --- 增强版同步逻辑：缺什么补什么 ---
    // 检查每一项，如果本地缺失，则尝试从远程获取
    const missingKeys: string[] = [];
    if (!metadata) missingKeys.push(`${METADATA_PREFIX}${novel.id}`);
    if (!wv) missingKeys.push(`${WORLDVIEW_PREFIX}${novel.id}`);
    if (!char) missingKeys.push(`${CHARACTERS_PREFIX}${novel.id}`);
    if (!out) missingKeys.push(`${OUTLINE_PREFIX}${novel.id}`);
    if (!plot) missingKeys.push(`${PLOT_OUTLINE_PREFIX}${novel.id}`);
    if (!ref) missingKeys.push(`${REFERENCE_PREFIX}${novel.id}`);
    if (!insp) missingKeys.push(`${INSPIRATION_PREFIX}${novel.id}`);

    if (missingKeys.length > 0) {
      terminal.log(`[STORAGE] 检测到《${novel.title}》缺失 ${missingKeys.length} 项数据，尝试从远程补全...`);

      const remoteResults = await Promise.all([
        !metadata ? fetchFromApi<any>(`${METADATA_PREFIX}${novel.id}`) : Promise.resolve(null),
        !wv ? fetchFromApi<any>(`${WORLDVIEW_PREFIX}${novel.id}`) : Promise.resolve(null),
        !char ? fetchFromApi<any>(`${CHARACTERS_PREFIX}${novel.id}`) : Promise.resolve(null),
        !out ? fetchFromApi<any>(`${OUTLINE_PREFIX}${novel.id}`) : Promise.resolve(null),
        !plot ? fetchFromApi<any>(`${PLOT_OUTLINE_PREFIX}${novel.id}`) : Promise.resolve(null),
        !ref ? fetchFromApi<any>(`${REFERENCE_PREFIX}${novel.id}`) : Promise.resolve(null),
        !insp ? fetchFromApi<any>(`${INSPIRATION_PREFIX}${novel.id}`) : Promise.resolve(null),
      ]);

      const [rMeta, rWv, rChar, rOut, rPlot, rRef, rInsp] = remoteResults;
      const syncTasks = [];

      if (rMeta) {
        metadata = rMeta;
        syncTasks.push(set(`${METADATA_PREFIX}${novel.id}`, rMeta));
      }
      if (rWv) {
        wv = rWv;
        syncTasks.push(set(`${WORLDVIEW_PREFIX}${novel.id}`, rWv));
      }
      if (rChar) {
        char = rChar;
        syncTasks.push(set(`${CHARACTERS_PREFIX}${novel.id}`, rChar));
      }
      if (rOut) {
        out = rOut;
        syncTasks.push(set(`${OUTLINE_PREFIX}${novel.id}`, rOut));
      }
      if (rPlot) {
        plot = rPlot;
        syncTasks.push(set(`${PLOT_OUTLINE_PREFIX}${novel.id}`, rPlot));
      }
      if (rRef) {
        ref = rRef;
        syncTasks.push(set(`${REFERENCE_PREFIX}${novel.id}`, rRef));
      }
      if (rInsp) {
        insp = rInsp;
        syncTasks.push(set(`${INSPIRATION_PREFIX}${novel.id}`, rInsp));
      }

      if (syncTasks.length > 0) {
        await Promise.all(syncTasks);
        terminal.log(`[STORAGE] 已从远程补全 ${syncTasks.length} 项数据`);
      } else {
        // 如果远程也没有，且本地有部分数据，尝试反向推送 (Edge 场景)
        // 只有当本地有至少一项数据时才推送
        if (metadata || wv || char || out || plot || ref || insp) {
          const pushTasks = [];
          if (metadata) pushTasks.push(saveToApi(`${METADATA_PREFIX}${novel.id}`, metadata));
          if (wv) pushTasks.push(saveToApi(`${WORLDVIEW_PREFIX}${novel.id}`, wv));
          if (char) pushTasks.push(saveToApi(`${CHARACTERS_PREFIX}${novel.id}`, char));
          if (out) pushTasks.push(saveToApi(`${OUTLINE_PREFIX}${novel.id}`, out));
          if (plot) pushTasks.push(saveToApi(`${PLOT_OUTLINE_PREFIX}${novel.id}`, plot));
          if (ref) pushTasks.push(saveToApi(`${REFERENCE_PREFIX}${novel.id}`, ref));
          if (insp) pushTasks.push(saveToApi(`${INSPIRATION_PREFIX}${novel.id}`, insp));

          // 异步执行
          if (pushTasks.length > 0) {
            Promise.all(pushTasks).catch(() => {});
            terminal.log(`[STORAGE] 远程缺失，已触发后台反向同步`);
          }
        }
      }
    }

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

    // 2. 加载章节正文 (保持并行，增加远程回退)
    const contentPromises = (novel.chapters || []).map(async chapter => {
      if (chapter.content && lastSavedContentCache.has(chapter.id)) return;

      let content = await get<string>(`chapter_content_${chapter.id}`);

      // 本地无内容，尝试远程
      if (content === undefined) {
        const remoteContent = await fetchFromApi<string>(`chapter_content_${chapter.id}`);
        if (remoteContent !== null) {
          content = remoteContent;
          // 同步回本地
          await set(`chapter_content_${chapter.id}`, content);
        }
      } else {
        // 本地有内容，异步确保远程也有 (反向同步)
        // 同样，为了不频繁请求，可以做一个简单的检查或者只在特定时机触发
        // 这里为了确保一致性，在加载时做一次覆盖写入是比较稳妥的初始化方式
        // 但对于章节正文，内容较大，我们只在“疑似未同步”时做？
        // 简化策略：异步推送。
        saveToApi(`chapter_content_${chapter.id}`, content).catch(() => {});

        // 同时也同步版本历史
        this.getChapterVersions(chapter.id).then(versions => {
          if (versions && versions.length > 0) {
            saveToApi(`${VERSIONS_PREFIX}${chapter.id}`, versions).catch(() => {});
          }
        });
      }

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
          const data = {
            chapters: novel.chapters.map(({ versions, content, analysisResult, ...rest }) => ({
              ...rest,
              analysisResult: analysisResult?.substring(0, 100),
            })),
            volumes: novel.volumes || [],
          };
          tasks.push(set(`${METADATA_PREFIX}${novel.id}`, data));
          tasks.push(saveToApi(`${METADATA_PREFIX}${novel.id}`, data)); // 同步到服务器
          lastSavedMetadataCache.set(novel.id, currentMetaJson);
          metadataUpdateCount++;
          terminal.log(`[STORAGE] 更新元数据: 《${novel.title}》`);
        }

        // 1.2 世界观拆分块 (Worldview)
        if (novel.worldviewSets) {
          const currentWvJson = this._getWorldviewJson(novel);
          if (currentWvJson !== lastSavedWorldviewCache.get(novel.id)) {
            tasks.push(set(`${WORLDVIEW_PREFIX}${novel.id}`, novel.worldviewSets));
            tasks.push(saveToApi(`${WORLDVIEW_PREFIX}${novel.id}`, novel.worldviewSets));
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
            tasks.push(saveToApi(`${CHARACTERS_PREFIX}${novel.id}`, novel.characterSets));
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
            tasks.push(saveToApi(`${OUTLINE_PREFIX}${novel.id}`, novel.outlineSets));
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
            tasks.push(saveToApi(`${PLOT_OUTLINE_PREFIX}${novel.id}`, novel.plotOutlineSets));
            lastSavedPlotOutlineCache.set(novel.id, currentPlotJson);
            metadataUpdateCount++;
            terminal.log(`[STORAGE] 更新剧情粗纲: 《${novel.title}》`);
          }
        }

        // 1.6 资料库拆分块 (Reference)
        if (novel.referenceFiles || novel.referenceFolders) {
          const currentRefJson = this._getReferenceJson(novel);
          if (currentRefJson !== lastSavedReferenceCache.get(novel.id)) {
            const data = {
              f: novel.referenceFiles || [],
              d: novel.referenceFolders || [],
            };
            tasks.push(set(`${REFERENCE_PREFIX}${novel.id}`, data));
            tasks.push(saveToApi(`${REFERENCE_PREFIX}${novel.id}`, data));
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
            tasks.push(saveToApi(`${INSPIRATION_PREFIX}${novel.id}`, novel.inspirationSets));
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
              tasks.push(saveToApi(`chapter_content_${chapter.id}`, currentContent));
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
        tasks.push(saveToApi(NOVELS_KEY, strippedNovels));
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
      let versions = await get<ChapterVersion[]>(`${VERSIONS_PREFIX}${chapterId}`);
      if (!versions) {
        const remoteVersions = await fetchFromApi<ChapterVersion[]>(`${VERSIONS_PREFIX}${chapterId}`);
        if (remoteVersions) {
          versions = remoteVersions;
          await set(`${VERSIONS_PREFIX}${chapterId}`, versions);
        }
      }
      return versions || [];
    } catch (e) {
      console.error('Failed to get chapter versions', e);
      return [];
    }
  },

  async saveChapterVersions(chapterId: number, versions: ChapterVersion[]): Promise<void> {
    try {
      await set(`${VERSIONS_PREFIX}${chapterId}`, versions);
      await saveToApi(`${VERSIONS_PREFIX}${chapterId}`, versions);
    } catch (e) {
      console.error('Failed to save chapter versions', e);
    }
  },

  async deleteChapterVersions(chapterId: number): Promise<void> {
    try {
      await del(`${VERSIONS_PREFIX}${chapterId}`);
      await deleteFromApi(`${VERSIONS_PREFIX}${chapterId}`);
    } catch (e) {
      console.error('Failed to delete chapter versions', e);
    }
  },

  async deleteChapterContent(chapterId: number): Promise<void> {
    try {
      await del(`chapter_content_${chapterId}`);
      await deleteFromApi(`chapter_content_${chapterId}`);
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

      if (!workflows) {
        // 尝试从远程获取
        const remoteWorkflows = await fetchFromApi<any[]>(WORKFLOWS_KEY);
        if (remoteWorkflows) {
          workflows = remoteWorkflows;
          await set(WORKFLOWS_KEY, workflows);
        }
      } else {
        // 本地有，远程无 (或远程为空数组但本地有内容) -> 自动上报
        const remoteWorkflows = await fetchFromApi<any[]>(WORKFLOWS_KEY);

        // 核心修复：如果远程为空，或者远程是空数组但本地有数据，则强制上报
        const shouldPush =
          !remoteWorkflows || (Array.isArray(remoteWorkflows) && remoteWorkflows.length === 0 && workflows.length > 0);

        if (shouldPush) {
          terminal.log(
            `[STORAGE] 检测到服务器工作流缺失 (本地: ${workflows.length}, 远程: ${
              remoteWorkflows?.length || 0
            })，正在同步...`,
          );
          saveToApi(WORKFLOWS_KEY, workflows).catch(e => console.error('[STORAGE] 工作流同步失败', e));
        }
      }

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
        await saveToApi(WORKFLOWS_KEY, serializableWorkflows);
      } catch (e) {
        terminal.error(`[STORAGE] 工作流保存至 IndexedDB 失败 (队列执行): ${e}`);
        // 这里不抛出异常，防止某个任务失败导致后续队列永久中断，仅记录错误
      }
    });

    return workflowSaveQueue;
  },

  async getActiveWorkflowId(): Promise<string | null> {
    try {
      // 本地优先
      let id = await get<string>(ACTIVE_WF_ID_KEY);
      if (!id) {
        const remoteId = await fetchFromApi<string>(ACTIVE_WF_ID_KEY);
        // @ts-ignore
        id = remoteId || localStorage.getItem('active_workflow_id');
        if (id && typeof id === 'string') {
          await set(ACTIVE_WF_ID_KEY, id);
        }
      }
      return id || localStorage.getItem('active_workflow_id');
    } catch (e) {
      return localStorage.getItem('active_workflow_id');
    }
  },

  async setActiveWorkflowId(id: string): Promise<void> {
    try {
      await set(ACTIVE_WF_ID_KEY, id);
      await saveToApi(ACTIVE_WF_ID_KEY, id);
      localStorage.setItem('active_workflow_id', id); // 保持同步以兼容
    } catch (e) {}
  },
};
