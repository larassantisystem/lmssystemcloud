import React from 'react';

interface NotificationBadgeProps {
  count?: number | string;
  label?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success' | 'purple' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count,
  label,
  variant = 'danger',
  size = 'md',
  pulse = true,
  className = '',
}) => {
  const displayVal = count !== undefined ? (typeof count === 'number' && count > 99 ? '99+' : count) : label;

  if (count !== undefined && typeof count === 'number' && count <= 0) {
    return null;
  }
  if (!displayVal && displayVal !== 0) return null;

  const colorMap = {
    danger: 'bg-rose-600 text-white ring-2 ring-white shadow-xs shadow-rose-600/30',
    warning: 'bg-amber-500 text-white ring-2 ring-white shadow-xs shadow-amber-500/30',
    info: 'bg-indigo-600 text-white ring-2 ring-white shadow-xs shadow-indigo-600/30',
    success: 'bg-emerald-600 text-white ring-2 ring-white shadow-xs shadow-emerald-600/30',
    purple: 'bg-purple-700 text-white ring-2 ring-white shadow-xs shadow-purple-700/30',
    neutral: 'bg-slate-800 text-white ring-2 ring-white shadow-xs shadow-slate-800/30',
  };

  const sizeMap = {
    sm: 'min-w-[18px] h-[18px] px-1 text-[9px] font-black',
    md: 'min-w-[20px] h-[20px] px-1.5 text-[10px] font-black',
    lg: 'min-w-[24px] h-[24px] px-2 text-xs font-black',
  };

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full leading-none tracking-tight font-mono select-none ${
        colorMap[variant]
      } ${sizeMap[size]} ${pulse ? 'animate-pulse' : ''} ${className}`}
    >
      {displayVal}
    </span>
  );
};
