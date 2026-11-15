import React from 'react';
import { Package } from '../../types';
import { AppIcon, AppIconSize } from '../icons';

interface AppIconImageProps {
  pkg: Package;
  className?: string;
  size?: AppIconSize;
}

export const AppIconImage: React.FC<AppIconImageProps> = ({
  pkg,
  className = '',
  size = 'md',
}) => {
  return <AppIcon pkg={pkg} size={size} className={className} />;
};
