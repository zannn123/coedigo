import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
const backendHint = import.meta.env.VITE_API_BASE_URL || 'the /api proxy to http://127.0.0.1:8000';

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('coedigo_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (!err.response) {
      err.userMessage = `Cannot reach the COEDIGO backend. Start the PHP API and verify ${backendHint}.`;
    }

    if (err.response?.status === 401) {
      localStorage.removeItem('coedigo_token');
      localStorage.removeItem('coedigo_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
