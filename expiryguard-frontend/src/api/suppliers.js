import api from './axios';

export const suppliersApi = {
  list: () => api.get('/suppliers').then((r) => r.data),
  create: (data) => api.post('/suppliers', data).then((r) => r.data),
  update: (id, data) => api.put(`/suppliers/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/suppliers/${id}`).then((r) => r.data),
  // Distributor network
  linkDistributor: (distributorId) =>
    api.post('/suppliers/distributor/link', { distributor_id: distributorId }).then((r) => r.data),
  getRetailers: () => api.get('/suppliers/distributor/retailers').then((r) => r.data),
  bulkPickup: (batchIds, pickupDate) =>
    api.post('/suppliers/distributor/bulk-pickup', {
      batch_ids: batchIds,
      pickup_date: pickupDate,
    }).then((r) => r.data),
};

export const usersApi = {
  updateMe: (data) => api.patch('/users/me', data).then((r) => r.data),
};
