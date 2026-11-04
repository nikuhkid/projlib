export function validateTarget(value, proxyOrigin) {
  const target = new URL(value);
  const host = target.hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Only public HTTP and HTTPS addresses without credentials are supported.');
  }
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') ||
      /(^|\.)(localhost|local|localdomain|internal|lan|home|invalid)$/.test(host) || host.endsWith('.home.arpa') ||
      (target.port && !['80', '443'].includes(target.port)) || target.origin === proxyOrigin) {
    throw new Error('Use a public website on its standard HTTP or HTTPS port.');
  }
  return target;
}
