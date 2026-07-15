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
        'flex flex-1 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors',
        active ? 'border-primary/40 bg-primary-light' : 'border-slate-200 bg-white hover:bg-slate-50'
      )}
    >
      <span className={cn('text-xl font-bold leading-none', TONES[tone])}>{value}</span>
      <span className="text-[0.7rem] font-medium text-slate-500">{label}</span>
    </button>
  );
}
