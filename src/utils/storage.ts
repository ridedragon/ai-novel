import * as idb from 'idb-keyval';
const { del, get, set } = idb;
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

// 后端 API 地址 - 优先使用固定配置的环境变量或固定地址，适配多设备同步
const getApiBaseUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('api_url');
  if (override) return override;

  const hostname = window.location.hostname || 'localhost';
  const port = '3001';

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${window.location.protocol}//${hostname}:${port}/api/storage`;
  }

  return `${window.location.protocol}//${hostname}:${port}/api/storage`;
};

const API_BASE_URL = getApiBaseUrl();

let serverConnectionStatus: 'unknown' | 'connected' | 'disconnected' = 'unknown';
let serverConnectionCheckPromise: Promise<'connected' | 'disconnected'> | null = null;

export const checkServerConnection = async (): Promise<'connected' | 'disconnected'> => {
  if (serverConnectionStatus === 'connected') return 'connected';
  if (serverConnectionCheckPromise) return serverConnectionCheckPromise;

  serverConnectionCheckPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${API_BASE_URL}/__health`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      serverConnectionStatus = response.ok ? 'connected' : 'disconnected';
      return serverConnectionStatus;
    } catch {
      serverConnectionStatus = 'disconnected';
      return 'disconnected';
    } finally {
      serverConnectionCheckPromise = null;
    }
  })();

  return serverConnectionCheckPromise;
};

export const getServerConnectionStatus = () => serverConnectionStatus;

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

  _mergePendingChapter(existing: any, incoming: any) {
    const existingContent = typeof existing?.content === 'string' ? existing.content : '';
    const incomingContent = typeof incoming?.content === 'string' ? incoming.content : '';
    const preferredContent = incomingContent.length >= existingContent.length ? incomingContent : existingContent;

    return {
      ...existing,
      ...incoming,
      volumeId: incoming?.volumeId || existing?.volumeId,
      content: preferredContent,
      sourceContent:
        (incoming?.sourceContent?.length || 0) >= (existing?.sourceContent?.length || 0)
          ? incoming?.sourceContent
          : existing?.sourceContent,
      optimizedContent:
        (incoming?.optimizedContent?.length || 0) >= (existing?.optimizedContent?.length || 0)
          ? incoming?.optimizedContent
          : existing?.optimizedContent,
      versions:
        (incoming?.versions?.length || 0) >= (existing?.versions?.length || 0)
          ? incoming?.versions
          : existing?.versions,
      analysisResult:
        (incoming?.analysisResult?.length || 0) >= (existing?.analysisResult?.length || 0)
          ? incoming?.analysisResult
          : existing?.analysisResult,
      logicScore: incoming?.logicScore ?? existing?.logicScore,
      activeVersionId: incoming?.activeVersionId ?? existing?.activeVersionId,
      showingVersion: incoming?.showingVersion ?? existing?.showingVersion,
      summaryRange: incoming?.summaryRange ?? existing?.summaryRange,
      summaryRangeVolume: incoming?.summaryRangeVolume ?? existing?.summaryRangeVolume,
      globalIndex: incoming?.globalIndex ?? existing?.globalIndex,
      volumeIndex: incoming?.volumeIndex ?? existing?.volumeIndex,
    };
  },

  _mergePendingNovel(existing: Novel, incoming: Novel): Novel {
    const existingChapters = existing.chapters || [];
    const incomingChapters = incoming.chapters || [];
    const chapterMap = new Map<number, any>();

    existingChapters.forEach(chapter => {
      chapterMap.set(chapter.id, chapter);
    });

    incomingChapters.forEach(chapter => {
      const prev = chapterMap.get(chapter.id);
      chapterMap.set(chapter.id, prev ? this._mergePendingChapter(prev, chapter) : chapter);
    });

    const mergedChapters = [
      ...incomingChapters.map(chapter => chapterMap.get(chapter.id)),
      ...existingChapters
        .filter(chapter => !incomingChapters.some(incomingChapter => incomingChapter.id === chapter.id))
        .map(chapter => chapterMap.get(chapter.id)),
    ];

    const mergedVolumesMap = new Map<string, any>();
    (existing.volumes || []).forEach(volume => mergedVolumesMap.set(volume.id, volume));
    (incoming.volumes || []).forEach(volume => {
      const prev = mergedVolumesMap.get(volume.id);
      mergedVolumesMap.set(volume.id, { ...prev, ...volume });
    });

    const pickRicherArray = <T,>(incomingArray: T[] | undefined, existingArray: T[] | undefined): T[] | undefined => {
      const incomingLength = incomingArray?.length || 0;
      const existingLength = existingArray?.length || 0;
      return incomingLength >= existingLength ? incomingArray : existingArray;
    };

    return {
      ...existing,
      ...incoming,
      chapters: mergedChapters,
      volumes: Array.from(mergedVolumesMap.values()),
      outlineSets: pickRicherArray(incoming.outlineSets, existing.outlineSets),
      characterSets: pickRicherArray(incoming.characterSets, existing.characterSets),
      worldviewSets: pickRicherArray(incoming.worldviewSets, existing.worldviewSets),
      inspirationSets: pickRicherArray(incoming.inspirationSets, existing.inspirationSets),
      plotOutlineSets: pickRicherArray(incoming.plotOutlineSets, existing.plotOutlineSets),
      referenceFiles: pickRicherArray(incoming.referenceFiles, existing.referenceFiles),
      referenceFolders: pickRicherArray(incoming.referenceFolders, existing.referenceFolders),
    };
  },

  _mergePendingNovels(existingNovels: Novel[] | null, incomingNovels: Novel[]): Novel[] {
    if (!existingNovels || existingNovels.length === 0) {
      return incomingNovels;
    }

    const mergedMap = new Map<string, Novel>();
    existingNovels.forEach(novel => mergedMap.set(novel.id, novel));

    incomingNovels.forEach(novel => {
      const prev = mergedMap.get(novel.id);
      mergedMap.set(novel.id, prev ? this._mergePendingNovel(prev, novel) : novel);
    });

    return incomingNovels.map(novel => mergedMap.get(novel.id) || novel);
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
          const existing = mergedMap.get(rn.id);
          if (!existing) {
            // 发现远程有本地没有的书籍
            mergedMap.set(rn.id, rn);
            needsLocalSave = true;
          } else {
            // 两者都有，需要基于时间戳进行冲突解决
            const localTime = (existing as any).updatedAt || existing.createdAt || 0;
            const remoteTime = (rn as any).updatedAt || rn.createdAt || 0;
            if (remoteTime > localTime) {
              // 远程更新，使用远程版本
              mergedMap.set(rn.id, rn);
              needsLocalSave = true;
              terminal.log(`[STORAGE] 书籍《${rn.title}》发现远程更新，使用远程版本`);
            }
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

    // 如果 metadata 缺失，尝试从远程获取，否则使用传入的章节数据
    if (!metadata) {
      terminal.log(`[STORAGE] 本地未找到《${novel.title}》的元数据，尝试从远程获取...`);
      metadata = await fetchFromApi<any>(`${METADATA_PREFIX}${novel.id}`);
      if (metadata) {
        await set(`${METADATA_PREFIX}${novel.id}`, metadata);
        terminal.log(`[STORAGE] 已从远程恢复《${novel.title}》的元数据`);
      }
    }

    // 核心修复：如果 metadata 不存在，需要初始化基础结构
    if (!metadata) {
      terminal.warn(`[STORAGE] 《${novel.title}》元数据完全缺失，使用初始结构`);
      metadata = {
        chapters: novel.chapters || [],
        volumes: novel.volumes || [],
      };
    }

    // 安全合并：只更新存在的字段，保留目标对象的现有属性
    const safeMerge = (target: any, source: any) => {
      if (!source || typeof source !== 'object') return;
      Object.keys(source).forEach(key => {
        if (source[key] !== undefined) {
          target[key] = source[key];
        }
      });
    };

    // 保存原始章节数据用于后续加载
    const originalChapters = novel.chapters || [];
    const originalVolumes = novel.volumes || [];

    // 创建章节ID到原始章节的映射
    const originalChapterMap = new Map(originalChapters.map(ch => [ch.id, ch]));

    // 应用元数据到小说对象，但不覆盖章节内容
    if (metadata && metadata.chapters) {
      // 合并章节信息，但保留原始章节的内容
      novel.chapters = metadata.chapters.map((metaChapter: any) => {
        const originalChapter = originalChapterMap.get(metaChapter.id);
        if (originalChapter) {
          // 保留原始章节的内容，只更新元数据字段
          return {
            ...originalChapter,
            ...metaChapter,
            content: originalChapter.content, // 关键：保留原始内容！
          };
        }
        return metaChapter;
      });
    }
    
    // 合并其他元数据（volumes等）
    if (metadata && metadata.volumes) {
      novel.volumes = metadata.volumes;
    }

    // --- 双轨兼容逻辑：如果新 Key 有值则优先使用，否则沿用 Metadata 里的旧值 (实现无损平滑迁移) ---
    // 核心修复：确保所有字段都有默认值，防止文件夹丢失
    novel.worldviewSets = wv || novel.worldviewSets || [];
    novel.characterSets = char || novel.characterSets || [];
    novel.outlineSets = out || novel.outlineSets || [];
    novel.plotOutlineSets = plot || novel.plotOutlineSets || [];
    if (ref) {
      novel.referenceFiles = ref.f || [];
      novel.referenceFolders = ref.d || [];
    } else {
      novel.referenceFiles = novel.referenceFiles || [];
      novel.referenceFolders = novel.referenceFolders || [];
    }
    novel.inspirationSets = insp || novel.inspirationSets || [];

    // 初始化所有脏检查缓存，防止首次保存时触发误判
    lastSavedMetadataCache.set(novel.id, this._getNovelMetadataJson(novel));
    lastSavedWorldviewCache.set(novel.id, this._getWorldviewJson(novel));
    lastSavedCharactersCache.set(novel.id, this._getCharactersJson(novel));
    lastSavedOutlineCache.set(novel.id, this._getOutlineJson(novel));
    lastSavedPlotOutlineCache.set(novel.id, this._getPlotOutlineJson(novel));
    lastSavedReferenceCache.set(novel.id, this._getReferenceJson(novel));
    lastSavedInspirationCache.set(novel.id, this._getInspirationJson(novel));

    // 2. 加载章节正文 (保持并行，增加远程回退)
    const contentPromises = (novel.chapters || []).map(async chapter => {
      // 关键修改：如果内存中已经有内容，优先使用内存中的内容
      // 但需要确保缓存是最新的
      if (chapter.content && lastSavedContentCache.has(chapter.id)) {
        // 如果缓存中的内容和内存中的内容一致，直接返回
        if (lastSavedContentCache.get(chapter.id) === chapter.content) {
          return;
        }
      }

      // 尝试从存储加载内容
      const localContent = await get<string>(`chapter_content_${chapter.id}`);
      let content: string = localContent || '';

      // 本地无内容，尝试远程
      if (!content) {
        const remoteContent = await fetchFromApi<string>(`chapter_content_${chapter.id}`);
        if (remoteContent !== null) {
          content = remoteContent;
          // 同步回本地
          await set(`chapter_content_${chapter.id}`, remoteContent);
        }
      } else {
        // 本地有内容，异步确保远程也有 (反向同步)
        const contentToSync = content;
        saveToApi(`chapter_content_${chapter.id}`, contentToSync).catch(() => {});

        // 同时也同步版本历史
        this.getChapterVersions(chapter.id).then(versions => {
          if (versions && versions.length > 0) {
            saveToApi(`${VERSIONS_PREFIX}${chapter.id}`, versions).catch(() => {});
          }
        });
      }

      // 关键修改：只有当内存中没有内容时，才用存储中的内容覆盖
      if (!chapter.content || chapter.content.length === 0) {
        chapter.content = content;
      }
      // 更新缓存
      lastSavedContentCache.set(chapter.id, chapter.content);
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
  // 保存防抖定时器
  _saveDebounceTimer: null as number | null,
  // 待保存的 novels 引用
  _pendingNovels: null as Novel[] | null,

  async saveNovels(novels: Novel[]): Promise<void> {
    const startTime = Date.now();

    // 如果有正在等待的保存，取消它
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
    }

    // 更新待保存的 novels
    // 核心修复：防抖期间不能让“较旧快照”直接覆盖“较新快照”
    // 这里按小说/章节进行合并，优先保留更完整的章节列表、更长的正文内容和更丰富的卷信息
    this._pendingNovels = this._mergePendingNovels(this._pendingNovels, novels);

    // 验证假设：检测高频写入（仅记录，不阻塞）
    if (startTime - this._lastSaveTime < 500) {
      this._saveCountInWindow++;
      if (this._saveCountInWindow > 5 && this._saveCountInWindow % 10 === 0) {
        terminal.warn(
          `[FREQ ALERT] storage.saveNovels 触发频率过高: 500ms内达 ${this._saveCountInWindow} 次 (已启用防抖)`
        );
      }
    } else {
      this._saveCountInWindow = 0;
    }
    this._lastSaveTime = startTime;

    // 使用 Promise 包装防抖逻辑，使调用者可以等待最终完成
    return new Promise((resolve, reject) => {
      this._saveDebounceTimer = setTimeout(async () => {
        try {
          await this._doSaveNovels(this._pendingNovels!);
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 300) as unknown as number; // 300ms 防抖
    });
  },

  // 实际执行保存的内部函数
  async _doSaveNovels(novels: Novel[]): Promise<void> {
    const startTime = Date.now();

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
        // --- 1. 原子化脏检查与异步任务分发 ---
        // 注意：即使没有章节，也要保存其他数据（分卷、世界观、设定等）

        // 1.1 索引元数据 (Metadata: 章节索引、分卷)
        const currentMetaJson = this._getNovelMetadataJson(novel);
        if (currentMetaJson !== lastSavedMetadataCache.get(novel.id)) {
          const data = {
            chapters: (novel.chapters || []).map(({ versions, content, analysisResult, ...rest }) => ({
              ...rest,
              analysisResult: analysisResult,
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
        const currentWvJson = this._getWorldviewJson(novel);
        if (currentWvJson !== lastSavedWorldviewCache.get(novel.id)) {
          tasks.push(set(`${WORLDVIEW_PREFIX}${novel.id}`, novel.worldviewSets || []));
          tasks.push(saveToApi(`${WORLDVIEW_PREFIX}${novel.id}`, novel.worldviewSets || []));
          lastSavedWorldviewCache.set(novel.id, currentWvJson);
          metadataUpdateCount++;
          terminal.log(`[STORAGE] 更新世界观: 《${novel.title}》`);
        }

        // 1.3 角色集拆分块 (Characters)
        const currentCharJson = this._getCharactersJson(novel);
        if (currentCharJson !== lastSavedCharactersCache.get(novel.id)) {
          tasks.push(set(`${CHARACTERS_PREFIX}${novel.id}`, novel.characterSets || []));
          tasks.push(saveToApi(`${CHARACTERS_PREFIX}${novel.id}`, novel.characterSets || []));
          lastSavedCharactersCache.set(novel.id, currentCharJson);
          metadataUpdateCount++;
          terminal.log(`[STORAGE] 更新角色集: 《${novel.title}》`);
        }

        // 1.4 大纲集拆分块 (Outline)
        const currentOutJson = this._getOutlineJson(novel);
        if (currentOutJson !== lastSavedOutlineCache.get(novel.id)) {
          tasks.push(set(`${OUTLINE_PREFIX}${novel.id}`, novel.outlineSets || []));
          tasks.push(saveToApi(`${OUTLINE_PREFIX}${novel.id}`, novel.outlineSets || []));
          lastSavedOutlineCache.set(novel.id, currentOutJson);
          metadataUpdateCount++;
          terminal.log(`[STORAGE] 更新大纲: 《${novel.title}》`);
        }

        // 1.5 剧情粗纲拆分块 (Plot Outline)
        const currentPlotJson = this._getPlotOutlineJson(novel);
        if (currentPlotJson !== lastSavedPlotOutlineCache.get(novel.id)) {
          tasks.push(set(`${PLOT_OUTLINE_PREFIX}${novel.id}`, novel.plotOutlineSets || []));
          tasks.push(saveToApi(`${PLOT_OUTLINE_PREFIX}${novel.id}`, novel.plotOutlineSets || []));
          lastSavedPlotOutlineCache.set(novel.id, currentPlotJson);
          metadataUpdateCount++;
          terminal.log(`[STORAGE] 更新剧情粗纲: 《${novel.title}》`);
        }

        // 1.6 资料库拆分块 (Reference)
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

        // 1.7 灵感集拆分块 (Inspiration)
        const currentInspJson = this._getInspirationJson(novel);
        if (currentInspJson !== lastSavedInspirationCache.get(novel.id)) {
          tasks.push(set(`${INSPIRATION_PREFIX}${novel.id}`, novel.inspirationSets || []));
          tasks.push(saveToApi(`${INSPIRATION_PREFIX}${novel.id}`, novel.inspirationSets || []));
          lastSavedInspirationCache.set(novel.id, currentInspJson);
          metadataUpdateCount++;
          terminal.log(`[STORAGE] 更新灵感集: 《${novel.title}》`);
        }

        // --- 2. 章节正文增量保存 (纳入并行清单) ---
        // 只有当有章节时才处理
        if (novel.chapters && novel.chapters.length > 0) {
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

  // 获取特定章节的正文内容（含内存缓存和远程回退控制）
  async getChapterContent(chapterId: number): Promise<string> {
    try {
      // 1. 尝试从内存缓存获取
      const cached = lastSavedContentCache.get(chapterId);
      if (cached !== undefined) {
        return cached;
      }

      // 2. 尝试从 IndexedDB 获取
      const localValue = await get<string>(`chapter_content_${chapterId}`);
      let content: string = localValue ?? '';

      // 3. 尝试从 API 获取 (如果本地为空，则回退)
      if (!content) {
        const remoteValue = await fetchFromApi<string>(`chapter_content_${chapterId}`);
        if (remoteValue !== null) {
          content = remoteValue;
          // 同步回本地
          await set(`chapter_content_${chapterId}`, remoteValue);
        }
      }

      // 4. 更新缓存并返回
      lastSavedContentCache.set(chapterId, content);
      return content;
    } catch (e) {
      console.error(`[STORAGE] Failed to get chapter content for ${chapterId}`, e);
      return '';
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
        terminal.error(`[STORAGE] 工作流保存失败: ${e}`);
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
