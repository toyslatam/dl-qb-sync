import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/Button.jsx';

/** Buscador generico (clientes o items) contra un endpoint de la API, con feedback de error visible. */
export default function EntitySearchBox({ endpoint, labelKey, onPick, placeholder, autoFocus }) {
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
    <div>
      <div className="flex gap-2">
        <input
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
        <Button variant="primary" size="md" onClick={search} disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Buscar
        </Button>
      </div>
      {error && <p className="mt-1.5 text-[0.78rem] font-medium text-danger">{error}</p>}
      {results.length > 0 && (
        <ul className="mt-2 max-h-52 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-popover">
          {results.map((r) => (
            <li key={r.Id}>
              <button
                onClick={() => {
                  onPick(r);
                  setResults([]);
                  setQuery('');
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-primary-light hover:text-primary"
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
