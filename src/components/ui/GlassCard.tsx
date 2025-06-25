import React from 'react';
import { cn } from '../../lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  goldBorder?: boolean;
  onClick?: () => void;
}

const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className, 
  hover = false,
  goldBorder = false,
  onClick 
}) => {
  const baseClasses = 'glass-panel rounded-lg';
  const hoverClasses = hover ? 'glass-panel-hover cursor-pointer' : '';
  const borderClasses = goldBorder ? 'gold-border' : '';

  return (
    <div
      className={cn(baseClasses, hoverClasses, borderClasses, className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default GlassCard;