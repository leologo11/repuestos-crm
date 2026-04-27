import { useState, useEffect } from 'react';
import Card from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
import Ico from '../components/ui/Icons.jsx';
import { socket, getPedidos, getRepartidores, createRepartidor, updateRepartidor, updatePedido } from '../services/api.js';

const STATUS_META = {
  buscando_proveedor: { label: 'Buscando precio',  color: 'var(--amber)', bg: 'var(--amber-dim)' },
  precio_enviado:     { label: 'Precio enviado',   color: 'var(--blue)',  bg: 'var(--blue-dim)'  },
  precio_aceptado:    { label: 'Aceptado',         color: 'var(--accent)', bg: 'var(--accent-dim)' },
  en_preparacion:     { label: 'Preparando',       color: 'var(--amber)', bg: 'var(--amber-dim)' },
  en_camino:          { label: 'En camino',        color: 'var(--accent)', bg: 'var(--accent-dim)' },
  entregado:          { label: 'Entregado',        color: 'var(--text2)', bg: 'var(--border)'    },
  cancelado:          { label: 'Cancelado',        color: 'var(--red)',   bg: 'var(--red-dim)'   },
};

const ESTADO_REP = {
  disponible: { color: 'var(--accent)', label: 'Disponible' },
  en_ruta:    { color: 'var(--amber)',  label: 'En ruta'    },
  inactivo:   { color: 'var(--text2)', label: 'Inactivo'   },
};

function StatusBadge({ status }) {
  const s = STATUS_META[status] || { label: status, color: 'var(--text2)', bg: 'var(--border)' };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

const EMPTY_REP = { nombre: '', telefono: '', whatsapp: '', vehiculo: 'Moto', patente: '', tarifa_base: 3000 };

export default function Delivery() {
  const [pedidos,     setPedidos]    = useState([]);
  const [repartidores, setReps]      = useState([]);
  const [tab,         setTab]        = useState('pedidos'); // 'pedidos' | 'repartidores'
  const [selPedido,   setSelPedido]  = useState(null);
  const [pedidoModal, setPedidoModal] = useState(false);
  const [repModal,    setRepModal]   = useState(false);
  const [editRepModal, setEditRepModal] = useState(false);
  const [selRep,      setSelRep]     = useState(null);
  const [repForm,     setRepForm]    = useState(EMPTY_REP);
  const [pedidoForm,  setPedidoForm] = useState({ repartidor_id: '', delivery_address: '', delivery_notes: '', delivery_fee: 3000, status: '' });
  const [saving,      setSaving]     = useState(false);

  useEffect(() => {
    getPedidos().then(setPedidos).catch(() => {});
    getRepartidores().then(setReps).catch(() => {});
  }, []);

  useEffect(() => {
    socket.on('pedido:new',     (p) => setPedidos((prev) => [p, ...prev]));
    socket.on('pedido:updated', (p) => setPedidos((prev) => prev.map((x) => x._id === p._id ? p : x)));
    return () => { socket.off('pedido:new'); socket.off('pedido:updated'); };
  }, []);

  const openPedido = (p) => {
    setSelPedido(p);
    setPedidoForm({
      repartidor_id:    p.repartidor_id?._id || p.repartidor_id || '',
      delivery_address: p.delivery_address || '',
      delivery_notes:   p.delivery_notes || '',
      delivery_fee:     p.delivery_fee || 3000,
      status:           p.status,
    });
    setPedidoModal(true);
  };

  const savePedido = async () => {
    if (!selPedido) return;
    setSaving(true);
    try {
      const formData = { ...pedidoForm, delivery_fee: Number(pedidoForm.delivery_fee) };
      if (formData.repartidor_id && !['en_camino', 'entregado'].includes(formData.status)) {
        formData.status = 'en_camino';
      }
      const u = await updatePedido(selPedido._id, formData);
      setPedidos((prev) => prev.map((p) => p._id === u._id ? u : p));
      setPedidoModal(false);
    } catch (err) { alert('Error: ' + err.message); }
    setSaving(false);
  };

  const markPaid = async (pedido) => {
    try {
      const u = await updatePedido(pedido._id, { delivery_paid: !pedido.delivery_paid });
      setPedidos((prev) => prev.map((p) => p._id === u._id ? u : p));
    } catch (_) {}
  };

  const saveRep = async () => {
    setSaving(true);
    try {
      const r = await createRepartidor({ ...repForm, tarifa_base: Number(repForm.tarifa_base) });
      setReps((prev) => [...prev, r]);
    } catch (err) { alert('Error: ' + err.message); }
    setRepModal(false); setRepForm(EMPTY_REP); setSaving(false);
  };

  const saveEditRep = async () => {
    if (!selRep) return;
    setSaving(true);
    try {
      const r = await updateRepartidor(selRep._id, { ...repForm, tarifa_base: Number(repForm.tarifa_base) });
      setReps((prev) => prev.map((x) => x._id === r._id ? r : x));
    } catch (err) { alert('Error: ' + err.message); }
    setEditRepModal(false); setSaving(false);
  };

  const openEditRep = (r) => {
    setSelRep(r);
    setRepForm({ nombre: r.nombre, telefono: r.telefono || '', whatsapp: r.whatsapp || '', vehiculo: r.vehiculo || 'Moto', patente: r.patente || '', tarifa_base: r.tarifa_base || 3000 });
    setEditRepModal(true);
  };

  // Stats
  const enCamino    = pedidos.filter((p) => p.status === 'en_camino').length;
  const entregados  = pedidos.filter((p) => p.status === 'entregado').length;
  const pendPago    = pedidos.filter((p) => p.status === 'entregado' && !p.delivery_paid).reduce((s, p) => s + (p.delivery_fee || 3000), 0);
  const disponibles = repartidores.filter((r) => r.estado === 'disponible').length;

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, outline: 'none' };

  function RepForm({ f, setF }) {
    return (
      <>
        {[['nombre', 'Nombre', 'Juan Pérez'], ['telefono', 'Teléfono', '+56 9 1234 5678'], ['whatsapp', 'WhatsApp', '56912345678'], ['patente', 'Patente', 'ABCD12']].map(([key, label, ph]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
            <input value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} placeholder={ph} style={inputStyle} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Vehículo</label>
            <select value={f.vehiculo} onChange={(e) => setF((x) => ({ ...x, vehiculo: e.target.value }))} style={inputStyle}>
              {['Moto', 'Auto', 'Bicicleta', 'Otro'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Tarifa base ($)</label>
            <input type="number" value={f.tarifa_base} onChange={(e) => setF((x) => ({ ...x, tarifa_base: e.target.value }))} style={inputStyle} />
          </div>
        </div>
      </>
    );
  }

  return (
    <div style={{ padding: 28, flex: 1, overflowY: 'auto' }}>
      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          ['En camino',     enCamino,    'var(--accent)',  'delivery'],
          ['Entregados',    entregados,  'var(--blue)',    'check'],
          ['Pago pendiente', `$${pendPago.toLocaleString('es-CL')}`, 'var(--amber)', 'clock'],
          ['Repartidores disponibles', disponibles, 'var(--accent)', 'moto'],
        ].map(([label, value, color, icon]) => (
          <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ico name={icon} size={16} style={{ color }} />
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[['pedidos', 'Pedidos'], ['repartidores', 'Repartidores']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: tab === id ? 'var(--accent)' : 'var(--bg2)', color: tab === id ? 'white' : 'var(--text2)', border: tab !== id ? '1px solid var(--border)' : 'none' }}>
            {label}
          </button>
        ))}
        {tab === 'repartidores' && (
          <button onClick={() => { setRepForm(EMPTY_REP); setRepModal(true); }}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
            <Ico name="plus" size={14} /> Agregar Repartidor
          </button>
        )}
      </div>

      {/* ── TAB PEDIDOS ── */}
      {tab === 'pedidos' && (
        <Card>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Código', 'Cliente', 'Repuesto', 'Vehículo', 'Precio', 'Repartidor', 'Estado', 'Pago Repartidor', 'Acciones'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 14px', fontSize: 11.5, color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Sin pedidos registrados</td></tr>
              ) : pedidos.map((p) => (
                <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '3px 8px', borderRadius: 6 }}>{p.secretCode}</span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.customer_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{p.customer_phone}</div>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>{p.repuesto || p.quote_id?.item_description || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text2)' }}>{p.vehicle || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    {p.final_price ? `$${p.final_price.toLocaleString('es-CL')}` : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>
                    {p.repartidor_id ? (
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.repartidor_id.nombre}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{p.repartidor_id.vehiculo}</div>
                      </div>
                    ) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>Sin asignar</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }}><StatusBadge status={p.status} /></td>
                  <td style={{ padding: '12px 14px' }}>
                    {p.status === 'entregado' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: p.delivery_paid ? 'var(--accent)' : 'var(--amber)' }}>
                          ${(p.delivery_fee || 3000).toLocaleString('es-CL')}
                        </span>
                        <button onClick={() => markPaid(p)}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: p.delivery_paid ? 'var(--accent-dim)' : 'var(--bg)', color: p.delivery_paid ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {p.delivery_paid ? '✓ Pagado' : 'Marcar pagado'}
                        </button>
                      </div>
                    ) : <span style={{ fontSize: 12, color: 'var(--text2)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button onClick={() => openPedido(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Ico name="edit" size={12} /> Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── TAB REPARTIDORES ── */}
      {tab === 'repartidores' && (
        <Card>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Repartidor', 'Contacto', 'Vehículo', 'Tarifa', 'Estado', 'Entregas', 'Total Pagado', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 14px', fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repartidores.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Sin repartidores registrados</td></tr>
              ) : repartidores.map((r) => {
                const est = ESTADO_REP[r.estado] || { color: 'var(--text2)', label: r.estado };
                return (
                  <tr key={r._id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13.5 }}>{r.nombre}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 13 }}>{r.telefono || '—'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{r.whatsapp || ''}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 13 }}>{r.vehiculo}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{r.patente || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                      ${(r.tarifa_base || 3000).toLocaleString('es-CL')}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: est.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: est.color }}>{est.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700 }}>{r.total_entregas || 0}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                      ${(r.total_pagado || 0).toLocaleString('es-CL')}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={() => openEditRep(r)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Ico name="edit" size={12} /> Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Modal gestionar pedido ── */}
      <Modal open={pedidoModal} onClose={() => setPedidoModal(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Gestionar Pedido {selPedido?.secretCode}</div>
          <button onClick={() => setPedidoModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}><Ico name="x" size={18} /></button>
        </div>

        {selPedido && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{selPedido.customer_name} · {selPedido.customer_phone}</div>
            <div style={{ color: 'var(--text2)' }}>{selPedido.repuesto} · {selPedido.vehicle}</div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Estado</label>
          <select value={pedidoForm.status} onChange={(e) => setPedidoForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Asignar Repartidor</label>
          <select value={pedidoForm.repartidor_id} onChange={(e) => setPedidoForm((f) => ({ ...f, repartidor_id: e.target.value }))} style={inputStyle}>
            <option value="">Sin repartidor</option>
            {repartidores.map((r) => <option key={r._id} value={r._id}>{r.nombre} — {r.vehiculo} — ${(r.tarifa_base || 3000).toLocaleString('es-CL')}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Dirección de entrega</label>
          <input value={pedidoForm.delivery_address} onChange={(e) => setPedidoForm((f) => ({ ...f, delivery_address: e.target.value }))}
            placeholder="Ej: Av. Principal 123, Santiago" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Notas de entrega</label>
          <input value={pedidoForm.delivery_notes} onChange={(e) => setPedidoForm((f) => ({ ...f, delivery_notes: e.target.value }))}
            placeholder="Timbre 3, deja en portería..." style={inputStyle} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Tarifa del repartidor ($)</label>
          <input type="number" value={pedidoForm.delivery_fee} onChange={(e) => setPedidoForm((f) => ({ ...f, delivery_fee: e.target.value }))} style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setPedidoModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}>Cancelar</button>
          <button onClick={savePedido} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
            {saving ? 'Guardando…' : 'Actualizar'}
          </button>
        </div>
      </Modal>

      {/* ── Modal agregar repartidor ── */}
      <Modal open={repModal} onClose={() => setRepModal(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Agregar Repartidor</div>
          <button onClick={() => setRepModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}><Ico name="x" size={18} /></button>
        </div>
        <RepForm f={repForm} setF={setRepForm} inputStyle={inputStyle} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setRepModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}>Cancelar</button>
          <button onClick={saveRep} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </Modal>

      {/* ── Modal editar repartidor ── */}
      <Modal open={editRepModal} onClose={() => setEditRepModal(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Editar — {selRep?.nombre}</div>
          <button onClick={() => setEditRepModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}><Ico name="x" size={18} /></button>
        </div>
        <RepForm f={repForm} setF={setRepForm} inputStyle={inputStyle} />
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Estado</label>
          <select value={repForm.estado || 'disponible'} onChange={(e) => setRepForm((x) => ({ ...x, estado: e.target.value }))} style={inputStyle}>
            <option value="disponible">Disponible</option>
            <option value="en_ruta">En ruta</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setEditRepModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}>Cancelar</button>
          <button onClick={saveEditRep} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
            {saving ? 'Guardando…' : 'Actualizar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function RepForm({ f, setF, inputStyle }) {
  return (
    <>
      {[['nombre', 'Nombre completo', 'Juan Pérez'], ['telefono', 'Teléfono', '+56 9 1234 5678'], ['whatsapp', 'WhatsApp (solo dígitos)', '56912345678'], ['patente', 'Patente del vehículo', 'ABCD12']].map(([key, label, ph]) => (
        <div key={key} style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
          <input value={f[key] || ''} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} placeholder={ph} style={inputStyle} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Vehículo</label>
          <select value={f.vehiculo || 'Moto'} onChange={(e) => setF((x) => ({ ...x, vehiculo: e.target.value }))} style={inputStyle}>
            {['Moto', 'Auto', 'Bicicleta', 'Otro'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Tarifa por entrega ($)</label>
          <input type="number" value={f.tarifa_base || 3000} onChange={(e) => setF((x) => ({ ...x, tarifa_base: e.target.value }))} style={inputStyle} />
        </div>
      </div>
    </>
  );
}
