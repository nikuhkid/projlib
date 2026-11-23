export const MAX_PROFILE_BYTES = 256 * 1024 * 1024;
const databaseName = fixture => fixture ? 'projlib-brave-profile-fixture' : 'projlib-brave-profile-v1';

async function openProfileDatabase(fixture) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(fixture), 1);
    request.onupgradeneeded = () => request.result.createObjectStore('profiles');
    request.onerror = () => reject(new Error('Local profile storage is unavailable.'));
    request.onsuccess = () => { const database = request.result; database.onversionchange = () => database.close(); resolve(database); };
  });
}

async function limitedBytes(stream) {
  const reader = stream.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_PROFILE_BYTES) { await reader.cancel(); throw new Error('This profile exceeds the 256 MiB prototype limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

// Profile bytes stay in this origin's IndexedDB. No profile upload endpoint is
// used; Wolfie receives only the guest's network traffic through the relay.
export async function loadProfile({ fixture = false, previous = false } = {}) {
  const database = await openProfileDatabase(fixture);
  let record;
  try {
    record = await new Promise((resolve, reject) => {
      const transaction = database.transaction('profiles', 'readonly');
      const request = transaction.objectStore('profiles').get(previous ? 'previous' : 'current');
      request.onsuccess = () => resolve(request.result);
      transaction.onerror = () => reject(new Error('The local profile could not be read.'));
    });
  } finally { database.close(); }
  if (!record) return null;
  if (record.version !== 1 || !(record.blob instanceof Blob) || record.blob.size > MAX_PROFILE_BYTES) throw new Error('The stored profile format is invalid.');
  const bytes = await limitedBytes(record.blob.stream().pipeThrough(new DecompressionStream('gzip')));
  if (!bytes.length) throw new Error('The stored profile is empty.');
  return { bytes, savedAt: record.savedAt, compressedBytes: record.blob.size };
}

export async function saveProfile(bytes, { fixture = false } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_PROFILE_BYTES) throw new Error('The profile snapshot has an invalid size.');
  const blob = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const record = { version: 1, savedAt: Date.now(), blob };
  const database = await openProfileDatabase(fixture);
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('profiles', 'readwrite'); const store = transaction.objectStore('profiles');
      const old = store.get('current');
      old.onsuccess = () => { if (old.result) store.put(old.result, 'previous'); store.put(record, 'current'); };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error('The profile could not be saved on this device. The previous save is retained.'));
      transaction.onabort = () => reject(new Error('Saving the profile was interrupted. The previous save is retained.'));
    });
  } finally { database.close(); }
  return { savedAt: record.savedAt, compressedBytes: blob.size };
}
