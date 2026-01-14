import React from 'react';

/**
 * Button variants
 */
const variants = {
  primary: `
    bg-[#FFE600] hover:bg-[#FFD700] 
    text-black font-semibold
    shadow-lg shadow-yellow-500/20
  `,
  secondary: `
    bg-white/10 hover:bg-white/15 
    text-white font-medium
    border border-white/20
  `,
  success: `
    bg-emerald-500 hover:bg-emerald-600 
    text-white font-semibold
  `,
  danger: `
    bg-red-500 hover:bg-red-600 
    text-white font-semibold
  `,
  ghost: `
    bg-transparent hover:bg-white/5 
    text-white/70 hover:text-white
  `,
  yes: `
    bg-emerald-500/20 hover:bg-emerald-500/30 
    text-emerald-400 font-semibold
    border border-emerald-500/30
  `,
  no: `
    bg-red-500/20 hover:bg-red-500/30 
    text-red-400 font-semibold
    border border-red-500/30
  `,
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  lg: 'px-6 py-3 text-lg rounded-xl',
  xl: 'px-8 py-4 text-xl rounded-2xl',
};

/**
 * Button - Unified button component
 */
export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center
    transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed
    active:scale-[0.98]
  `;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        ${baseStyles}
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <LoadingSpinner size="sm" className="mr-2" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
};

/**
 * IconButton - Square button for icons
 */
export const IconButton = ({
  children,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}) => {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  return (
    <button
      className={`
        ${iconSizes[size]}
        ${variants[variant]}
        rounded-xl
        flex items-center justify-center
        transition-all duration-200
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};

/**
 * Small loading spinner for buttons
 */
const LoadingSpinner = ({ size = 'sm', className = '' }) => {
  const spinnerSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <div 
      className={`
        ${spinnerSizes[size]} 
        border-2 border-current border-t-transparent 
        rounded-full animate-spin
        ${className}
      `} 
    />
  );
};

export default Button;


