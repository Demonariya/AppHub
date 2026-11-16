import React from 'react';
import { Package } from '../../types';
import { AppIcon, AppIconSize } from '../icons';

interface AppIconImageProps {
  pkg: Package;
  className?: string;
  size?: AppIconSize;
  refreshKey?: number;
}

export const AppIconImage: React.FC<AppIconImageProps> = ({
  pkg,
  className = '',
  size = 'md',
  refreshKey,
}) => {
  return <AppIcon pkg={pkg} size={size} className={className} refreshKey={refreshKey} />;
};
