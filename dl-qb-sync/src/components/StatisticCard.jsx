import { cn } from '../lib/utils.js';

const TONES = {
  slate: 'text-slate-900',
  warning: 'text-warning',
  success: 'text-success',
  danger: 'text-danger',
};

export default function StatisticCard({ label, value, tone = 'slate', active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors',
        active ? 'border-primary/40 bg-primary-light' : 'border-slate-200 bg-white hover:bg-slate-50'
      )}
    >
      <span className={cn('text-2xl font-bold leading-none tabular-nums', TONES[tone])}>{value}</span>
      <span className="whitespace-nowrap text-[0.8125rem] font-medium text-slate-600">{label}</span>
    </button>
  );
}
