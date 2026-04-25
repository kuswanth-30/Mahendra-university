/**
 * UniEventText - Text Component
 * Contains only the "UniEvent Hub" wordmark
 */

export default function UniEventText({ 
  width = 280, 
  height = 60,
  className = '' 
}) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 280 60" 
      width={width} 
      height={height}
      className={className}
      aria-label="UniEvent Hub Text"
    >
      {/* 404 - High Contrast Black */}
      <text 
        x="0" 
        y="45" 
        fontFamily="Consolas, 'Courier New', monospace" 
        fontSize="32" 
        fontWeight="bold" 
        fill="#0f172a"
      >
        404
      </text>
      
      {/* FOUND - Professional Slate */}
      <text 
        x="65" 
        y="45" 
        fontFamily="Consolas, 'Courier New', monospace" 
        fontSize="32" 
        fontWeight="bold" 
        fill="#475569"
      >
        FOUND
      </text>
    </svg>
  );
}
