// Suppress benign Three.js r183+ deprecation warnings triggered by third-party
// libraries (globe.gl / three-globe / three-forcegraph / react-force-graph-3d)
// that still instantiate THREE.Clock internally.
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('THREE.Clock: This module has been deprecated')
  ) {
    return;
  }
  originalWarn(...args);
};

