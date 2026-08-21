import { createServer } from './server.js';
import { AppState } from './services/app-state.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const app = createServer();

// Preload signals in background
const state = AppState.getInstance();
state.refreshSignals('1h', 'crypto').catch(err => console.error('Initial scan error:', err));

app.listen(PORT, () => {
  console.log(`🚀 Money Scanner API Server running on port ${PORT}`);
  console.log(`📡 Health endpoint: http://localhost:${PORT}/api/health`);
  console.log(`📊 Scanner endpoint: http://localhost:${PORT}/api/scanner`);
});
