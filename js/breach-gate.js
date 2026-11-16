/* ProjLib page entrance. This is a client-side gate, independent of host authentication. */
const BREACH_PASSWORD = Object.freeze({
  iterations: 600000,
  salt: '095b9fab3f8efb7dc9e5371d612b3540',
  verifier: '6cdf6607f89139811d21b2cff63b488b42262b2e228038f047dd88b59dfe7652',
});
const BREACH_BOARDS = [{"id":"RMM-01","size":6,"capacity":14,"seconds":60,"cells":["55","FF","7A","BD","55","7A","55","FF","FF","7A","7A","E9","7A","BD","E9","55","FF","BD","E9","BD","55","7A","BD","55","FF","BD","FF","7A","7A","1C","7A","1C","1C","55","55","FF"],"targets":[["55","55","FF"],["FF","55","55","7A"],["55","7A","55"],["55","55","E9","1C"],["E9","1C","7A","55"]]},{"id":"RMM-02","size":6,"capacity":14,"seconds":60,"cells":["55","E9","55","1C","FF","BD","FF","7A","BD","FF","FF","E9","55","55","FF","7A","E9","FF","BD","BD","E9","7A","55","FF","FF","7A","BD","1C","E9","FF","55","55","E9","7A","FF","E9"],"targets":[["55","BD","BD"],["BD","E9","55","FF"],["55","FF","FF"],["FF","E9","FF","1C"],["FF","1C","FF","FF"]]},{"id":"RMM-03","size":6,"capacity":14,"seconds":60,"cells":["BD","E9","FF","FF","7A","E9","1C","BD","E9","55","1C","7A","BD","1C","BD","FF","BD","E9","1C","55","7A","FF","1C","E9","1C","BD","FF","1C","1C","BD","E9","1C","BD","FF","1C","7A"],"targets":[["E9","BD","1C"],["1C","7A","FF","E9"],["FF","E9","BD"],["BD","55","1C","E9"],["1C","E9","1C","1C"]]},{"id":"RMM-04","size":6,"capacity":14,"seconds":60,"cells":["BD","BD","FF","1C","55","BD","1C","55","E9","1C","1C","7A","E9","7A","7A","E9","55","7A","FF","FF","BD","7A","55","1C","BD","FF","FF","E9","BD","E9","55","FF","E9","1C","1C","1C"],"targets":[["FF","7A","7A"],["7A","E9","FF","7A"],["FF","7A","E9"],["E9","1C","1C","55"],["1C","55","BD","E9"]]},{"id":"RMM-05","size":6,"capacity":14,"seconds":60,"cells":["1C","E9","55","E9","FF","1C","BD","BD","BD","7A","7A","BD","E9","1C","BD","7A","7A","7A","E9","BD","FF","55","E9","1C","55","FF","1C","1C","7A","1C","BD","1C","7A","7A","FF","55"],"targets":[["1C","BD","7A"],["7A","7A","BD","1C"],["BD","1C","1C"],["1C","7A","7A","1C"],["7A","1C","FF","1C"]]},{"id":"RMM-06","size":6,"capacity":14,"seconds":60,"cells":["E9","E9","BD","FF","1C","FF","1C","FF","7A","7A","55","BD","55","55","7A","55","1C","BD","55","55","7A","7A","FF","BD","BD","7A","E9","BD","1C","7A","BD","1C","E9","E9","55","FF"],"targets":[["1C","1C","7A"],["7A","E9","BD","7A"],["BD","7A","BD"],["BD","FF","55","55"],["55","55","7A","55"]]},{"id":"RMM-07","size":6,"capacity":14,"seconds":60,"cells":["1C","E9","7A","BD","1C","FF","55","E9","E9","BD","E9","FF","55","55","BD","E9","FF","E9","BD","BD","55","E9","BD","BD","7A","FF","1C","BD","E9","7A","BD","1C","7A","1C","E9","7A"],"targets":[["BD","E9","BD"],["BD","7A","1C","E9"],["1C","E9","7A"],["7A","FF","E9","E9"],["E9","E9","1C","7A"]]},{"id":"RMM-08","size":6,"capacity":14,"seconds":60,"cells":["FF","7A","FF","1C","BD","1C","BD","E9","55","FF","7A","BD","FF","E9","7A","BD","7A","1C","E9","55","1C","1C","FF","1C","1C","7A","1C","55","FF","E9","E9","55","1C","E9","E9","55"],"targets":[["FF","7A","E9"],["E9","55","FF","7A"],["FF","7A","1C"],["1C","55","E9","FF"],["E9","FF","E9","1C"]]},{"id":"RMM-09","size":6,"capacity":14,"seconds":60,"cells":["BD","FF","BD","1C","1C","1C","1C","FF","1C","E9","55","FF","BD","1C","1C","BD","FF","E9","55","55","7A","1C","1C","BD","1C","1C","55","FF","BD","E9","7A","FF","BD","BD","FF","1C"],"targets":[["1C","1C","7A"],["7A","1C","55","1C"],["55","1C","55"],["55","1C","1C","1C"],["1C","1C","FF","FF"]]},{"id":"RMM-10","size":6,"capacity":14,"seconds":60,"cells":["FF","FF","55","E9","1C","7A","1C","55","BD","55","BD","FF","1C","FF","BD","1C","FF","55","E9","E9","7A","55","E9","BD","E9","7A","FF","BD","FF","7A","1C","7A","FF","7A","1C","E9"],"targets":[["1C","FF","1C"],["1C","E9","7A","FF"],["7A","FF","55"],["55","BD","FF","7A"],["FF","7A","E9","BD"]]},{"id":"RMM-11","size":6,"capacity":14,"seconds":60,"cells":["E9","7A","FF","7A","1C","FF","BD","7A","7A","1C","E9","1C","BD","7A","FF","BD","55","55","BD","7A","FF","FF","FF","BD","1C","BD","BD","55","55","BD","1C","7A","1C","55","55","55"],"targets":[["1C","FF","FF"],["FF","7A","E9","1C"],["E9","1C","55"],["55","1C","1C","BD"],["1C","BD","BD","BD"]]},{"id":"RMM-12","size":6,"capacity":14,"seconds":60,"cells":["1C","7A","7A","BD","1C","55","7A","7A","E9","1C","1C","7A","FF","FF","55","E9","E9","FF","BD","1C","1C","FF","1C","FF","FF","55","E9","1C","BD","FF","7A","FF","E9","1C","E9","1C"],"targets":[["BD","1C","FF"],["FF","1C","E9","BD"],["E9","BD","E9"],["E9","7A","55","FF"],["55","FF","1C","55"]]},{"id":"RMM-13","size":6,"capacity":14,"seconds":60,"cells":["1C","E9","E9","7A","1C","FF","7A","1C","E9","BD","55","E9","E9","55","E9","7A","FF","1C","7A","7A","E9","BD","FF","BD","FF","FF","7A","FF","FF","55","55","7A","E9","BD","7A","1C"],"targets":[["1C","E9","7A"],["7A","BD","55","FF"],["55","FF","55"],["55","1C","7A","FF"],["7A","FF","7A","E9"]]},{"id":"RMM-14","size":6,"capacity":14,"seconds":60,"cells":["55","FF","1C","7A","BD","55","BD","55","1C","55","1C","BD","1C","E9","55","1C","BD","55","1C","FF","BD","1C","E9","55","55","7A","E9","BD","FF","E9","1C","E9","1C","1C","FF","1C"],"targets":[["55","1C","E9"],["E9","1C","BD","1C"],["BD","1C","55"],["55","55","BD","55"],["BD","55","1C","BD"]]},{"id":"RMM-15","size":6,"capacity":14,"seconds":60,"cells":["1C","7A","1C","BD","7A","1C","E9","BD","E9","55","BD","FF","55","55","E9","1C","BD","1C","E9","1C","BD","1C","E9","FF","BD","7A","BD","BD","FF","FF","1C","55","55","BD","E9","E9"],"targets":[["1C","1C","BD"],["BD","1C","1C","FF"],["1C","FF","BD"],["BD","E9","55","BD"],["55","BD","1C","FF"]]},{"id":"RMM-16","size":6,"capacity":14,"seconds":60,"cells":["55","7A","BD","7A","E9","7A","E9","FF","E9","1C","1C","E9","E9","BD","55","E9","BD","55","E9","7A","FF","FF","1C","55","BD","1C","FF","E9","55","FF","BD","E9","1C","1C","1C","BD"],"targets":[["55","E9","BD"],["BD","7A","55","7A"],["55","7A","BD"],["BD","FF","FF","1C"],["FF","1C","1C","1C"]]},{"id":"RMM-17","size":6,"capacity":14,"seconds":60,"cells":["FF","55","BD","BD","BD","1C","E9","55","7A","55","1C","1C","FF","FF","BD","BD","7A","1C","1C","FF","1C","BD","BD","BD","FF","BD","7A","7A","E9","FF","FF","FF","FF","55","55","55"],"targets":[["BD","1C","7A"],["7A","BD","55","FF"],["55","FF","BD"],["BD","55","1C","1C"],["1C","1C","FF","FF"]]},{"id":"RMM-18","size":6,"capacity":14,"seconds":60,"cells":["7A","E9","FF","BD","1C","E9","E9","E9","55","7A","55","1C","1C","E9","BD","BD","55","55","55","BD","FF","FF","FF","55","FF","55","7A","FF","BD","55","FF","55","7A","FF","FF","55"],"targets":[["E9","55","55"],["55","1C","55","1C"],["55","1C","7A"],["7A","55","FF","FF"],["FF","FF","55","BD"]]},{"id":"RMM-19","size":6,"capacity":14,"seconds":60,"cells":["FF","7A","1C","7A","FF","BD","1C","E9","1C","55","7A","E9","1C","E9","E9","7A","55","BD","1C","E9","BD","E9","E9","7A","1C","55","1C","BD","7A","BD","FF","1C","FF","FF","55","FF"],"targets":[["7A","1C","FF"],["FF","E9","7A","E9"],["7A","E9","1C"],["1C","1C","E9","55"],["E9","55","1C","FF"]]},{"id":"RMM-20","size":6,"capacity":14,"seconds":60,"cells":["BD","FF","BD","1C","55","7A","FF","BD","55","1C","55","55","55","55","FF","FF","7A","55","BD","FF","7A","1C","7A","E9","55","FF","FF","E9","55","FF","BD","BD","BD","55","1C","55"],"targets":[["FF","FF","E9"],["E9","1C","BD","BD"],["BD","BD","1C"],["1C","1C","55","7A"],["55","7A","55","55"]]}];
const BREACH_NAMES = ['ACCESS_NODE', 'DECRYPT_INDEX', 'OPEN_CHANNEL', 'OVERRIDE_ICE', 'RELEASE_LOCK'];
const BREACH_RESULT_MS = 1500;

class BreachResultPresenter {
  constructor(parts, schedule = (callback, delay) => setTimeout(callback, delay), cancel = timer => clearTimeout(timer)) {
    this.parts = parts;
    this.schedule = schedule;
    this.cancel = cancel;
    this.current = null;
  }
  get active() { return this.current !== null; }
  present(kind, detail, options = {}) {
    if (kind === 'denied' && this.current?.kind === 'granted') return Promise.resolve(false);
    if (this.current?.kind === kind) {
      if(this.parts.detail)this.parts.detail.textContent='';
      if(this.parts.next)this.parts.next.textContent='';
      if(this.parts.protocol&&options.protocol)this.parts.protocol.textContent=options.protocol;
      return this.current.promise;
    }
    if (this.current) { this.cancel(this.current.timer); this.current.resolve(false); }
    const granted = kind === 'granted';
    const {screen, shell, title, code, detail: detailElement, next} = this.parts;
    const current = {kind};
    current.promise = new Promise(resolve => { current.resolve = resolve; });
    this.current = current;
    shell.inert = true;
    screen.dataset.state = kind;
    title.textContent = granted ? 'ACCESS GRANTED' : 'ACCESS DENIED';
    if(code)code.textContent='';
    if(detailElement)detailElement.textContent='';
    if(next)next.textContent='';
    if(this.parts.protocol)this.parts.protocol.textContent=options.protocol || 'BREACH PROTOCOL';
    screen.style.setProperty('--breach-result-duration', `${BREACH_RESULT_MS}ms`);
    screen.hidden = false;
    screen.focus({preventScroll: true});
    current.timer = this.schedule(() => {
      if (this.current !== current) return;
      screen.hidden = true;
      shell.inert = false;
      this.current = null;
      current.resolve(true);
    }, BREACH_RESULT_MS);
    return current.promise;
  }
}

function breachSequenceProgress(buffer, sequence) {
  for (let start = 0; start <= buffer.length - sequence.length; start++) {
    if (sequence.every((code, offset) => buffer[start + offset] === code)) return sequence.length;
  }
  for (let length = Math.min(buffer.length, sequence.length - 1); length > 0; length--) {
    if (sequence.slice(0, length).every((code, offset) => buffer[buffer.length - length + offset] === code)) return length;
  }
  return 0;
}

class BreachPuzzle {
  constructor(board, now = () => performance.now()) {
    this.board = board;
    this.now = now;
    this.buffer = [];
    this.used = new Set();
    this.axis = 'row';
    this.line = 0;
    this.last = null;
    this.started = null;
    this.result = 'ready';
    this.reason = '';
  }
  remaining(at = this.now()) {
    return this.started === null ? this.board.seconds * 1000 : Math.max(0, this.board.seconds * 1000 - (at - this.started));
  }
  progress() { return this.board.targets.map(sequence => breachSequenceProgress(this.buffer, sequence)); }
  completed() { return this.progress().filter((length, i) => length === this.board.targets[i].length).length; }
  allowed(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.board.cells.length || this.used.has(index)) return false;
    if (!['ready', 'running'].includes(this.result)) return false;
    return this.axis === 'row' ? Math.floor(index / this.board.size) === this.line : index % this.board.size === this.line;
  }
  available() { return this.board.cells.map((_, index) => index).filter(index => this.allowed(index)); }
  tick() {
    if (this.result === 'running' && this.remaining() <= 0) { this.result = 'failed'; this.reason = 'TIME EXPIRED'; }
    return this.result;
  }
  select(index) {
    this.tick();
    if (!this.allowed(index)) return false;
    if (this.started === null) this.started = this.now();
    this.result = 'running';
    this.used.add(index);
    this.last = index;
    this.buffer.push(this.board.cells[index]);
    this.line = this.axis === 'row' ? index % this.board.size : Math.floor(index / this.board.size);
    this.axis = this.axis === 'row' ? 'column' : 'row';
    if (this.completed() === this.board.targets.length) {
      this.result = 'won';
    } else if (this.buffer.length >= this.board.capacity) {
      this.result = 'failed'; this.reason = 'BUFFER FULL';
    } else if (!this.available().length) {
      this.result = 'failed'; this.reason = 'NO AVAILABLE CELLS';
    }
    return true;
  }
}

function breachHexBytes(hex) {
  return Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
}

async function breachVerifyPassword(password, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle) throw new Error('Browser password verification requires HTTPS or localhost.');
  const encoded = new TextEncoder().encode(password);
  let key;
  try { key = await cryptoProvider.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveBits']); }
  finally { encoded.fill(0); }
  const result = new Uint8Array(await cryptoProvider.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: breachHexBytes(BREACH_PASSWORD.salt), iterations: BREACH_PASSWORD.iterations,
  }, key, 256));
  const expected = breachHexBytes(BREACH_PASSWORD.verifier);
  let mismatch = result.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) mismatch |= result[i] ^ expected[i];
  result.fill(0);
  return mismatch === 0;
}

class BreachAccessFlow {
  constructor(actions){this.actions=actions;this.stage='breach';}
  get canUnlock(){return this.stage==='breach';}
  async deny(){
    if(this.stage!=='breach')return false;
    this.stage='denying';
    const completed=await this.actions.present('denied','');
    if(!completed||this.stage!=='denying')return false;
    this.stage='redirected';this.actions.redirect('https://www.google.com/');return true;
  }
  async unlock(){
    if(!this.canUnlock)return false;
    this.stage='granting';
    const completed=await this.actions.present('granted','');
    if(!completed||this.stage!=='granting')return false;
    this.stage='unlocked';this.actions.grant();return true;
  }
}

function waitForBreachUnlock() {
  return new Promise(resolve => {
    const root = document.querySelector('#breach-gate');
    const find = id => root.querySelector(`#breach-${id}`);
    const matrix = find('matrix');
    const buffer = find('buffer');
    const sequences = find('sequences');
    const passwordForm = find('password-form');
    const passwordField = find('password');
    const passwordButton = find('password-submit');
    const passwordStatus = find('password-status');
    const resultScreen = new BreachResultPresenter({
      screen: find('outcome'), shell: root.querySelector('.breach-stages'), protocol: find('outcome-protocol'),
      title: find('outcome-title'), code: find('outcome-code'),
      detail: find('outcome-detail'), next: find('outcome-next'),
    });
    const boardIndex = Math.floor(Math.random() * BREACH_BOARDS.length);
    let puzzle;
    let frame = 0;
    let unlocked = false;
    let passwordBusy = false;
    let failurePresented = false;
    const cleanup = new AbortController();
    const listen = (element, type, callback) => element.addEventListener(type, callback, {signal: cleanup.signal});

    const flow=new BreachAccessFlow({
      present:(...args)=>resultScreen.present(...args),
      grant(){
        stopClock();cleanup.abort();root.remove();document.body.classList.remove('breach-locked');
        for(const element of document.querySelectorAll('[data-breach-protected]')){
          element.hidden=false;element.inert=false;element.removeAttribute('data-breach-protected');
        }
        resolve();
      },
      redirect:url=>window.location.replace(url),
    });
    function stopClock() { cancelAnimationFrame(frame); frame = 0; }
    function deny(){
      if(flow.stage!=='breach')return Promise.resolve(false);
      stopClock();passwordField.value='';passwordField.disabled=true;
      for(const button of root.querySelectorAll('button'))button.disabled=true;
      return flow.deny();
    }
    function unlock(detail='ACCESS KEY VERIFIED'){
      if(unlocked||!flow.canUnlock)return;
      unlocked=true;stopClock();root.dataset.result='granted';
      find('footer-status').textContent='ACCESS GRANTED';
      passwordField.value='';for(const button of root.querySelectorAll('button'))button.disabled=true;passwordField.disabled=true;
      return flow.unlock(detail);
    }
    function paintClock() {
      const seconds = puzzle.remaining() / 1000;
      find('timer').textContent = seconds.toFixed(2).padStart(5, '0');
      find('time-bar').style.transform = `scaleX(${seconds / puzzle.board.seconds})`;
    }
    function clock() {
      frame = 0;
      puzzle.tick();
      paintClock();
      if (puzzle.result === 'failed') render();
      else if (!unlocked && puzzle.result === 'running') frame = requestAnimationFrame(clock);
    }
    function render() {
      if(flow.stage!=='breach')return;
      
      root.dataset.result = puzzle.result === 'failed' ? 'failed' : puzzle.result;
      const progress = puzzle.progress();
      const complete = puzzle.completed();
      const available = puzzle.available();
      find('buffer-count').textContent = `${String(puzzle.buffer.length).padStart(2, '0')} / ${puzzle.board.capacity}`;
      find('complete-count').textContent = `${complete} / ${puzzle.board.targets.length}`;
      find('axis').textContent = `${puzzle.axis.toUpperCase()} ${String(puzzle.line + 1).padStart(2, '0')}`;
      find('footer-status').textContent = puzzle.result === 'failed' ? 'BREACH FAILED' : puzzle.started === null ? 'AWAITING INPUT' : 'UPLOADING';
      for (const button of matrix.children) {
        const index = Number(button.dataset.cell);
        const used = puzzle.used.has(index);
        button.disabled = !puzzle.allowed(index);
        button.tabIndex = index === available[0] ? 0 : -1;
        button.classList.toggle('available', !button.disabled);
        button.classList.toggle('used', used);
        button.classList.toggle('last', puzzle.last === index);
        button.textContent = used ? '··' : puzzle.board.cells[index];
        button.setAttribute('aria-label', `Row ${Math.floor(index / 6) + 1}, column ${index % 6 + 1}, ${puzzle.board.cells[index]}${used ? ', used' : ''}`);
      }
      for (let i = 0; i < buffer.children.length; i++) {
        buffer.children[i].textContent = puzzle.buffer[i] || '';
        buffer.children[i].classList.toggle('filled', i < puzzle.buffer.length);
        buffer.children[i].classList.toggle('next', i === puzzle.buffer.length && puzzle.result !== 'failed');
      }
      for (let i = 0; i < sequences.children.length; i++) {
        const row = sequences.children[i];
        const done = progress[i] === puzzle.board.targets[i].length;
        row.classList.toggle('complete', done);
        row.querySelector('.breach-sequence-status').textContent = done ? 'UPLOADED' : progress[i] ? 'UPLOADING' : 'PENDING';
        for (const [offset, code] of [...row.querySelector('.breach-sequence-codes').children].entries()) code.classList.toggle('matched', !done && offset < progress[i]);
      }
      paintClock();
      if (puzzle.result === 'failed') {
        stopClock();
        
        
        if (!failurePresented && !unlocked) {
          failurePresented = true;
          
          deny();
        }
      } else if (puzzle.result === 'won') {
        unlock('ALL FIVE SEQUENCES UPLOADED');
      } else {
        
        
      }
    }
    function loadBoard() {
      stopClock();
      failurePresented = false;
      puzzle = new BreachPuzzle(BREACH_BOARDS[boardIndex]);
      matrix.replaceChildren(); buffer.replaceChildren(); sequences.replaceChildren();
      for (let index = 0; index < puzzle.board.cells.length; index++) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'breach-cell'; button.dataset.cell = index;
        matrix.append(button);
      }
      for (let i = 0; i < puzzle.board.capacity; i++) {
        const slot = document.createElement('span'); slot.className = 'breach-slot'; buffer.append(slot);
      }
      for (const [index, sequence] of puzzle.board.targets.entries()) {
        const row = document.createElement('li'); row.className = 'breach-sequence';
        const label = document.createElement('div'); label.className = 'breach-sequence-label';
        const name = document.createElement('span'); name.className = 'breach-sequence-name'; name.textContent = BREACH_NAMES[index];
        const state = document.createElement('span'); state.className = 'breach-sequence-status';
        label.append(name, state);
        const codes = document.createElement('div'); codes.className = 'breach-sequence-codes';
        for (const code of sequence) { const span = document.createElement('span'); span.textContent = code; codes.append(span); }
        row.append(label, codes); sequences.append(row);
      }
      render();
    }
    listen(matrix, 'click', event => {
      if (unlocked || flow.stage!=='breach' || resultScreen.active) return;
      const button = event.target.closest('button[data-cell]');
      if (!button || !puzzle.select(Number(button.dataset.cell))) return;
      render();
      if (puzzle.result === 'running') {
        if (!frame) frame = requestAnimationFrame(clock);
        matrix.querySelector('button.available')?.focus({preventScroll: true});
      }
    });
    listen(matrix, 'keydown', event => {
      if (unlocked || flow.stage!=='breach' || resultScreen.active) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const available = puzzle.available();
      if (!available.length) return;
      const at = available.indexOf(Number(event.target.dataset.cell));
      let next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (at + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + available.length) % available.length;
      for (const button of matrix.children) button.tabIndex = Number(button.dataset.cell) === available[next] ? 0 : -1;
      matrix.children[available[next]].focus({preventScroll: true});
    });
    listen(passwordForm, 'submit', async event => {
      event.preventDefault();
      if (passwordBusy || unlocked || flow.stage!=='breach' || resultScreen.active) return;
      if (!passwordField.value) { passwordStatus.textContent = 'Enter the access key.'; passwordField.focus(); return; }
      passwordBusy = true; passwordButton.disabled = true; passwordField.disabled = true;
      passwordButton.textContent = 'VERIFYING'; passwordStatus.textContent = '';
      let candidate = passwordField.value; passwordField.value = '';
      try {
        const checking = breachVerifyPassword(candidate); candidate = '';
        if (await checking) await unlock();
        else if (!unlocked && flow.stage==='breach') {
          passwordStatus.textContent = 'ACCESS DENIED';
          passwordField.setAttribute('aria-invalid', 'true');
          await deny();
        }
      } catch (error) {
        if (!unlocked) passwordStatus.textContent = 'VERIFICATION UNAVAILABLE';
      } finally {
        candidate = ''; passwordBusy = false;
        if (!unlocked && flow.stage==='breach') {
          passwordButton.disabled = false; passwordField.disabled = false; passwordButton.textContent = 'UNLOCK';
          passwordField.focus({preventScroll: true});
        }
      }
    });
    listen(passwordField, 'input', () => { passwordField.removeAttribute('aria-invalid'); passwordStatus.textContent = ''; });
    listen(document, 'visibilitychange', () => {
      if (!document.hidden && !unlocked && flow.stage==='breach') { puzzle.tick(); render(); if (puzzle.result === 'running' && !frame) frame = requestAnimationFrame(clock); }
    });
    root.dataset.stage='breach';loadBoard();
  });
}


export {BREACH_BOARDS,BREACH_PASSWORD,BREACH_RESULT_MS,BreachPuzzle,BreachResultPresenter,BreachAccessFlow,breachSequenceProgress,breachVerifyPassword,waitForBreachUnlock};
