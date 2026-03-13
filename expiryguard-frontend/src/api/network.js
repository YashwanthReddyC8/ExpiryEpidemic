import axios from './axios';

export const searchUser = async (email) => {
  const { data } = await axios.get('/network/search', { params: { email } });
  return data;
};

export const sendConnectRequest = async (targetUserId, message = '') => {
  const { data } = await axios.post('/network/connect', {
    target_user_id: targetUserId,
    message,
  });
  return data;
};

export const getIncomingRequests = async () => {
  const { data } = await axios.get('/network/requests');
  return data;
};

export const getSentRequests = async () => {
  const { data } = await axios.get('/network/requests/sent');
  return data;
};

export const handleRequest = async (requestId, action) => {
  const { data } = await axios.post(`/network/requests/${requestId}`, { action });
  return data;
};
