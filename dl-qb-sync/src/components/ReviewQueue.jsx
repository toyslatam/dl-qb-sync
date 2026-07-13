import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import DraftRow from './DraftRow.jsx';

export default function ReviewQueue({ refreshTrigger }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/review-queue')
      .then((res) => res.json())
      .then(setDrafts)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem' }}>
      <h2>Cola de revisión manual</h2>
      {loading && <p>Cargando…</p>}
      {!loading && drafts.length === 0 && <p>Sin pendientes 🎉</p>}
      {!loading &&
        drafts.map((row) => <DraftRow key={row.id_pago} row={row} onChange={load} />)}
    </section>
  );
}
