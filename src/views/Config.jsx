import { useState, useEffect } from 'react';
import Card from '../components/ui/Card.jsx';
import Ico from '../components/ui/Icons.jsx';
import { socket, getBotStatus } from '../services/api.js';

export default function Config() {
  const [margin, setMargin]       = useState(28);
  const [botStatus, setBotStatus] = useState('disconnected');
  const [qrDataURL, setQrDataURL] = useState(null);
  const [timeout, setTimeout_]    = useState(10);

  const refreshStatus = () => {
    getBotStatus()
      .then(({ status, qrDataURL: qr }) => { setBotStatus(status); setQrDataURL(qr || null); })
      .catch(() => {});
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 8000);

    socket.on('bot:qr',    ({ qrDataURL: qr }) => { setBotStatus('qr_pending'); setQrDataURL(qr); });
    socket.on('bot:status',({ status })        => { setBotStatus(status); if (status === 'connected') setQrDataURL(null); });

    return () => { clearInterval(interval); socket.off('bot:qr'); socket.off('bot:status'); };
  }, []);

  const STATUS_COLOR = { connected: 'var(--accent)', qr_pending: 'var(--amber)', disconnected: 'var(--red)' };
  const STATUS_LABEL = { connected: 'Conectado', qr_pending: 'Esperando QR', disconnected: 'Desconectado' };

  return (
    <div style={{ padding: 28, flex: 1, overflowY: 'auto', maxWidth: 640 }}>

      {/* WhatsApp Bot */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>WhatsApp Bot</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: STATUS_COLOR[botStatus] }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[botStatus], display: 'inline-block' }} />
            {STATUS_LABEL[botStatus]}
          </div>
        </div>

        {qrDataURL && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0' }}>
            <div style={{ padding: 12, background: 'white', borderRadius: 12, border: '2px solid var(--accent)', boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>
              <img src={qrDataURL} alt="QR WhatsApp" style={{ width: 220, height: 220, display: 'block' }} />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.6 }}>
              Abre <strong>WhatsApp</strong> en tu celular<br/>
              → Dispositivos vinculados → Vincular dispositivo<br/>
              → Escanea este QR
            </p>
          </div>
        )}

        {!qrDataURL && botStatus === 'connected' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--accent-dim)', fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
            <Ico name="check" size={15} style={{ color: 'var(--accent)' }} />
            Bot conectado y escuchando mensajes
          </div>
        )}

        {!qrDataURL && botStatus === 'disconnected' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--red-dim)', fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>
              <Ico name="wifiOff" size={15} style={{ color: 'var(--red)' }} />
              Bot desconectado — esperando QR...
            </div>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              El QR aparecerá aquí automáticamente. Esta página se actualiza cada 8 segundos.
            </p>
          </div>
        )}
      </Card>

      {/* Margen */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Margen global por defecto</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input
            type="range" min={5} max={60}
            value={margin}
            onChange={(e) => setMargin(+e.target.value)}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', minWidth: 50 }}>{margin}%</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
          Se aplica como base a todas las cotizaciones nuevas.
        </div>
      </Card>

      {/* Timeout proveedores */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Tiempo de espera proveedores</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input
            type="range" min={2} max={30}
            value={timeout}
            onChange={(e) => setTimeout_(+e.target.value)}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', minWidth: 60 }}>{timeout} min</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
          Si no hay respuesta en este tiempo, la conversación pasa a "Intervención humana".
        </div>
      </Card>

      {/* MongoDB */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Base de datos MongoDB</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            ['URI de conexión', 'mongodb+srv://LeoM:••••••@cluster0.ocpbaeu.mongodb.net/repuestos'],
            ['Colecciones activas', 'conversations · quotes · clientes · proveedores'],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
              <div style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontFamily: 'monospace', fontSize: 12, color: 'var(--text)' }}>
                {val}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* IA */}
      <Card style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Agente de IA (Claude)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>Anthropic API Key</div>
            <input
              defaultValue="sk-ant-••••••••••••••••"
              type="password"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'monospace', fontSize: 12, outline: 'none' }}
            />
          </div>
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--blue-dim)', fontSize: 12.5, color: 'var(--blue)', display: 'flex', gap: 8 }}>
            <Ico name="zap" size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
            <span>Modelo: claude-sonnet-4-6 · Prompt caching activado · Extracción NLP + generación de respuestas</span>
          </div>
          <button style={{ alignSelf: 'flex-start', padding: '9px 18px', borderRadius: 8, background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
            Guardar configuración
          </button>
        </div>
      </Card>
    </div>
  );
}
