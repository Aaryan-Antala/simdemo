import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'premium' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  className, 
  children, 
  ...props 
}) => {
  const baseClasses = 'rounded-lg transition-all duration-200 relative inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500';
  
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    premium: 'premium-button',
    ghost: 'text-primary hover:bg-surface hover:text-primary border border-transparent hover:border-gray-200',
  };
  
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      className={cn(baseClasses, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;