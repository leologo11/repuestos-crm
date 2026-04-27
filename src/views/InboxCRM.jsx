import { useState, useEffect, useRef } from 'react';
import Ico from '../components/ui/Icons.jsx';
import { CONVERSATIONS_MOCK, CHAT_MSGS_MOCK, QUOTES_MOCK } from '../data/mockData.js';
import {
  socket,
  getConversations, getConversation, getQuote, getProveedores,
  getProveedorQuotes, updateConversation, sendAdminMessage,
  sendQuoteToClient, messageProveedor, confirmPayment,
} from '../services/api.js';

const STATUS_META = {
  esperando_proveedor:   { label: 'Esp. proveedor',  color: 'var(--amber)', bg: 'var(--amber-dim)' },
  esperando_cliente:     { label: 'Esp. cliente',    color: 'var(--blue)',  bg: 'var(--blue-dim)'  },
  esperando_seleccion:   { label: 'Elige opción',    color: 'var(--blue)',  bg: 'var(--blue-dim)'  },
  esperando_confirmacion:{ label: 'Confirmar compra',color: '#7c3aed',      bg: '#ede9fe'           },
  esperando_direccion:   { label: 'Pide dirección',  color: '#7c3aed',      bg: '#ede9fe'           },
  pedido_pendiente_pago: { label: '💸 Pago pendiente',color: 'var(--amber)', bg: '#fef9c3'          },
  pago_confirmado:       { label: '✅ Pago confirmado',color: 'var(--accent)',bg: 'var(--accent-dim)'},
  intervencion_humana:   { label: 'Intervención',    color: 'var(--red)',   bg: 'var(--red-dim)'   },
  cerrado:               { label: 'Cerrado',          color: 'var(--text2)', bg: 'var(--border)'    },
};

const PEDIDO_STATUS = {
  buscando_proveedor: { label: 'Buscando precio', color: 'var(--amber)' },
  precio_enviado:     { label: 'Precio enviado',  color: 'var(--blue)'  },
  precio_aceptado:    { label: 'Aceptado',        color: 'var(--accent)' },
  en_preparacion:     { label: 'Preparando',      color: 'var(--amber)' },
  en_camino:          { label: 'En camino',        color: 'var(--accent)' },
  entregado:          { label: 'Entregado',        color: 'var(--text2)' },
  cancelado:          { label: 'Cancelado',        color: 'var(--red)'   },
};

function StatusPill({ status }) {
  const s = STATUS_META[status] || { label: status, color: 'var(--text2)', bg: 'var(--border)' };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); }
  catch { return String(ts); }
}

export default function InboxCRM() {
  // ── Estado cliente ────────────────────────────────────────
  const [convs,    setConvs]   = useState([]);
  const [selId,    setSelId]   = useState(null);
  const [msgs,     setMsgs]    = useState({});
  const [quote,    setQuote]   = useState(null);
  const [input,    setInput]   = useState('');
  const [apiMode,  setApiMode] = useState(false);
  const chatEndRef             = useRef();

  // ── Estado proveedor ──────────────────────────────────────
  const [proveedores,    setProveedores]   = useState([]);
  const [selProveedor,   setSelProveedor]  = useState(null); // objeto proveedor
  const [provQuotes,     setProvQuotes]    = useState([]);
  const [provInput,      setProvInput]     = useState('');
  const [sendingProv,    setSendingProv]   = useState(false);
  const [mode,           setMode]          = useState('client'); // 'client' | 'provider'

  const selChat   = convs.find((c) => c._id === selId) || convs[0];
  const botOn     = selChat?.bot_active;
  const bestPrice = quote ? Math.min(...(quote.supplier_responses?.filter((r) => r.price).map((r) => r.price) || [0])) || null : null;
  const finalPrice = bestPrice && quote ? Math.round(bestPrice * (1 + (quote.margin || 0.28))) : null;
  const allWaiting = quote && quote.supplier_responses?.every((r) => !r.price);

  // ── Carga inicial ─────────────────────────────────────────
  useEffect(() => {
    getConversations()
      .then((data) => {
        if (data?.length) { setConvs(data); setSelId(data[0]._id); setApiMode(true); setMsgs({}); }
      }).catch(() => {});

    getProveedores()
      .then((data) => { if (data?.length) setProveedores(data); })
      .catch(() => {});
  }, []);

  // ── Mensajes + cotización al cambiar conversación ─────────
  useEffect(() => {
    if (!selId || mode !== 'client') return;
    getConversation(selId)
      .then((conv) => {
        if (conv?.messages?.length) {
          setMsgs((p) => ({ ...p, [selId]: conv.messages.map((m) => ({ from: m.from, text: m.text, ts: fmtTime(m.ts) })) }));
        }
      }).catch(() => {});
    getQuote(selId)
      .then((q) => setQuote(q || null))
      .catch(() => setQuote(null));
  }, [selId, mode]); // eslint-disable-line

  // ── Cotizaciones del proveedor seleccionado ───────────────
  useEffect(() => {
    if (!selProveedor) return;
    getProveedorQuotes(selProveedor._id)
      .then(setProvQuotes)
      .catch(() => {});
  }, [selProveedor]);

  // ── Auto-scroll ───────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selId, msgs, mode, selProveedor]);

  // ── Socket.io ─────────────────────────────────────────────
  useEffect(() => {
    socket.on('conversation:new', (conv) => {
      setConvs((p) => [conv, ...p.filter((c) => c._id !== conv._id)]);
      setApiMode(true);
    });
    socket.on('conversation:message', ({ conversationId, message }) => {
      const fm = { from: message.from, text: message.text, ts: fmtTime(message.ts) };
      setMsgs((p) => ({ ...p, [conversationId]: [...(p[conversationId] || []), fm] }));
      setConvs((p) => p.map((c) => c._id === conversationId ? { ...c, updatedAt: new Date().toISOString() } : c));
    });
    socket.on('conversation:updated', ({ conversationId, ...changes }) => {
      setConvs((p) => p.map((c) => c._id === conversationId ? { ...c, ...changes } : c));
    });
    socket.on('quote:updated', ({ conversationId, quote: q }) => {
      if (conversationId === selId) setQuote(q);
    });
    socket.on('quote:created', ({ conversationId, quote: q }) => {
      if (conversationId === selId) setQuote(q);
    });
    return () => {
      socket.off('conversation:new');
      socket.off('conversation:message');
      socket.off('conversation:updated');
      socket.off('quote:updated');
      socket.off('quote:created');
    };
  }, [selId]);

  // ── Acciones cliente ──────────────────────────────────────
  const toggleBot = async () => {
    const newVal = !botOn;
    setConvs((p) => p.map((c) => c._id === selId ? { ...c, bot_active: newVal } : c));
    await updateConversation(selId, { bot_active: newVal }).catch(() => {});
  };

  const sendMsg = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    const fm = { from: 'admin', text, ts: fmtTime(new Date()) };
    setMsgs((p) => ({ ...p, [selId]: [...(p[selId] || []), fm] }));
    await sendAdminMessage(selId, text).catch(() => {});
  };

  const sendPrice = async () => {
    if (!quote || !finalPrice) return;
    await sendQuoteToClient(quote._id || selId, null).catch(() => {});
  };

  const handleConfirmPayment = async () => {
    if (!selId) return;
    try {
      await confirmPayment(selId);
      setConvs((p) => p.map((c) => c._id === selId ? { ...c, status: 'pago_confirmado' } : c));
    } catch (err) { alert('Error: ' + err.message); }
  };

  // ── Acciones proveedor ────────────────────────────────────
  const selectProveedor = (p) => {
    setSelProveedor(p);
    setMode('provider');
    setProvInput('');
  };

  const sendProvMsg = async () => {
    if (!provInput.trim() || !selProveedor) return;
    setSendingProv(true);
    try {
      await messageProveedor(selProveedor._id, provInput.trim());
      setProvInput('');
    } catch (err) {
      alert('Error enviando mensaje: ' + err.message);
    }
    setSendingProv(false);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Col 1: Lista ── */}
      <div style={{ width: 272, borderRight: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '10px 14px 6px', fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.8, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span>CLIENTES · {convs.length}</span>
          {apiMode && <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 700 }}>● EN VIVO</span>}
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {convs.map((c) => (
            <div
              key={c._id}
              onClick={() => { setSelId(c._id); setMode('client'); setSelProveedor(null); }}
              style={{
                padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                background:  mode === 'client' && selId === c._id ? 'var(--bg)' : 'transparent',
                borderLeft:  mode === 'client' && selId === c._id ? '3px solid var(--accent)' : '3px solid transparent',
              }}
              onMouseEnter={(e) => { if (!(mode === 'client' && selId === c._id)) e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={(e) => { if (!(mode === 'client' && selId === c._id)) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.customer_name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>{fmtTime(c.updatedAt)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.customer_vehicle || c.customer_phone}
              </div>
              <StatusPill status={c.status} />
            </div>
          ))}

          {/* Proveedores */}
          <div style={{ padding: '10px 14px 6px', fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.8, borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)', marginTop: 4 }}>
            PROVEEDORES · {proveedores.length}
          </div>
          {proveedores.map((p) => (
            <div
              key={p._id}
              onClick={() => selectProveedor(p)}
              style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                background:  mode === 'provider' && selProveedor?._id === p._id ? 'var(--bg)' : 'transparent',
                borderLeft:  mode === 'provider' && selProveedor?._id === p._id ? '3px solid var(--accent)' : '3px solid transparent',
              }}
              onMouseEnter={(e) => { if (!(mode === 'provider' && selProveedor?._id === p._id)) e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={(e) => { if (!(mode === 'provider' && selProveedor?._id === p._id)) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.estado === 'Activo' ? 'var(--accent)' : 'var(--border)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.nombre}</span>
                </div>
                <span style={{ fontSize: 10.5, color: 'var(--text2)', background: 'var(--border)', padding: '1px 6px', borderRadius: 99 }}>{p.estado}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', paddingLeft: 14 }}>{p.marcas || p.whatsapp || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Col 2: Panel central ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {mode === 'client' && selChat ? (
          <>
            {/* Header cliente */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue-dim)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>
                {selChat.customer_name?.[0] || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selChat.customer_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                  {selChat.customer_vehicle ? `${selChat.customer_vehicle} · ` : ''}{selChat.customer_phone}
                </div>
              </div>
              <StatusPill status={selChat.status} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <Ico name={botOn ? 'zap' : 'pause'} size={13} style={{ color: botOn ? 'var(--accent)' : 'var(--text2)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: botOn ? 'var(--accent)' : 'var(--text2)' }}>
                  Bot {botOn ? 'activo' : 'pausado'}
                </span>
                <div
                  onClick={toggleBot}
                  style={{ width: 36, height: 20, borderRadius: 10, background: botOn ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}
                >
                  <div style={{ position: 'absolute', top: 3, left: botOn ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                </div>
              </div>
            </div>

            {/* Mensajes cliente */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(msgs[selId] || []).map((m, i) => {
                if (m.from === 'sistema') return (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--red)', background: 'var(--red-dim)', padding: '4px 12px', borderRadius: 99, display: 'inline-block' }}>{m.text}</span>
                  </div>
                );
                const isAdmin  = m.from === 'admin';
                const isBot    = m.from === 'bot';
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, flexDirection: isAdmin ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
                    {!isAdmin && (
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: isBot ? 'oklch(22% 0.06 162)' : 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: 11, color: isBot ? 'var(--accent)' : 'var(--blue)' }}>
                        {isBot ? <Ico name="zap" size={13} style={{ color: 'var(--accent)' }} /> : (selChat.customer_name?.[0] || '?')}
                      </div>
                    )}
                    <div style={{ maxWidth: '68%' }}>
                      <div style={{
                        background: isAdmin ? 'var(--accent)' : isBot ? 'oklch(22% 0.06 162)' : 'var(--bg)',
                        border: `1px solid ${isAdmin ? 'transparent' : isBot ? 'oklch(62% 0.17 162 / 0.2)' : 'var(--border)'}`,
                        borderRadius: isAdmin ? '10px 0 10px 10px' : '0 10px 10px 10px',
                        padding: '9px 13px', fontSize: 13.5,
                        color: isAdmin ? 'white' : isBot ? 'var(--accent)' : 'var(--text)',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {m.text}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text2)', marginTop: 3, textAlign: isAdmin ? 'right' : 'left' }}>
                        {isAdmin ? 'Admin · ' : isBot ? 'Bot · ' : ''}{m.ts}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input cliente */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
              {botOn ? (
                <div style={{ flex: 1, padding: '6px 12px', borderRadius: 8, background: 'var(--accent-dim)', fontSize: 12, color: 'var(--accent)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ico name="zap" size={13} /> Bot activo — respondiendo automáticamente
                </div>
              ) : (
                <>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMsg()}
                    placeholder="Escribe un mensaje (bot pausado)…"
                    style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
                  />
                  <button onClick={sendMsg} style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                    <Ico name="send" size={15} />
                  </button>
                </>
              )}
            </div>
          </>
        ) : mode === 'provider' && selProveedor ? (
          <>
            {/* Header proveedor */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>
                {selProveedor.nombre[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selProveedor.nombre}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{selProveedor.whatsapp || 'Sin WhatsApp'} · {selProveedor.marcas || '—'}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: selProveedor.estado === 'Activo' ? 'var(--accent-dim)' : 'var(--border)', color: selProveedor.estado === 'Activo' ? 'var(--accent)' : 'var(--text2)' }}>
                {selProveedor.estado}
              </span>
            </div>

            {/* Historial cotizaciones del proveedor */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {provQuotes.length === 0 ? (
                <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                  Sin cotizaciones registradas con este proveedor
                </div>
              ) : provQuotes.map((q, i) => {
                const resp = q.supplier_responses?.find((r) => r.supplier_id?.toString() === selProveedor._id);
                return (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Solicitud enviada */}
                    <div style={{ padding: '10px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>SOLICITUD ENVIADA</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{q.item_description}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{q.vehicle_model} {q.vehicle_year}</div>
                      {q.conversation_id && (
                        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4 }}>
                          Cliente: {q.conversation_id.customer_name || q.conversation_id.customer_phone}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{fmtTime(q.createdAt)}</div>
                    </div>
                    {/* Respuesta del proveedor */}
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>RESPUESTA</div>
                      {resp?.price ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
                            ${resp.price.toLocaleString('es-CL')}
                          </span>
                          {resp.selected && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 99 }}>
                              Mejor precio
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Sin respuesta aún</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input directo al proveedor */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
              <input
                value={provInput}
                onChange={(e) => setProvInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendProvMsg()}
                placeholder={`Mensaje directo a ${selProveedor.nombre} por WhatsApp…`}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
              />
              <button
                onClick={sendProvMsg}
                disabled={sendingProv || !provInput.trim()}
                style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, opacity: sendingProv || !provInput.trim() ? 0.5 : 1 }}
              >
                <Ico name="send" size={15} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 14 }}>
            Selecciona una conversación o proveedor
          </div>
        )}
      </div>

      {/* ── Col 3: Acciones ── */}
      <div style={{ width: 280, borderLeft: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
          {mode === 'provider' ? 'Info Proveedor' : 'Acciones rápidas'}
        </div>

        {mode === 'provider' && selProveedor ? (
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.5, marginBottom: 10 }}>DETALLES</div>
            {[
              ['Nombre', selProveedor.nombre],
              ['WhatsApp', selProveedor.whatsapp || '—'],
              ['Marcas', selProveedor.marcas || '—'],
              ['Estado', selProveedor.estado],
              ['Rating', `${selProveedor.rating || 0}%`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{k}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, maxWidth: 150, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 16, fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>HISTORIAL</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{provQuotes.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>cotizaciones enviadas</div>
            <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
              {provQuotes.filter((q) => q.supplier_responses?.some((r) => r.supplier_id?.toString() === selProveedor._id && r.price)).length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>respuestas recibidas</div>
          </div>
        ) : (
          <>
            {/* Cotización activa */}
            {quote ? (
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.5, marginBottom: 10 }}>COTIZACIÓN ACTIVA</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>{quote.item_description}</div>

                {allWaiting && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 8, background: 'var(--amber-dim)', marginBottom: 10, fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>
                    <Ico name="clock" size={13} style={{ color: 'var(--amber)' }} />
                    Esperando {quote.supplier_responses?.length} proveedores…
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(quote.supplier_responses || []).map((p, i) => (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${p.selected ? 'var(--accent)' : 'var(--border)'}`, background: p.selected ? 'var(--accent-dim)' : 'var(--bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{p.supplier_name}</span>
                        {p.price
                          ? <span style={{ fontSize: 13.5, fontWeight: 800, color: p.selected ? 'var(--accent)' : 'var(--text)' }}>${p.price.toLocaleString('es-CL')}</span>
                          : <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>esperando…</span>
                        }
                      </div>
                      {p.selected && p.price && (
                        <div style={{ fontSize: 10.5, color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
                          ✓ Seleccionado · precio más bajo
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {finalPrice && (
                  <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, background: 'var(--accent-dim)', border: '1px solid oklch(62% 0.17 162 / 0.3)' }}>
                    <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>PRECIO FINAL AL CLIENTE</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>${finalPrice.toLocaleString('es-CL')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
                      Incluye {Math.round((quote.margin || 0.28) * 100)}% margen · base ${bestPrice?.toLocaleString('es-CL')}
                    </div>
                    <button
                      onClick={sendPrice}
                      style={{ marginTop: 10, width: '100%', padding: 8, borderRadius: 7, background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }}
                    >
                      Enviar precio al cliente
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.5, marginBottom: 8 }}>COTIZACIÓN ACTIVA</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Sin cotización activa para esta conversación.</div>
              </div>
            )}

            {/* Botón confirmar pago — solo cuando el cliente ya dio la dirección */}
            {(selChat?.status === 'pedido_pendiente_pago') && (
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#fefce8' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', letterSpacing: 0.5, marginBottom: 8 }}>💸 PAGO PENDIENTE</div>
                {selChat?.delivery_address && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                    📍 {selChat.delivery_address}
                  </div>
                )}
                <button
                  onClick={handleConfirmPayment}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  ✅ Recibí la transferencia
                </button>
              </div>
            )}

            {(selChat?.status === 'pago_confirmado') && (
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#f0fdf4' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>✅ Pago confirmado</div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4 }}>Ve a Despachos para asignar un repartidor.</div>
              </div>
            )}

            {/* Documentos */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.5, marginBottom: 10 }}>DOCUMENTOS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[['Generar Boleta', 'invoice'], ['Generar Factura', 'copy'], ['Reenviar cotización', 'send']].map(([label, icon]) => (
                  <button
                    key={label}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                  >
                    <Ico name={icon} size={14} style={{ color: 'var(--text2)' }} /> {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Info sesión */}
            {selChat && (
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.5, marginBottom: 10 }}>SESIÓN</div>
                {[
                  ['Vehículo', selChat.customer_vehicle || '—'],
                  ['Teléfono', selChat.customer_phone],
                  ['Estado', STATUS_META[selChat.status]?.label || selChat.status],
                  ['Bot', selChat.bot_active ? 'Activo' : 'Pausado'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{k}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, maxWidth: 150, textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
