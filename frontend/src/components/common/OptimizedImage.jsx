import React, { useState, useRef, useEffect } from 'react';

/**
 * OptimizedImage - Lazy loading image component with placeholder
 * Improves LCP and reduces layout shift
 */
const OptimizedImage = ({ 
  src, 
  alt, 
  width, 
  height, 
  className = '', 
  style = {},
  priority = false,
  placeholder = 'blur',
  onError,
  ...props 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  // Optimize Unsplash URLs for smaller sizes
  const optimizeSrc = (url) => {
    if (!url) return url;
    
    // If it's an Unsplash URL, request optimized size
    if (url.includes('source.unsplash.com')) {
      // Replace large dimensions with smaller ones
      return url.replace(/\/\d+x\d+\//, '/200x200/');
    }
    
    // If it's Unsplash images.unsplash.com, add quality params
    if (url.includes('images.unsplash.com')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}w=${width || 200}&q=75&fm=webp&fit=crop`;
    }
    
    return url;
  };

  const optimizedSrc = optimizeSrc(src);

  useEffect(() => {
    // For priority images, start loading immediately
    if (priority && imgRef.current) {
      imgRef.current.loading = 'eager';
    }
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = (e) => {
    setHasError(true);
    if (onError) onError(e);
  };

  // Calculate aspect ratio for placeholder
  const aspectRatio = height && width ? (height / width) * 100 : 100;

  return (
    <div 
      className={`relative overflow-hidden ${className}`}
      style={{ 
        width: width ? `${width}px` : '100%',
        ...style 
      }}
    >
      {/* Aspect ratio container to prevent layout shift */}
      <div style={{ paddingBottom: `${aspectRatio}%`, position: 'relative' }}>
        {/* Placeholder blur background */}
        {placeholder === 'blur' && !isLoaded && !hasError && (
          <div 
            className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 animate-pulse"
            style={{ borderRadius: 'inherit' }}
          />
        )}
        
        {/* Actual image */}
        {!hasError && (
          <img
            ref={imgRef}
            src={optimizedSrc}
            alt={alt}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchpriority={priority ? 'high' : 'auto'}
            onLoad={handleLoad}
            onError={handleError}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ borderRadius: 'inherit' }}
            {...props}
          />
        )}
        
        {/* Error fallback */}
        {hasError && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

export default OptimizedImage;

