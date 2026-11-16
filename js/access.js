// Keep the console inactive until the entrance finishes its granted response.
(function () {
  'use strict';
  const ready = new Promise((resolve, reject) => {
    const start = async () => {
      try {
        const { waitForBreachUnlock } = await import('./breach-gate.js?v=1');
        await waitForBreachUnlock();
        resolve();
      } catch (error) {
        console.error('Access terminal could not initialize.', error);
        reject(error);
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  });
  window.ProjLibAccess = Object.freeze({ ready });
})();
