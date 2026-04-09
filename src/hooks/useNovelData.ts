import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import {
  Chapter,
  CharacterSet,
  InspirationSet,
  Novel,
  NovelVolume,
  OutlineSet,
  PlotOutlineSet,
  WorldviewSet,
} from '../types';
import { storage } from '../utils/storage';
import { isSummaryChapter, recalibrateSummaries, sortChapters } from '../utils/SummaryManager';
import {
  calculateNewChapterNumbering,
  generateChapterTitle,
  recalibrateChapterNumbering,
  switchNumberingMode,
} from '../utils/chapterNumbering';

export function useNovelData() {
  const [novels, _setNovels] = useState<Novel[]>([]);
  const novelsRef = useRef<Novel[]>([]);

  // 【BUG 修复】：章节复活黑名单
  const deletedChapterIdsRef = useRef<Set<number>>(new Set());

  // 自动保存的防抖定时器
  const saveDebounceTimerRef = useRef<number | null>(null);

  // 活跃状态
  const [activeNovelId, setActiveNovelId] = useState<string | null>(null);
  const activeNovelIdRef = useRef(activeNovelId);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);

  // 子模块活跃集 ID
  const [activeOutlineSetId, setActiveOutlineSetId] = useState<string | null>(null);
  const [activeCharacterSetId, setActiveCharacterSetId] = useState<string | null>(null);
  const [activeWorldviewSetId, setActiveWorldviewSetId] = useState<string | null>(null);
  const [activeInspirationSetId, setActiveInspirationSetId] = useState<string | null>(null);
  const [activePlotOutlineSetId, setActivePlotOutlineSetId] = useState<string | null>(null);

  // 同步 Ref
  useEffect(() => {
    activeNovelIdRef.current = activeNovelId;
  }, [activeNovelId]);

  // 统一状态更新包装器
  const setNovels = useCallback((value: Novel[] | ((prev: Novel[]) => Novel[])) => {
    const startTime = Date.now();
    _setNovels(prev => {
      let next = typeof value === 'function' ? (value as any)(prev) : value;
      if (next === prev) return prev;

      // 强制过滤已删除章节，防止“亡灵复活”
      if (deletedChapterIdsRef.current.size > 0) {
        next = next.map((novel: Novel) => ({
          ...novel,
          chapters: (novel.chapters || []).filter((c: Chapter) => !deletedChapterIdsRef.current.has(c.id)),
        }));
      }

      if (next === prev) return prev;
      novelsRef.current = next;

      const duration = Date.now() - startTime;
      if (duration > 100) {
        terminal.warn(`[PERF ALERT] Novel Data State Update: ${duration}ms`);
      }
      return next;
    });
  }, []);

  // 初始加载
  useEffect(() => {
    storage.getNovels().then(loaded => setNovels(loaded));
  }, [setNovels]);

  // 自动保存逻辑（添加防抖）
  useEffect(() => {
    if (novels.length > 0) {
      // 清除之前的定时器
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
      }

      // 设置新的防抖定时器（500ms 延迟保存）
      saveDebounceTimerRef.current = setTimeout(() => {
        storage.saveNovels(novels).catch(e => {
          terminal.error(`[STORAGE] 自动保存失败: ${e.message}`);
        });
      }, 500) as unknown as number;
    }

    // 组件卸载时清除定时器
    return () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
      }
    };
  }, [novels]);

  // 派生状态 (提前定义以供 Effect 使用)
  const activeNovel = useMemo(() => novels.find(n => n.id === activeNovelId), [novels, activeNovelId]);
  const chapters = useMemo(() => activeNovel?.chapters || [], [activeNovel]);
  const sortedChapters = useMemo(() => sortChapters(chapters), [chapters]);
  const volumes = useMemo(() => activeNovel?.volumes || [], [activeNovel]);

  const chaptersByVolume = useMemo(() => {
    const group: Record<string, Chapter[]> = { uncategorized: [] };
    const validVolumeIds = new Set(volumes.map(v => String(v.id)));
    sortedChapters.forEach(c => {
      const cid = c.volumeId ? String(c.volumeId) : null;
      if (cid && validVolumeIds.has(cid)) {
        if (!group[cid]) group[cid] = [];
        group[cid].push(c);
      } else {
        group['uncategorized'].push(c);
      }
    });
    return group;
  }, [sortedChapters, volumes]);

  // 书籍切换与 Data Healing 逻辑
  useEffect(() => {
    if (activeNovelId) {
      const novel = novelsRef.current.find(n => n.id === activeNovelId);
      if (novel) {
        storage.loadNovelContent(novel).then(async loadedNovel => {
          const currentVolumes = loadedNovel.volumes || [];
          const orphanVolumeIds = new Set(
            (loadedNovel.chapters || [])
              .map(c => c.volumeId)
              .filter(id => id && id.trim() !== '' && !currentVolumes.some(v => String(v.id) === String(id))),
          );

          if (orphanVolumeIds.size > 0) {
            terminal.log(`[DATA HEALING] 检测到 ${orphanVolumeIds.size} 个丢失名称的分卷，启动找回程序...`);
            let healed = false;
            const newVolumes = [...currentVolumes];
            const remainingOrphans = new Set(orphanVolumeIds);

            // 从资料集 ID 匹配中找回
            remainingOrphans.forEach(id => {
              if (deletedChapterIdsRef.current.has(id as any)) return;
              const matchedSet =
                loadedNovel.outlineSets?.find(s => String(s.id) === String(id)) ||
                loadedNovel.worldviewSets?.find(s => String(s.id) === String(id)) ||
                loadedNovel.characterSets?.find(s => String(s.id) === String(id));

              if (matchedSet) {
                newVolumes.push({ id: String(id), title: matchedSet.name, collapsed: false });
                remainingOrphans.delete(id);
                healed = true;
              }
            });

            // 兜底策略
            remainingOrphans.forEach(id => {
              if (deletedChapterIdsRef.current.has(id as any)) return;
              newVolumes.push({
                id: String(id),
                title: `恢复的分卷 (${String(id).substring(0, 4)})`,
                collapsed: false,
              });
              healed = true;
            });

            if (healed) loadedNovel.volumes = newVolumes;
          }

          setNovels(prev => prev.map(n => (n.id === loadedNovel.id ? { ...loadedNovel } : n)));

          // 自动选择第一章
          setActiveChapterId(prev => {
            if (prev === null && loadedNovel.chapters && loadedNovel.chapters.length > 0) {
              return loadedNovel.chapters[0].id;
            }
            return prev;
          });
        });
      }
    }
  }, [activeNovelId, setNovels]);

  // 当切换小说时，尝试恢复子模块的活跃 ID
  useEffect(() => {
    if (activeNovelId && activeNovel) {
      if (activeNovel.outlineSets?.length && !activeNovel.outlineSets.some(s => s.id === activeOutlineSetId)) {
        setActiveOutlineSetId(activeNovel.outlineSets[0].id);
      }
      if (activeNovel.characterSets?.length && !activeNovel.characterSets.some(s => s.id === activeCharacterSetId)) {
        setActiveCharacterSetId(activeNovel.characterSets[0].id);
      }
      if (activeNovel.worldviewSets?.length && !activeNovel.worldviewSets.some(s => s.id === activeWorldviewSetId)) {
        setActiveWorldviewSetId(activeNovel.worldviewSets[0].id);
      }
      if (
        activeNovel.inspirationSets?.length &&
        !activeNovel.inspirationSets.some(s => s.id === activeInspirationSetId)
      ) {
        setActiveInspirationSetId(activeNovel.inspirationSets[0].id);
      }
      if (
        activeNovel.plotOutlineSets?.length &&
        !activeNovel.plotOutlineSets.some(s => s.id === activePlotOutlineSetId)
      ) {
        setActivePlotOutlineSetId(activeNovel.plotOutlineSets[0].id);
      }
    }
  }, [
    activeNovelId,
    activeNovel,
    activeOutlineSetId,
    activeCharacterSetId,
    activeWorldviewSetId,
    activeInspirationSetId,
    activePlotOutlineSetId,
  ]);

  const normalizeChapters = useCallback(
    (chapterList: Chapter[]) => {
      const recalibratedNumbering = recalibrateChapterNumbering([...chapterList]);
      const mode = activeNovel?.chapterNumberingMode || 'global';
      const renumberedTitles = recalibratedNumbering.map(chapter => {
        if (!chapter.subtype || chapter.subtype === 'story') {
          const displayIndex = mode === 'perVolume' ? chapter.volumeIndex : chapter.globalIndex;
          return { ...chapter, title: generateChapterTitle(displayIndex || 1, chapter.title) };
        }
        return chapter;
      });

      return sortChapters(recalibrateSummaries(renumberedTitles));
    },
    [activeNovel],
  );

  const setChapters = useCallback(
    (value: Chapter[] | ((prev: Chapter[]) => Chapter[])) => {
      if (!activeNovelId) return;
      setNovels(prevNovels =>
        prevNovels.map(n => {
          if (n.id === activeNovelId) {
            const currentChapters = n.chapters || [];
            const newChapters = typeof value === 'function' ? (value as any)(currentChapters) : value;
            return { ...n, chapters: normalizeChapters(newChapters) };
          }
          return n;
        }),
      );
    },
    [activeNovelId, setNovels, normalizeChapters],
  );

  const setVolumes = useCallback(
    (value: NovelVolume[] | ((prev: NovelVolume[]) => NovelVolume[])) => {
      if (!activeNovelId) return;
      setNovels(prevNovels =>
        prevNovels.map(n => {
          if (n.id === activeNovelId) {
            const currentVolumes = n.volumes || [];
            const nextVolumes = typeof value === 'function' ? (value as any)(currentVolumes) : value;
            return { ...n, volumes: nextVolumes };
          }
          return n;
        }),
      );
    },
    [activeNovelId, setNovels],
  );

  const updateNovel = useCallback(
    (id: string, updates: Partial<Novel>) => {
      setNovels(prev => prev.map(n => (n.id === id ? { ...n, ...updates } : n)));
    },
    [setNovels],
  );

  // --- 高级操作方法 ---

  const renameNovel = useCallback(
    (id: string, newTitle: string) => {
      updateNovel(id, { title: newTitle });
    },
    [updateNovel],
  );

  const deleteNovel = useCallback(
    (id: string) => {
      setNovels(prev => prev.filter(n => n.id !== id));
      if (activeNovelIdRef.current === id) {
        setActiveNovelId(null);
        setActiveChapterId(null);
      }
    },
    [setNovels],
  );

  const renameVolume = useCallback(
    (volumeId: string, newTitle: string) => {
      setVolumes(prev => prev.map(v => (v.id === volumeId ? { ...v, title: newTitle } : v)));
    },
    [setVolumes],
  );

  const renameChapter = useCallback(
    (chapterId: number, newTitle: string) => {
      setChapters(prev => prev.map(c => (c.id === chapterId ? { ...c, title: newTitle } : c)));
    },
    [setChapters],
  );

  const addChapter = useCallback(
    (volumeId?: string) => {
      const newId = Date.now() + Math.floor(Math.random() * 1000);
      setChapters(prev => {
        const mode = activeNovel?.chapterNumberingMode || 'global';
        const { globalIndex, volumeIndex } = calculateNewChapterNumbering(prev, volumeId);
        const displayIndex = mode === 'perVolume' ? volumeIndex : globalIndex;
        const title = generateChapterTitle(displayIndex);
        
        const newChapter: Chapter = {
          id: newId,
          title,
          content: '',
          volumeId,
          globalIndex,
          volumeIndex,
        };
        
        return [...prev, newChapter];
      });
      setActiveChapterId(newId);
      return newId;
    },
    [setChapters, activeNovel],
  );

  const deleteChapter = useCallback(
    (chapterId: number) => {
      const novel = novelsRef.current.find(n => n.id === activeNovelIdRef.current);
      if (!novel) return;

      const storyChapters = (novel.chapters || []).filter(c => !c.subtype || c.subtype === 'story');
      const cascadeIds = new Set<number>([chapterId]);

      (novel.chapters || []).forEach(c => {
        if (c.subtype === 'small_summary' || c.subtype === 'big_summary') {
          const range = c.summaryRange?.split('-').map(Number);
          if (range && range.length === 2) {
            const lastStoryIdx = range[1] - 1;
            const targetStoryChapter = storyChapters[lastStoryIdx];
            if (targetStoryChapter && targetStoryChapter.id === chapterId) {
              cascadeIds.add(c.id);
            }
          }
        }
      });

      cascadeIds.forEach(id => deletedChapterIdsRef.current.add(id));
      cascadeIds.forEach(id => {
        storage.deleteChapterContent(id).catch(() => {});
        storage.deleteChapterVersions(id).catch(() => {});
      });

      let newChapters = (novel.chapters || []).filter(c => !cascadeIds.has(c.id));
      // 删除章节后重新校准编号
      newChapters = recalibrateChapterNumbering(newChapters);
      // 根据当前模式更新章节标题（保留原有章节名称）
      const mode = novel.chapterNumberingMode || 'global';
      newChapters = newChapters.map(c => {
        if (!c.subtype || c.subtype === 'story') {
          const displayIndex = mode === 'perVolume' ? c.volumeIndex : c.globalIndex;
          return { ...c, title: generateChapterTitle(displayIndex || 1, c.title) };
        }
        return c;
      });
      setChapters(newChapters);

      setActiveChapterId(prev => (prev === chapterId ? newChapters[0]?.id || null : prev));
    },
    [setChapters],
  );

  const addVolume = useCallback(
    (name: string) => {
      const newVolume: NovelVolume = {
        id:
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).substring(2),
        title: name.trim(),
        collapsed: false,
      };
      setVolumes(prev => [...prev, newVolume]);
      return newVolume.id;
    },
    [setVolumes],
  );

  const deleteVolume = useCallback(
    (volumeId: string) => {
      setVolumes(prev => prev.filter(v => v.id !== volumeId));

      setChapters(prev => {
        const chaptersInVolume = prev.filter(c => c.volumeId === volumeId);
        const chapterIdsToDelete = new Set(chaptersInVolume.map(c => c.id));
        const storyChapters = prev.filter(c => !c.subtype || c.subtype === 'story');
        const orphanSummaryIds = new Set<number>();

        prev.forEach(c => {
          if (c.subtype === 'small_summary' || c.subtype === 'big_summary') {
            const range = c.summaryRange?.split('-').map(Number);
            if (range && range.length === 2) {
              const lastStoryIdx = range[1] - 1;
              const targetStoryChapter = storyChapters[lastStoryIdx];
              if (targetStoryChapter && chapterIdsToDelete.has(targetStoryChapter.id)) {
                orphanSummaryIds.add(c.id);
              }
            }
          }
        });

        const allIdsToDelete = new Set([...chapterIdsToDelete, ...orphanSummaryIds]);
        allIdsToDelete.forEach(id => deletedChapterIdsRef.current.add(id));
        allIdsToDelete.forEach(id => {
          storage.deleteChapterContent(id).catch(() => {});
          storage.deleteChapterVersions(id).catch(() => {});
        });

        return prev.filter(c => !allIdsToDelete.has(c.id));
      });

      setActiveChapterId(prev => {
        // Bug 2 修复：检查当前活跃章节是否属于被删卷
        // 从 novelsRef 读取章节列表（此时 setChapters 的更新可能还未反映到 novelsRef）
        const currentNovel = novelsRef.current.find(n => n.id === activeNovelIdRef.current);
        const currentChapters = currentNovel?.chapters || [];
        const currentChapter = currentChapters.find(c => c.id === prev);
        // 如果当前活跃章节属于被删卷，切换到第一个不属于被删卷的章节
        if (!currentChapter || currentChapter.volumeId === volumeId) {
          const remaining = currentChapters.filter(c => c.volumeId !== volumeId);
          return remaining.length > 0 ? remaining[0].id : null;
        }
        return prev;
      });
    },
    [setVolumes, setChapters],
  );

  const addNovel = useCallback(
    (
      title: string,
      volumeName?: string,
      coverUrl?: string,
      category?: string,
      status?: '连载中' | '已完结',
      description?: string,
      chapterNumberingMode?: 'global' | 'perVolume'
    ) => {
      const volumeId =
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).substring(2);
      const initialVolumes: NovelVolume[] = [];
      if (volumeName?.trim()) {
        initialVolumes.push({
          id: volumeId,
          title: volumeName.trim(),
          collapsed: false,
        });
      }

      const newNovel: Novel = {
        id: Date.now().toString(),
        title: title.trim(),
        chapters: [],
        volumes: initialVolumes,
        systemPrompt: '你是一个专业的小说家。请根据用户的要求创作小说，文笔要优美，情节要跌宕起伏。',
        createdAt: Date.now(),
        coverUrl: coverUrl || undefined,
        category: category || undefined,
        status: status || '连载中',
        description: description || undefined,
        chapterNumberingMode: chapterNumberingMode || 'global',
      };

      setNovels(prev => [newNovel, ...prev]);
      setActiveNovelId(newNovel.id);
      setActiveChapterId(null);
      return newNovel.id;
    },
    [setNovels],
  );

  // --- 子模块快捷更新方法 ---

  const updateOutlineSets = useCallback(
    (newSets: OutlineSet[]) => {
      if (!activeNovelId) return;
      updateNovel(activeNovelId, { outlineSets: newSets });
    },
    [activeNovelId, updateNovel],
  );

  const updateCharacterSets = useCallback(
    (newSets: CharacterSet[]) => {
      if (!activeNovelId) return;
      updateNovel(activeNovelId, { characterSets: newSets });
    },
    [activeNovelId, updateNovel],
  );

  const updateWorldviewSets = useCallback(
    (newSets: WorldviewSet[]) => {
      if (!activeNovelId) return;
      updateNovel(activeNovelId, { worldviewSets: newSets });
    },
    [activeNovelId, updateNovel],
  );

  const updateInspirationSets = useCallback(
    (newSets: InspirationSet[]) => {
      if (!activeNovelId) return;
      updateNovel(activeNovelId, { inspirationSets: newSets });
    },
    [activeNovelId, updateNovel],
  );

  const updatePlotOutlineSets = useCallback(
    (newSets: PlotOutlineSet[]) => {
      if (!activeNovelId) return;
      updateNovel(activeNovelId, { plotOutlineSets: newSets });
    },
    [activeNovelId, updateNovel],
  );

  // 联动创建设定集
  const addProjectSet = useCallback(
    (name: string) => {
      if (!activeNovelId || !name.trim()) return null;
      const newId =
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).substring(2);
      const trimmedName = name.trim();

      setNovels(prev =>
        prev.map(n => {
          if (n.id === activeNovelId) {
            return {
              ...n,
              outlineSets: [...(n.outlineSets || []), { id: newId, name: trimmedName, items: [] }],
              worldviewSets: [...(n.worldviewSets || []), { id: newId, name: trimmedName, entries: [] }],
              characterSets: [...(n.characterSets || []), { id: newId, name: trimmedName, characters: [] }],
              inspirationSets: [...(n.inspirationSets || []), { id: newId, name: trimmedName, items: [] }],
            };
          }
          return n;
        }),
      );
      return newId;
    },
    [activeNovelId, setNovels],
  );

  const deleteSet = useCallback(
    (type: 'outline' | 'character' | 'worldview' | 'inspiration' | 'plotOutline', id: string) => {
      if (!activeNovelId) return;
      // 记录黑名单防止 Data Healing 误恢复
      deletedChapterIdsRef.current.add(id as any);

      setNovels(prev =>
        prev.map(n => {
          if (n.id === activeNovelId) {
            const update: Partial<Novel> = {};
            if (type === 'outline') update.outlineSets = (n.outlineSets || []).filter(s => s.id !== id);
            if (type === 'character') update.characterSets = (n.characterSets || []).filter(s => s.id !== id);
            if (type === 'worldview') update.worldviewSets = (n.worldviewSets || []).filter(s => s.id !== id);
            if (type === 'inspiration') update.inspirationSets = (n.inspirationSets || []).filter(s => s.id !== id);
            if (type === 'plotOutline') update.plotOutlineSets = (n.plotOutlineSets || []).filter(s => s.id !== id);
            return { ...n, ...update };
          }
          return n;
        }),
      );
    },
    [activeNovelId, setNovels],
  );

  const renameSet = useCallback(
    (type: 'outline' | 'character' | 'worldview' | 'inspiration' | 'plotOutline', id: string, newName: string) => {
      if (!activeNovelId || !newName.trim()) return;
      setNovels(prev =>
        prev.map(n => {
          if (n.id === activeNovelId) {
            const update: Partial<Novel> = {};
            const name = newName.trim();
            if (type === 'outline')
              update.outlineSets = (n.outlineSets || []).map(s => (s.id === id ? { ...s, name } : s));
            if (type === 'character')
              update.characterSets = (n.characterSets || []).map(s => (s.id === id ? { ...s, name } : s));
            if (type === 'worldview')
              update.worldviewSets = (n.worldviewSets || []).map(s => (s.id === id ? { ...s, name } : s));
            if (type === 'inspiration')
              update.inspirationSets = (n.inspirationSets || []).map(s => (s.id === id ? { ...s, name } : s));
            if (type === 'plotOutline')
              update.plotOutlineSets = (n.plotOutlineSets || []).map(s => (s.id === id ? { ...s, name } : s));
            return { ...n, ...update };
          }
          return n;
        }),
      );
    },
    [activeNovelId, setNovels],
  );

  // 切换章节编号模式
  const switchChapterNumberingMode = useCallback(
    (newMode: 'global' | 'perVolume') => {
      if (!activeNovelId) return;
      setNovels(prev =>
        prev.map(n => {
          if (n.id === activeNovelId) {
            return switchNumberingMode(n, newMode);
          }
          return n;
        }),
      );
    },
    [activeNovelId, setNovels],
  );

  // 移动章节到不同分卷时重新校准编号
  const moveChapter = useCallback(
    (chapterId: number, volumeId: string | undefined) => {
      setChapters(prev => prev.map(c => (c.id === chapterId ? { ...c, volumeId } : c)));
    },
    [setChapters],
  );

  const moveChapterOrder = useCallback(
    (chapterId: number, direction: 'up' | 'down') => {
      setChapters(prev => {
        const chapterIndex = prev.findIndex(chapter => chapter.id === chapterId);
        if (chapterIndex === -1) return prev;

        const chapter = prev[chapterIndex];

        if (isSummaryChapter(chapter)) {
          const reordered = [...prev];

          if (direction === 'up') {
            if (chapterIndex === 0) return prev;
            [reordered[chapterIndex - 1], reordered[chapterIndex]] = [reordered[chapterIndex], reordered[chapterIndex - 1]];
            return reordered;
          }

          if (chapterIndex >= prev.length - 1) return prev;
          [reordered[chapterIndex], reordered[chapterIndex + 1]] = [reordered[chapterIndex + 1], reordered[chapterIndex]];
          return reordered;
        }

        let blockEnd = chapterIndex + 1;
        while (blockEnd < prev.length && isSummaryChapter(prev[blockEnd])) {
          blockEnd += 1;
        }

        const currentBlock = prev.slice(chapterIndex, blockEnd);

        if (direction === 'up') {
          let previousStoryStart = -1;
          for (let i = chapterIndex - 1; i >= 0; i -= 1) {
            if (!isSummaryChapter(prev[i])) {
              previousStoryStart = i;
              break;
            }
          }

          if (previousStoryStart === -1) return prev;

          const reordered = [...prev];
          reordered.splice(chapterIndex, currentBlock.length);

          reordered.splice(previousStoryStart, 0, ...currentBlock);
          return reordered;
        }

        let nextStoryStart = -1;
        for (let i = blockEnd; i < prev.length; i += 1) {
          if (!isSummaryChapter(prev[i])) {
            nextStoryStart = i;
            break;
          }
        }

        if (nextStoryStart === -1) return prev;

        let nextBlockEnd = nextStoryStart + 1;
        while (nextBlockEnd < prev.length && isSummaryChapter(prev[nextBlockEnd])) {
          nextBlockEnd += 1;
        }

        const nextBlock = prev.slice(nextStoryStart, nextBlockEnd);
        return [
          ...prev.slice(0, chapterIndex),
          ...nextBlock,
          ...currentBlock,
          ...prev.slice(nextBlockEnd),
        ];
      });
    },
    [setChapters],
  );

  return {
    novels,
    setNovels,
    novelsRef,
    activeNovelId,
    setActiveNovelId,
    activeNovelIdRef,
    activeChapterId,
    setActiveChapterId,
    activeNovel,
    chapters,
    sortedChapters,
    volumes,
    chaptersByVolume,
    setChapters,
    setVolumes,
    updateNovel,
    deletedChapterIdsRef,
    activeOutlineSetId,
    setActiveOutlineSetId,
    activeCharacterSetId,
    setActiveCharacterSetId,
    activeWorldviewSetId,
    setActiveWorldviewSetId,
    activeInspirationSetId,
    setActiveInspirationSetId,
    activePlotOutlineSetId,
    setActivePlotOutlineSetId,
    // Actions
    addChapter,
    deleteChapter,
    addVolume,
    renameVolume,
    deleteVolume,
    addNovel,
    updateOutlineSets,
    updateCharacterSets,
    updateWorldviewSets,
    updateInspirationSets,
    updatePlotOutlineSets,
    renameNovel,
    deleteNovel,
    renameChapter,
    moveChapter,
    moveChapterOrder,
    addProjectSet,
    deleteSet,
    renameSet,
    switchChapterNumberingMode,
  };
}
