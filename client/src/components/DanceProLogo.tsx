import React from 'react';
import { cn } from '@/lib/utils';

interface DanceProLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  showSubtitle?: boolean;
  textClassName?: string;
  variant?: 'light' | 'dark' | 'auto';
}

export function DanceProLogo({
  className,
  size = 'md',
  showText = true,
  showSubtitle = false,
  textClassName,
  variant = 'auto',
}: DanceProLogoProps) {
  const sizeMap = {
    sm: { icon: 'w-7 h-7', text: 'text-lg', sub: 'text-[9px]' },
    md: { icon: 'w-10 h-10', text: 'text-2xl', sub: 'text-[10px]' },
    lg: { icon: 'w-14 h-14', text: 'text-3xl', sub: 'text-xs' },
    xl: { icon: 'w-20 h-20', text: 'text-4xl', sub: 'text-sm' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={cn("inline-flex items-center gap-3 select-none", className)}>
      {/* Ícone da letra D com bailarina em espaço negativo */}
      <div className={cn("relative flex-shrink-0 flex items-center justify-center", currentSize.icon)}>
        <svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-sm">
          <defs>
            <linearGradient id="dp-blue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0088ff" />
              <stop offset="50%" stopColor="#0066ff" />
              <stop offset="100%" stopColor="#0050e6" />
            </linearGradient>
          </defs>

          {/* D principal */}
          <path 
            d="M 60 70 L 260 70 C 390 70 440 170 440 250 C 440 330 390 430 260 430 L 60 430 Z" 
            fill="url(#dp-blue-grad)" 
          />

          {/* Bailarina em espaço negativo */}
          <circle cx="282" cy="190" r="26" fill="#ffffff" />
          <path 
            d="M 185 190 C 220 215 255 240 285 242 C 320 245 365 195 408 145 C 390 190 350 255 315 285 C 285 310 265 375 238 432 C 226 390 245 340 270 300 C 235 290 185 315 58 382 C 125 315 180 250 185 190 Z" 
            fill="#ffffff" 
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <span className={cn(
            "font-outfit font-black tracking-tight leading-none", 
            currentSize.text, 
            variant === 'dark' ? "text-white" : "text-[#0c1f44] dark:text-white",
            textClassName
          )}>
            Dance<span className="text-[#0066ff]">Pro</span>
          </span>
          {showSubtitle && (
            <span className={cn(
              "font-medium tracking-wide uppercase mt-1",
              currentSize.sub,
              variant === 'dark' ? "text-slate-300" : "text-slate-500 dark:text-slate-400"
            )}>
              Gestão para escolas de dança
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default DanceProLogo;
