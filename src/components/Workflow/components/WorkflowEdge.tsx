import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
} from '@xyflow/react';

export const WorkflowEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  animated,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  // 颜色配置 - 支持独立自定义或跟随系统主题色
  // 优先级：用户定义的 CSS 变量 > 系统主题色 > 默认紫色
  // 用户可以在不修改源码的情况下，通过在外部 CSS 中定义 --workflow-edge-color 来单独更改连接线颜色
  const COLORS = {
    primary: 'var(--workflow-edge-color, var(--theme-color, #6366f1))',
    secondary: 'var(--workflow-edge-color-dark, var(--theme-color-hover, #4f46e5))',
    highlight: 'var(--workflow-edge-color-light, var(--theme-color-light, #818cf8))',
    core: selected ? '#fff' : 'var(--workflow-edge-color-light, var(--theme-color-light, #818cf8))',
    glow: selected ? 'var(--workflow-edge-color, var(--theme-color, #6366f1))' : 'var(--workflow-edge-color-dark, var(--theme-color-hover, #4f46e5))',
  };

  return (
    <>
      {/* 核心修复 4.1：合并渲染层级，移除内联 <style> 以解决主进程内存爆炸 */}
      {/* 仅保留一层外发光 (使用 strokeOpacity 模拟，不再使用多层 Path 叠加) */}
      <path
        id={`${id}-glow-combined`}
        d={edgePath}
        fill="none"
        stroke={selected ? COLORS.highlight : COLORS.primary}
        strokeWidth={selected ? 6 : 3}
        strokeOpacity={selected ? 0.3 : 0.15}
      />
      {/* 核心线条 */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: COLORS.core,
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {/* 科技感流动效果：使用全局 CSS 动画 .animate-workflow-dash 替代 inline style 和 animateMotion */}
      {(selected || animated) && (
        <path
          d={edgePath}
          fill="none"
          stroke="#fff"
          strokeWidth={1.5}
          strokeDasharray="4, 16"
          strokeLinecap="round"
          className="animate-workflow-dash"
          style={{
            opacity: selected ? 0.6 : 0.2,
          }}
        />
      )}
    </>
  );
};