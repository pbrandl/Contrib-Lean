// Only for the dev server (npm start), not part of the build: forwards /api to the backend,
// as Apache does on the Uberspace, so the app runs locally against `node server.js`.
// API_TARGET points it at another backend.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = (app) => {
  app.use(createProxyMiddleware('/api', { target: process.env.API_TARGET || 'http://localhost:3001' }));
};
