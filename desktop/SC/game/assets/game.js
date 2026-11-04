/* Offline browser integration. See ../licences/ for the engine notices. */
'use strict';
var Module;
(function () {
  const canvas = document.getElementById('canvas');
  const errorPanel = document.getElementById('error');
  const SAVE_KEY = 'pvz-goty-1073-save-v1';
  const SEED = 'seed-1073-dave-v2';
  const LEGACY_SEED = 'seed-1073-zeke-v1';
  const title = document.querySelector('title');
  const titleObserver = new MutationObserver(() => { if (document.title !== 'Plants vs. Zombies') document.title = 'Plants vs. Zombies'; });
  titleObserver.observe(title,{childList:true,subtree:true,characterData:true});
  const strings = {
    failed:'The game could not start. ',
    retry:'Try again',
    context:'WebGL is unavailable. Enable hardware acceleration in your browser and reopen this page.',
    missing:'Some game files are missing. Extract the entire ZIP archive before opening index.html.'
  };
  let database = null, started = false, failed = false, quitting = false;
  let lastPayload = '', latestSnapshot = null, timer = null;
  let writeQueue = Promise.resolve();
  function decode(text) {
    const raw = atob(text), bytes = new Uint8Array(raw.length);
    for (let i=0; i<raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  function encode(bytes) {
    let text = '';
    for (let i=0; i<bytes.length; i+=16384) text += String.fromCharCode.apply(null, bytes.subarray(i,i+16384));
    return btoa(text);
  }
  function checksum(text) {
    let value = 2166136261;
    for (let i=0; i<text.length; i++) value = Math.imul(value ^ text.charCodeAt(i),16777619);
    return (value >>> 0).toString(16).padStart(8,'0');
  }
  function showError(message) {
    if (failed) return;
    failed = true;
    errorPanel.style.display = 'flex';
    const box = document.createElement('div');
    box.textContent = strings.failed + String(message);
    const button = document.createElement('button');
    button.textContent = strings.retry;
    button.onclick = () => location.reload();
    box.appendChild(button);
    errorPanel.replaceChildren(box);
  }
  function write(path, bytes) {
    Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')) || '/');
    Module.FS.writeFile(path,bytes);
  }
  function exists(path) { return Module.FS.analyzePath(path).exists; }
  function valid(snapshot, allowLegacy = false) {
    try {
      if (!snapshot || (snapshot.seed !== SEED && !(allowLegacy && snapshot.seed === LEGACY_SEED)) || !snapshot.files || typeof snapshot.files !== 'object') return false;
      const files = snapshot.files, names = Object.keys(files);
      if (!files['userdata/users.dat'] || !files['userdata/user1.dat'] || names.length > 1000) return false;
      if (snapshot.checksum && snapshot.checksum !== checksum(JSON.stringify(files))) return false;
      let total = 0;
      for (const name of names) {
        if (!/^(userdata\/[A-Za-z0-9_.-]+|registry\.regemu)$/.test(name) || name.includes('..')) return false;
        if (typeof files[name] !== 'string' || files[name].length > 14*1024*1024) return false;
        total += files[name].length;
      }
      if (total > 64*1024*1024) return false;
      const users = decode(files['userdata/users.dat']);
      const player = decode(files['userdata/user1.dat']);
      return users.length >= 8 && player.length >= 100 && users[0] > 0 && users[0] <= 32 && player[0] > 0 && player[0] <= 32;
    } catch (_) { return false; }
  }
  async function openDatabase() {
    return new Promise(resolve => {
      let finished = false;
      const finish = value => { if (!finished) { finished = true; clearTimeout(timeout); resolve(value); } };
      const timeout = setTimeout(() => finish(null),1500);
      try {
        const request = indexedDB.open('plants-vs-zombies-1073',1);
        request.onupgradeneeded = () => request.result.createObjectStore('saves');
        request.onsuccess = () => {
          if (finished) { request.result.close(); return; }
          const db = request.result;
          db.onversionchange = () => db.close();
          finish(db);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch (_) { finish(null); }
    });
  }
  async function databaseRead() {
    if (!database) return [];
    return new Promise(resolve => {
      let done = false;
      const finish = value => { if (!done) { done = true; clearTimeout(timeout); resolve(value); } };
      const timeout = setTimeout(() => finish([]),1500);
      try {
        const tx = database.transaction('saves','readonly');
        const output = [];
        for (const key of ['current','previous']) {
          const request = tx.objectStore('saves').get(key);
          request.onsuccess = () => output.push(request.result);
        }
        tx.oncomplete = () => finish(output);
        tx.onerror = tx.onabort = () => finish([]);
      } catch (_) { finish([]); }
    });
  }
  function databaseWrite(snapshot, previous) {
    if (!database) return Promise.resolve();
    return new Promise(resolve => {
      try {
        const tx = database.transaction('saves','readwrite');
        const store = tx.objectStore('saves');
        if (previous) store.put(previous,'previous');
        store.put(snapshot,'current');
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch (_) { resolve(); }
    });
  }
  function persist() {
    if (!started) return Promise.resolve();
    try {
      const files = {};
      for (const name of Module.FS.readdir('/saves/userdata').sort()) {
        if (name === '.' || name === '..' || !/^[A-Za-z0-9_.-]+$/.test(name)) continue;
        const path = '/saves/userdata/'+name, stat = Module.FS.stat(path);
        if (Module.FS.isFile(stat.mode) && stat.size <= 10*1024*1024) files['userdata/'+name] = encode(Module.FS.readFile(path));
      }
      if (exists('/saves/registry.regemu')) files['registry.regemu'] = encode(Module.FS.readFile('/saves/registry.regemu'));
      const payload = JSON.stringify(files);
      if (payload === lastPayload) return writeQueue;
      const snapshot = {version:2,seed:SEED,updated:Date.now(),files,checksum:checksum(payload)};
      if (!valid(snapshot)) return writeQueue;
      const previous = latestSnapshot;
      latestSnapshot = snapshot;
      lastPayload = payload;
      try {
        // Keep the old slot intact if quota prevents writing the new slot.
        localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot));
        if (previous) localStorage.setItem(SAVE_KEY+'-backup',JSON.stringify(previous));
      } catch (_) {}
      writeQueue = writeQueue.then(() => databaseWrite(snapshot,previous));
    } catch (_) {}
    return writeQueue;
  }
  function migrateProfile(snapshot) {
    if (snapshot.seed !== LEGACY_SEED) return snapshot;
    const files = {...snapshot.files};
    const users = decode(files['userdata/users.dat']);
    let renamed = false;
    try {
      const view = new DataView(users.buffer, users.byteOffset, users.byteLength);
      if (view.getUint32(0,true) !== 14) return null;
      const count = view.getUint16(4,true);
      const records = [];
      let offset = 6;
      for (let i=0; i<count; i++) {
        const size = view.getUint16(offset,true);
        offset += 2;
        if (size > users.length-offset-8) return null;
        const name = new TextDecoder().decode(users.subarray(offset,offset+size));
        const id = view.getUint32(offset+size+4,true);
        records.push({offset,size,name,id});
        offset += size+8;
      }
      if (offset !== users.length) return null;
      const original = records.find(record => record.id === 1 && record.size === 4 && record.name.toLowerCase() === 'zeke');
      const duplicate = records.some(record => record.id !== 1 && record.name.toLowerCase() === 'dave');
      if (original && !duplicate) {
        users.set([68,97,118,101],original.offset);
        files['userdata/users.dat'] = encode(users);
        renamed = true;
      }
    } catch (_) { return null; }
    if (renamed && files['registry.regemu']) {
      files['registry.regemu'] = encode(renameCurrentProfile(decode(files['registry.regemu'])));
    }
    return {...snapshot,seed:SEED,files,checksum:checksum(JSON.stringify(files))};
  }
  function renameCurrentProfile(original) {
    // Preserve every registry value except the active name of the renamed profile.
    const bytes = original.slice();
    try {
      if (new TextDecoder().decode(bytes.subarray(0,6)) !== 'REGEMU') return original;
      const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      if (view.getUint16(6,true) !== 1) return original;
      let offset = 8;
      const uint32 = () => {
        if (offset+4 > bytes.length) throw new Error('Invalid save settings');
        const value = view.getUint32(offset,true);
        offset += 4;
        return value;
      };
      const take = size => {
        if (size > bytes.length-offset) throw new Error('Invalid save settings');
        const start = offset;
        offset += size;
        return start;
      };
      const keys = uint32();
      if (keys > 1000) return original;
      for (let i=0; i<keys; i++) {
        take(uint32());
        const count = uint32();
        if (count > 10000) return original;
        for (let j=0; j<count; j++) {
          const nameLength = uint32();
          const nameOffset = take(nameLength);
          const name = new TextDecoder().decode(bytes.subarray(nameOffset,nameOffset+nameLength)).replace(/\0+$/,'');
          uint32();
          const length = uint32();
          const start = take(length);
          if (name === 'CurUser' && length === 4 && new TextDecoder().decode(bytes.subarray(start,start+4)).toLowerCase() === 'zeke') {
            bytes.set([68,97,118,101],start);
          }
        }
      }
      return offset === bytes.length ? bytes : original;
    } catch (_) { return original; }
  }
  async function restore() {
    Module.FS.mkdirTree('/saves/userdata');
    database = await openDatabase();
    const candidates = await databaseRead();
    for (const key of [SAVE_KEY,SAVE_KEY+'-backup']) {
      try { candidates.push(JSON.parse(localStorage.getItem(key) || 'null')); } catch (_) {}
    }
    const saved = candidates.filter(candidate => valid(candidate,true))
      .sort((a,b) => (b.updated || 0)-(a.updated || 0))
      .map(migrateProfile).find(candidate => valid(candidate));
    if (saved) {
      for (const [path,data] of Object.entries(saved.files)) write('/saves/'+path,decode(data));
      latestSnapshot = saved;
    } else {
      for (const [name,data] of Object.entries(window.GameDefaultSave)) write('/saves/userdata/'+name,decode(data));
    }
  }
  function caseInsensitiveResources() {
    const original = Module.FS.lookupNode, indexes = new WeakMap();
    Module.FS.lookupNode = function (parent,name) {
      try { return original.call(this,parent,name); }
      catch (error) {
        if (error.errno === 44 && parent.contents && typeof name === 'string') {
          const names = Object.keys(parent.contents);
          let index = indexes.get(parent);
          if (!index || index.count !== names.length) {
            index = {count:names.length,entries:new Map(names.map(key => [key.toLowerCase(),key]))};
            indexes.set(parent,index);
          }
          const match = index.entries.get(name.toLowerCase());
          if (match && parent.contents[match]) return original.call(this,parent,match);
        }
        throw error;
      }
    };
  }
  function resumeSound() {
    const context = Module && Module.SDL2 && Module.SDL2.audioContext;
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }
  async function launch() {
    try {
      if (!Array.isArray(window.GameAssets) || window.GameAssets.length < 3000 || !window.GameDefaultSave) throw new Error(strings.missing);
      caseInsensitiveResources();
      let count = 0;
      for (const [name,data] of window.GameAssets) {
        write('/'+name,decode(data));
        if (++count % 128 === 0) await new Promise(resolve => setTimeout(resolve,0));
      }
      window.GameAssets.length = 0;
      await restore();
      started = true;
      canvas.focus({preventScroll:true});
      timer = setInterval(persist,2000);
      Module.callMain(['-resdir','/','-savedir','/saves/']);
      persist();
    } catch (error) { showError(error.message || error); }
  }
  Module = {
    canvas, noInitialRun:true,
    print:() => {},
    printErr:message => {
      const text = String(message);
      if (/FATAL:/.test(text)) showError(/GL|EGL|display/i.test(text) ? strings.context : text.replace(/^.*FATAL:\s*/,''));
      else if (/Failed to load|Font Descriptor Error|Resource file not found|Image resource not found|Image rectangle out of bounds/.test(text)) showError(text);
      else if (!/^INFO:/.test(text)) console.warn(text);
    },
    onRuntimeInitialized:launch,
    onAbort:showError,
    instantiateWasm(imports,receive) {
      try {
        if (!window.GameWasm) throw new Error(strings.missing);
        const bytes = decode(window.GameWasm);
        delete window.GameWasm;
        WebAssembly.instantiate(bytes,imports).then(result => receive(result.instance,result.module)).catch(showError);
      } catch (error) { showError(error.message || error); }
      return {};
    }
  };
  canvas.addEventListener('contextmenu',event => event.preventDefault());
  document.addEventListener('pointerdown',resumeSound,{capture:true});
  document.addEventListener('keydown',resumeSound,{capture:true});
  document.addEventListener('visibilitychange',() => { if (document.hidden) persist(); });
  window.addEventListener('pagehide',persist);
  window.addEventListener('beforeunload',persist);
  window.onGameExit = function () {
    if (quitting || failed) return;
    quitting = true;
    clearInterval(timer);
    persist().finally(() => {
      // Browsers may decline to close a tab that was opened by the user.
      canvas.style.visibility = 'hidden';
      document.addEventListener('pointerdown',() => location.reload(),{once:true});
      document.addEventListener('keydown',() => location.reload(),{once:true});
      // Leave an ordinary browser tab open after the game exits.
    });
  };
  window.addEventListener('error',event => { if (!started) showError(event.message || strings.missing); });
})();
