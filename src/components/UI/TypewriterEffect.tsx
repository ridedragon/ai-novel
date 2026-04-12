import React, { useState, useEffect, useRef, useCallback } from 'react';

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
    if (!isStreaming) {
      setDisplayedText(text);
      displayedTextRef.current = text;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    if (text.length < displayedTextRef.current.length) {
      setDisplayedText(text);
      displayedTextRef.current = text;
    }

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isStreaming, text, animate]);

  return (
    <div className={className}>
      {displayedText.split('\n').map((line, index) => (
        <React.Fragment key={index}>
          {line}
          {index < displayedText.split('\n').length - 1 && <br />}
        </React.Fragment>
      ))}
      {isStreaming && displayedText.length < text.length && (
        <span className="inline-block w-2 h-5 bg-current animate-pulse ml-1"></span>
      )}
    </div>
  );
};