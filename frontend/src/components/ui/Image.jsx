import React, { useState, memo } from 'react';

/**
 * Default placeholder for failed images
 */
const DefaultPlaceholder = ({ size = 48 }) => (
  <div 
    className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center"
  >
    <svg 
      width={size * 0.5} 
      height={size * 0.5} 
      viewBox="0 0 24 24" 
      fill="none" 
      className="text-white/30"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </div>
);

/**
 * LazyImage - Image with loading state and error handling
 */
export const LazyImage = memo(({ 
  src, 
  alt = '',
  className = '',
  fallback = null,
  onLoad,
  onError,
  ...props 
}) => {
  const [status, setStatus] = useState('loading'); // loading | loaded | error

  const handleLoad = (e) => {
    setStatus('loaded');
    onLoad?.(e);
  };

  const handleError = (e) => {
    setStatus('error');
    onError?.(e);
  };

  if (status === 'error' || !src) {
    return fallback || <DefaultPlaceholder />;
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Loading shimmer */}
      {status === 'loading' && (
        <div className="absolute inset-0 bg-white/5 animate-pulse" />
      )}
      
      {/* Actual image */}
      <img
        src={src}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        className={`
          w-full h-full object-cover
          transition-opacity duration-300
          ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}
        `}
        loading="lazy"
        decoding="async"
        {...props}
      />
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

/**
 * MarketImage - Specialized image for market thumbnails
 */
export const MarketImage = memo(({ 
  src, 
  alt,
  size = 48,
  rounded = 'rounded-xl',
  className = '',
}) => {
  // Optimize Unsplash URLs
  const optimizedSrc = src?.includes('unsplash.com') 
    ? `${src.split('?')[0]}?w=${size * 2}&h=${size * 2}&fit=crop&auto=format`
    : src;

  return (
    <div 
      className={`${rounded} overflow-hidden bg-white/5 flex-shrink-0 ${className}`}
      style={{ width: size, height: size * 1.125 }}
    >
      <LazyImage 
        src={optimizedSrc} 
        alt={alt}
        fallback={<DefaultPlaceholder size={size} />}
      />
    </div>
  );
});

MarketImage.displayName = 'MarketImage';

export default LazyImage;


