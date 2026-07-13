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
    <section className="card">
      <h2>Cola de revisión manual</h2>
      {loading && <p className="text-muted">Cargando…</p>}
      {!loading && drafts.length === 0 && <p className="text-muted">Sin pendientes 🎉</p>}
      {!loading &&
        drafts.map((row) => <DraftRow key={row.id_pago} row={row} onChange={load} />)}
    </section>
  );
}
