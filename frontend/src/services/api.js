import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

// Agrega el token JWT en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tecnicos_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Manejo global de 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('tecnicos_token')
      localStorage.removeItem('tecnicos_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
