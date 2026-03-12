import api from './axios';

export const dashboardApi = {
  getSummary: () => api.get('/dashboard/summary').then((r) => r.data),
  getDistributor: () => api.get('/dashboard/distributor').then((r) => r.data),
};
