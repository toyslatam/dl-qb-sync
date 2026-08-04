import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import SearchableSelect from './ui/SearchableSelect.jsx';

/** Combobox con buscador que carga sus opciones desde un endpoint de QuickBooks. */
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
    <SearchableSelect
      options={options.map((o) => ({ value: o.Id, label: o.Name }))}
      value={value}
      onChange={onChange}
      placeholder={placeholder || '(sin seleccionar)'}
      loading={loading}
      className={className}
    />
  );
}
