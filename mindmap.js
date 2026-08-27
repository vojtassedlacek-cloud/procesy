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

var PALETTE = [
  { key: '',       fill: '#ffffff', stroke: '#d5dae0', text: '#3d3f47', name: 'Bílá' },
  { key: 'green',  fill: '#bfd630', stroke: '#a8bd22', text: '#3d3f47', name: 'Brand zelená' },
  { key: 'dark',   fill: '#3d3f47', stroke: '#3d3f47', text: '#ffffff', name: 'Tmavá' },
  { key: 'blue',   fill: '#5bc2fd', stroke: '#38a8e8', text: '#3d3f47', name: 'Modrá' },
  { key: 'pink',   fill: '#e50751', stroke: '#c00544', text: '#ffffff', name: 'Růžová' },
  { key: 'wine',   fill: '#a31d03', stroke: '#821702', text: '#ffffff', name: 'Vínová' },
  { key: 'brown',  fill: '#47423e', stroke: '#47423e', text: '#ffffff', name: 'Hnědošedá' },
  { key: 'mint',   fill: '#e8f4c4', stroke: '#c9dd8a', text: '#3d3f47', name: 'Světle zelená' },
  { key: 'sky',    fill: '#ddf1ff', stroke: '#a9d9f7', text: '#3d3f47', name: 'Světle modrá' },
  { key: 'rose',   fill: '#ffe0ea', stroke: '#f5b3c6', text: '#3d3f47', name: 'Světle růžová' },
  { key: 'sand',   fill: '#fdf0d5', stroke: '#e8cf9a', text: '#3d3f47', name: 'Písková' },
  { key: 'gray',   fill: '#eef1f4', stroke: '#cfd6dd', text: '#3d3f47', name: 'Šedá' }
];
var PALETTE_BY_KEY = {};
PALETTE.forEach(function (c) { PALETTE_BY_KEY[c.key] = c; });

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
  colors: {},           // { idUzlu: klic barvy }
  maps: [],             // [{ id, name }]
  mapId: null,          // otevřená mapa
  saveTimer: null,
  texts: []             // vlastní textové uzly mimo Trello
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
  btnDelete:document.getElementById('btn-delete'),
  chooser:  document.getElementById('chooser'),
  mapList:  document.getElementById('map-list'),
  mapName:  document.getElementById('map-name'),
  editor:   document.getElementById('editor')
};

/* ------------------------------------------------------------------ */
/* Načtení dat                                                         */
/* ------------------------------------------------------------------ */

function loadData() {
  setStatus('Načítám data…');

  return Promise.all([
    t.board('id', 'name'),
    t.lists('id', 'name'),
    t.cards('id', 'name', 'idList', 'shortLink', 'url', 'labels', 'members', 'badges', 'closed', 'due', 'dueComplete')
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
      var hasLabels = !!(c.labels && c.labels.length);
      var top = (hasLabels ? 14 : 0) + PAD_TOP;
      var h = top + lines.length * LINE_H + (badgeText(c) ? 16 : 0) + PAD_BOT;
      state.nodes.push({
        id: 'c:' + c.id, kind: 'card', listId: c.idList, name: c.name, card: c,
        lines: lines, top: top, hasLabels: hasLabels, h: h, x: null, y: null
      });
    });

    state.nodeById = {};
    state.nodes.forEach(function (n) { state.nodeById[n.id] = n; });

    return loadMapList();
  }).then(function () {
    if (state.focusId && state.maps.length) return openMap(state.maps[0].id);
    showChooser();
  }).catch(function (err) {
    console.error(err);
    setStatus('Chyba při načítání: ' + (err && err.message ? err.message : err));
  });
}

/* ------------------------------------------------------------------ */
/* Uložené mapy                                                        */
/* ------------------------------------------------------------------ */

function loadMapList() {
  return t.get('board', 'shared', 'maps').then(function (list) {
    state.maps = Array.isArray(list) ? list : [];
  }).catch(function () { state.maps = []; });
}

function saveMapList() {
  return t.set('board', 'shared', 'maps', state.maps).catch(function (err) {
    console.error(err);
    t.alert({ message: 'Seznam map se nepodařilo uložit.', duration: 5 });
  });
}

// Data mapy jsou rozsekaná do klíčů kvůli limitu 4096 znaků na klíč.
function loadMapData(id) {
  var jobs = [];
  for (var i = 0; i < 10; i++) jobs.push(t.get('board', 'shared', 'm_' + id + '_' + i).catch(function () { return null; }));
  return Promise.all(jobs).then(function (parts) {
    var raw = parts.filter(function (p) { return typeof p === 'string'; }).join('');
    if (!raw) return { p: {}, e: [], c: {} };
    try { return JSON.parse(raw); }
    catch (err) { console.error(err); return { p: {}, e: [], c: {} }; }
  });
}

function saveMapData() {
  if (!state.mapId) return Promise.resolve();
  var data = { p: {}, e: [], c: state.colors, t: state.texts.map(function (x) {
    return { i: x.id, x: x.x, y: x.y, s: x.text };
  }) };
  state.nodes.forEach(function (n) {
    if (n.x !== null) data.p[n.id] = [n.x, n.y];
  });
  state.edges.forEach(function (e) { data.e.push([e.f, e.fh, e.t, e.th]); });

  var raw = JSON.stringify(data);
  var jobs = [];
  for (var i = 0; i < 10; i++) {
    var part = raw.slice(i * 3400, (i + 1) * 3400);
    if (part) jobs.push(t.set('board', 'shared', 'm_' + state.mapId + '_' + i, part));
    else jobs.push(t.remove('board', 'shared', 'm_' + state.mapId + '_' + i).catch(function () {}));
  }
  return Promise.all(jobs).catch(function (err) {
    console.error(err);
    t.alert({ message: 'Mapu se nepodařilo uložit.', duration: 6 });
  });
}

function scheduleSave() {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(function () {
    state.saveTimer = null;
    saveMapData();
  }, 700);
}

function openMap(id) {
  var meta = state.maps.filter(function (m) { return m.id === id; })[0];
  if (!meta) { showChooser(); return Promise.resolve(); }
  state.mapId = id;
  el.mapName.textContent = meta.name;
  setStatus('Načítám mapu…');

  return loadMapData(id).then(function (data) {
    state.texts = (data.t || []).map(function (x) {
      return { id: x.i, x: x.x, y: x.y, text: x.s || '' };
    });
    rebuildTextNodes();

    state.nodes.forEach(function (n) {
      var p = data.p[n.id];
      if (p) { n.x = p[0]; n.y = p[1]; }
      else { n.x = null; n.y = null; }
    });
    state.edges = (data.e || []).filter(function (a) {
      return state.nodeById[a[0]] && state.nodeById[a[2]];
    }).map(function (a) {
      return { f: a[0], fh: a[1], t: a[2], th: a[3] };
    });
    state.colors = data.c || {};

    autoPlaceMissing();
    hideChooser();
    render();
    updateStatus();
    fitToScreen();
  });
}

function createMap(template) {
  var name = window.prompt('Název nové mapy:', 'Mapa ' + (state.maps.length + 1));
  if (name === null) return;
  name = (name || '').trim() || ('Mapa ' + (state.maps.length + 1));

  var id = 'm' + Date.now().toString(36);
  state.maps.push({ id: id, name: name });
  state.mapId = id;
  el.mapName.textContent = name;

  state.colors = {};
  state.edges = [];
  state.texts = [];
  rebuildTextNodes();
  state.nodes.forEach(function (n) { n.x = null; n.y = null; });

  applyTemplate(template);
  hideChooser();
  render();
  updateStatus();
  fitToScreen();

  saveMapList();
  saveMapData();
}

function renameMap(id) {
  var meta = state.maps.filter(function (m) { return m.id === id; })[0];
  if (!meta) return;
  var name = window.prompt('Nový název mapy:', meta.name);
  if (name === null) return;
  meta.name = (name || '').trim() || meta.name;
  if (state.mapId === id) el.mapName.textContent = meta.name;
  saveMapList().then(renderMapList);
}

function deleteMap(id) {
  var meta = state.maps.filter(function (m) { return m.id === id; })[0];
  if (!meta) return;
  if (!window.confirm('Opravdu smazat mapu „' + meta.name + '“? Karty v Trellu to nijak nezmění.')) return;

  state.maps = state.maps.filter(function (m) { return m.id !== id; });
  var jobs = [];
  for (var i = 0; i < 10; i++) jobs.push(t.remove('board', 'shared', 'm_' + id + '_' + i).catch(function () {}));
  Promise.all(jobs).then(saveMapList).then(renderMapList);
  if (state.mapId === id) { state.mapId = null; showChooser(); }
}

/* --- textové uzly --------------------------------------------------- */

// Textové uzly nejsou karty — žijí jen v mapě. Po každé změně je promítneme
// do seznamu uzlů, aby se chovaly stejně jako karty (tažení, spojnice, barvy).
function rebuildTextNodes() {
  state.nodes = state.nodes.filter(function (n) { return n.kind !== 'text'; });
  state.texts.forEach(function (x) {
    var lines = wrapText(x.text || 'Klikni dvakrát a piš…', 26, 6);
    state.nodes.push({
      id: x.id, kind: 'text', listId: null, name: x.text, card: null, ref: x,
      lines: lines, top: 14, hasLabels: false,
      h: 14 + lines.length * LINE_H + PAD_BOT, x: x.x, y: x.y
    });
  });
  state.nodeById = {};
  state.nodes.forEach(function (n) { state.nodeById[n.id] = n; });
}

function addTextNode() {
  if (!state.mapId) return;
  var rect = el.wrap.getBoundingClientRect();
  var cx = (rect.width / 2 - state.view.x) / state.view.k;
  var cy = (rect.height / 2 - state.view.y) / state.view.k;

  var x = { id: 'x' + Date.now().toString(36), x: Math.round(cx / GRID) * GRID, y: Math.round(cy / GRID) * GRID, text: '' };
  state.texts.push(x);
  rebuildTextNodes();
  render();
  scheduleSave();
  startEdit(state.nodeById[x.id]);
}

function startEdit(n) {
  if (!n || n.kind !== 'text') return;
  var ed = el.editor;
  ed.value = n.ref.text || '';
  ed.style.left   = (n.x * state.view.k + state.view.x) + 'px';
  ed.style.top    = (n.y * state.view.k + state.view.y) + 'px';
  ed.style.width  = (NODE_W * state.view.k) + 'px';
  ed.style.height = Math.max(n.h * state.view.k, 46) + 'px';
  ed.style.fontSize = (13 * state.view.k) + 'px';
  ed.classList.add('show');
  ed.focus();
  ed.select();

  function finish(save) {
    ed.classList.remove('show');
    ed.onblur = null;
    ed.onkeydown = null;
    if (save) {
      var v = ed.value.trim();
      if (!v) {
        state.texts = state.texts.filter(function (x) { return x.id !== n.id; });
        state.edges = state.edges.filter(function (e) { return e.f !== n.id && e.t !== n.id; });
      } else {
        n.ref.text = v;
      }
      rebuildTextNodes();
      render();
      scheduleSave();
    }
  }

  ed.onblur = function () { finish(true); };
  ed.onkeydown = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
  };
}

function deleteTextNode(id) {
  state.texts = state.texts.filter(function (x) { return x.id !== id; });
  state.edges = state.edges.filter(function (e) { return e.f !== id && e.t !== id; });
  rebuildTextNodes();
  render();
  scheduleSave();
}

/* --- šablony ------------------------------------------------------- */

function applyTemplate(kind) {
  autoPlaceMissing();
  if (kind === 'grid') return;

  if (kind === 'lists') {
    state.nodes.forEach(function (n) {
      if (n.kind !== 'card') return;
      var lnode = state.nodeById['l:' + n.listId];
      if (lnode) state.edges.push({ f: lnode.id, fh: 'b', t: n.id, th: 'tp' });
    });
    return;
  }

  if (kind === 'flow') {
    // karty za sebou v jedné řadě, propojené podle pořadí
    var cards = state.nodes.filter(function (n) { return n.kind === 'card'; });
    var x = 0;
    cards.forEach(function (n, i) {
      n.x = x;
      n.y = 0;
      x += NODE_W + COL_GAP;
      if (i > 0) state.edges.push({ f: cards[i - 1].id, fh: 'r', t: n.id, th: 'l' });
    });
    // hlavičky seznamů nad řadu
    var lx = 0;
    state.nodes.forEach(function (n) {
      if (n.kind !== 'list') return;
      n.x = lx; n.y = -160; lx += NODE_W + COL_GAP;
    });
  }
}

/* --- úvodní obrazovka ---------------------------------------------- */

function showChooser() {
  state.mapId = null;
  el.mapName.textContent = '';
  el.chooser.classList.add('show');
  renderMapList();
  setStatus('');
}

function hideChooser() { el.chooser.classList.remove('show'); }

function renderMapList() {
  el.mapList.innerHTML = '';
  if (!state.maps.length) {
    var note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'Zatím tu žádná mapa není. Založ si první níže.';
    el.mapList.appendChild(note);
    return;
  }
  state.maps.forEach(function (m) {
    var row = document.createElement('div');
    row.className = 'map-row';

    var nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = m.name;
    row.appendChild(nm);

    [['Otevřít', function () { openMap(m.id); }],
     ['Přejmenovat', function () { renameMap(m.id); }],
     ['Smazat', function () { deleteMap(m.id); }]].forEach(function (b) {
      var btn = document.createElement('button');
      btn.textContent = b[0];
      btn.addEventListener('click', b[1]);
      row.appendChild(btn);
    });

    el.mapList.appendChild(row);
  });
}


// Seznam není karta, plugin data se na něj uložit nedají — držíme je na boardu.


function saveColors() { scheduleSave(); }

function setColor(key) {
  if (!state.selected) return;
  if (key) state.colors[state.selected] = key;
  else delete state.colors[state.selected];
  render();
  saveColors();
}


// Hrany jsou uložené na boardu, rozsekané do několika klíčů kvůli limitu 4096 znaků.

function saveEdges() { scheduleSave(); }


function savePosition() { scheduleSave(); }

/* Karty bez uložené pozice se rozloží do sloupců podle seznamů. */
function autoPlaceMissing() {
  // textové uzly mají pozici vždy, rozmisťujeme jen karty a hlavičky
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
  updateStatus();
  fitToScreen();
  scheduleSave();
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
    // barevné proužky štítků
    if (n.hasLabels) {
      n.card.labels.slice(0, 6).forEach(function (lab, i) {
        g.appendChild(svgEl('rect', {
          x: 14 + i * 34, y: 8, width: 28, height: 7, rx: 3.5, ry: 3.5,
          fill: LABEL_COLORS[lab.color] || '#b3bac5'
        }));
      });
    }
    var lname = state.listName[n.listId];
    if (lname) {
      var lt = svgEl('text', { x: 14, y: (n.hasLabels ? 31 : 17), 'class': 'node-list' });
      lt.textContent = trimTo(lname, 26).toUpperCase();
      g.appendChild(lt);
    }
  }

  var top = (n.kind === 'list') ? 14 : n.top;
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

  if (n.kind === 'card') {
    var bt = badgeText(n.card);
    if (bt) {
      var bel = svgEl('text', {
        x: 14, y: n.h - PAD_BOT - 2, 'class': 'node-badges', fill: style.text, opacity: 0.75
      });
      bel.textContent = bt;
      g.appendChild(bel);
    }
  }

  // úchyty na čtyřech stranách
  [['l', 0, n.h / 2], ['r', NODE_W, n.h / 2], ['tp', NODE_W / 2, 0], ['b', NODE_W / 2, n.h]]
    .forEach(function (h) {
      // neviditelný větší terč, ať se úchyt dá pohodlně trefit
      var hit = svgEl('circle', {
        'class': 'handle-hit', cx: h[1], cy: h[2], r: 13,
        fill: 'transparent', 'data-h': h[0]
      });
      hit.addEventListener('mousedown', function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        startLink(n, h[0]);
      });
      g.appendChild(hit);

      g.appendChild(svgEl('circle', {
        'class': 'handle', cx: h[1], cy: h[2], r: 6, 'data-h': h[0]
      }));
    });

  g.addEventListener('mousedown', function (ev) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    startNodeDrag(n, ev);
  });

  g.addEventListener('dblclick', function (ev) {
    ev.stopPropagation();
    if (n.kind === 'card') openCard(n.card);
    else if (n.kind === 'text') startEdit(n);
  });

  return g;
}

// Termín, checklisty, komentáře a přílohy do jednoho řádku pod názvem.
function badgeText(card) {
  var parts = [];
  var b = card.badges || {};
  if (card.due) {
    var d = new Date(card.due);
    parts.push('📅 ' + d.getDate() + '. ' + (d.getMonth() + 1) + '.');
  }
  if (b.checkItems) parts.push('☑ ' + (b.checkItemsChecked || 0) + '/' + b.checkItems);
  if (b.comments) parts.push('💬 ' + b.comments);
  if (b.attachments) parts.push('📎 ' + b.attachments);
  if (b.description) parts.push('≡');
  if (card.members && card.members.length) {
    parts.push(card.members.map(function (m) {
      return m.initials || (m.fullName || m.username || '?').slice(0, 2).toUpperCase();
    }).join(' '));
  }
  return parts.join('   ');
}

function nodeStyle(n) {
  var own = state.colors[n.id];
  if (!own && n.kind === 'text') {
    return { fill: '#fdf0d5', stroke: '#e8cf9a', text: BRAND.dark, strokeWidth: 1.5 };
  }
  if (own && PALETTE_BY_KEY[own]) {
    var c = PALETTE_BY_KEY[own];
    return { fill: c.fill, stroke: c.stroke, text: c.text, strokeWidth: 2, bold: n.kind === 'list' };
  }
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
  setPaletteEnabled(true);
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

  // Pustil-li uživatel přímo na úchytu, bereme ten. Jinak stranu, která je
  // nejblíž místu puštění — ne stranu odhadnutou ze středu uzlu.
  var hit = handleUnderCursor(ev);
  var target, th;

  if (hit && hit.node) {
    target = hit.node;
    th = hit.h;
  } else {
    target = nodeUnderCursor(ev);
    if (!target) return;
    th = nearestSide(target, toCanvas(ev));
  }

  if (target.id === from.id) return;
  addEdge(from.id, fh, target.id, th);
}

function nearestSide(n, p) {
  var d = {
    l:  Math.abs(p.x - n.x),
    r:  Math.abs(p.x - (n.x + NODE_W)),
    tp: Math.abs(p.y - n.y),
    b:  Math.abs(p.y - (n.y + n.h))
  };
  var best = 'l';
  Object.keys(d).forEach(function (k) { if (d[k] < d[best]) best = k; });
  return best;
}

function handleUnderCursor(ev) {
  var elem = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!elem || !elem.classList) return null;
  if (!elem.classList.contains('handle') && !elem.classList.contains('handle-hit')) return null;
  var g = elem.parentNode;
  if (!g || !g.getAttribute) return null;
  return { node: state.nodeById[g.getAttribute('data-id')] || null, h: elem.getAttribute('data-h') || 'l' };
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
    setPaletteEnabled(false);
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
      var dn = state.drag.node;
      if (dn.kind === 'text' && dn.ref) { dn.ref.x = dn.x; dn.ref.y = dn.y; }
      if (state.drag.moved) savePosition(state.drag.node);
      state.drag = null;
    }
    panning = false;
    el.wrap.classList.remove('panning');
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { clearLink(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      if (el.editor.classList.contains('show')) return;
      var sel = state.nodeById[state.selected];
      if (sel && sel.kind === 'text') deleteTextNode(sel.id);
      else removeEdgesOf(state.selected);
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

// paleta v liště
var paletteWrap = document.getElementById('palette');
PALETTE.forEach(function (c) {
  var b = document.createElement('button');
  b.className = 'swatch';
  b.title = c.name;
  b.style.background = c.fill;
  b.style.borderColor = c.stroke;
  b.disabled = true;
  b.addEventListener('click', function () { setColor(c.key); });
  paletteWrap.appendChild(b);
});

function setPaletteEnabled(on) {
  Array.prototype.forEach.call(paletteWrap.querySelectorAll('.swatch'), function (b) {
    b.disabled = !on;
  });
}

document.getElementById('btn-maps').addEventListener('click', function () {
  if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; saveMapData(); }
  showChooser();
});

Array.prototype.forEach.call(document.querySelectorAll('.tpl'), function (b) {
  b.addEventListener('click', function () { createMap(b.getAttribute('data-tpl')); });
});

document.getElementById('btn-text').addEventListener('click', addTextNode);
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

loadData();
