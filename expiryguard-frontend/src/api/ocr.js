import api from './axios';

export const ocrApi = {
  processInvoice: (file) => {
    const form = new FormData();
    form.append('image', file);
    return api.post('/ocr/invoice', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};
