import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  variant?: 'light' | 'dark';
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
  variant = 'light',
}) => {
  const imageSizes = {
    sm: 'h-8 w-auto',
    md: 'h-11 w-auto',
    lg: 'h-14 w-auto',
  };

  const isDark = variant === 'dark';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative shrink-0 flex items-center justify-center">
        <img
          src="/logo.png"
          alt="PT. Larassanti Makmur Sejahtera"
          className={`${imageSizes[size]} object-contain`}
          referrerPolicy="no-referrer"
        />
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-base sm:text-xl font-serif font-black tracking-tight italic ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Larassanti
            </span>
            <span className="text-[9px] sm:text-[10px] font-sans font-black tracking-wider text-purple-600 uppercase">
              SYSTEM
            </span>
          </div>
          <span
            className={`text-[7px] sm:text-[8px] font-sans font-bold tracking-widest uppercase hidden sm:block ${
              isDark ? 'text-purple-200/70' : 'text-slate-500'
            }`}
          >
            PT. LARASSANTI MAKMUR SEJAHTERA
          </span>
        </div>
      )}
    </div>
  );
};
