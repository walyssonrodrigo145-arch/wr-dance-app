import React from 'react';
import { cn } from '@/lib/utils';

interface DanceProLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  textClassName?: string;
}

export function DanceProLogo({
  className,
  size = 'md',
  showText = true,
  textClassName,
}: DanceProLogoProps) {
  const sizeMap = {
    sm: { box: 'w-8 h-8 rounded-lg', icon: 'w-4 h-4', text: 'text-lg' },
    md: { box: 'w-10 h-10 rounded-xl', icon: 'w-5 h-5', text: 'text-2xl' },
    lg: { box: 'w-14 h-14 rounded-2xl', icon: 'w-7 h-7', text: 'text-3xl' },
    xl: { box: 'w-20 h-20 rounded-3xl', icon: 'w-10 h-10', text: 'text-4xl' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div 
        className={cn(
          "relative p-[1px] shadow-lg shadow-pink-500/20 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex-shrink-0 overflow-hidden",
          currentSize.box
        )}
      >
        <div className="w-full h-full bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center relative z-10">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={currentSize.icon}>
            <circle cx="56" cy="26" r="8" fill="white" />
            <path 
              d="M32 72 C 28 50, 42 36, 58 40 C 72 43, 76 58, 62 68 C 52 75, 38 74, 32 72 Z" 
              fill="white" 
              fillOpacity="0.95" 
            />
            <path 
              d="M26 64 C 30 78, 48 83, 66 77 C 74 74, 78 68, 77 61" 
              stroke="white" 
              strokeWidth="5" 
              strokeLinecap="round" 
              strokeOpacity="0.85" 
            />
          </svg>
        </div>
      </div>

      {showText && (
        <span className={cn("font-outfit font-extrabold tracking-tight text-foreground leading-none", currentSize.text, textClassName)}>
          Dance<span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-500">Pro</span>
        </span>
      )}
    </div>
  );
}

export default DanceProLogo;
