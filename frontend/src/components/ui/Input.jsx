import React, { forwardRef } from 'react';

/**
 * Input - Styled input component
 */
export const Input = forwardRef(({ 
  label,
  error,
  hint,
  className = '',
  containerClassName = '',
  ...props 
}, ref) => {
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium text-white/70 mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`
          w-full px-4 py-3 
          bg-white/5 
          border border-white/10 
          rounded-xl
          text-white placeholder-white/40
          focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20
          transition-all duration-200
          ${error ? 'border-red-500/50 focus:border-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-sm text-red-400">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1.5 text-sm text-white/50">{hint}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

/**
 * Textarea - Styled textarea component
 */
export const Textarea = forwardRef(({ 
  label,
  error,
  hint,
  className = '',
  containerClassName = '',
  rows = 4,
  ...props 
}, ref) => {
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium text-white/70 mb-1.5">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        rows={rows}
        className={`
          w-full px-4 py-3 
          bg-white/5 
          border border-white/10 
          rounded-xl
          text-white placeholder-white/40
          focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20
          transition-all duration-200
          resize-none
          ${error ? 'border-red-500/50 focus:border-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-sm text-red-400">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1.5 text-sm text-white/50">{hint}</p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

/**
 * Select - Styled select component
 */
export const Select = forwardRef(({ 
  label,
  error,
  options = [],
  placeholder = 'Select...',
  className = '',
  containerClassName = '',
  ...props 
}, ref) => {
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium text-white/70 mb-1.5">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={`
          w-full px-4 py-3 
          bg-white/5 
          border border-white/10 
          rounded-xl
          text-white
          focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20
          transition-all duration-200
          appearance-none
          cursor-pointer
          ${error ? 'border-red-500/50 focus:border-red-500' : ''}
          ${className}
        `}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          backgroundSize: '16px',
        }}
        {...props}
      >
        <option value="" disabled className="bg-[#1a1a1a]">{placeholder}</option>
        {options.map((opt) => (
          <option 
            key={opt.value} 
            value={opt.value}
            className="bg-[#1a1a1a]"
          >
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1.5 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Input;


