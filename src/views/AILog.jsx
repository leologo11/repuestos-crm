import { useState, useEffect, useRef } from 'react';
import Card from '../components/ui/Card.jsx';
import Badge from '../components/ui/Badge.jsx';
import Ico from '../components/ui/Icons.jsx';
import { getConversations, getQuote, socket } from '../services/api.js';

const STATUS_LABEL = {
  esperando_cliente:    'Esperando cliente',
  esperando_proveedor:  'Cotizando',
  esperando_seleccion:  'Elige opción',
  intervencion_humana:  'Intervención',
  cerrado:              'Cerrado',
};

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoy ' + fmtTime(ts);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + ' ' + fmtTime(ts);
}

function MarginPill({ margin, base, final }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 99, background: '#dbeafe', border: '1px solid #bfdbfe' }}>
      <span style={{ fontSize: 11, color: '#64748b' }}>Proveedor: <strong style={{ color: '#0f172a' }}>${base?.toLocaleString('es-CL')}</strong></span>
      <span style={{ width: 1, height: 12, background: '#cbd5e1' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#0066ff' }}>+{Math.round(margin * 100)}% margen</span>
      <span style={{ width: 1, height: 12, background: '#cbd5e1' }} />
      <span style={{ fontSize: 11, color: '#64748b' }}>Cliente paga: <strong style={{ color: '#0066ff' }}>${final?.toLocaleString('es-CL')}</strong></span>
    </div>
  );
}

export default function AILog() {
  const [convs,    setConvs]    = useState([]);
  const [selected, setSelected] = useState(null);
  const [quote,    setQuote]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const chatEndRef = useRef(null);

  // Carga inicial
  useEffect(() => {
    getConversations()
      .then((data) => {
        setConvs(data);
        if (data.length) setSelected(data[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Cargar cotización cuando cambia la conversación seleccionada
  useEffect(() => {
    setQuote(null);
    if (!selected?._id) return;
    getQuote(selected._id).then(setQuote).catch(() => {});
  }, [selected?._id]);

  // Scroll al fondo del chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected?.messages]);

  // Socket.io — actualizaciones en tiempo real
  useEffect(() => {
    const onNew = (conv) => {
      setConvs((prev) => {
        const exists = prev.find((c) => c._id === conv._id);
        return exists ? prev : [conv, ...prev];
      });
    };

    const onMsg = ({ conversationId, message }) => {
      setConvs((prev) => prev.map((c) => {
        if (c._id !== conversationId) return c;
        const msgs = [...(c.messages || []), message];
        return { ...c, messages: msgs, updatedAt: new Date() };
      }));
      setSelected((prev) => {
        if (!prev || prev._id !== conversationId) return prev;
        const msgs = [...(prev.messages || []), message];
        return { ...prev, messages: msgs, updatedAt: new Date() };
      });
    };

    const onUpdated = ({ conversationId, ...changes }) => {
      setConvs((prev) => prev.map((c) =>
        c._id === conversationId ? { ...c, ...changes } : c
      ));
      setSelected((prev) =>
        prev?._id === conversationId ? { ...prev, ...changes } : prev
      );
    };

    const onQuote = ({ conversationId, quote: q }) => {
      if (selected?._id === conversationId) setQuote(q);
    };

    socket.on('conversation:new',     onNew);
    socket.on('conversation:message', onMsg);
    socket.on('conversation:updated', onUpdated);
    socket.on('quote:created',        onQuote);
    socket.on('quote:updated',        onQuote);

    return () => {
      socket.off('conversation:new',     onNew);
      socket.off('conversation:message', onMsg);
      socket.off('conversation:updated', onUpdated);
      socket.off('quote:created',        onQuote);
      socket.off('quote:updated',        onQuote);
    };
  }, [selected?._id]);

  const bestResp = quote?.supplier_responses
    ?.filter((r) => r.price)
    .sort((a, b) => a.price - b.price)[0];

  const intent = selected?.pending_intent;

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Lista conversaciones ── */}
      <div style={{ width: 280, borderRight: '1px solid var(--border)', background: 'var(--bg)', overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', letterSpacing: .5, textTransform: 'uppercase' }}>
          Conversaciones · {convs.length}
        </div>

        {loading && (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>Cargando…</div>
        )}

        {!loading && convs.length === 0 && (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.6 }}>
            Sin conversaciones aún.<br />Cuando llegue un mensaje aparecerá aquí.
          </div>
        )}

        {convs.map((c) => (
          <div key={c._id} onClick={() => setSelected(c)}
            style={{ padding: '13px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: selected?._id === c._id ? 'var(--card)' : 'transparent', borderLeft: selected?._id === c._id ? '3px solid var(--accent)' : '3px solid transparent', transition: 'background .15s' }}
            onMouseEnter={(e) => { if (selected?._id !== c._id) e.currentTarget.style.background = 'var(--card)'; }}
            onMouseLeave={(e) => { if (selected?._id !== c._id) e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.customer_name || c.customer_phone}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text2)', flexShrink: 0 }}>{fmtTime(c.updatedAt)}</span>
            </div>
            {c.customer_vehicle && (
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 5 }}>{c.customer_vehicle}</div>
            )}
            <Badge label={STATUS_LABEL[c.status] || c.status} />
          </div>
        ))}
      </div>

      {/* ── Panel derecho ── */}
      {!selected && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 13 }}>
          Selecciona una conversación
        </div>
      )}

      {selected && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.customer_name || selected.customer_phone}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>+{selected.customer_phone} · {fmtDate(selected.updatedAt)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge label={selected.bot_active ? 'Bot activo' : 'Bot pausado'} />
              <Badge label={STATUS_LABEL[selected.status] || selected.status} />
            </div>
          </div>

          {/* NLP / intent extraído */}
          {intent && (
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: .5, textTransform: 'uppercase', marginBottom: 10 }}>
                Extracción IA
              </div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                {[
                  ['Repuesto',  intent.repuesto  || quote?.item_description || '—'],
                  ['Vehículo',  intent.modelo     || selected.customer_vehicle || '—'],
                  ['Año',       intent.año        || '—'],
                  ['Cantidad',  intent.cantidad   || 1],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: .5 }}>{k}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Respuestas de proveedores */}
          {quote?.supplier_responses?.some((r) => r.price) && (
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: .5, textTransform: 'uppercase', marginBottom: 10 }}>
                Respuestas Proveedores
              </div>
              {quote.supplier_responses.filter((r) => r.price).map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < quote.supplier_responses.filter(x => x.price).length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.selected ? 'var(--accent)' : 'var(--border)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1 }}>{r.supplier_name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>${r.price?.toLocaleString('es-CL')}</span>
                  {r.selected && <Badge label="Mejor precio" />}
                </div>
              ))}
              {bestResp && (
                <div style={{ marginTop: 12 }}>
                  <MarginPill margin={quote.margin} base={bestResp.price} final={quote.final_price || Math.round(bestResp.price * (1 + quote.margin))} />
                </div>
              )}
            </Card>
          )}

          {/* Flujo de mensajes */}
          <Card style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: .5, textTransform: 'uppercase', marginBottom: 14 }}>
              Flujo de mensajes
            </div>

            {(!selected.messages || selected.messages.length === 0) && (
              <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '12px 0' }}>Sin mensajes</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(selected.messages || []).filter(m => m.text && m.text !== '__processing__').map((m, i) => {
                const isClient = m.from === 'cliente';
                const isBot    = m.from === 'bot';
                const isAdmin  = m.from === 'admin';

                if (m.from === 'sistema') return (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--red)', background: '#fef2f2', padding: '3px 12px', borderRadius: 99, display: 'inline-block', border: '1px solid #fecaca' }}>{m.text}</span>
                  </div>
                );

                const bubbleColor  = isClient ? 'var(--card)' : isAdmin ? '#fef9c3' : '#dbeafe';
                const bubbleBorder = isClient ? 'var(--border)' : isAdmin ? '#fde68a' : '#bfdbfe';
                const textColor    = isClient ? 'var(--text)' : isAdmin ? '#78350f' : '#1e40af';
                const label        = isClient ? (selected.customer_name || 'Cliente') : isAdmin ? 'Admin' : 'Bot IA';
                const align        = isClient ? 'flex-start' : 'flex-end';

                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 2 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
                    <div style={{ maxWidth: '75%', background: bubbleColor, border: `1px solid ${bubbleBorder}`, borderRadius: isClient ? '4px 12px 12px 12px' : '12px 4px 12px 12px', padding: '9px 13px', fontSize: 13, color: textColor, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {m.text}
                    </div>
                    {m.ts && <div style={{ fontSize: 10, color: 'var(--text2)' }}>{fmtTime(m.ts)}</div>}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          </Card>

        </div>
      )}
    </div>
  );
}
