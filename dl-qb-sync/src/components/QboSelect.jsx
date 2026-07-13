import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';

/** <select> que carga sus opciones desde un endpoint de QuickBooks (terminos, metodos de pago, cuentas). */
export default function QboSelect({ endpoint, value, onChange, placeholder, style }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(endpoint)
      .then((res) => res.json())
      .then(setOptions)
      .finally(() => setLoading(false));
  }, [endpoint]);

  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} style={style} disabled={loading}>
      <option value="">{loading ? 'Cargando…' : placeholder || '(sin seleccionar)'}</option>
      {options.map((o) => (
        <option key={o.Id} value={o.Id}>
          {o.Name}
        </option>
      ))}
    </select>
  );
}
