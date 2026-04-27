import { useState, useEffect } from 'react';
import Card from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
import Ico from '../components/ui/Icons.jsx';
import { CLIENTES_MOCK } from '../data/mockData.js';
import { getClientes, createCliente, updateCliente } from '../services/api.js';

const EMPTY_FORM = { nombre: '', telefono: '', vehiculos: '' };

export default function Clientes() {
  const [rows,      setRows]      = useState([]);
  const [modal,     setModal]     = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    getClientes().then(setRows).catch(() => {});
  }, []);

  const openEdit = (c) => {
    setSelected(c);
    setForm({
      nombre:    c.nombre || '',
      telefono:  c.telefono || '',
      vehiculos: Array.isArray(c.vehiculos) ? c.vehiculos.join(', ') : c.vehiculos || '',
    });
    setEditModal(true);
  };

  const save = async () => {
    if (!form.telefono) return;
    setSaving(true);
    const payload = {
      nombre:    form.nombre,
      telefono:  form.telefono,
      vehiculos: form.vehiculos ? form.vehiculos.split(',').map((v) => v.trim()).filter(Boolean) : [],
    };
    try {
      const c = await createCliente(payload);
      setRows((r) => {
        const exists = r.find((x) => x._id === c._id || x.telefono === c.telefono);
        return exists ? r.map((x) => x.telefono === c.telefono ? c : x) : [c, ...r];
      });
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setModal(false); setForm(EMPTY_FORM); setSaving(false);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    const payload = {
      nombre:    form.nombre,
      vehiculos: form.vehiculos ? form.vehiculos.split(',').map((v) => v.trim()).filter(Boolean) : [],
    };
    try {
      const u = await updateCliente(selected._id, payload);
      setRows((r) => r.map((c) => c._id === selected._id ? u : c));
    } catch {
      setRows((r) => r.map((c) => c._id === selected._id ? { ...c, ...payload } : c));
    }
    setEditModal(false); setSaving(false);
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, outline: 'none',
  };

  return (
    <div style={{ padding: 28, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{rows.length} clientes registrados</div>
        <button onClick={() => { setForm(EMPTY_FORM); setModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
          <Ico name="plus" size={15} /> Agregar Cliente
        </button>
      </div>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Cliente', 'Teléfono', 'Vehículos', 'Pedidos', 'Gasto Total', ''].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c._id} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--blue-dim)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                      {c.nombre?.[0] || '?'}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.nombre || 'Sin nombre'}</span>
                  </div>
                </td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text2)' }}>{c.telefono}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text2)' }}>
                  {Array.isArray(c.vehiculos) ? c.vehiculos.join(', ') || '—' : c.vehiculos || '—'}
                </td>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600 }}>{c.total_pedidos || 0}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                  ${(c.total_gasto || 0).toLocaleString('es-CL')}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <button onClick={() => openEdit(c)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Ico name="edit" size={12} /> Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Modal agregar */}
      <Modal open={modal} onClose={() => setModal(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Agregar Cliente</div>
          <button onClick={() => setModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}><Ico name="x" size={18} /></button>
        </div>
        {[
          { key: 'nombre',    label: 'Nombre',                           ph: 'Carlos Mendoza'           },
          { key: 'telefono',  label: 'Teléfono (WhatsApp)',              ph: 'Ej: 56912345678'          },
          { key: 'vehiculos', label: 'Vehículos (separados por coma)',   ph: 'Toyota Corolla 2020, ...' },
        ].map(({ key, label, ph }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
            <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inputStyle} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={() => setModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </Modal>

      {/* Modal editar */}
      <Modal open={editModal} onClose={() => setEditModal(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Editar — {selected?.nombre || selected?.telefono}</div>
          <button onClick={() => setEditModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}><Ico name="x" size={18} /></button>
        </div>
        {[
          { key: 'nombre',    label: 'Nombre',                           ph: 'Carlos Mendoza'           },
          { key: 'vehiculos', label: 'Vehículos (separados por coma)',   ph: 'Toyota Corolla 2020, ...' },
        ].map(({ key, label, ph }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
            <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inputStyle} />
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>Teléfono: {selected?.telefono}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setEditModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}>Cancelar</button>
          <button onClick={saveEdit} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
            {saving ? 'Guardando…' : 'Actualizar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
