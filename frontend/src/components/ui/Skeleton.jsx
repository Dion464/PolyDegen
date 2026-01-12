import React from 'react';

/**
 * Skeleton - Loading placeholder component
 */
export const Skeleton = ({ 
  width = '100%', 
  height = '20px', 
  rounded = 'rounded-md',
  className = '',
  animate = true,
}) => (
  <div 
    className={`
      bg-white/5 
      ${rounded}
      ${animate ? 'animate-pulse' : ''}
      ${className}
    `}
    style={{ width, height }}
  />
);

/**
 * SkeletonText - Text placeholder
 */
export const SkeletonText = ({ 
  lines = 1, 
  className = '' 
}) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton 
        key={i} 
        width={i === lines - 1 && lines > 1 ? '70%' : '100%'} 
        height="16px" 
      />
    ))}
  </div>
);

/**
 * SkeletonCard - Card placeholder
 */
export const SkeletonCard = ({ className = '' }) => (
  <div className={`p-4 rounded-2xl bg-white/5 ${className}`}>
    <div className="flex gap-3 mb-3">
      <Skeleton width="48px" height="48px" rounded="rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton width="60%" height="16px" />
        <Skeleton width="40%" height="14px" />
      </div>
    </div>
    <Skeleton width="100%" height="12px" className="mb-2" />
    <Skeleton width="80%" height="12px" />
  </div>
);

/**
 * SkeletonMarketCard - Market card placeholder
 */
export const SkeletonMarketCard = () => (
  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
    <div className="flex gap-3 mb-4">
      <Skeleton width="52px" height="58px" rounded="rounded-xl" />
      <div className="flex-1">
        <Skeleton width="80%" height="18px" className="mb-2" />
        <Skeleton width="50%" height="14px" />
      </div>
    </div>
    <div className="flex gap-2">
      <Skeleton width="50%" height="40px" rounded="rounded-xl" />
      <Skeleton width="50%" height="40px" rounded="rounded-xl" />
    </div>
  </div>
);

export default Skeleton;

