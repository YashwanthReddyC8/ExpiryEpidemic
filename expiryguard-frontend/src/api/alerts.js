import api from './axios';

export const alertsApi = {
  list: (params) => api.get('/alerts', { params }).then((r) => r.data),
  markRead: (id) => api.put(`/alerts/${id}/read`).then((r) => r.data),
  markAllRead: () => api.put('/alerts/read-all').then((r) => r.data),
  testWhatsapp: () => api.post('/alerts/test-whatsapp').then((r) => r.data),
};
