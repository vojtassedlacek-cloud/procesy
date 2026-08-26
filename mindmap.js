/* global TrelloPowerUp */
'use strict';

var t = window.TrelloPowerUp.iframe();

/* ------------------------------------------------------------------ */
/* Konstanty                                                           */
/* ------------------------------------------------------------------ */

var NODE_W    = 210;
var LINE_H    = 17;
var PAD_TOP   = 26;   // místo na název seznamu
var PAD_BOT   = 10;
var MAX_LINES = 3;
var GRID      = 10;   // přichytávání pozic
var COL_GAP   = 90;
var ROW_GAP   = 26;

var BRAND = {
  green: '#bfd630', dark: '#3d3f47', pink: '#e50751',
  blue: '#5bc2fd', brown: '#47423e'
};

var LABEL_COLORS = {
  green: '#61bd4f', yellow: '#f2d600', orange: '#ff9f1a', red: '#eb5a46',
  purple: '#c377e0', blue: '#0079bf', sky: '#00c2e0', lime: '#51e898',
  pink: '#ff78cb', black: '#344563'
};

// pozice úchytů na uzlu
var HANDLES = {
  l: function (n) { return { x: n.x,               y: n.y + n.h / 2 }; },
  r: function (n) { return { x: n.x + NODE_W,      y: n.y + n.h / 2 }; },
  tp:function (n) { return { x: n.x + NODE_W / 2,  y: n.y }; },
  b: function (n) { return { x: n.x + NODE_W / 2,  y: n.y + n.h }; }
};

/* ------------------------------------------------------------------ */
/* Stav                                                                */
/* ------------------------------------------------------------------ */

var state = {
  board: null,
  listName: {},
  nodes: [],            // { id, name, card, x, y, h, lines }
  nodeById: {},
  edges: [],            // { f, fh, t, th }
  colorByLabel: false,
  selected: null,
  focusId: null,
  drag: null,           // přesun uzlu
  link: null,           // tažení spojnice
  view: { x: 60, y: 60, k: 1 },
  dirtyPos: {}          // pozice čekající na uložení
};

var el = {
  svg:      document.getElementById('svg'),
  viewport: document.getElementById('viewport'),
  edges:    document.getElementById('edges'),
  nodes:    document.getElementById('nodes'),
  temp:     document.getElementById('temp-edge'),
  wrap:     document.getElementById('canvas-wrap'),
  status:   document.getElementById('status'),
  empty:    document.getElementById('empty'),
  hint:     document.getElementById('hint'),
  hintText: document.getElementById('hint-text'),
  btnDelete:document.getElementById('btn-delete')
};

/* ------------------------------------------------------------------ */
/* Načtení dat                                                         */
/* ------------------------------------------------------------------ */

function loadData() {
  setStatus('Načítám data…');

  return Promise.all([
    t.board('id', 'name'),
    t.lists('id', 'name'),
    t.cards('id', 'name', 'idList', 'shortLink', 'url', 'labels', 'closed', 'due', 'dueComplete')
  ]).then(function (res) {
    state.board = res[0];
    state.listName = {};
    (res[1] || []).forEach(function (l) { state.listName[l.id] = l.name; });

    var cards = (res[2] || []).filter(function (c) { return !c.closed; });
    var used = {};
    cards.forEach(function (c) { used[c.idList] = true; });

    state.nodes = [];

    // uzly seznamů — hlavičky sloupců
    (res[1] || []).forEach(function (l) {
      if (!used[l.id]) return;
      var lines = wrapText(l.name, 24, 2);
      state.nodes.push({
        id: 'l:' + l.id, kind: 'list', listId: l.id, name: l.name, card: null,
        lines: lines, h: 14 + lines.length * LINE_H + PAD_BOT, x: null, y: null
      });
    });

    // uzly karet
    cards.forEach(function (c) {
      var lines = wrapText(c.name, 26, MAX_LINES);
      state.nodes.push({
        id: 'c:' + c.id, kind: 'card', listId: c.idList, name: c.name, card: c,
        lines: lines, h: PAD_TOP + lines.length * LINE_H + PAD_BOT, x: null, y: null
      });
    });

    state.nodeById = {};
    state.nodes.forEach(function (n) { state.nodeById[n.id] = n; });

    return Promise.all([loadPositions(), loadListPositions(), loadEdges()]);
  }).then(function () {
    autoPlaceMissing();
    render();
    updateStatus();
  }).catch(function (err) {
    console.error(err);
    setStatus('Chyba při načítání: ' + (err && err.message ? err.message : err));
  });
}

function loadPositions() {
  var jobs = state.nodes.filter(function (n) { return n.kind === 'card'; }).map(function (n) {
    return t.get(n.card.id, 'shared', 'pos')
      .then(function (p) { if (p && typeof p.x === 'number') { n.x = p.x; n.y = p.y; } })
      .catch(function () {});
  });
  return Promise.all(jobs);
}

// Seznam není karta, plugin data se na něj uložit nedají — držíme je na boardu.
function loadListPositions() {
  return t.get('board', 'shared', 'listpos').then(function (map) {
    if (!map) return;
    state.nodes.forEach(function (n) {
      if (n.kind !== 'list') return;
      var p = map[n.listId];
      if (p && typeof p.x === 'number') { n.x = p.x; n.y = p.y; }
    });
  }).catch(function () {});
}

function saveListPositions() {
  var map = {};
  state.nodes.forEach(function (n) {
    if (n.kind === 'list' && n.x !== null) map[n.listId] = { x: n.x, y: n.y };
  });
  return t.set('board', 'shared', 'listpos', map).catch(function (err) {
    console.error(err);
    t.alert({ message: 'Pozici seznamu se nepodařilo uložit.', duration: 5 });
  });
}

// Hrany jsou uložené na boardu, rozsekané do několika klíčů kvůli limitu 4096 znaků.
function loadEdges() {
  var jobs = [];
  for (var i = 0; i < 10; i++) jobs.push(t.get('board', 'shared', 'edges' + i).catch(function () { return null; }));
  return Promise.all(jobs).then(function (chunks) {
    var all = [];
    chunks.forEach(function (ch) {
      if (Array.isArray(ch)) all = all.concat(ch);
    });
    // zahodíme spojnice na karty, které už neexistují
    state.edges = all.filter(function (e) {
      return e && state.nodeById[e.f] && state.nodeById[e.t];
    });
  });
}

function saveEdges() {
  var chunks = [[]], size = 0;
  state.edges.forEach(function (e) {
    var len = JSON.stringify(e).length + 1;
    if (size + len > 3400) { chunks.push([]); size = 0; }
    chunks[chunks.length - 1].push(e);
    size += len;
  });

  var jobs = [];
  for (var i = 0; i < 10; i++) {
    if (i < chunks.length) jobs.push(t.set('board', 'shared', 'edges' + i, chunks[i]));
    else jobs.push(t.remove('board', 'shared', 'edges' + i).catch(function () {}));
  }
  return Promise.all(jobs).catch(function (err) {
    console.error(err);
    t.alert({ message: 'Spojnice se nepodařilo uložit.', duration: 6 });
  });
}

function savePosition(n) {
  if (n.kind === 'list') return saveListPositions();
  return t.set(n.card.id, 'shared', 'pos', { x: n.x, y: n.y }).catch(function (err) {
    console.error(err);
    t.alert({ message: 'Pozici se nepodařilo uložit.', duration: 5 });
  });
}

/* Karty bez uložené pozice se rozloží do sloupců podle seznamů. */
function autoPlaceMissing() {
  var colY = {}, colIndex = {}, nextCol = 0;

  function column(lid) {
    if (!(lid in colIndex)) { colIndex[lid] = nextCol++; colY[lid] = 0; }
    return colIndex[lid];
  }

  // nejdřív hlavičky seznamů, ať sedí na začátku sloupce
  state.nodes.forEach(function (n) {
    if (n.kind !== 'list' || n.x !== null) return;
    var col = column(n.listId);
    n.x = col * (NODE_W + COL_GAP);
    n.y = colY[n.listId];
    colY[n.listId] += n.h + ROW_GAP + 14;
  });

  state.nodes.forEach(function (n) {
    if (n.kind !== 'card' || n.x !== null) return;
    var lid = n.listId || 'x';
    var col = column(lid);
    n.x = col * (NODE_W + COL_GAP);
    n.y = colY[lid];
    colY[lid] += n.h + ROW_GAP;
  });
}

function arrangeAll() {
  state.nodes.forEach(function (n) { n.x = null; });
  autoPlaceMissing();

  // hlavička seznamu se propojí se svými kartami, pokud tam spojnice ještě není
  state.nodes.forEach(function (n) {
    if (n.kind !== 'card') return;
    var lnode = state.nodeById['l:' + n.listId];
    if (!lnode) return;
    var exists = state.edges.some(function (e) {
      return (e.f === lnode.id && e.t === n.id) || (e.f === n.id && e.t === lnode.id);
    });
    if (!exists) state.edges.push({ f: lnode.id, fh: 'b', t: n.id, th: 'tp' });
  });

  render();
  setStatus('Srovnáno — ukládám…');
  var jobs = state.nodes.filter(function (n) { return n.kind === 'card'; }).map(savePosition);
  jobs.push(saveListPositions());
  jobs.push(saveEdges());
  Promise.all(jobs).then(function () {
    updateStatus();
    fitToScreen();
  });
}

/* ------------------------------------------------------------------ */
/* Vykreslení                                                          */
/* ------------------------------------------------------------------ */

function render() {
  el.edges.innerHTML = '';
  el.nodes.innerHTML = '';
  el.empty.classList.toggle('show', !state.nodes.length);

  state.edges.forEach(drawEdge);
  state.nodes.forEach(function (n) { el.nodes.appendChild(nodeEl(n)); });

  applyView();
  if (state.focusId) {
    focusOn(state.focusId);
    state.focusId = null;
  }
}

function edgeD(from, fh, to, th) {
  var a = HANDLES[fh](from), b = HANDLES[th](to);
  var dx = Math.max(Math.abs(b.x - a.x) * 0.5, 40);
  var dy = Math.max(Math.abs(b.y - a.y) * 0.5, 40);
  var c1 = { x: a.x, y: a.y }, c2 = { x: b.x, y: b.y };

  if (fh === 'r') c1.x += dx; else if (fh === 'l') c1.x -= dx;
  else if (fh === 'b') c1.y += dy; else c1.y -= dy;

  if (th === 'r') c2.x += dx; else if (th === 'l') c2.x -= dx;
  else if (th === 'b') c2.y += dy; else c2.y -= dy;

  return 'M' + a.x + ',' + a.y + ' C' + c1.x + ',' + c1.y + ' ' + c2.x + ',' + c2.y + ' ' + b.x + ',' + b.y;
}

function drawEdge(e) {
  var from = state.nodeById[e.f], to = state.nodeById[e.t];
  if (!from || !to) return;
  var d = edgeD(from, e.fh, to, e.th);

  var hit = svgEl('path', { 'class': 'edge-hit', d: d });
  hit.addEventListener('click', function (ev) {
    ev.stopPropagation();
    removeEdge(e);
  });
  el.edges.appendChild(hit);
  el.edges.appendChild(svgEl('path', { 'class': 'edge', d: d, 'marker-end': 'url(#arrow)' }));
}

function nodeEl(n) {
  var g = svgEl('g', {
    'class': 'node' + (state.selected === n.id ? ' selected' : ''),
    transform: 'translate(' + n.x + ',' + n.y + ')',
    'data-id': n.id
  });

  var style = nodeStyle(n);
  g.appendChild(svgEl('rect', {
    'class': 'body', width: NODE_W, height: n.h, rx: 8, ry: 8,
    fill: style.fill, stroke: style.stroke, 'stroke-width': style.strokeWidth || 1.5
  }));

  if (n.kind === 'card') {
    var lname = state.listName[n.listId];
    if (lname) {
      var lt = svgEl('text', { x: 14, y: 17, 'class': 'node-list' });
      lt.textContent = trimTo(lname, 26).toUpperCase();
      g.appendChild(lt);
    }
  }

  var top = (n.kind === 'list') ? 14 : PAD_TOP;
  n.lines.forEach(function (line, i) {
    var text = svgEl('text', {
      x: 14, y: top + LINE_H * (i + 0.75),
      'class': 'node-label', fill: style.text,
      'font-weight': style.bold ? 700 : 500,
      'font-size': style.bold ? 14 : 13
    });
    text.textContent = line;
    g.appendChild(text);
  });

  // úchyty na čtyřech stranách
  [['l', 0, n.h / 2], ['r', NODE_W, n.h / 2], ['tp', NODE_W / 2, 0], ['b', NODE_W / 2, n.h]]
    .forEach(function (h) {
      var c = svgEl('circle', { 'class': 'handle', cx: h[1], cy: h[2], r: 6, 'data-h': h[0] });
      c.addEventListener('mousedown', function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        startLink(n, h[0]);
      });
      g.appendChild(c);
    });

  g.addEventListener('mousedown', function (ev) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    startNodeDrag(n, ev);
  });

  if (n.kind === 'card') {
    g.addEventListener('dblclick', function (ev) {
      ev.stopPropagation();
      openCard(n.card);
    });
  }

  return g;
}

function nodeStyle(n) {
  if (n.kind === 'list') {
    return { fill: BRAND.green, stroke: BRAND.green, text: BRAND.dark, strokeWidth: 2, bold: true };
  }
  if (state.colorByLabel && n.card.labels && n.card.labels.length) {
    var c = LABEL_COLORS[n.card.labels[0].color] || BRAND.blue;
    return { fill: '#fff', stroke: c, text: BRAND.dark, strokeWidth: 3 };
  }
  var overdue = n.card.due && !n.card.dueComplete && new Date(n.card.due) < new Date();
  return {
    fill: '#fff',
    stroke: overdue ? BRAND.pink : '#d5dae0',
    text: BRAND.dark,
    strokeWidth: overdue ? 2.5 : 1.5
  };
}

function svgEl(tag, attrs) {
  var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  return e;
}

function wrapText(text, maxChars, maxLines) {
  var words = String(text || '(bez názvu)').split(/\s+/), lines = [], cur = '';
  for (var i = 0; i < words.length; i++) {
    var next = cur ? cur + ' ' + words[i] : words[i];
    if (next.length > maxChars && cur) {
      lines.push(cur); cur = words[i];
      if (lines.length === maxLines) break;
    } else { cur = next; }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines) {
    var consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) lines[maxLines - 1] = trimTo(lines[maxLines - 1], maxChars - 1) + '…';
  }
  return lines.length ? lines : ['(bez názvu)'];
}

function trimTo(s, n) { return String(s).length > n ? String(s).slice(0, n) : String(s); }

function openCard(card) {
  var url = card.url || ('https://trello.com/c/' + (card.shortLink || card.id));
  try { window.open(url, '_blank', 'noopener'); }
  catch (e) { t.alert({ message: 'Kartu se nepodařilo otevřít.', duration: 5 }); }
}

/* ------------------------------------------------------------------ */
/* Spojnice                                                            */
/* ------------------------------------------------------------------ */

function addEdge(f, fh, tid, th) {
  if (f === tid) return;
  var exists = state.edges.some(function (e) {
    return (e.f === f && e.t === tid) || (e.f === tid && e.t === f);
  });
  if (exists) { t.alert({ message: 'Tyhle dvě karty už spojené jsou.', duration: 4 }); return; }

  state.edges.push({ f: f, fh: fh, t: tid, th: th });
  render();
  updateStatus();
  saveEdges();
}

function removeEdge(e) {
  var i = state.edges.indexOf(e);
  if (i < 0) return;
  state.edges.splice(i, 1);
  render();
  updateStatus();
  saveEdges();
}

function removeEdgesOf(cardId) {
  var before = state.edges.length;
  state.edges = state.edges.filter(function (e) { return e.f !== cardId && e.t !== cardId; });
  if (state.edges.length === before) return;
  render();
  updateStatus();
  saveEdges();
}

/* ------------------------------------------------------------------ */
/* Tažení uzlu a spojnice                                              */
/* ------------------------------------------------------------------ */

function startNodeDrag(n, ev) {
  var p = toCanvas(ev);
  state.drag = { node: n, dx: p.x - n.x, dy: p.y - n.y, moved: false };
  state.selected = n.id;
  el.btnDelete.disabled = false;
  highlightSelection();
}

function startLink(n, handle) {
  state.link = { from: n, fh: handle };
  el.wrap.classList.add('linking');
  el.hint.classList.add('show');
  el.hintText.textContent = 'Pusť nad jinou kartou. Escape zruší.';
}

function endLink(ev) {
  if (!state.link) return;
  var from = state.link.from, fh = state.link.fh;
  clearLink();

  var target = nodeUnderCursor(ev);
  if (!target || target.id === from.id) return;

  // úchyt cíle vybereme podle toho, odkud spojnice přilétá
  var a = HANDLES[fh](from);
  var th = 'l';
  var cx = target.x + NODE_W / 2, cy = target.y + target.h / 2;
  if (Math.abs(a.x - cx) > Math.abs(a.y - cy)) th = (a.x < cx) ? 'l' : 'r';
  else th = (a.y < cy) ? 'tp' : 'b';

  addEdge(from.id, fh, target.id, th);
}

function clearLink() {
  state.link = null;
  el.temp.removeAttribute('d');
  el.wrap.classList.remove('linking');
  el.hint.classList.remove('show');
  var prev = el.nodes.querySelector('.drop-target');
  if (prev) prev.classList.remove('drop-target');
}

function highlightSelection() {
  Array.prototype.forEach.call(el.nodes.querySelectorAll('.node'), function (g) {
    g.classList.toggle('selected', g.getAttribute('data-id') === state.selected);
  });
}

function nodeUnderCursor(ev) {
  var elem = document.elementFromPoint(ev.clientX, ev.clientY);
  while (elem && elem !== document.body) {
    if (elem.classList && elem.classList.contains('node')) {
      return state.nodeById[elem.getAttribute('data-id')] || null;
    }
    elem = elem.parentNode;
  }
  return null;
}

function toCanvas(ev) {
  var rect = el.wrap.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left - state.view.x) / state.view.k,
    y: (ev.clientY - rect.top  - state.view.y) / state.view.k
  };
}

function redrawNode(n) {
  var g = el.nodes.querySelector('[data-id="' + n.id + '"]');
  if (g) g.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
  // spojnice se překreslí celé, je jich málo
  el.edges.innerHTML = '';
  state.edges.forEach(drawEdge);
}

/* ------------------------------------------------------------------ */
/* Myš                                                                 */
/* ------------------------------------------------------------------ */

function applyView() {
  el.viewport.setAttribute('transform',
    'translate(' + state.view.x + ',' + state.view.y + ') scale(' + state.view.k + ')');
}

(function initPointer() {
  var panning = false, sx = 0, sy = 0, ox = 0, oy = 0;

  el.wrap.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || state.link || state.drag) return;
    panning = true; sx = e.clientX; sy = e.clientY; ox = state.view.x; oy = state.view.y;
    el.wrap.classList.add('panning');
    state.selected = null;
    el.btnDelete.disabled = true;
    highlightSelection();
  });

  window.addEventListener('mousemove', function (e) {
    if (state.link) {
      var f = state.link.from;
      var a = HANDLES[state.link.fh](f);
      var p = toCanvas(e);
      var mid = (a.x + p.x) / 2;
      el.temp.setAttribute('d', 'M' + a.x + ',' + a.y + ' C' + mid + ',' + a.y + ' ' + mid + ',' + p.y + ' ' + p.x + ',' + p.y);

      var prev = el.nodes.querySelector('.drop-target');
      if (prev) prev.classList.remove('drop-target');
      var over = nodeUnderCursor(e);
      if (over && over.id !== f.id) {
        var g = el.nodes.querySelector('[data-id="' + over.id + '"]');
        if (g) g.classList.add('drop-target');
      }
      return;
    }

    if (state.drag) {
      var q = toCanvas(e);
      var nx = Math.round((q.x - state.drag.dx) / GRID) * GRID;
      var ny = Math.round((q.y - state.drag.dy) / GRID) * GRID;
      if (nx !== state.drag.node.x || ny !== state.drag.node.y) state.drag.moved = true;
      state.drag.node.x = nx;
      state.drag.node.y = ny;
      redrawNode(state.drag.node);
      return;
    }

    if (!panning) return;
    state.view.x = ox + (e.clientX - sx);
    state.view.y = oy + (e.clientY - sy);
    applyView();
  });

  window.addEventListener('mouseup', function (e) {
    if (state.link) endLink(e);
    if (state.drag) {
      if (state.drag.moved) savePosition(state.drag.node);
      state.drag = null;
    }
    panning = false;
    el.wrap.classList.remove('panning');
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { clearLink(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      removeEdgesOf(state.selected);
    }
  });

  el.wrap.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = el.wrap.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var k = Math.min(2.5, Math.max(0.15, state.view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    state.view.x = mx - (mx - state.view.x) * (k / state.view.k);
    state.view.y = my - (my - state.view.y) * (k / state.view.k);
    state.view.k = k;
    applyView();
  }, { passive: false });
})();

function fitToScreen() {
  var box;
  try { box = el.viewport.getBBox(); } catch (e) { return; }
  if (!box || !box.width) return;
  var rect = el.wrap.getBoundingClientRect();
  var k = Math.max(Math.min((rect.width - 80) / box.width, (rect.height - 80) / box.height, 1.4), 0.12);
  state.view.k = k;
  state.view.x = (rect.width  - box.width  * k) / 2 - box.x * k;
  state.view.y = (rect.height - box.height * k) / 2 - box.y * k;
  applyView();
}

function focusOn(cardId) {
  var n = state.nodeById['c:' + cardId] || state.nodeById[cardId];
  if (!n) { fitToScreen(); return; }
  var rect = el.wrap.getBoundingClientRect();
  state.view.k = 1;
  state.view.x = rect.width / 2 - n.x - NODE_W / 2;
  state.view.y = rect.height / 2 - n.y - n.h / 2;
  state.selected = n.id;
  el.btnDelete.disabled = false;
  applyView();
  highlightSelection();
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function exportSvg() {
  var box = el.viewport.getBBox(), pad = 40;
  var clone = el.svg.cloneNode(true);
  clone.setAttribute('width', box.width + pad * 2);
  clone.setAttribute('height', box.height + pad * 2);
  clone.setAttribute('viewBox', (box.x - pad) + ' ' + (box.y - pad) + ' ' + (box.width + pad * 2) + ' ' + (box.height + pad * 2));
  var vp = clone.querySelector('#viewport');
  if (vp) vp.removeAttribute('transform');
  var tmp = clone.querySelector('#temp-edge');
  if (tmp) tmp.parentNode.removeChild(tmp);
  Array.prototype.forEach.call(clone.querySelectorAll('.edge-hit,.handle'), function (h) {
    h.parentNode.removeChild(h);
  });

  var style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = ".node-label{font-family:Figtree,Arial,sans-serif;font-size:13px}" +
                      ".node-list{font-family:Figtree,Arial,sans-serif;font-size:10px;font-weight:700;fill:#98a0aa}" +
                      ".edge{fill:none;stroke:#9aa3ad;stroke-width:2}";
  clone.insertBefore(style, clone.firstChild);

  var data = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  try {
    var blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'myslenkova-mapa-' + (state.board ? slug(state.board.name) : 'board') + '.svg';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  } catch (e) {
    console.error(e);
    t.alert({ message: 'Stažení se nepovedlo.', duration: 6 });
  }
}

function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'board';
}

/* ------------------------------------------------------------------ */
/* Ovládání                                                            */
/* ------------------------------------------------------------------ */

function plural(n, one, few, many) {
  return n + ' ' + (n === 1 ? one : (n >= 2 && n <= 4 ? few : many));
}

function setStatus(msg) { el.status.textContent = msg; }

function updateStatus() {
  var cardCount = state.nodes.filter(function (n) { return n.kind === 'card'; }).length;
  setStatus(plural(cardCount, 'karta', 'karty', 'karet') + ' · ' +
            plural(state.edges.length, 'spojnice', 'spojnice', 'spojnic'));
}

document.getElementById('opt-labels').addEventListener('change', function (e) {
  state.colorByLabel = e.target.checked;
  render();
});

document.getElementById('btn-arrange').addEventListener('click', arrangeAll);
document.getElementById('btn-fit').addEventListener('click', fitToScreen);
document.getElementById('btn-reload').addEventListener('click', function () { loadData().then(fitToScreen); });
document.getElementById('btn-export').addEventListener('click', exportSvg);
el.btnDelete.addEventListener('click', function () {
  if (state.selected) removeEdgesOf(state.selected);
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

var focusArg = t.arg('focus', null);
if (focusArg) state.focusId = focusArg;

loadData().then(function () {
  if (!state.focusId) fitToScreen();
});
