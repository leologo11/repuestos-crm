import { useState, useEffect } from 'react';
import Card from '../components/ui/Card.jsx';
import { getVentas, socket } from '../services/api.js';

const STATUS_LABEL = {
  precio_aceptado: { label: 'Confirmado',  color: '#15803d', bg: '#dcfce7' },
  en_preparacion:  { label: 'Preparando',  color: '#a16207', bg: '#fef9c3' },
  en_camino:       { label: 'En camino',   color: '#1d4ed8', bg: '#dbeafe' },
  entregado:       { label: 'Entregado',   color: '#374151', bg: '#f3f4f6' },
  cancelado:       { label: 'Cancelado',   color: '#dc2626', bg: '#fee2e2' },
};

const FILTROS = [
  ['todos',          'Todos'],
  ['precio_aceptado','Confirmados'],
  ['en_preparacion', 'Preparando'],
  ['en_camino',      'En camino'],
  ['entregado',      'Entregados'],
];

const fmtCLP = (n) => n ? '$' + Number(n).toLocaleString('es-CL') : '—';

export default function Ventas() {
  const [rows,   setRows]   = useState([]);
  const [filter, setFilter] = useState('todos');

  useEffect(() => { getVentas().then(setRows).catch(() => {}); }, []);

  useEffect(() => {
    const onPedido = (p) => {
      const confirmados = ['precio_aceptado','en_preparacion','en_camino','entregado'];
      setRows((prev) => {
        const idx = prev.findIndex((r) => r._id === p._id);
        if (idx !== -1) return prev.map((r) => r._id === p._id ? p : r);
        if (confirmados.includes(p.status)) return [p, ...prev];
        return prev;
      });
    };
    socket.on('pedido:updated', onPedido);
    socket.on('pedido:new',     onPedido);
    return () => { socket.off('pedido:updated', onPedido); socket.off('pedido:new', onPedido); };
  }, []);

  const filtered = filter === 'todos' ? rows : rows.filter((r) => r.status === filter);

  // Totales del filtro activo
  const totalVenta    = filtered.reduce((s, r) => s + (r.final_price      || 0), 0);
  const totalCosto    = filtered.reduce((s, r) => s + (r.precio_proveedor || 0), 0);
  const totalDelivery = filtered.reduce((s, r) => s + (r.delivery_fee     || 0), 0);
  const totalGanancia = totalVenta - totalCosto - totalDelivery;
  const margenProm    = totalVenta > 0 ? ((totalGanancia / totalVenta) * 100).toFixed(1) : '—';

  const tabStyle = (active) => ({
    padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
    background: active ? 'var(--bg2)' : 'transparent',
    color:      active ? 'var(--text)' : 'var(--text2)',
    boxShadow:  active ? 'var(--card-shadow)' : 'none',
  });

  return (
    <div style={{ padding: 28, flex: 1, overflowY: 'auto' }}>
      {/* Resumen financiero */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          ['Ingresos',          fmtCLP(totalVenta),    'var(--accent)'],
          ['Costo proveedores', fmtCLP(totalCosto),    'var(--amber)'],
          ['Costo delivery',    fmtCLP(totalDelivery), 'var(--blue)'],
          ['Ganancia neta real',fmtCLP(totalGanancia), totalGanancia >= 0 ? '#16a34a' : 'var(--red)'],
          ['Margen real',       margenProm !== '—' ? margenProm + '%' : '—', 'var(--blue)'],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {FILTROS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={tabStyle(filter === key)}>{label}</button>
        ))}
      </div>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Código', 'Cliente', 'Repuesto', 'Vehículo', 'Proveedor pagó', 'Cliente pagó', 'Ganancia', 'Margen', 'Estado', 'Fecha'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11.5, color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                Sin ventas registradas aún
              </td></tr>
            ) : filtered.map((v) => {
              const badge    = STATUS_LABEL[v.status] || { label: v.status, color: 'var(--text2)', bg: 'var(--border)' };
              const costo    = v.precio_proveedor || 0;
              const venta    = v.final_price      || 0;
              const delivery = v.delivery_fee     || 0;
              const ganancia = venta - costo - delivery;
              const margen   = venta > 0 && costo > 0 ? ((ganancia / venta) * 100).toFixed(1) : null;
              return (
                <tr key={v._id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 6 }}>{v.secretCode}</span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{v.customer_name}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.repuesto || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{v.vehicle || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>
                    {costo ? fmtCLP(costo) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>Sin costo</span>}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
                    {fmtCLP(venta)}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: ganancia > 0 ? 'oklch(50% 0.18 162)' : 'var(--red)' }}>
                    {costo && venta ? fmtCLP(ganancia) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {margen ? (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: margen >= 25 ? '#dcfce7' : margen >= 15 ? '#fef9c3' : '#fee2e2',
                        color:      margen >= 25 ? '#15803d' : margen >= 15 ? '#a16207' : '#dc2626' }}>
                        {margen}%
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: badge.bg, color: badge.color }}>{badge.label}</span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {v.updatedAt ? new Date(v.updatedAt).toLocaleDateString('es-CL') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
