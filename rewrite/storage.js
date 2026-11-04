// Preserve Storage's named-property behavior while partitioning it by the virtual origin.
export function installStorage(client, self) {
  function partition(storage) {
    const prefix = client.url.origin + '@';
    const keys = () => Object.keys(storage).filter(key => key.startsWith(prefix));
    const methods = {
      getItem: key => storage.getItem(prefix + String(key)),
      setItem: (key, value) => storage.setItem(prefix + String(key), String(value)),
      removeItem: key => storage.removeItem(prefix + String(key)),
      clear: () => keys().forEach(key => storage.removeItem(key)),
      key: index => {
        const key = keys()[Number(index) >>> 0];
        return key === undefined ? null : key.slice(prefix.length);
      }
    };
    return new Proxy(storage, {
      get(target, property) {
        if (Object.hasOwn(methods, property)) return methods[property];
        if (property === 'length') return keys().length;
        if (typeof property === 'symbol' || property in Object.prototype) return Reflect.get(target, property);
        return storage.getItem(prefix + property) ?? undefined;
      },
      set(target, property, value) { methods.setItem(property, value); return true; },
      deleteProperty(target, property) { methods.removeItem(property); return true; },
      has(target, property) { return property === 'length' || property in methods || storage.getItem(prefix + String(property)) !== null; },
      ownKeys() { return keys().map(key => key.slice(prefix.length)); },
      getOwnPropertyDescriptor(target, property) {
        const value = storage.getItem(prefix + String(property));
        return value === null ? undefined : { value, enumerable: true, configurable: true, writable: true };
      },
      defineProperty(target, property, descriptor) { methods.setItem(property, descriptor.value); return true; }
    });
  }
  const local = partition(self.localStorage), session = partition(self.sessionStorage);
  delete self.localStorage;
  delete self.sessionStorage;
  self.localStorage = local;
  self.sessionStorage = session;
}
