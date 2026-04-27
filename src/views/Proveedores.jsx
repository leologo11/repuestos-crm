import { useState, useEffect } from 'react';
import Card from '../components/ui/Card.jsx';
import Badge from '../components/ui/Badge.jsx';
import Modal from '../components/ui/Modal.jsx';
import Ico from '../components/ui/Icons.jsx';
import { PROVEEDORES_MOCK } from '../data/mockData.js';
import { getProveedores, createProveedor, updateProveedor, messageProveedor } from '../services/api.js';

const EMPTY_FORM = { nombre: '', marcas: '', whatsapp: '', api: 'Sin API', estado: 'Pendiente' };

function FormFields({ f, setF }) {
  return (
    <>
      {[
        { key: 'nombre',   label: 'Nombre del proveedor',       ph: 'Ej: AutoParts Chile' },
        { key: 'marcas',   label: 'Marcas que distribuye',      ph: 'Ej: Toyota, Honda'   },
        { key: 'whatsapp', label: 'WhatsApp (con código país)', ph: 'Ej: 56987654321'     },
      ].map(({ key, label, ph }) => (
        <div key={key} style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
          <input value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} placeholder={ph}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {[['api', 'API', ['Sin API', 'Conectada']], ['estado', 'Estado', ['Pendiente', 'Activo', 'Inactivo']]].map(([key, label, opts]) => (
          <div key={key} style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
            <select value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }}>
              {opts.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Proveedores() {
  const [rows,      setRows]      = useState([]);
  const [modal,     setModal]     = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [msgModal,  setMsgModal]  = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [msgText,   setMsgText]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [sending,   setSending]   = useState(false);

  useEffect(() => {
    getProveedores().then(setRows).catch(() => {});
  }, []);

  const openEdit = (p) => {
    setSelected(p);
    setForm({ nombre: p.nombre, marcas: p.marcas || '', whatsapp: p.whatsapp || '', api: p.api || 'Sin API', estado: p.estado });
    setEditModal(true);
  };
  const openMsg = (p) => { setSelected(p); setMsgText(''); setMsgModal(true); };

  const save = async () => {
    if (!form.nombre) return;
    setSaving(true);
    try { const c = await createProveedor({ ...form, rating: 0 }); setRows((r) => [...r, c]); }
    catch { setRows((r) => [...r, { ...form, _id: Date.now(), rating: 0 }]); }
    setModal(false); setForm(EMPTY_FORM); setSaving(false);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try { const u = await updateProveedor(selected._id, form); setRows((r) => r.map((p) => p._id === selected._id ? u : p)); }
    catch { setRows((r) => r.map((p) => p._id === selected._id ? { ...p, ...form } : p)); }
    setEditModal(false); setSaving(false);
  };

  const sendMsg = async () => {
    if (!msgText.trim() || !selected) return;
    setSending(true);
    try { await messageProveedor(selected._id, msgText.trim()); setMsgText(''); setMsgModal(false); }
    catch (err) { alert('Error al enviar: ' + err.message); }
    setSending(false);
  };

  const btnStyle = (color = 'var(--accent)') => ({
    padding: '9px 18px', borderRadius: 8, border: 'none', background: color, color: 'white',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  });

  return (
    <div style={{ padding: 28, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{rows.length} proveedores registrados</div>
        <button onClick={() => { setForm(EMPTY_FORM); setModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
          <Ico name="plus" size={15} /> Agregar Proveedor
        </button>
      </div>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Proveedor', 'Marcas', 'WhatsApp', 'API', 'Rating', 'Estado', 'Acciones'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '14px 16px', fontWeight: 600, fontSize: 13.5 }}>{p.nombre}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text2)' }}>{p.marcas || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text2)' }}>{p.whatsapp || '—'}</td>
                <td style={{ padding: '14px 16px' }}><Badge label={p.api} /></td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--border)', maxWidth: 60 }}>
                      <div style={{ width: `${p.rating}%`, height: '100%', borderRadius: 3, background: p.rating >= 90 ? 'var(--accent)' : p.rating >= 75 ? 'var(--amber)' : 'var(--red)' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{p.rating}%</span>
                  </div>
                </td>
                <td style={{ padding: '14px 16px' }}><Badge label={p.estado} /></td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openMsg(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'white', background: '#25D366', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Ico name="whatsapp" size={12} /> Mensaje
                    </button>
                    <button onClick={() => openEdit(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Ico name="edit" size={12} /> Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Modal agregar */}
      <Modal open={modal} onClose={() => setModal(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Agregar Proveedor</div>
          <button onClick={() => setModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}><Ico name="x" size={18} /></button>
        </div>
        <FormFields f={form} setF={setForm} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={btnStyle()}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </Modal>

      {/* Modal editar */}
      <Modal open={editModal} onClose={() => setEditModal(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Editar — {selected?.nombre}</div>
          <button onClick={() => setEditModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}><Ico name="x" size={18} /></button>
        </div>
        <FormFields f={form} setF={setForm} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setEditModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}>Cancelar</button>
          <button onClick={saveEdit} disabled={saving} style={btnStyle()}>{saving ? 'Guardando…' : 'Actualizar'}</button>
        </div>
      </Modal>

      {/* Modal mensaje directo */}
      <Modal open={msgModal} onClose={() => setMsgModal(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Mensaje a {selected?.nombre}</div>
          <button onClick={() => setMsgModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}><Ico name="x" size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 14 }}>WhatsApp: {selected?.whatsapp || 'no registrado'}</p>
        <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Escribe tu mensaje…" rows={4}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, outline: 'none', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={() => setMsgModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}>Cancelar</button>
          <button onClick={sendMsg} disabled={sending || !msgText.trim()}
            style={{ ...btnStyle('#25D366'), display: 'flex', alignItems: 'center', gap: 7, opacity: sending || !msgText.trim() ? 0.6 : 1 }}>
            <Ico name="send" size={14} /> {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
