import React from 'react';

interface IconLoadingStateProps {
  className?: string;
}

export const IconLoadingState: React.FC<IconLoadingStateProps> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 bg-[var(--surface-hover)] animate-pulse ${className}`}
    />
  );
};
