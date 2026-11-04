import { CookieJar } from 'tough-cookie';

// Implements Scramjet's synchronous cookie interface with a maintained RFC cookie jar.
export class CookieStore {
  jar = new CookieJar();
  setCookies(values, url) {
    for (const value of values) {
      if (typeof value === 'string') {
        this.jar.setCookieSync(value, url.href, { ignoreError: true, http: typeof document === 'undefined' });
      }
    }
  }
  getCookies(url, fromJs) { return this.jar.getCookieStringSync(url.href, { http: !fromJs }); }
  load(value) { if (value) this.jar = CookieJar.deserializeSync(typeof value === 'string' ? JSON.parse(value) : value); }
  dump() { return JSON.stringify(this.jar.serializeSync()); }
}
