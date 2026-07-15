import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';

const VARIANTS = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-hover',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
  success: 'bg-success text-white shadow-sm hover:bg-emerald-600',
  danger: 'bg-danger text-white shadow-sm hover:bg-red-600',
  outlineDanger: 'bg-white text-danger border border-red-200 hover:bg-danger-light',
};

const SIZES = {
  sm: 'h-8 px-3 text-[0.8rem] gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[0.95rem] gap-2 font-semibold',
};

export const Button = forwardRef(function Button(
  { className, variant = 'secondary', size = 'md', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]',
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
