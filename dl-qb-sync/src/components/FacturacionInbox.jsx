import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Inbox as InboxIcon, RotateCcw } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import PaymentsSidebar from './PaymentsSidebar.jsx';
import PaymentSummary from './PaymentSummary.jsx';
import QuickBooksCard from './QuickBooksCard.jsx';
import ServicesCard from './ServicesCard.jsx';
import InvoiceCard from './InvoiceCard.jsx';
import InvoicePreview from './InvoicePreview.jsx';
import ChecklistCard from './ChecklistCard.jsx';
import BottomActionBar from './BottomActionBar.jsx';
import { Button } from './ui/Button.jsx';

/** Fecha de hoy en la zona horaria local del navegador (no UTC). */
function hoy() {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

async function api(path, options) {
  const res = await apiFetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error');
  return body;
}

export default function FacturacionInbox() {
  const [fecha, setFecha] = useState(hoy());
  const [pagos, setPagos] = useState([]);
  const [loadingPagos, setLoadingPagos] = useState(true);
  const [selected, setSelected] = useState(null); // pago crudo de la lista
  const [draft, setDraft] = useState(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [errores, setErrores] = useState({}); // idPago -> mensaje
  const [busy, setBusy] = useState(false);
  const [savedHint, setSavedHint] = useState('');

  const cargarPagos = useCallback(async () => {
    setLoadingPagos(true);
    try {
      const res = await apiFetch(`/api/pagos?desde=${fecha}&hasta=${fecha}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error desconocido');
      setPagos(body);
    } catch (err) {
      setErrores((prev) => ({ ...prev, _lista: err.message }));
    } finally {
      setLoadingPagos(false);
    }
  }, [fecha]);

  useEffect(() => {
    cargarPagos();
  }, [cargarPagos]);

  useEffect(() => {
    setSelected(null);
    setDraft(null);
  }, [fecha]);

  async function seleccionarPago(pago) {
    setSelected(pago);
    setDraft(null);
    setSavedHint('');

    if (pago.estado === 'sincronizado') return; // se muestra el panel de "ya procesado"

    setLoadingDraft(true);
    setErrores((prev) => {
      const next = { ...prev };
      delete next[pago.id];
      return next;
    });

    try {
      if (pago.estado === 'en_cola') {
        const row = await api(`/api/review-queue/${pago.id}`);
        setDraft(row.draft);
      } else {
        const result = await api(`/api/pagos/${pago.id}/traer-detalle`, { method: 'POST' });
        if (result.creada) {
          await cargarPagos();
          setSelected((prev) => (prev && prev.id === pago.id ? { ...prev, estado: 'sincronizado' } : prev));
        } else {
          const row = await api(`/api/review-queue/${pago.id}`);
          setDraft(row.draft);
          await cargarPagos();
        }
      }
    } catch (err) {
      setErrores((prev) => ({ ...prev, [pago.id]: err.message }));
    } finally {
      setLoadingDraft(false);
    }
  }

  async function ejecutar(action) {
    setBusy(true);
    try {
      const updated = await action();
      if (updated?.lineas) setDraft(updated);
      return updated;
    } catch (err) {
      setErrores((prev) => ({ ...prev, [selected.id]: err.message }));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function asignarCliente(customer) {
    return ejecutar(() =>
      api(`/api/review-queue/${selected.id}/asignar-cliente`, {
        method: 'POST',
        body: JSON.stringify({ qbCustomerId: customer.Id, qbDisplayName: customer.DisplayName }),
      })
    );
  }

  function crearCliente(nombre) {
    return ejecutar(() =>
      api(`/api/review-queue/${selected.id}/crear-cliente`, {
        method: 'POST',
        body: JSON.stringify({ nombre }),
      })
    );
  }

  function editarLinea(idDetalle, campo, valor) {
    return ejecutar(() =>
      api(`/api/review-queue/${selected.id}/lineas/${idDetalle}`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: valor }),
      })
    );
  }

  function eliminarLinea(idDetalle) {
    return ejecutar(() => api(`/api/review-queue/${selected.id}/lineas/${idDetalle}`, { method: 'DELETE' }));
  }

  function agregarLinea(nuevaLinea) {
    return ejecutar(() =>
      api(`/api/review-queue/${selected.id}/lineas`, {
        method: 'POST',
        body: JSON.stringify(nuevaLinea),
      })
    );
  }

  function asignarItem(idDetalle, item) {
    return ejecutar(() =>
      api(`/api/review-queue/${selected.id}/lineas/${idDetalle}/asignar-item`, {
        method: 'POST',
        body: JSON.stringify({ qbItemId: item.Id, qbItemName: item.Name }),
      })
    );
  }

  async function crearItem(idDetalle, nombre) {
    const result = await ejecutar(() =>
      api(`/api/review-queue/${selected.id}/lineas/${idDetalle}/crear-item`, {
        method: 'POST',
        body: JSON.stringify({ nombre }),
      })
    );
    if (result) setDraft(result.draft);
  }

  function actualizarFactura(campo, valor) {
    return ejecutar(() =>
      api(`/api/review-queue/${selected.id}/factura`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: valor }),
      })
    );
  }

  function actualizarDeposito(campo, valor) {
    return ejecutar(() =>
      api(`/api/review-queue/${selected.id}/deposito`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: valor }),
      })
    );
  }

  async function crearFactura(registrarPago) {
    setBusy(true);
    try {
      await api(`/api/review-queue/${selected.id}/crear-factura`, {
        method: 'POST',
        body: JSON.stringify({ registrarPago }),
      });
      setDraft(null);
      setSelected(null);
      await cargarPagos();
    } catch (err) {
      setErrores((prev) => ({ ...prev, [selected.id]: err.message }));
    } finally {
      setBusy(false);
    }
  }

  async function guardar() {
    if (!selected) return;
    setBusy(true);
    try {
      const row = await api(`/api/review-queue/${selected.id}`);
      setDraft(row.draft);
      setSavedHint('Guardado');
      setTimeout(() => setSavedHint(''), 1800);
    } catch (err) {
      setErrores((prev) => ({ ...prev, [selected.id]: err.message }));
    } finally {
      setBusy(false);
    }
  }

  async function revertirProcesado() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/pagos/${selected.id}/marcar-pendiente`, { method: 'POST' });
      await cargarPagos();
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  const listo =
    draft &&
    Boolean(draft.customerMatch?.qbCustomerId) &&
    draft.lineas.length > 0 &&
    draft.lineas.every((l) => l.estado === 'matched') &&
    Boolean(draft.factura?.docNumber);

  const totalFactura = draft ? draft.lineas.reduce((sum, l) => sum + (l.precio ?? 0) * (l.cantidad ?? 1), 0) : 0;

  return (
    <div className="flex h-[calc(100vh-88px)] gap-5 pb-20">
      <aside className="w-[36%] min-w-[320px] max-w-[420px]">
        <PaymentsSidebar
          fecha={fecha}
          onFechaChange={setFecha}
          pagos={pagos}
          loading={loadingPagos}
          selectedId={selected?.id}
          onSelect={seleccionarPago}
          onRefresh={cargarPagos}
          errores={errores}
        />
      </aside>

      <section className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {!selected && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex h-full flex-col items-center justify-center text-center text-slate-400"
            >
              <InboxIcon size={40} strokeWidth={1.5} />
              <p className="mt-3 text-sm">Selecciona un pago de la izquierda para revisarlo.</p>
            </motion.div>
          )}

          {selected && errores[selected.id] && !draft && (
            <motion.div
              key={`error-${selected.id}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-red-200 bg-danger-light p-5 text-sm text-danger"
            >
              <p className="font-semibold">No se pudo traer el detalle de este pago</p>
              <p className="mt-1">{errores[selected.id]}</p>
              <Button variant="outlineDanger" size="sm" className="mt-3" onClick={() => seleccionarPago(selected)}>
                Reintentar
              </Button>
            </motion.div>
          )}

          {selected && selected.estado === 'sincronizado' && (
            <motion.div
              key={`ok-${selected.id}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-emerald-200 bg-success-light p-6 text-center"
            >
              <CheckCircle2 size={32} className="mx-auto text-success" />
              <p className="mt-2 text-sm font-semibold text-slate-800">Este pago ya fue procesado en QuickBooks</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={revertirProcesado} disabled={busy}>
                <RotateCcw size={14} />
                Marcar como pendiente de nuevo
              </Button>
            </motion.div>
          )}

          {selected && loadingDraft && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-card bg-slate-100" />
              ))}
            </motion.div>
          )}

          {selected && draft && !loadingDraft && (
            <motion.div
              key={`draft-${selected.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <PaymentSummary pago={selected} estado={selected.estado} />
              <QuickBooksCard
                customerMatch={draft.customerMatch}
                busy={busy}
                onAsignar={asignarCliente}
                onCrear={crearCliente}
              />
              <ServicesCard
                lineas={draft.lineas}
                busy={busy}
                onEditar={editarLinea}
                onEliminar={eliminarLinea}
                onAsignarItem={asignarItem}
                onCrearItem={crearItem}
                onAgregarLinea={agregarLinea}
              />
              <InvoiceCard
                factura={draft.factura}
                deposito={draft.deposito}
                totalFactura={totalFactura}
                onChange={actualizarFactura}
                onChangeDeposito={actualizarDeposito}
              />
              <InvoicePreview draft={draft} />
              <ChecklistCard draft={draft} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <BottomActionBar
        visible={Boolean(selected && draft && !loadingDraft)}
        listo={Boolean(listo)}
        busy={busy}
        savedHint={savedHint}
        totalFactura={totalFactura}
        clienteNombre={draft?.customerMatch?.qbDisplayName || `cliente ${draft?.customerMatch?.qbCustomerId}`}
        onCancelar={() => {
          setSelected(null);
          setDraft(null);
        }}
        onGuardar={guardar}
        onCrearFactura={crearFactura}
      />
    </div>
  );
}
