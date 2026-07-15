import { cn } from '../../lib/utils.js';

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn('rounded-card border border-slate-200/70 bg-white shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 pt-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3 className={cn('text-[0.95rem] font-semibold text-slate-900', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('px-5 pb-5 pt-4', className)} {...props}>
      {children}
    </div>
  );
}
