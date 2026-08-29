import { webmcpRegistry } from './registry.js';

export function startWebMCP(): () => void {
  webmcpRegistry.start();
  return () => webmcpRegistry.stop();
}
