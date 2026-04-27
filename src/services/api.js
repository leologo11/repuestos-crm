import { io } from 'socket.io-client';

export const socket = io('/', { path: '/socket.io', autoConnect: true });

const BASE = '/api';

async function req(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Conversaciones ────────────────────────────────────────────
export const getConversations   = ()           => req('/conversations');
export const getConversation    = (id)         => req(`/conversations/${id}`);
export const updateConversation = (id, data)   => req(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const sendAdminMessage   = (id, text)   => req(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) });

// ── Cotizaciones ──────────────────────────────────────────────
export const getQuote           = (convId)     => req(`/quotes/conversation/${convId}`);
export const sendQuoteToClient  = (qId, msg)   => req(`/quotes/${qId}/send`, { method: 'POST', body: JSON.stringify({ customMessage: msg }) });
export const confirmPayment     = (convId)     => req(`/conversations/${convId}/confirm-payment`, { method: 'POST' });

// ── Proveedores ───────────────────────────────────────────────
export const getProveedores     = ()           => req('/proveedores');
export const createProveedor    = (data)       => req('/proveedores', { method: 'POST', body: JSON.stringify(data) });
export const updateProveedor    = (id, data)   => req(`/proveedores/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const messageProveedor   = (id, text)   => req(`/proveedores/${id}/message`, { method: 'POST', body: JSON.stringify({ text }) });
export const getProveedorQuotes = (id)         => req(`/proveedores/${id}/quotes`);

// ── Clientes ──────────────────────────────────────────────────
export const getClientes        = ()           => req('/clientes');
export const createCliente      = (data)       => req('/clientes', { method: 'POST', body: JSON.stringify(data) });
export const updateCliente      = (id, data)   => req(`/clientes/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Repartidores ──────────────────────────────────────────────
export const getRepartidores    = ()           => req('/repartidores');
export const createRepartidor   = (data)       => req('/repartidores', { method: 'POST', body: JSON.stringify(data) });
export const updateRepartidor   = (id, data)   => req(`/repartidores/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Pedidos ───────────────────────────────────────────────────
export const getPedidos         = ()           => req('/pedidos');
export const createPedido       = (data)       => req('/pedidos', { method: 'POST', body: JSON.stringify(data) });
export const updatePedido       = (id, data)   => req(`/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Ventas ────────────────────────────────────────────────────
export const getVentas          = ()           => req('/ventas');

// ── Dashboard ─────────────────────────────────────────────────
export const getDashboardStats  = ()           => req('/dashboard/stats');

// ── Bot ───────────────────────────────────────────────────────
export const getBotStatus       = ()           => req('/bot/status');
