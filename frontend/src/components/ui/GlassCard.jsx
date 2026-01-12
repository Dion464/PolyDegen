import React from 'react';

/**
 * GlassCard - Glassmorphism card component
 * The base card style used throughout the app
 */
export const GlassCard = ({ 
  children, 
  className = '', 
  hover = false,
  padding = 'p-4',
  onClick,
  ...props 
}) => {
  const baseStyles = `
    bg-[rgba(255,255,255,0.03)] 
    backdrop-blur-xl 
    border border-white/10 
    rounded-2xl
    ${padding}
  `;
  
  const hoverStyles = hover ? `
    hover:bg-[rgba(255,255,255,0.06)] 
    hover:border-white/20 
    transition-all duration-200
    cursor-pointer
  ` : '';
  
  return (
    <div 
      className={`${baseStyles} ${hoverStyles} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * GlassPanel - Larger glass container
 */
export const GlassPanel = ({ children, className = '', ...props }) => (
  <div 
    className={`
      bg-[rgba(10,10,14,0.85)] 
      backdrop-blur-2xl 
      border border-white/10 
      rounded-3xl 
      ${className}
    `}
    {...props}
  >
    {children}
  </div>
);

export default GlassCard;

