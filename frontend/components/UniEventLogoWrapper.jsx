/**
 * UniEventLogoWrapper - Wrapper Component
 * Provides consistent sizing, background, and styling for the brand
 */

import UniEventBrand from './UniEventBrand';

export default function UniEventLogoWrapper({
  size = 'medium',
  showText = true,
  variant = 'default', // 'default', 'dark', 'light', 'gradient'
  className = ''
}) {
  // Variant styles
  const variants = {
    default: 'bg-white',
    dark: 'bg-[#0a0a12]',
    light: 'bg-white',
    gradient: 'bg-gradient-to-br from-slate-50 to-white',
    card: 'bg-white border border-slate-200 rounded-xl shadow-sm'
  };

  // Size configurations for padding
  const paddingSizes = {
    small: 'p-3',
    medium: 'p-4',
    large: 'p-6'
  };

  const selectedVariant = variants[variant] || variants.default;
  const padding = paddingSizes[size] || paddingSizes.medium;

  return (
    <div 
      className={`
        inline-flex items-center justify-center
        ${selectedVariant}
        ${padding}
        ${variant === 'card' ? '' : 'rounded-lg'}
        ${className}
      `}
    >
      <UniEventBrand 
        size={size}
        showText={showText}
      />
    </div>
  );
}
