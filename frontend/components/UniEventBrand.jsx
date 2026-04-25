/**
 * UniEventBrand - Parent Component
 * Composes UniEventLogo and UniEventText together
 */

import UniEventLogo from './UniEventLogo';
import UniEventText from './UniEventText';

export default function UniEventBrand({ 
  size = 'medium',
  showText = true,
  className = '' 
}) {
  // Size configurations
  const sizes = {
    small: { logo: 40, text: 140, gap: 12 },
    medium: { logo: 60, text: 210, gap: 16 },
    large: { logo: 80, text: 280, gap: 20 }
  };

  const config = sizes[size] || sizes.medium;

  return (
    <div className={`flex items-center gap-${config.gap / 4} ${className}`}>
      <UniEventLogo 
        width={config.logo} 
        height={config.logo}
        className="flex-shrink-0"
      />
      {showText && (
        <UniEventText 
          width={config.text} 
          height={config.logo * 0.75}
          className="flex-shrink-0"
        />
      )}
    </div>
  );
}
