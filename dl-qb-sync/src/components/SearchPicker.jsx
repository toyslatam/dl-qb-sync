import { useState } from 'react';
import { apiFetch } from '../lib/api.js';

/** Buscador generico (clientes o items) contra un endpoint de la API. */
export default function SearchPicker({ endpoint, labelKey, onPick, placeholder }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch(`${endpoint}?q=${encodeURIComponent(query)}`);
      setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <input
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && search()}
        style={{ width: 180 }}
      />
      <button onClick={search} disabled={loading}>
        Buscar
      </button>
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0.25rem 0', padding: 0, border: '1px solid #ccc', maxWidth: 260 }}>
          {results.map((r) => (
            <li key={r.Id}>
              <button
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => {
                  onPick(r);
                  setResults([]);
                  setQuery('');
                }}
              >
                {r[labelKey]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
