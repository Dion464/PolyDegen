import React from 'react';

/**
 * Spinner - Loading indicator
 */
export const Spinner = ({ 
  size = 'md', 
  color = 'white',
  className = '' 
}) => {
  const sizes = {
    xs: 'w-3 h-3 border',
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-2',
    xl: 'w-12 h-12 border-3',
  };

  const colors = {
    white: 'border-white/20 border-t-white',
    yellow: 'border-yellow-500/20 border-t-yellow-500',
    current: 'border-current/20 border-t-current',
  };

  return (
    <div 
      className={`
        ${sizes[size]} 
        ${colors[color]}
        rounded-full 
        animate-spin
        ${className}
      `}
    />
  );
};

/**
 * PageLoader - Full page loading state
 */
export const PageLoader = ({ message = 'Loading...' }) => (
  <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <Spinner size="lg" />
      <span className="text-white/60 text-sm font-medium">{message}</span>
    </div>
  </div>
);

/**
 * InlineLoader - Inline loading indicator
 */
export const InlineLoader = ({ text = 'Loading...' }) => (
  <div className="flex items-center gap-2 text-white/60">
    <Spinner size="sm" />
    <span className="text-sm">{text}</span>
  </div>
);

export default Spinner;

