import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import SearchableSelect from './ui/SearchableSelect.jsx';

/** Combobox con buscador que carga sus opciones desde un endpoint de QuickBooks. */
export default function EntitySelect({ endpoint, value, onChange, placeholder, className = '' }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    apiFetch(endpoint)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
        setOptions(Array.isArray(body) ? body : []);
      })
      .catch((err) => {
        setError(err.message);
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [endpoint]);

  return (
    <div>
      <SearchableSelect
        options={options.map((o) => ({ value: o.Id, label: o.Name }))}
        value={value}
        onChange={onChange}
        placeholder={placeholder || '(sin seleccionar)'}
        loading={loading}
        className={className}
      />
      {error && <p className="mt-1 text-[0.75rem] font-medium text-danger">{error}</p>}
    </div>
  );
}
