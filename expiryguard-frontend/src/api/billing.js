import axios from './axios';

export const getSessions = async () => {
  const { data } = await axios.get('/billing/sessions');
  return data;
};

export const getSessionItems = async (sessionId) => {
  const { data } = await axios.get(`/billing/sessions/${sessionId}/items`);
  return data;
};

export const verifySession = async (sessionId) => {
  const { data } = await axios.post(`/billing/sessions/${sessionId}/verify`);
  return data;
};

export const paySession = async (sessionId) => {
  const { data } = await axios.post(`/billing/sessions/${sessionId}/pay`);
  return data;
};

export const rejectSession = async (sessionId) => {
  const { data } = await axios.post(`/billing/sessions/${sessionId}/reject`);
  return data;
};

export const updatePaymentMethod = async (sessionId, method) => {
  const { data } = await axios.post(`/billing/sessions/${sessionId}/payment-method`, { method });
  return data;
};
