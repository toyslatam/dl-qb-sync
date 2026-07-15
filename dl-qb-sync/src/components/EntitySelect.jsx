import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';

/** <select> con estilo Tailwind que carga sus opciones desde un endpoint de QuickBooks. */
export default function EntitySelect({ endpoint, value, onChange, placeholder, className = '' }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(endpoint)
      .then((res) => res.json())
      .then(setOptions)
      .finally(() => setLoading(false));
  }, [endpoint]);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={loading}
      className={`h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 ${className}`}
    >
      <option value="">{loading ? 'Cargando…' : placeholder || '(sin seleccionar)'}</option>
      {options.map((o) => (
        <option key={o.Id} value={o.Id}>
          {o.Name}
        </option>
      ))}
    </select>
  );
}
