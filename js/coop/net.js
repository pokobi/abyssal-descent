'use strict';
// The wire of co-op. Two transports with one shape:
//   t.onpeer(id)  someone connected (the host sees each guest; a guest sees the host as id 0)
//   t.onmsg(id, m) a message came in        t.onleave(id) a connection ended
//   t.send(id, m)  (id 0 from a guest = the host)        t.close()
// CoopNet.peer: real play, WebRTC through PeerJS (the room code is the host's peer id on the public broker).
// CoopNet.local: two tabs on one machine, for the tests; lat / jit (ms) delay every message, keeping its order, like a slow reliable channel.
(function () {
  const N = (window.CoopNet = {});
  const PREFIX = 'abyssal-descent-coop-';
  N.code = function () { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };

  // how long the room may take to be reached (the broker for a host; the broker and the line to the host for a guest) before it is given up, in ms
  N.WAIT = 15000;
  N.peer = function (code, isHost) {
    const t = { onpeer() {}, onmsg() {}, onleave() {}, onerror() {} };
    const conns = new Map(); let next = 1, closed = false, up = false, peer = null;
    t.send = (id, m) => { const c = conns.get(id); if (c && c.open) c.send(m); };
    t.close = () => { closed = true; clearTimeout(tm); try { if (peer) peer.destroy(); } catch (e) { /* already gone */ } };
    // (before the room is reached, any trouble ends the try with a message; after, the broker's trouble is not the players' - their lines stand)
    const fail = (why) => { if (up || closed) return; t.close(); t.onerror(why); };
    const tm = setTimeout(() => fail(isHost ? '仲介サーバにつながりません（しばらくしてから試してください）' : 'ホストにつながりません（部屋コードを確かめるか、しばらくしてから試してください。回線の組み合わせによっては、つながらない事があります）'), N.WAIT);
    // (the PeerJS script comes from a CDN: blocked or offline, there is no Peer)
    if (typeof Peer !== 'function') { setTimeout(() => fail('通信の部品（PeerJS）を読み込めませんでした。ネットワークや広告ブロックの設定を確かめて、再読み込みしてください'), 0); return t; }
    try { peer = new Peer(isHost ? PREFIX + code : undefined, { debug: 0 }); } catch (e) { setTimeout(() => fail('接続エラー: ' + e.message), 0); return t; }
    const hook = (c, id) => {
      conns.set(id, c);
      c.on('data', (m) => t.onmsg(id, m));
      c.on('close', () => { if (conns.delete(id) && !closed) t.onleave(id); });
      c.on('error', () => { if (conns.delete(id) && !closed) t.onleave(id); });
    };
    const reached = () => { up = true; clearTimeout(tm); };
    peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? '部屋が見つかりません' : e.type === 'unavailable-id' ? 'その部屋コードは使われています' : '接続エラー: ' + e.type));
    if (isHost) {
      peer.on('open', () => { reached(); if (t.onopen) t.onopen(); });
      peer.on('connection', (c) => { const id = next++; c.on('open', () => { hook(c, id); t.onpeer(id); }); });
      // a host that lost the broker still has its players, but nobody new can find the room: it asks again a few seconds later
      peer.on('disconnected', () => { if (up && !closed) setTimeout(() => { try { if (!closed && peer.disconnected && !peer.destroyed) peer.reconnect(); } catch (e) { /* tried */ } }, 3000); });
    } else {
      peer.on('open', () => { const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' }); c.on('open', () => { reached(); hook(c, 0); t.onpeer(0); }); });
    }
    return t;
  };

  N.local = function (code, isHost, o) {
    o = Object.assign({ lat: 0, jit: 0 }, o);
    const t = { onpeer() {}, onmsg() {}, onleave() {}, onerror() {} };
    const bc = new BroadcastChannel('coop-' + code), me = isHost ? 0 : 'g' + Math.random().toString(36).slice(2, 8);
    const ids = new Map(); let next = 1, gid = null, closed = false;
    const q = { at: 0 };
    const deliver = (fn) => {
      if (!o.lat && !o.jit) { fn(); return; }
      const when = Math.max(q.at, performance.now() + o.lat + Math.random() * o.jit); q.at = when;
      setTimeout(() => { if (!closed) fn(); }, when - performance.now());
    };
    bc.onmessage = (ev) => {
      const d = ev.data;
      if (d.to !== me) return;
      deliver(() => {
        if (d.hi && isHost) {
          // (a guest says hello again until it is answered: one already taken in is answered again with its own number)
          const known = [...ids].find(([, g]) => g === d.from);
          if (known) { bc.postMessage({ to: d.from, ok: known[0] }); return; }
          const id = next++; ids.set(id, d.from); bc.postMessage({ to: d.from, ok: id }); t.onpeer(id); return;
        }
        if (d.ok && gid !== null) return;
        if (d.ok) { gid = d.ok; t.onpeer(0); return; }
        t.onmsg(isHost ? [...ids].find(([, g]) => g === d.from)[0] : 0, d.m);
      });
    };
    if (isHost) setTimeout(() => t.onopen && t.onopen(), 0);
    else {
      // (a hello can go before the host's page listens - a busy machine loads it late: said again every second until it is answered)
      const hello = () => { if (closed || gid !== null) return; bc.postMessage({ to: 0, from: me, hi: 1 }); setTimeout(hello, 1000); };
      setTimeout(hello, 0);
    }
    t.send = (id, m) => { if (closed) return; bc.postMessage({ to: isHost ? ids.get(id) : 0, from: me, m }); };
    t.close = () => { closed = true; bc.close(); };
    return t;
  };
})();
