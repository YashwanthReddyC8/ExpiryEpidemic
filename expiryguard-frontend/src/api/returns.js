import api from './axios';

export const returnsApi = {
  generate: (batchId) => api.post('/returns/generate', { batch_id: batchId }).then((r) => r.data),
  getPdfUrl: (batchId) => `http://localhost:8000/returns/pdf/${batchId}`,
};
