export function defineAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") throw new Error("Adapter must be an object");
  if (!adapter.descriptor?.id || !adapter.descriptor?.license) throw new Error("Adapter descriptor and license are required");
  if (typeof adapter.read !== "function" || typeof adapter.normalize !== "function") throw new Error("Adapter must implement read() and normalize()");
  return Object.freeze(adapter);
}

