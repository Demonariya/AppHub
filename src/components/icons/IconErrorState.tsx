import React from 'react';
import { Package } from '../../types';
import { generateNeutralMonogramUri } from '../../services/icons/placeholder';

interface IconErrorStateProps {
  pkg: Package;
  imgClassName: string;
  alt?: string;
}

export const IconErrorState: React.FC<IconErrorStateProps> = ({
  pkg,
  imgClassName,
  alt,
}) => {
  const monogramUri = React.useMemo(
    () =>
      generateNeutralMonogramUri({
        name: pkg.name,
        category: pkg.category,
        packageId: pkg.id,
      }),
    [pkg.id, pkg.name, pkg.category]
  );

  return (
    <img
      src={monogramUri}
      alt={alt || `${pkg.name} placeholder icon`}
      draggable={false}
      className={`${imgClassName} object-contain select-none`}
    />
  );
};
