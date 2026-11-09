import React, { useState, useEffect } from 'react';
import { Package } from '../../types';
import { resolveAppIcon } from '../../services/icons';
import { generateNeutralMonogramUri } from '../../services/icons/placeholder';

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
  const [useNeutralPlaceholder, setUseNeutralPlaceholder] = useState(false);

  // Re-resolve icon whenever pkg.id or pkg.icon changes
  const resolved = React.useMemo(() => resolveAppIcon(pkg), [pkg.id, pkg.icon, pkg.name, pkg.category]);

  useEffect(() => {
    setLoaded(false);
    setUseFallback(false);
    setUseNeutralPlaceholder(false);
  }, [pkg.id]);

  let currentSrc = resolved.src;
  if (useNeutralPlaceholder) {
    currentSrc = generateNeutralMonogramUri({
      name: pkg.name,
      category: pkg.category,
      packageId: pkg.id,
    });
  } else if (useFallback && resolved.fallbackSrc) {
    currentSrc = resolved.fallbackSrc;
  }

  const isDataUri = currentSrc.startsWith('data:');

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
      title={`${pkg.name} (${resolved.sourceType})`}
    >
      {/* Skeleton Pulse during initial network load (not shown for instant inline SVGs) */}
      {!loaded && !isDataUri && (
        <div className="absolute inset-0 bg-neutral-800/60 animate-pulse" />
      )}

      <img
        src={currentSrc}
        alt={resolved.altText || pkg.name}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!useFallback && resolved.fallbackSrc) {
            setUseFallback(true);
          } else if (!useNeutralPlaceholder) {
            setUseNeutralPlaceholder(true);
            setLoaded(true);
          }
        }}
        className={`${sizeClass} object-contain transition-opacity duration-200 select-none ${
          loaded || isDataUri ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
