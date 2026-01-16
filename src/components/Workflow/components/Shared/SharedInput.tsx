import React, { useEffect, useState } from 'react';

interface SharedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string | number;
  onValueChange: (value: string) => void;
}

export const SharedInput = ({ value, onValueChange, ...props }: SharedInputProps) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <input
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={(e) => {
        if (e.target.value !== value.toString()) {
          onValueChange(e.target.value);
        }
      }}
    />
  );
};

interface SharedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onValueChange: (value: string) => void;
}

export const SharedTextarea = ({ value, onValueChange, ...props }: SharedTextareaProps) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <textarea
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={(e) => {
        if (e.target.value !== value) {
          onValueChange(e.target.value);
        }
      }}
    />
  );
};