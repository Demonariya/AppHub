import React, { useState } from 'react';
import { Package } from '../../types';
import { getAppIconUrl, getSecondaryIconFallback } from '../../services/iconService';

interface AppIconImageProps {
  pkg: Package;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const AppIconImage: React.FC<AppIconImageProps> = ({
  pkg,
  className = '',
  size = 'md',
}) => {
  const [loaded, setLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [hasError, setHasError] = useState(false);

  React.useEffect(() => {
    setLoaded(false);
    setUseFallback(false);
    setHasError(false);
  }, [pkg.id]);

  const primaryUrl = getAppIconUrl(pkg);
  const fallbackUrl = getSecondaryIconFallback(pkg);

  const currentSrc = useFallback ? fallbackUrl : primaryUrl;

  const sizeClass =
    size === 'sm'
      ? 'w-5 h-5'
      : size === 'md'
      ? 'w-8 h-8'
      : size === 'lg'
      ? 'w-12 h-12'
      : 'w-16 h-16';

  const containerClass =
    size === 'sm'
      ? 'w-8 h-8 rounded-md'
      : size === 'md'
      ? 'w-11 h-11 rounded-lg'
      : size === 'lg'
      ? 'w-16 h-16 rounded-xl'
      : 'w-20 h-20 rounded-2xl';

  return (
    <div
      className={`${containerClass} bg-neutral-900 border border-neutral-800/80 flex items-center justify-center shrink-0 overflow-hidden relative shadow-inner ${className}`}
    >
      {/* Loading Skeleton */}
      {!loaded && !hasError && (
        <div className="absolute inset-0 bg-neutral-800/60 animate-pulse" />
      )}

      {/* Real App Icon */}
      {!hasError ? (
        <img
          src={currentSrc}
          alt={pkg.name}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!useFallback) {
              setUseFallback(true);
            } else {
              setHasError(true);
            }
          }}
          className={`${sizeClass} object-contain transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        /* If both network requests fail, show clean high-contrast SVG brand representation */
        <svg
          viewBox="0 0 24 24"
          className={`${sizeClass} text-neutral-400`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 7h10v10H7z" />
        </svg>
      )}
    </div>
  );
};
