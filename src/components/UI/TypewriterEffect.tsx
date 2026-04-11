import React, { useState, useEffect, useRef } from 'react';

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
  const targetTextRef = useRef(text);
  
  useEffect(() => {
    targetTextRef.current = text;
  }, [text]);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(text);
      return;
    }

    const animate = (timestamp: number) => {
      const targetText = targetTextRef.current;
      
      if (displayedText.length < targetText.length) {
        if (!lastUpdateTimeRef.current) {
          lastUpdateTimeRef.current = timestamp;
        }

        const elapsed = timestamp - lastUpdateTimeRef.current;
        
        if (elapsed >= speed) {
          const charsToAdd = Math.min(
            Math.max(1, Math.floor(elapsed / speed)),
            targetText.length - displayedText.length
          );
          
          const newDisplayedText = targetText.substring(0, displayedText.length + charsToAdd);
          setDisplayedText(newDisplayedText);
          lastUpdateTimeRef.current = timestamp;
        }
        
        animationFrameRef.current = requestAnimationFrame(animate);
      } else if (displayedText.length > targetText.length) {
        setDisplayedText(targetText);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [text, isStreaming, speed, displayedText.length]);

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