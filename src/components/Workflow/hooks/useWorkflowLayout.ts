import { Edge } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import terminal from 'virtual:terminal';
import { WorkflowNode } from '../types';

export const useWorkflowLayout = (nodes: WorkflowNode[], edges: Edge[]) => {
  // 性能监控埋点
  const renderStartTimeRef = useRef<number>(0);
  renderStartTimeRef.current = performance.now();

  useEffect(() => {
    const renderDuration = performance.now() - renderStartTimeRef.current;
    if (renderDuration > 16) {
      // 超过 1 帧 (16ms)
      terminal.log(`[PERF] WorkflowLayout 渲染耗时过长: ${renderDuration.toFixed(2)}ms (警告: 可能造成 UI 卡顿)`);
    }
  });

  // 拓扑排序函数：根据连线确定执行顺序 (两端共用)
  const orderedNodes = useMemo(() => {
    const startTime = Date.now();
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // 基础过滤，确保节点数据有效
    const validNodes = nodes.filter(n => n && n.id);
    const validEdges = edges.filter(e => e && e.source && e.target);

    // 1. 构建图结构
    validNodes.forEach(node => {
      adjacencyList.set(node.id, []);
      inDegree.set(node.id, 0);
    });

    validEdges.forEach(edge => {
      if (adjacencyList.has(edge.source) && adjacencyList.has(edge.target)) {
        adjacencyList.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    });

    const queue: string[] = [];
    const resultIds: string[] = [];
    const visited = new Set<string>();

    // 2. 初始化队列：将所有入度为 0 的节点加入队列（通常是起点）
    const startNodes = validNodes
      .filter(n => (inDegree.get(n.id) || 0) === 0)
      .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));

    startNodes.forEach(n => {
      queue.push(n.id);
      visited.add(n.id);
    });

    const currentInDegree = new Map(inDegree);

    // 3. 循环处理
    while (resultIds.length < validNodes.length) {
      if (queue.length === 0) {
        const remainingNodes = validNodes.filter(n => !visited.has(n.id));
        if (remainingNodes.length === 0) break;

        // 策略 A：寻找“入口节点” (Entry Point)
        let candidates = remainingNodes.filter(node => {
          return validEdges.some(e => e.target === node.id && visited.has(e.source));
        });

        // 策略 B：如果找不到显式入口，则优先寻找 loopNode
        if (candidates.length === 0) {
          const loopNodes = remainingNodes.filter(n => n.data.typeKey === 'loopNode');
          candidates = loopNodes.length > 0 ? loopNodes : remainingNodes;
        }

        candidates.sort(
          (a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0),
        );

        const breaker = candidates[0];
        queue.push(breaker.id);
        visited.add(breaker.id);
      }

      const uId = queue.shift()!;
      if (!resultIds.includes(uId)) {
        resultIds.push(uId);
      }

      const neighbors = adjacencyList.get(uId) || [];
      const sortedNeighbors = neighbors
        .map(id => validNodes.find(n => n.id === id)!)
        .filter(Boolean)
        .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));

      sortedNeighbors.forEach(v => {
        if (visited.has(v.id)) return;
        const newDegree = (currentInDegree.get(v.id) || 0) - 1;
        currentInDegree.set(v.id, newDegree);
        if (newDegree === 0) {
          queue.push(v.id);
          visited.add(v.id);
        }
      });
    }

    const finalNodes = resultIds.map(id => validNodes.find(n => n.id === id)!).filter(Boolean);
    const duration = Date.now() - startTime;
    if (duration > 15) {
      terminal.log(`[PERF] useWorkflowLayout.orderedNodes recalculate: ${duration}ms`);
    }
    return finalNodes;
  }, [nodes, edges]);

  // 计算 PC 端网格布局坐标
  const getDesktopLayout = useCallback((ordered: WorkflowNode[]) => {
    const cols = 4;
    const spacingX = 320;
    const spacingY = 180;
    const startX = 100;
    const startY = 250;

    return ordered.map((node, idx) => ({
      ...node,
      position: {
        x: (idx % cols) * spacingX + startX,
        y: Math.floor(idx / cols) * spacingY + startY,
      },
    }));
  }, []);

  // 计算移动端单列布局坐标
  const getMobileLayout = useCallback((ordered: WorkflowNode[]) => {
    const startX = 50;
    const startY = 100;
    const spacingY = 120;

    return ordered.map((node, idx) => ({
      ...node,
      position: {
        x: startX,
        y: idx * spacingY + startY,
      },
    }));
  }, []);

  return {
    orderedNodes,
    getDesktopLayout,
    getMobileLayout,
  };
};
