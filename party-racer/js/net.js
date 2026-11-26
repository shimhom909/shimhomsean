// 連線層：主機與手機之間傳 JSON 訊息。
//  - 預設用 PeerJS（WebRTC 點對點），透過 PeerJS 免費的公用信令伺服器配對，
//    配對完成後資料直接在手機之間傳，不需要自己架伺服器。
//  - 網址加 ?net=local 時改用 BroadcastChannel，同一台電腦開多個分頁就能測試。
//  - 網址加 ?peerhost=…&peerport=…&peerpath=… 可以改用自架的 PeerJS 伺服器。

import { ROOM_PREFIX, CODE_ALPHABET, CODE_LENGTH } from './config.js';

const PASS_KEYS = ['net', 'peerhost', 'peerport', 'peerpath', 'peersecure', 'peerkey'];

export function netParams() {
  const q = new URLSearchParams(location.search);
  const o = {};
  for (const k of PASS_KEYS) if (q.has(k)) o[k] = q.get(k);
  return o;
}

// 這些參數要一路帶到 QR code 的加入網址
export function passthroughQuery() {
  const p = netParams();
  return PASS_KEYS.filter((k) => p[k] != null).map((k) => `${k}=${encodeURIComponent(p[k])}`).join('&');
}

export function randomCode() {
  let s = '';
  const buf = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(buf);
  for (const v of buf) s += CODE_ALPHABET[v % CODE_ALPHABET.length];
  return s;
}

export function normalizeCode(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

function peerOptions() {
  const p = netParams();
  const o = { debug: 1 };
  if (p.peerhost) {
    const secure = p.peersecure != null ? p.peersecure !== '0' : location.protocol === 'https:';
    o.host = p.peerhost;
    o.port = +p.peerport || (secure ? 443 : 80);
    o.path = p.peerpath || '/';
    o.secure = secure;
  }
  if (p.peerkey) o.key = p.peerkey;
  return o;
}

function makeLink(id, sendFn, closeFn) {
  const link = {
    id, closed: false, onMessage: null, onClose: null,
    send(obj) {
      if (link.closed) return;
      try { sendFn(obj); } catch (e) { /* 連線剛斷時送不出去，忽略 */ }
    },
    close() {
      if (link.closed) return;
      try { closeFn(); } catch (e) { /* ignore */ }
      link._closed();
    },
    _closed() {
      if (link.closed) return;
      link.closed = true;
      if (link.onClose) link.onClose();
    },
  };
  return link;
}

// ── 主機端 ─────────────────────────────────────────────
// handlers: onReady(code), onConnect(link), onStatus(text|null), onError(message)
export function createHost(handlers) {
  return netParams().net === 'local' ? new LocalHost(handlers) : new PeerHost(handlers);
}

class PeerHost {
  constructor(h) {
    this.h = h;
    this.start(0);
  }

  start(attempt) {
    if (typeof window.Peer !== 'function') {
      this.h.onError('連線元件載入失敗，請重新整理頁面');
      return;
    }
    this.code = randomCode();
    const peer = new window.Peer(ROOM_PREFIX + this.code, peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      this.h.onStatus(null);
      if (!this.readyFired) { this.readyFired = true; this.h.onReady(this.code); }
    });
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      if (peer.destroyed) return;
      this.h.onStatus('與配對伺服器斷線，重新連線中…（已加入的玩家不受影響）');
      clearTimeout(this.retry);
      this.retry = setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 2000);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && !this.readyFired && attempt < 6) {
        peer.destroy();
        this.start(attempt + 1);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        if (!this.readyFired) this.h.onError('連不上配對伺服器，請確認網路後重新整理');
        else this.h.onStatus('網路不穩，重新連線中…');
      } else if (err.type === 'browser-incompatible') {
        this.h.onError('這個瀏覽器不支援 WebRTC，請改用 Chrome 或 Safari');
      } else {
        console.warn('peer error', err.type, err);
      }
    });
  }

  accept(conn) {
    const link = makeLink(conn.peer, (o) => conn.open && conn.send(o), () => conn.close());
    let opened = false;
    conn.on('open', () => { opened = true; this.h.onConnect(link); });
    conn.on('data', (d) => link.onMessage && link.onMessage(d));
    conn.on('close', () => link._closed());
    conn.on('error', () => link._closed());
    setTimeout(() => { if (!opened) { conn.close(); } }, 15000);
  }

  destroy() {
    clearTimeout(this.retry);
    if (this.peer) this.peer.destroy();
  }
}

class LocalHost {
  constructor(h) {
    this.h = h;
    this.code = randomCode();
    this.links = new Map();
    this.bc = new BroadcastChannel('party-racer-' + this.code);
    this.bc.onmessage = (e) => this.onMsg(e.data);
    setTimeout(() => h.onReady(this.code), 50);
  }

  onMsg(m) {
    if (!m || m.to !== 'host') return;
    if (m.k === 'open') {
      const old = this.links.get(m.from);
      if (old) old._closed();
      const link = makeLink(
        m.from,
        (o) => this.bc.postMessage({ to: m.from, k: 'msg', d: o }),
        () => this.bc.postMessage({ to: m.from, k: 'close' }),
      );
      this.links.set(m.from, link);
      this.bc.postMessage({ to: m.from, k: 'opened' });
      this.h.onConnect(link);
    } else if (m.k === 'msg') {
      const l = this.links.get(m.from);
      if (l && l.onMessage) l.onMessage(m.d);
    } else if (m.k === 'close') {
      const l = this.links.get(m.from);
      if (l) { l._closed(); this.links.delete(m.from); }
    }
  }

  destroy() { this.bc.close(); }
}

// ── 手機（搖桿）端 ──────────────────────────────────────
// handlers: onOpen(), onMessage(obj), onClose(), onError(kind, message)
//   kind: 'notfound' 找不到房間、'network' 網路問題
export function joinRoom(code, handlers) {
  return netParams().net === 'local' ? new LocalClient(code, handlers) : new PeerClient(code, handlers);
}

class PeerClient {
  constructor(code, h) {
    this.code = code;
    this.h = h;
    this.connect();
  }

  connect() {
    this.cleanup();
    if (typeof window.Peer !== 'function') {
      this.h.onError('network', '連線元件載入失敗，請重新整理頁面');
      return;
    }
    const peer = new window.Peer(peerOptions());
    this.peer = peer;
    const gen = (this.gen = (this.gen || 0) + 1);
    const alive = () => gen === this.gen;
    this.timer = setTimeout(() => {
      if (alive() && !this.isOpen) this.h.onError('network', '連線逾時');
    }, 15000);

    peer.on('open', () => {
      if (!alive()) return;
      const conn = peer.connect(ROOM_PREFIX + this.code, { reliable: true, serialization: 'json' });
      this.conn = conn;
      conn.on('open', () => {
        if (!alive()) return;
        this.isOpen = true;
        clearTimeout(this.timer);
        this.h.onOpen();
      });
      conn.on('data', (d) => alive() && this.h.onMessage(d));
      conn.on('close', () => { if (alive() && this.isOpen) { this.isOpen = false; this.h.onClose(); } });
      conn.on('error', () => { if (alive() && this.isOpen) { this.isOpen = false; this.h.onClose(); } });
    });
    peer.on('error', (err) => {
      if (!alive()) return;
      if (err.type === 'peer-unavailable') this.h.onError('notfound', '找不到這個房間');
      else if (err.type === 'browser-incompatible') this.h.onError('fatal', '這個瀏覽器不支援 WebRTC，請改用 Chrome 或 Safari');
      else if (!this.isOpen) this.h.onError('network', '連線失敗（' + err.type + '）');
    });
  }

  send(obj) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(obj); } catch (e) { /* ignore */ }
    }
  }

  cleanup() {
    clearTimeout(this.timer);
    this.isOpen = false;
    this.gen = (this.gen || 0) + 1;
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.peer = null;
    this.conn = null;
  }

  close() { this.cleanup(); }
}

class LocalClient {
  constructor(code, h) {
    this.code = code;
    this.h = h;
    this.connect();
    addEventListener('pagehide', () => this.close());
  }

  connect() {
    this.cleanup();
    this.id = 'local-' + Math.random().toString(36).slice(2, 10);
    this.bc = new BroadcastChannel('party-racer-' + this.code);
    this.bc.onmessage = (e) => {
      const m = e.data;
      if (!m || m.to !== this.id) return;
      if (m.k === 'opened') { this.isOpen = true; clearTimeout(this.timer); this.h.onOpen(); }
      else if (m.k === 'msg') this.h.onMessage(m.d);
      else if (m.k === 'close') { this.isOpen = false; this.h.onClose(); }
    };
    this.bc.postMessage({ to: 'host', from: this.id, k: 'open' });
    this.timer = setTimeout(() => { if (!this.isOpen) this.h.onError('notfound', '找不到這個房間'); }, 2500);
  }

  send(obj) {
    if (this.isOpen) this.bc.postMessage({ to: 'host', from: this.id, k: 'msg', d: obj });
  }

  cleanup() {
    clearTimeout(this.timer);
    if (this.bc) {
      if (this.isOpen) this.bc.postMessage({ to: 'host', from: this.id, k: 'close' });
      this.bc.close();
    }
    this.isOpen = false;
    this.bc = null;
  }

  close() { this.cleanup(); }
}
