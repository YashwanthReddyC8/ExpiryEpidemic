import api from './axios';

export const batchesApi = {
  list: (params) => api.get('/batches', { params }).then((r) => r.data),
  get: (id) => api.get(`/batches/${id}`).then((r) => r.data),
  create: (data) => api.post('/batches', data).then((r) => r.data),
  bulkCreate: (data) => api.post('/batches/bulk', data).then((r) => r.data),
  update: (id, data) => api.put(`/batches/${id}`, data).then((r) => r.data),
  updateStatus: (id, status) => api.put(`/batches/${id}/status`, { status }).then((r) => r.data),
  delete: (id) => api.delete(`/batches/${id}`).then((r) => r.data),
  discountSuggestion: (id) => api.get(`/batches/${id}/discount-suggestion`).then((r) => r.data),
};
