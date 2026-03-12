import api from './axios';

export const authApi = {
  login: (data) => api.post('/auth/login', data).then((r) => r.data),
  register: (data) => api.post('/auth/register', data).then((r) => r.data),
  refresh: (token) => api.post('/auth/refresh', { refresh_token: token }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};
