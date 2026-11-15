import React, { useEffect, useRef, useState } from 'react';
import { Package } from '../../types';
import { ResolvedIcon, resolveAppIcon, resolveAppIconAsync } from '../../services/icons';
import { IconLoadingState } from './IconLoadingState';
import { IconErrorState } from './IconErrorState';

export type AppIconSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AppIconProps {
  pkg: Package;
  size?: AppIconSize;
  className?: string;
}

const SIZE_SPECS: Record<AppIconSize, { container: string; img: string }> = {
  sm: { container: 'w-8 h-8 rounded-[6px]', img: 'w-5 h-5' },
  md: { container: 'w-11 h-11 rounded-[8px]', img: 'w-7 h-7' },
  lg: { container: 'w-16 h-16 rounded-[12px]', img: 'w-11 h-11' },
  xl: { container: 'w-20 h-20 rounded-[14px]', img: 'w-14 h-14' },
};

export const AppIcon: React.FC<AppIconProps> = ({
  pkg,
  size = 'md',
  className = '',
}) => {
  const spec = SIZE_SPECS[size];
  const syncResolved = React.useMemo(
    () => resolveAppIcon(pkg),
    [pkg.id, pkg.source, pkg.icon, pkg.name, pkg.category]
  );

  const [resolved, setResolved] = useState<ResolvedIcon>(syncResolved);
  const [imgLoaded, setImgLoaded] = useState<boolean>(syncResolved.src.startsWith('data:'));
  const [useFallback, setUseFallback] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    const immediate = resolveAppIcon(pkg);
    setResolved(immediate);
    setUseFallback(false);
    setRenderFailed(false);
    setImgLoaded(immediate.src.startsWith('data:') && immediate.diagnostic.validationStatus !== 'pending');

    // Only fetch/verify asynchronously if not already verified or bundled SVG
    if (immediate.verified) {
      return;
    }

    const controller = new AbortController();
    resolveAppIconAsync(pkg, { signal: controller.signal })
      .then(asyncResolved => {
        if (controller.signal.aborted || requestSeqRef.current !== seq) return;
        setResolved(asyncResolved);
        setUseFallback(false);
        setRenderFailed(false);
        if (asyncResolved.src.startsWith('data:')) {
          setImgLoaded(true);
        }
      })
      .catch(() => {
        if (controller.signal.aborted || requestSeqRef.current !== seq) return;
        setRenderFailed(true);
        setImgLoaded(true);
      });

    return () => {
      controller.abort();
    };
  }, [pkg.id, pkg.source, pkg.icon, pkg.name, pkg.category]);

  const activeSrc =
    useFallback && resolved.fallbackSrc ? resolved.fallbackSrc : resolved.src;
  const isDataUri = activeSrc.startsWith('data:');
  const isPending = resolved.diagnostic.validationStatus === 'pending';

  return (
    <div
      className={`${spec.container} bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 overflow-hidden relative ${className}`}
      title={`${pkg.name} (${resolved.sourceType})`}
    >
      {((!imgLoaded && !isDataUri) || isPending) && <IconLoadingState />}

      {renderFailed ? (
        <IconErrorState pkg={pkg} imgClassName={spec.img} alt={resolved.altText} />
      ) : (
        <img
          key={activeSrc}
          src={activeSrc}
          alt={resolved.altText || pkg.name}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            if (!useFallback && resolved.fallbackSrc) {
              setUseFallback(true);
              setImgLoaded(false);
            } else {
              setRenderFailed(true);
              setImgLoaded(true);
            }
          }}
          className={`${spec.img} object-contain transition-opacity duration-200 select-none ${
            imgLoaded || isDataUri ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
};
