# 大纲与正文生成聚合单节点 Bug 报告

## 问题描述
大纲与正文生成聚合单节点仍然存在问题，自动化创作中心的大纲文件夹中没有发现生成的大纲内容。该节点需要生成一章大纲，然后生成一章正文，然后再生成一个大纲（此时AI能看到前面生成的正文），然后再生成正文，直到生成的大纲数目和正文数目都和分卷管理器的对应卷的（终止章节号-起始章节号）+1这个数目一致。该节点生成内容列表 (Output Entries)仅可查看大纲，不显示正文生成内容。该节点生成的大纲存入对应文件夹。

## 代码分析

### 相关代码路径
- `/workspace/src/components/Workflow/hooks/useWorkflowEngine.ts` - 工作流引擎主逻辑，包含大纲与正文生成聚合单节点的实现
- `/workspace/src/components/OutlineManager.tsx` - 大纲管理器，负责管理大纲文件夹

### 核心问题代码

在 `useWorkflowEngine.ts` 文件中，`outlineAndChapter` 节点的实现逻辑如下：

```typescript
// --- Outline and Chapter Node ---
if (node.data.typeKey === 'outlineAndChapter') {
  await syncNodeStatus(node.id, { status: 'executing' }, i);
  setEdgeAnimation(node.id, true);

  // 获取目标卷信息
  let targetVolumeId = node.data.targetVolumeId as string;
  if (!targetVolumeId) {
    targetVolumeId = workflowManager.getActiveVolumeAnchor() || '';
  }
  
  // 增强：如果仍然没有目标卷，尝试从当前工作流文件夹或分卷规划中获取
  if (!targetVolumeId && localNovel.volumes && localNovel.volumes.length > 0) {
    // 尝试从当前工作流文件夹匹配
    if (currentWorkflowFolder) {
      const volByFolder = localNovel.volumes.find(v => v.title === currentWorkflowFolder);
      if (volByFolder) {
        targetVolumeId = volByFolder.id;
      }
    }
    
    // 尝试从分卷规划中获取
    if (!targetVolumeId) {
      const volumePlans = workflowManager.getVolumePlans();
      const currentVolumeIndex = workflowManager.getCurrentVolumeIndex();
      if (volumePlans[currentVolumeIndex]) {
        const volumePlan = volumePlans[currentVolumeIndex];
        const volByName = localNovel.volumes.find(v => 
          v.title === volumePlan.volumeName || v.title === volumePlan.folderName
        );
        if (volByName) {
          targetVolumeId = volByName.id;
        }
      }
    }
    
    // 兜底：使用第一个卷
    if (!targetVolumeId) {
      targetVolumeId = localNovel.volumes[0].id;
    }
  }
  
  if (!targetVolumeId) {
    await syncNodeStatus(node.id, { status: 'failed', outputEntries: [{ id: 'err_1', title: '错误', content: '未找到目标卷' }] }, i);
    setEdgeAnimation(node.id, false);
    continue;
  }

  // 获取分卷规划信息，计算需要生成的章节数
  let chapterCount = 1;
  const volumePlans = workflowManager.getVolumePlans();
  const activeVolume = localNovel.volumes?.find(v => v.id === targetVolumeId);
  if (activeVolume) {
    const volumePlan = volumePlans.find((plan: any) => plan.volumeName === activeVolume.title || plan.folderName === activeVolume.title);
    if (volumePlan && volumePlan.startChapter !== undefined && volumePlan.endChapter !== undefined) {
      chapterCount = (volumePlan.endChapter - volumePlan.startChapter) + 1;
    }
  }

  // 获取大纲和正文的预设
  const outlinePresets = allPresets['outline'] || [];
  const chapterPresets = allPresets['completion'] || [];
  const outlinePreset = outlinePresets.find(p => p.id === node.data.outlinePresetId) || outlinePresets[0];
  const chapterPreset = chapterPresets.find(p => p.id === node.data.chapterPresetId) || chapterPresets[0];

  if (!outlinePreset || !chapterPreset) {
    await syncNodeStatus(node.id, { status: 'failed', outputEntries: [{ id: 'err_2', title: '错误', content: '缺少大纲或正文预设' }] }, i);
    setEdgeAnimation(node.id, false);
    continue;
  }

  // 构建上下文信息
  const { dynamicContextMessages, dynamicFolder } = buildDynamicContext(i);
  // 增强：优先使用activeVolume的标题，确保大纲保存到正确的卷文件夹
  const currentVolumeName = activeVolume?.title || dynamicFolder || '';

  // 生成大纲和正文
  const outputEntries: OutputEntry[] = [];
  let lastChapterContent = '';

  // 预获取或创建大纲集，确保整个循环使用同一个大纲集
  let outlineSet: any = null;
  if (currentVolumeName) {
    // 确保 localNovel.outlineSets 存在
    if (!localNovel.outlineSets) {
      localNovel.outlineSets = [];
    }
    
    // 查找或创建大纲集
    outlineSet = localNovel.outlineSets.find(s => s.name === currentVolumeName);
    if (!outlineSet) {
      outlineSet = {
        id: `outline_set_${Date.now()}`,
        name: currentVolumeName,
        items: []
      };
      localNovel.outlineSets.push(outlineSet);
      terminal.log(`[OutlineAndChapter] 创建新大纲集: ${currentVolumeName}`);
    } else {
      terminal.log(`[OutlineAndChapter] 使用现有大纲集: ${currentVolumeName}`);
    }
  }

  for (let chapterIndex = 0; chapterIndex < chapterCount; chapterIndex++) {
    if (!checkActive()) break;

    // 1. 生成大纲
    const outlineOpenai = new OpenAI({
      apiKey: outlinePreset.apiConfig?.apiKey || globalConfig.apiKey,
      baseURL: outlinePreset.apiConfig?.baseUrl || globalConfig.baseUrl,
      dangerouslyAllowBrowser: true,
    });

    let outlineMessages: any[] = [
      { role: 'system', content: localNovel.systemPrompt || '你是一名专业的小说大纲作者。' },
      ...dynamicContextMessages,
    ];

    if (lastChapterContent) {
      outlineMessages.push({
        role: 'system',
        content: `【前文回顾】：\n${lastChapterContent.substring(0, 1000)}...`
      });
    }

    outlineMessages.push({
      role: 'user',
      content: `请为《${localNovel.title || '小说'}》的${currentVolumeName || '当前卷'}生成第${chapterIndex + 1}章的大纲。${node.data.outlineInstruction || ''}`
    });

    let outlineResponse = '';
    try {
      console.groupCollapsed(
        `[Workflow AI Request] 大纲与正文生成 - 大纲 ${chapterIndex + 1}`
      );
      console.log('Messages:', outlineMessages);
      console.log('Config:', {
        model: outlinePreset.apiConfig?.model || globalConfig.outlineModel || globalConfig.model,
        temperature: outlinePreset.temperature || 0.7,
      });
      console.groupEnd();

      terminal.log(`
>> AI REQUEST [工作流: 大纲生成] 第${chapterIndex + 1}章
>> -----------------------------------------------------------
>> Model:       ${outlinePreset.apiConfig?.model || globalConfig.outlineModel || globalConfig.model}
>> Temperature: ${outlinePreset.temperature || 0.7}
>> -----------------------------------------------------------
`);

      const outlineCompletion = await outlineOpenai.chat.completions.create({
        model: outlinePreset.apiConfig?.model || globalConfig.outlineModel || globalConfig.model,
        messages: outlineMessages,
        temperature: outlinePreset.temperature || 0.7,
      });
      outlineResponse = outlineCompletion.choices[0]?.message?.content || '';
      
      terminal.log(`
>> AI RESPONSE [工作流: 大纲生成] 第${chapterIndex + 1}章
>> -----------------------------------------------------------
>> Content length: ${outlineResponse.length} characters
>> -----------------------------------------------------------
`);
    } catch (err) {
      terminal.error(`[OutlineAndChapter] 大纲生成失败: ${err}`);
      continue;
    }

    // 保存大纲到对应文件夹
    if (outlineSet) {
      outlineSet.items.push({
        title: `第${chapterIndex + 1}章`,
        summary: outlineResponse
      });
    }

    // 添加大纲到输出条目
    outputEntries.push({
      id: `outline_${chapterIndex}_${Date.now()}`,
      title: `第${chapterIndex + 1}章大纲`,
      content: outlineResponse
    });

    // 2. 生成正文
    const chapterOpenai = new OpenAI({
      apiKey: chapterPreset.apiConfig?.apiKey || globalConfig.apiKey,
      baseURL: chapterPreset.apiConfig?.baseUrl || globalConfig.baseUrl,
      dangerouslyAllowBrowser: true,
    });

    let chapterMessages: any[] = [
      { role: 'system', content: localNovel.systemPrompt || '你是一名专业的小说作者。' },
      ...dynamicContextMessages,
      {
        role: 'system',
        content: `【本章大纲】：\n${outlineResponse}`
      }
    ];

    if (lastChapterContent) {
      chapterMessages.push({
        role: 'system',
        content: `【前文回顾】：\n${lastChapterContent.substring(0, 1000)}...`
      });
    }

    chapterMessages.push({
      role: 'user',
      content: `请根据大纲为《${localNovel.title || '小说'}》的${currentVolumeName || '当前卷'}生成第${chapterIndex + 1}章的正文。${node.data.chapterInstruction || ''}`
    });

    let chapterResponse = '';
    try {
      console.groupCollapsed(
        `[Workflow AI Request] 大纲与正文生成 - 正文 ${chapterIndex + 1}`
      );
      console.log('Messages:', chapterMessages);
      console.log('Config:', {
        model: chapterPreset.apiConfig?.model || globalConfig.model,
        temperature: chapterPreset.temperature || 0.7,
      });
      console.groupEnd();

      terminal.log(`
>> AI REQUEST [工作流: 正文生成] 第${chapterIndex + 1}章
>> -----------------------------------------------------------
>> Model:       ${chapterPreset.apiConfig?.model || globalConfig.model}
>> Temperature: ${chapterPreset.temperature || 0.7}
>> -----------------------------------------------------------
`);

      const chapterCompletion = await chapterOpenai.chat.completions.create({
        model: chapterPreset.apiConfig?.model || globalConfig.model,
        messages: chapterMessages,
        temperature: chapterPreset.temperature || 0.7,
      });
      chapterResponse = chapterCompletion.choices[0]?.message?.content || '';
      
      terminal.log(`
>> AI RESPONSE [工作流: 正文生成] 第${chapterIndex + 1}章
>> -----------------------------------------------------------
>> Content length: ${chapterResponse.length} characters
>> -----------------------------------------------------------
`);
    } catch (err) {
      terminal.error(`[OutlineAndChapter] 正文生成失败: ${err}`);
      continue;
    }

    // 保存正文到章节
    const newChapter: Chapter = {
      id: Date.now() + chapterIndex,
      title: `第${chapterIndex + 1}章`,
      content: chapterResponse,
      volumeId: targetVolumeId
    };
    localNovel.chapters = [...(localNovel.chapters || []), newChapter];
    lastChapterContent = chapterResponse;

    // 更新本地小说数据，确保大纲和正文都被保存
    await updateLocalAndGlobal(localNovel);
  }

  await syncNodeStatus(node.id, { status: 'completed', outputEntries }, i);
  setEdgeAnimation(node.id, false);
  continue;
}
```

## 问题原因分析

1. **大纲集更新问题**：
   - 代码在第2724-2745行创建或获取大纲集，使用的是 `currentVolumeName` 作为大纲集的名称。
   - 然后在第2813-2818行，将生成的大纲添加到大纲集的 `items` 数组中。
   - 最后在第2904行，调用 `updateLocalAndGlobal(localNovel)` 更新本地小说数据。
   - 但问题是，`outlineSet` 是通过 `localNovel.outlineSets.find(s => s.name === currentVolumeName)` 获取的，这意味着 `outlineSet` 是 `localNovel.outlineSets` 中的一个引用。当我们修改 `outlineSet.items` 时，应该会自动修改 `localNovel.outlineSets` 中的对应项，但可能存在的问题是，在循环过程中，`localNovel.outlineSets` 可能没有被正确更新，导致大纲没有被保存到正确的大纲集中。

2. **大纲集名称与分卷名称不匹配**：
   - 代码在第2718行使用 `const currentVolumeName = activeVolume?.title || dynamicFolder || '';` 获取当前卷名称。
   - 但可能存在的问题是，`activeVolume?.title` 与 `dynamicFolder` 不匹配，导致大纲集名称与分卷名称不匹配，从而导致大纲没有保存到正确的文件夹中。

3. **大纲集创建失败**：
   - 代码在第2724-2745行创建或获取大纲集，但如果 `currentVolumeName` 为空，大纲集将不会被创建，导致大纲没有被保存到大纲集中。

4. **循环中的状态更新问题**：
   - 在循环中，每次生成大纲和正文后，都会调用 `updateLocalAndGlobal(localNovel)`，但这个函数可能会异步更新全局状态，而循环会继续执行，导致后续的迭代使用的是未更新的状态。

5. **outputEntries 更新问题**：
   - 代码在第2721行初始化 `outputEntries` 数组，然后在第2821-2825行，将生成的大纲添加到 `outputEntries` 数组中，最后在第2907行，调用 `syncNodeStatus(node.id, { status: 'completed', outputEntries }, i)`，将 `outputEntries` 设置为节点的 `outputEntries`。但可能存在的问题是，在循环过程中，`outputEntries` 没有被及时更新，导致大纲没有及时显示在自动化创作中心的大纲文件夹中。

## 解决方案

1. **确保大纲集正确更新**：
   - 确保在循环中，每次生成大纲后，都及时更新大纲集，并确保大纲集的更新能够反映到 `localNovel.outlineSets` 中。
   - 可以在每次添加大纲到大纲集后，显式更新 `localNovel.outlineSets`，确保大纲集的更新能够反映到 `localNovel` 中。

2. **确保大纲集名称与分卷名称匹配**：
   - 确保 `currentVolumeName` 与分卷名称匹配，以便大纲能够保存到正确的文件夹中。
   - 可以使用 `activeVolume?.title` 作为大纲集的名称，确保大纲集名称与分卷名称匹配。

3. **确保大纲集创建成功**：
   - 确保 `currentVolumeName` 不为空，以便大纲集能够被正确创建或获取。
   - 可以添加错误处理，确保在 `currentVolumeName` 为空时，能够给出明确的错误提示。

4. **确保循环中的状态更新正确**：
   - 确保在循环中，每次生成大纲和正文后，都等待 `updateLocalAndGlobal(localNovel)` 完成，然后再继续执行下一次迭代。
   - 可以使用 `await updateLocalAndGlobal(localNovel)` 确保状态更新完成后再继续执行。

5. **确保 outputEntries 及时更新**：
   - 确保在循环中，每次生成大纲后，都及时更新节点的 `outputEntries`，以便大纲能够及时显示在自动化创作中心的大纲文件夹中。
   - 可以在每次生成大纲后，调用 `syncNodeStatus(node.id, { outputEntries }, i)`，及时更新节点的 `outputEntries`。

## 代码修复建议

1. **修复大纲集更新问题**：
   - 在每次添加大纲到大纲集后，显式更新 `localNovel.outlineSets`，确保大纲集的更新能够反映到 `localNovel` 中。

2. **修复大纲集名称与分卷名称不匹配问题**：
   - 使用 `activeVolume?.title` 作为大纲集的名称，确保大纲集名称与分卷名称匹配。

3. **修复大纲集创建失败问题**：
   - 添加错误处理，确保在 `currentVolumeName` 为空时，能够给出明确的错误提示。

4. **修复循环中的状态更新问题**：
   - 使用 `await updateLocalAndGlobal(localNovel)` 确保状态更新完成后再继续执行。

5. **修复 outputEntries 更新问题**：
   - 在每次生成大纲后，调用 `syncNodeStatus(node.id, { outputEntries }, i)`，及时更新节点的 `outputEntries`。

## 具体代码修改

### 修改 1：确保大纲集正确更新

在 `outlineAndChapter` 节点的实现中，修改大纲集的更新逻辑：

```typescript
// 保存大纲到对应文件夹
if (outlineSet) {
  outlineSet.items.push({
    title: `第${chapterIndex + 1}章`,
    summary: outlineResponse
  });
  
  // 显式更新 localNovel.outlineSets，确保大纲集的更新能够反映到 localNovel 中
  localNovel.outlineSets = localNovel.outlineSets.map(s => 
    s.id === outlineSet.id ? outlineSet : s
  );
}
```

### 修改 2：确保大纲集名称与分卷名称匹配

在 `outlineAndChapter` 节点的实现中，修改 `currentVolumeName` 的获取逻辑：

```typescript
// 增强：优先使用activeVolume的标题，确保大纲保存到正确的卷文件夹
const currentVolumeName = activeVolume?.title || '';
if (!currentVolumeName && dynamicFolder) {
  currentVolumeName = dynamicFolder;
}
```

### 修改 3：确保大纲集创建成功

在 `outlineAndChapter` 节点的实现中，添加错误处理：

```typescript
// 预获取或创建大纲集，确保整个循环使用同一个大纲集
let outlineSet: any = null;
if (currentVolumeName) {
  // 确保 localNovel.outlineSets 存在
  if (!localNovel.outlineSets) {
    localNovel.outlineSets = [];
  }
  
  // 查找或创建大纲集
  outlineSet = localNovel.outlineSets.find(s => s.name === currentVolumeName);
  if (!outlineSet) {
    outlineSet = {
      id: `outline_set_${Date.now()}`,
      name: currentVolumeName,
      items: []
    };
    localNovel.outlineSets.push(outlineSet);
    terminal.log(`[OutlineAndChapter] 创建新大纲集: ${currentVolumeName}`);
  } else {
    terminal.log(`[OutlineAndChapter] 使用现有大纲集: ${currentVolumeName}`);
  }
} else {
  await syncNodeStatus(node.id, { status: 'failed', outputEntries: [{ id: 'err_3', title: '错误', content: '未找到当前卷名称，无法创建大纲集' }] }, i);
  setEdgeAnimation(node.id, false);
  continue;
}
```

### 修改 4：确保循环中的状态更新正确

在 `outlineAndChapter` 节点的实现中，确保 `updateLocalAndGlobal(localNovel)` 完成后再继续执行：

```typescript
// 更新本地小说数据，确保大纲和正文都被保存
await updateLocalAndGlobal(localNovel);
// 等待状态更新完成
await new Promise(resolve => setTimeout(resolve, 100));
```

### 修改 5：确保 outputEntries 及时更新

在 `outlineAndChapter` 节点的实现中，每次生成大纲后，及时更新节点的 `outputEntries`：

```typescript
// 添加大纲到输出条目
outputEntries.push({
  id: `outline_${chapterIndex}_${Date.now()}`,
  title: `第${chapterIndex + 1}章大纲`,
  content: outlineResponse
});

// 及时更新节点的 outputEntries，以便大纲能够及时显示在自动化创作中心的大纲文件夹中
await syncNodeStatus(node.id, { outputEntries }, i);
```

## 结论

通过以上修改，可以解决大纲与正文生成聚合单节点的问题，确保大纲能够正确保存到对应文件夹中，并且能够在自动化创作中心的大纲文件夹中看到生成的大纲内容。