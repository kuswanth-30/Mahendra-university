/**
 * UniEventLogo - Logo Mark Component
 * Contains only the graphical logo (circle with calendar icon)
 */

export default function UniEventLogo({ 
  width = 80, 
  height = 80,
  className = '' 
}) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 100 100" 
      width={width} 
      height={height}
      className={className}
      aria-label="UniEvent Hub Logo"
    >
      {/* Background Square - Black */}
      <rect 
        x="0" 
        y="0" 
        width="100" 
        height="100" 
        rx="20" 
        fill="#0f172a" 
      />
      
      {/* "404" Text - White */}
      <text 
        x="50" 
        y="62" 
        fontFamily="Consolas, 'Courier New', monospace" 
        fontSize="36" 
        fontWeight="bold" 
        fill="white" 
        textAnchor="middle"
      >
        404
      </text>
    </svg>
  );
}
