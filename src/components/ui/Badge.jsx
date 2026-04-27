const MAP = {
  despachado:         { bg: 'var(--accent-dim)',  color: 'var(--accent)' },
  aprobado:           { bg: 'var(--blue-dim)',    color: 'var(--blue)'   },
  cotizado:           { bg: 'var(--amber-dim)',   color: 'var(--amber)'  },
  Activo:             { bg: 'var(--accent-dim)',  color: 'var(--accent)' },
  Inactivo:           { bg: 'var(--red-dim)',     color: 'var(--red)'    },
  Pendiente:          { bg: 'var(--amber-dim)',   color: 'var(--amber)'  },
  Conectada:          { bg: 'var(--accent-dim)',  color: 'var(--accent)' },
  'Sin API':          { bg: 'var(--red-dim)',     color: 'var(--red)'    },
  respondido:         { bg: 'var(--accent-dim)',  color: 'var(--accent)' },
  esperando:          { bg: 'var(--amber-dim)',   color: 'var(--amber)'  },
  enviado:            { bg: 'var(--blue-dim)',    color: 'var(--blue)'   },
  aceptado:           { bg: 'var(--accent-dim)',  color: 'var(--accent)' },
  rechazado:          { bg: 'var(--red-dim)',     color: 'var(--red)'    },
};

export default function Badge({ label }) {
  const s = MAP[label] || { bg: 'var(--border)', color: 'var(--text2)' };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 99,
        fontSize: 11.5, fontWeight: 600,
        background: s.bg, color: s.color,
      }}
    >
      {label}
    </span>
  );
}
