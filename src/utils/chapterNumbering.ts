import { Chapter, Novel, NovelVolume } from '../types';

/**
 * 双编号系统工具类
 * 支持两种章节编号模式：
 * - 'global': 全书连续编号 (第1章, 第2章, ..., 第10章)
 * - 'perVolume': 分卷内独立编号 (第1章, 第2章, ..., 第6章; 第1章, 第2章, ...)
 */

/**
 * 从章节标题中提取章节名称
 * 例如: "第1章 命运的相遇" -> "命运的相遇"
 *       "第1章" -> null
 */
export const extractChapterName = (title: string): string | null => {
  if (!title || typeof title !== 'string') return null;
  const match = title.match(/^第\d+章\s+(.+)$/);
  return match && match[1] ? match[1].trim() : null;
};

/**
 * 生成章节标题
 * @param index 章节编号
 * @param originalTitle 原有标题（可选），用于保留章节名称
 */
export const generateChapterTitle = (index: number, originalTitle?: string): string => {
  const baseTitle = `第${index}章`;
  if (originalTitle) {
    const name = extractChapterName(originalTitle);
    if (name) {
      return `${baseTitle} ${name}`;
    }
  }
  return baseTitle;
};

/**
 * 为小说的所有章节初始化双编号信息
 * 在切换模式或加载数据时调用
 */
export const initializeChapterNumbering = (novel: Novel): Novel => {
  const chapters = [...(novel.chapters || [])];
  const volumes = novel.volumes || [];
  const mode = novel.chapterNumberingMode || 'global';

  // 1. 先分离正文章节和总结章节
  const storyChapters = chapters.filter(c => !c.subtype || c.subtype === 'story');
  const summaryChapters = chapters.filter(c => c.subtype === 'small_summary' || c.subtype === 'big_summary');

  // 2. 为所有正文章节分配 globalIndex
  storyChapters.forEach((chapter, index) => {
    chapter.globalIndex = index + 1;
  });

  // 3. 按分卷分组，为每个分卷内的正文章节分配 volumeIndex
  const chaptersByVolume: Record<string, Chapter[]> = {};
  storyChapters.forEach(chapter => {
    const volId = chapter.volumeId || 'uncategorized';
    if (!chaptersByVolume[volId]) chaptersByVolume[volId] = [];
    chaptersByVolume[volId].push(chapter);
  });

  Object.values(chaptersByVolume).forEach(volChapters => {
    volChapters.forEach((chapter, index) => {
      chapter.volumeIndex = index + 1;
    });
  });

  // 4. 根据当前模式更新章节标题（保留原有章节名称）
  const updatedStoryChapters = storyChapters.map(chapter => {
    const displayIndex = mode === 'perVolume' ? chapter.volumeIndex : chapter.globalIndex;
    const newTitle = generateChapterTitle(displayIndex || 1, chapter.title);
    return { ...chapter, title: newTitle };
  });

  // 5. 合并回总结章节
  const updatedChapters: Chapter[] = [];
  
  // 保持原来的顺序，只替换正文章节
  let storyIdx = 0;
  chapters.forEach(chapter => {
    if (!chapter.subtype || chapter.subtype === 'story') {
      updatedChapters.push(updatedStoryChapters[storyIdx]);
      storyIdx++;
    } else {
      updatedChapters.push(chapter);
    }
  });

  return { ...novel, chapters: updatedChapters };
};

/**
 * 为新章节计算编号
 */
export const calculateNewChapterNumbering = (
  existingChapters: Chapter[],
  targetVolumeId?: string
): { globalIndex: number; volumeIndex: number } => {
  const storyChapters = existingChapters.filter(c => !c.subtype || c.subtype === 'story');
  
  // 计算全书索引
  const globalIndex = storyChapters.length + 1;

  // 计算分卷内索引
  let volumeIndex = 1;
  if (targetVolumeId) {
    const chaptersInVolume = storyChapters.filter(c => c.volumeId === targetVolumeId);
    volumeIndex = chaptersInVolume.length + 1;
  } else {
    const uncategorizedChapters = storyChapters.filter(c => !c.volumeId);
    volumeIndex = uncategorizedChapters.length + 1;
  }

  return { globalIndex, volumeIndex };
};

/**
 * 切换编号模式
 * 同时更新所有章节的标题
 */
export const switchNumberingMode = (
  novel: Novel,
  newMode: 'global' | 'perVolume'
): Novel => {
  const updatedNovel = { ...novel, chapterNumberingMode: newMode };
  return initializeChapterNumbering(updatedNovel);
};

/**
 * 获取章节在指定模式下的显示编号
 */
export const getChapterDisplayNumber = (
  chapter: Chapter,
  mode: 'global' | 'perVolume'
): number => {
  if (mode === 'perVolume') {
    return chapter.volumeIndex || 1;
  }
  return chapter.globalIndex || 1;
};

/**
 * 重新校准所有章节的编号（在删除章节后调用）
 */
export const recalibrateChapterNumbering = (chapters: Chapter[]): Chapter[] => {
  const storyChapters = chapters.filter(c => !c.subtype || c.subtype === 'story');
  const summaryChapters = chapters.filter(c => c.subtype === 'small_summary' || c.subtype === 'big_summary');

  // 重新分配 globalIndex
  storyChapters.forEach((chapter, index) => {
    chapter.globalIndex = index + 1;
  });

  // 按分卷分组重新分配 volumeIndex
  const chaptersByVolume: Record<string, Chapter[]> = {};
  storyChapters.forEach(chapter => {
    const volId = chapter.volumeId || 'uncategorized';
    if (!chaptersByVolume[volId]) chaptersByVolume[volId] = [];
    chaptersByVolume[volId].push(chapter);
  });

  Object.values(chaptersByVolume).forEach(volChapters => {
    volChapters.forEach((chapter, index) => {
      chapter.volumeIndex = index + 1;
    });
  });

  // 合并回总结章节
  const result: Chapter[] = [];
  let storyIdx = 0;
  chapters.forEach(chapter => {
    if (!chapter.subtype || chapter.subtype === 'story') {
      result.push(storyChapters[storyIdx]);
      storyIdx++;
    } else {
      result.push(chapter);
    }
  });

  return result;
};
