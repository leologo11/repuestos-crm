import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import Card from '../components/ui/Card.jsx';
import Ico from '../components/ui/Icons.jsx';
import { getDashboardStats, getVentas, socket } from '../services/api.js';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function MetricCard({ label, value, sub, color, icon, highlight }) {
  return (
    <Card style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12,
      ...(highlight ? { border: `2px solid ${color}`, background: color + '08' } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>{label}</span>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ico name={icon} size={17} style={{ color }} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: '-0.5px' }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>}
      </div>
    </Card>
  );
}

function DualLineChart({ data1, data2, labels, color1, color2, label1, label2 }) {
  const ref = useRef(); const chart = useRef();
  useEffect(() => {
    chart.current?.destroy();
    const ctx  = ref.current.getContext('2d');
    const withAlpha = (hex, a) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${a})`;
    };
    const g1 = ctx.createLinearGradient(0, 0, 0, 130);
    g1.addColorStop(0, withAlpha(color1, 0.2)); g1.addColorStop(1, withAlpha(color1, 0));
    const g2 = ctx.createLinearGradient(0, 0, 0, 130);
    g2.addColorStop(0, withAlpha(color2, 0.2)); g2.addColorStop(1, withAlpha(color2, 0));
    chart.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: label1, data: data1, borderColor: color1, backgroundColor: g1, fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2 },
          { label: label2, data: data2, borderColor: color2, backgroundColor: g2, fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2, borderDash: [4,3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
          tooltip: { mode: 'index', intersect: false, callbacks: { label: (c) => `${c.dataset.label}: $${c.raw.toLocaleString('es-CL')}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#888', font: { size: 11 } } },
          y: { grid: { color: '#88888811' }, ticks: { color: '#888', font: { size: 11 }, callback: (v) => `$${(v/1000).toFixed(0)}k` } },
        },
      },
    });
    return () => chart.current?.destroy();
  }, [data1, data2]);
  return <div style={{ position: 'relative', height: 150 }}><canvas ref={ref} /></div>;
}

const STATUS_BADGE = {
  precio_aceptado: { label: 'Confirmado',  c: '#15803d', bg: '#dcfce7' },
  en_preparacion:  { label: 'Preparando',  c: '#a16207', bg: '#fef9c3' },
  en_camino:       { label: 'En camino',   c: '#15803d', bg: '#dcfce7' },
  entregado:       { label: 'Entregado',   c: '#374151', bg: '#f3f4f6' },
};

export default function Dashboard() {
  const [stats,  setStats]  = useState(null);
  const [ventas, setVentas] = useState([]);

  const fetchAll = () => {
    getDashboardStats().then(setStats).catch(() => {});
    getVentas().then(setVentas).catch(() => {});
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const refresh = () => fetchAll();
    socket.on('pedido:updated', refresh);
    socket.on('pedido:new',     refresh);
    return () => { socket.off('pedido:updated', refresh); socket.off('pedido:new', refresh); };
  }, []);

  const fmtCLP  = (n) => '$' + (n || 0).toLocaleString('es-CL');
  const mesIdx  = new Date().getMonth();
  const mesNombre = MESES[mesIdx];

  const ventasMes   = stats?.ventasMes   || 0;
  const costoMes    = stats?.costoMes    || 0;
  const gananciaMes = stats?.gananciaMes || 0;
  const deltaMes    = stats?.deltaMes;
  const margenProm  = stats?.margenProm  || 0;
  const totalRevenue= stats?.totalRevenue|| 0;
  const totalCost   = stats?.totalCost   || 0;
  const totalProfit = stats?.totalProfit || 0;

  const ventasPorMes   = stats?.ventasPorMes   || Array(12).fill(0);
  const gananciaPorMes = stats?.gananciaPorMes || Array(12).fill(0);

  return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>

      {/* ── Métricas principales ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <MetricCard
          label={`Ventas — ${mesNombre}`}
          value={fmtCLP(ventasMes)}
          sub={deltaMes != null ? `${deltaMes >= 0 ? '+' : ''}${deltaMes}% vs mes anterior` : 'Mes actual'}
          color="var(--accent)" icon="sales"
        />
        <MetricCard
          label={`Costo proveedor — ${mesNombre}`}
          value={fmtCLP(costoMes)}
          sub={`${stats?.pedidosMes ?? 0} pedidos confirmados`}
          color="var(--amber)" icon="suppliers"
        />
        <MetricCard
          label={`Ganancia neta — ${mesNombre}`}
          value={fmtCLP(gananciaMes)}
          sub={ventasMes > 0 ? `${((gananciaMes/ventasMes)*100).toFixed(1)}% margen real` : 'Sin ventas aún'}
          color={gananciaMes >= 0 ? 'oklch(62% 0.17 162)' : 'var(--red)'}
          icon="trending" highlight
        />
        <MetricCard
          label="Pedidos en camino"
          value={stats?.pedidosEnCamino ?? '—'}
          sub={`${stats?.activeConvs ?? 0} conversaciones activas`}
          color="var(--blue)" icon="delivery"
        />
      </div>

      {/* ── Gráfico ventas vs ganancia ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Ventas vs Ganancia — {new Date().getFullYear()}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Por mes, pedidos confirmados</div>
            </div>
            {deltaMes != null && (
              <span style={{ fontSize: 12, color: deltaMes >= 0 ? 'var(--accent)' : 'var(--red)', fontWeight: 600, background: deltaMes >= 0 ? 'var(--accent-dim)' : 'var(--red-dim)', padding: '4px 10px', borderRadius: 6 }}>
                {deltaMes >= 0 ? '+' : ''}{deltaMes}% ventas este mes
              </span>
            )}
          </div>
          <DualLineChart
            data1={ventasPorMes} label1="Ventas (c/ margen)"  color1="#0066ff"
            data2={gananciaPorMes} label2="Ganancia neta"     color2="#22c55e"
            labels={MESES}
          />
        </Card>

        {/* ── Resumen financiero histórico ── */}
        <Card style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Resultado histórico</div>
          {[
            ['Ingresos totales',   fmtCLP(totalRevenue),                   'var(--accent)'],
            ['Costo proveedores',  fmtCLP(totalCost),                      'var(--amber)'],
            ['Costo delivery',     fmtCLP(stats?.totalDeliveryCost || 0),  'var(--blue)'],
            ['Ganancia neta real', fmtCLP(totalProfit),                    totalProfit >= 0 ? '#16a34a' : 'var(--red)'],
            ['Margen real',        `${margenProm}%`,                       '#16a34a'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color }}>{value}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>
            * Ganancia = Precio cliente − Precio proveedor
          </div>
        </Card>
      </div>

      {/* ── Últimas ventas con desglose ── */}
      <Card style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Desglose de ventas</div>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{ventas.length} registros</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Código', 'Cliente', 'Repuesto', 'Costo (proveedor)', 'Venta (cliente)', 'Ganancia', 'Margen', 'Estado'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ventas.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                Sin ventas aún — confirma el pago de un pedido para que aparezca aquí
              </td></tr>
            ) : ventas.slice(0, 10).map((v) => {
              const badge    = STATUS_BADGE[v.status] || { label: v.status, c: 'var(--text2)', bg: 'var(--border)' };
              const costo    = v.precio_proveedor || 0;
              const venta    = v.final_price || 0;
              const delivery = v.delivery_fee || 0;
              const ganancia = venta - costo - delivery;
              const margen   = venta > 0 ? ((ganancia / venta) * 100).toFixed(1) : null;
              return (
                <tr key={v._id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, fontFamily: 'monospace', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 7px', borderRadius: 5 }}>{v.secretCode}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{v.customer_name}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.repuesto || '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>
                    {costo ? fmtCLP(costo) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
                    {venta ? fmtCLP(venta) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: ganancia > 0 ? 'oklch(55% 0.17 162)' : 'var(--red)' }}>
                    {costo && venta ? fmtCLP(ganancia) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {margen && costo ? (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: margen >= 25 ? '#dcfce7' : margen >= 15 ? '#fef9c3' : '#fee2e2',
                        color:      margen >= 25 ? '#15803d' : margen >= 15 ? '#a16207' : '#dc2626' }}>
                        {margen}%
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: badge.bg, color: badge.c }}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ── Estado de pedidos ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          ['Confirmados',   ventas.filter(v=>v.status==='precio_aceptado').length,  '#dcfce7','#15803d'],
          ['Preparando',    ventas.filter(v=>v.status==='en_preparacion').length,   '#fef9c3','#a16207'],
          ['En camino',     ventas.filter(v=>v.status==='en_camino').length,        '#dbeafe','#1d4ed8'],
          ['Entregados',    ventas.filter(v=>v.status==='entregado').length,        '#f3f4f6','#374151'],
        ].map(([label, count, bg, color]) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color }}>{count}</div>
            <div style={{ fontSize: 12.5, color, fontWeight: 600, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
