import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';

const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:border-slate-400 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  success: 'bg-success text-white hover:bg-emerald-800',
  danger: 'bg-danger text-white hover:bg-red-800',
  outlineDanger: 'bg-white text-danger border border-red-200 hover:bg-danger-light',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-[0.875rem] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2 font-semibold',
};

export const Button = forwardRef(function Button(
  { className, variant = 'secondary', size = 'md', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
