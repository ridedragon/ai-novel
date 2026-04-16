import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

interface TypewriterEffectProps {
  text: string;
  speed?: number;
  className?: string;
  isStreaming?: boolean;
}

export const TypewriterEffect: React.FC<TypewriterEffectProps> = ({ 
  text, 
  speed = 30, 
  className = '',
  isStreaming = true
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const animationFrameRef = useRef<number>();
  const lastUpdateTimeRef = useRef<number>(0);
  const displayedTextRef = useRef('');
  
  useEffect(() => {
    displayedTextRef.current = displayedText;
  }, [displayedText]);

  const animate = useCallback((timestamp: number) => {
    const targetText = text;
    const currentDisplayed = displayedTextRef.current;
    
    if (currentDisplayed.length < targetText.length) {
      if (!lastUpdateTimeRef.current) {
        lastUpdateTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastUpdateTimeRef.current;
      
      if (elapsed >= speed) {
        const charsToAdd = Math.min(
          Math.max(1, Math.floor(elapsed / speed)),
          targetText.length - currentDisplayed.length
        );
        
        const newDisplayedText = targetText.substring(0, currentDisplayed.length + charsToAdd);
        setDisplayedText(newDisplayedText);
        displayedTextRef.current = newDisplayedText;
        lastUpdateTimeRef.current = timestamp;
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    } else if (currentDisplayed.length > targetText.length) {
      setDisplayedText(targetText);
      displayedTextRef.current = targetText;
    }
  }, [text, speed]);

  useEffect(() => {
    // 处理连续的换行符，只保留一个
    const processedText = text.replace(/\n+/g, '\n');
    
    if (!isStreaming) {
      setDisplayedText(processedText);
      displayedTextRef.current = processedText;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    // 重置时间戳，确保动画从新文本开始
    lastUpdateTimeRef.current = 0;
    
    // 如果新文本比当前显示的短，直接更新
    if (processedText.length < displayedTextRef.current.length) {
      setDisplayedText(processedText);
      displayedTextRef.current = processedText;
    }

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isStreaming, text, animate]);

  return (
    <div className={`${className} whitespace-pre-wrap`}>
      {isStreaming ? (
        displayedText
      ) : (
        <ReactMarkdown>{displayedText}</ReactMarkdown>
      )}
      {isStreaming && displayedText.length < text.length && (
        <span className="inline-block w-2 h-5 bg-current animate-pulse ml-1"></span>
      )}
    </div>
  );
};