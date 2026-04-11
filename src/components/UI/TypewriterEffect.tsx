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
  const [currentIndex, setCurrentIndex] = useState(0);
  const textRef = useRef(text);
  const animationFrameRef = useRef<number>();
  const lastUpdateTimeRef = useRef<number>(0);

  useEffect(() => {
    // Update the ref when text changes
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    // Only reset if text is shorter than displayed text (content removed)
    // or if it's a completely different text
    if (text.length < displayedText.length || 
        (text.length > displayedText.length && !text.startsWith(displayedText))) {
      setCurrentIndex(0);
      setDisplayedText('');
    }
  }, [text, displayedText.length]);

  useEffect(() => {
    if (!isStreaming) {
      // If not streaming, just display the full text immediately
      setDisplayedText(text);
      setCurrentIndex(text.length);
      return;
    }

    // Reset animation when text changes significantly
    if (text.length < displayedText.length || 
        (text.length > displayedText.length && !text.startsWith(displayedText))) {
      setCurrentIndex(0);
      setDisplayedText('');
    }

    // If text has grown, adjust currentIndex to match the new text length
    if (text.length > displayedText.length && text.startsWith(displayedText)) {
      setCurrentIndex(displayedText.length);
    }

    const animate = (timestamp: number) => {
      if (!lastUpdateTimeRef.current) {
        lastUpdateTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastUpdateTimeRef.current;
      
      if (elapsed >= speed && currentIndex < text.length) {
        setDisplayedText(text.substring(0, currentIndex + 1));
        setCurrentIndex(prevIndex => prevIndex + 1);
        lastUpdateTimeRef.current = timestamp;
      }

      // Always continue the animation if text is still growing or not fully displayed
      if (currentIndex < text.length) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    // Start the animation immediately
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [text, currentIndex, speed, isStreaming, displayedText.length]);

  return (
    <span className={className}>
      {displayedText}
      {isStreaming && currentIndex < text.length && (
        <span className="inline-block w-2 h-5 bg-current animate-pulse ml-1"></span>
      )}
    </span>
  );
};