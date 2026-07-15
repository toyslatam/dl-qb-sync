import { useState } from 'react';
import { apiFetch } from '../lib/api.js';

/** Buscador generico (clientes o items) contra un endpoint de la API. */
export default function SearchPicker({ endpoint, labelKey, onPick, placeholder }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${endpoint}?q=${encodeURIComponent(query)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || `Error ${res.status} al buscar`);
        setResults([]);
        return;
      }
      setResults(Array.isArray(body) ? body : []);
    } catch (err) {
      setError(err.message || 'Error de red al buscar');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div className="row" style={{ gap: 'var(--space-1)' }}>
        <input
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          style={{ width: 170 }}
        />
        <button onClick={search} disabled={loading}>
          {loading ? '…' : 'Buscar'}
        </button>
      </div>
      {error && (
        <div style={{ color: 'var(--color-danger, #c0392b)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{error}</div>
      )}
      {results.length > 0 && (
        <ul
          className="card"
          style={{
            listStyle: 'none',
            position: 'absolute',
            zIndex: 10,
            margin: '0.25rem 0 0',
            padding: '0.25rem',
            width: 240,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {results.map((r) => (
            <li key={r.Id}>
              <button
                style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none' }}
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
