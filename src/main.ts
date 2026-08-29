import { mountBranchline } from './App.js';

const cleanup = mountBranchline();
if (import.meta.hot) import.meta.hot.dispose(cleanup);
