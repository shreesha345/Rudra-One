import React from 'react';

interface RudraOneLogoProps {
  className?: string;
  style?: React.CSSProperties;
}

export const RudraOneLogo: React.FC<RudraOneLogoProps> = ({ className, style }) => {
  return (
    <div className={`inline-flex items-center ${className}`} style={style}>
      {/* Custom R with cut */}
      <svg 
        width="40" 
        height="40" 
        viewBox="0 0 40 40" 
        fill="currentColor"
        className="mr-1"
      >
        <path d="M8 6 L8 34 L12 34 L12 22 L20 22 L20 18 L12 18 L12 10 L24 10 Q28 10 28 14 Q28 18 24 18 L20 18 L28 34 L33 34 L25 18 Q30 16 30 10 Q30 6 26 6 Z M16 14 L20 18 L16 18 Z" />
      </svg>
      
      {/* Rest of the text */}
      <span className="font-bold tracking-tight">udraOne</span>
    </div>
  );
};