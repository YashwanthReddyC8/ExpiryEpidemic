import api from './axios';

export const productsApi = {
  list: () => api.get('/products').then((r) => r.data),
  create: (data) => api.post('/products', data).then((r) => r.data),
  update: (id, data) => api.put(`/products/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/products/${id}`).then((r) => r.data),
  lookupBarcode: (code) => api.get(`/barcode/${code}`).then((r) => r.data),
};
