import api from './axios';

export const stockRequestsApi = {
  create: (data) => api.post('/stock-requests', data).then((r) => r.data),
  quote: (distributorId, supplierSku) =>
    api.get('/stock-requests/quote', { params: { distributor_id: distributorId, supplier_sku: supplierSku } }).then((r) => r.data),
  generateDirectInvoice: (data) => api.post('/stock-requests/direct-invoice/generate', data).then((r) => r.data),
  downloadDirectInvoicePdf: (invoiceId) =>
    api.get(`/stock-requests/direct-invoice/${invoiceId}/pdf`, { responseType: 'blob' }),
  listMine: () => api.get('/stock-requests/mine').then((r) => r.data),
  listIncoming: () => api.get('/stock-requests/incoming').then((r) => r.data),
  approve: (requestId, approveQuantity) =>
    api.post(`/stock-requests/${requestId}/approve`, { approve_quantity: approveQuantity }).then((r) => r.data),
  reject: (requestId, reason = '') =>
    api.post(`/stock-requests/${requestId}/reject`, { reason }).then((r) => r.data),
  generateInvoice: (requestId) => api.get(`/stock-requests/${requestId}/invoice`).then((r) => r.data),
  generateInvoicePdf: (requestId) =>
    api.get(`/stock-requests/${requestId}/invoice/pdf`, { responseType: 'blob' }),
  importInvoice: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/stock-requests/import-invoice', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  importDirectInvoiceByCode: (invoiceNo) =>
    api.post('/stock-requests/import-direct-invoice', { invoice_no: invoiceNo }).then((r) => r.data),
};
