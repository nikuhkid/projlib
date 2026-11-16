# ProjLib access entrance

ProjLib now waits behind the same minimal Breach Protocol entrance used by Remmie. It includes twenty matrices, five required sequences, a fourteen-code buffer and a sixty-second timer beginning on the first legal selection. The existing password bypass uses its PBKDF2-SHA-256 verifier; the plaintext access key is not stored in the repository.

Completing all five sequences or verifying the access key shows Access Granted for 1.5 seconds, then reveals the console and starts its existing application code. Until that point, the console is hidden and inert, and its directory, themes and website viewer do not initialize.

A failed puzzle or incorrect access key shows Access Denied for 1.5 seconds, then replaces the current location with `https://www.google.com/`. Denial is terminal for that visit, including when a password verification was already pending. There is no circuit fallback, reset control, new-matrix control or gameplay guidance. Reloading starts at the entrance again.

The gate is client-side. Destination website authentication and the separate proxy/rewriting services are unchanged. The original ProjLib title, themes, Scanner behavior and proxy defaults are retained after access is granted.

`tests/breach-gate.test.mjs` covers all twenty puzzle solutions, timer/selection rules, exact outcome timing, terminal denial and preservation of the verifier format. The browser checks solve puzzles through the rendered controls instead of embedding passwords, fixed answer paths or a test-only production bypass. Existing console/proxy/browser checks now complete the entrance after navigation and reload.
