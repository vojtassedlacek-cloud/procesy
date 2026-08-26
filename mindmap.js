/* global TrelloPowerUp */
'use strict';

var t = window.TrelloPowerUp.iframe();

/* ------------------------------------------------------------------ */
/* Konstanty vzhledu                                                   */
/* ------------------------------------------------------------------ */

var NODE_W   = 190;   // šířka uzlu
var LINE_H   = 17;    // výška řádku textu
var PAD_Y    = 10;    // vnitřní odsazení uzlu
var ROW_GAP  = 12;    // mezera mezi sourozenci
var COL_GAP  = 70;    // vodorovná mezera mezi úrovněmi
var MAX_LINES = 3;    // max. řádků v jednom uzlu

var BRAND = {
  green: '#bfd630',
  dark:  '#3d3f47',
  pink:  '#e50751',
  blue:  '#5bc2fd',
  brown: '#47423e'
};

// Trello barvy štítků -> hex (přibližné, stačí na odlišení)
var LABEL_COLORS = {
  green: '#61bd4f', yellow: '#f2d600', orange: '#ff9f1a', red: '#eb5a46',
  purple: '#c377e0', blue: '#0079bf', sky: '#00c2e0', lime: '#51e898',
  pink: '#ff78cb', black: '#344563'
};

/* ------------------------------------------------------------------ */
/* Stav                                                                */
/* ------------------------------------------------------------------ */

var state = {
  board: null,
  lists: [],
  cards: [],
  parents: {},        // { idKarty: idRodice }  – vlastní vazby uložené v Trellu
  mode: 'lists',
  showChecklists: false,
  colorByLabel: false,
  selectedId: null,
  linkingFrom: null,  // id karty, které hledáme nového rodiče
  focusId: null,
  view: { x: 40, y: 40, k: 1 }
};

var el = {
  svg:      document.getElementById('svg'),
  viewport: document.getElementById('viewport'),
  edges:    document.getElementById('edges'),
  nodes:    document.getElementById('nodes'),
  wrap:     document.getElementById('canvas-wrap'),
  status:   document.getElementById('status'),
  empty:    document.getElementById('empty'),
  hint:     document.getElementById('hint'),
  hintText: document.getElementById('hint-text')
};

/* ------------------------------------------------------------------ */
/* Načtení dat z Trella                                                */
/* ------------------------------------------------------------------ */

function loadData() {
  setStatus('Načítám data z boardu…');

  return Promise.all([
    t.board('id', 'name'),
    t.lists('id', 'name'),
    t.cards('id', 'name', 'idList', 'shortLink', 'labels', 'checklists', 'closed', 'due', 'dueComplete')
  ]).then(function (res) {
    state.board = res[0];
    state.lists = res[1] || [];
    state.cards = (res[2] || []).filter(function (c) { return !c.closed; });

    // Vlastní vazby čteme jen když jsou potřeba — je to volání na každou kartu.
    if (state.mode === 'custom') {
      return loadParents();
    }
  }).then(function () {
    render();
    setStatus(state.cards.length + ' karet · ' + state.lists.length + ' seznamů');
  }).catch(function (err) {
    console.error(err);
    setStatus('Chyba při načítání: ' + (err && err.message ? err.message : err));
  });
}

function loadParents() {
  setStatus('Načítám vlastní vazby…');
  var jobs = state.cards.map(function (c) {
    return t.get(c.id, 'shared', 'parent')
      .then(function (p) { return { id: c.id, parent: p || null }; })
      .catch(function () { return { id: c.id, parent: null }; });
  });
  return Promise.all(jobs).then(function (rows) {
    state.parents = {};
    rows.forEach(function (r) { if (r.parent) state.parents[r.id] = r.parent; });
  });
}

function saveParent(cardId, parentId) {
  var op = parentId
    ? t.set(cardId, 'shared', 'parent', parentId)
    : t.remove(cardId, 'shared', 'parent');

  return op.then(function () {
    if (parentId) state.parents[cardId] = parentId;
    else delete state.parents[cardId];
    render();
  }).catch(function (err) {
    console.error(err);
    t.alert({ message: 'Vazbu se nepodařilo uložit.', duration: 6 });
  });
}

/* ------------------------------------------------------------------ */
/* Sestavení stromu                                                    */
/* ------------------------------------------------------------------ */

function buildTree() {
  var root = node('board:' + state.board.id, state.board.name, 'root', null);

  if (state.mode === 'lists') {
    var byList = {};
    state.lists.forEach(function (l) {
      var n = node('list:' + l.id, l.name, 'list', null);
      byList[l.id] = n;
      root.children.push(n);
    });
    state.cards.forEach(function (c) {
      var parent = byList[c.idList];
      if (!parent) return;
      parent.children.push(cardNode(c));
    });
    // Prázdné seznamy do mapy netaháme
    root.children = root.children.filter(function (n) { return n.children.length > 0; });

  } else {
    var map = {};
    state.cards.forEach(function (c) { map[c.id] = cardNode(c); });

    state.cards.forEach(function (c) {
      var n = map[c.id];
      var pid = state.parents[c.id];
      if (pid && map[pid] && pid !== c.id && !createsCycle(c.id, pid)) {
        map[pid].children.push(n);
      } else {
        root.children.push(n);
      }
    });
  }

  if (state.showChecklists) addChecklists(root);
  return root;
}

function addChecklists(n) {
  if (n.card && n.card.checklists) {
    n.card.checklists.forEach(function (cl) {
      var clNode = node('cl:' + n.id + ':' + cl.id, cl.name, 'checklist', null);
      (cl.checkItems || []).forEach(function (item) {
        clNode.children.push(node('ci:' + item.id, item.name, 'checkitem', null, item.state === 'complete'));
      });
      n.children.push(clNode);
    });
  }
  n.children.forEach(addChecklists);
}

function cardNode(c) {
  var n = node('card:' + c.id, c.name, 'card', c);
  return n;
}

function node(id, name, kind, card, done) {
  return { id: id, name: name || '(bez názvu)', kind: kind, card: card, done: !!done, children: [] };
}

function createsCycle(childId, parentId) {
  var seen = {};
  var cur = parentId;
  while (cur) {
    if (cur === childId) return true;
    if (seen[cur]) return true;
    seen[cur] = true;
    cur = state.parents[cur];
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Layout — vodorovný strom zleva doprava                              */
/* ------------------------------------------------------------------ */

function layout(root) {
  var cursorY = 0;

  (function measure(n) {
    n.lines = wrapText(n.name, 24, MAX_LINES);
    n.w = NODE_W;
    n.h = n.lines.length * LINE_H + PAD_Y * 2;
    n.children.forEach(measure);
  })(root);

  (function place(n, depth) {
    n.x = depth * (NODE_W + COL_GAP);
    if (n.children.length === 0) {
      n.y = cursorY;
      cursorY += n.h + ROW_GAP;
    } else {
      n.children.forEach(function (c) { place(c, depth + 1); });
      var first = n.children[0];
      var last  = n.children[n.children.length - 1];
      n.y = (first.y + first.h / 2 + last.y + last.h / 2) / 2 - n.h / 2;
    }
  })(root, 0);

  return root;
}

function wrapText(text, maxChars, maxLines) {
  var words = String(text).split(/\s+/);
  var lines = [];
  var cur = '';
  for (var i = 0; i < words.length; i++) {
    var next = cur ? cur + ' ' + words[i] : words[i];
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines) {
    var joined = lines.join(' ');
    var consumed = joined.split(/\s+/).length;
    if (consumed < words.length) {
      lines[maxLines - 1] = trimTo(lines[maxLines - 1], maxChars - 1) + '…';
    }
  }
  return lines.length ? lines : ['(bez názvu)'];
}

function trimTo(s, n) { return s.length > n ? s.slice(0, n) : s; }

/* ------------------------------------------------------------------ */
/* Vykreslení                                                          */
/* ------------------------------------------------------------------ */

function render() {
  var root = layout(buildTree());

  el.edges.innerHTML = '';
  el.nodes.innerHTML = '';

  var hasContent = root.children.length > 0;
  el.empty.classList.toggle('show', !hasContent);

  (function draw(n) {
    n.children.forEach(function (c) {
      el.edges.appendChild(edge(n, c));
      draw(c);
    });
    el.nodes.appendChild(nodeEl(n));
  })(root);

  applyView();
  if (state.focusId) {
    focusOn('card:' + state.focusId);
    state.focusId = null;
  }
}

function edge(a, b) {
  var x1 = a.x + a.w, y1 = a.y + a.h / 2;
  var x2 = b.x,       y2 = b.y + b.h / 2;
  var mid = (x1 + x2) / 2;
  var p = svgEl('path', {
    'class': 'edge',
    d: 'M' + x1 + ',' + y1 + ' C' + mid + ',' + y1 + ' ' + mid + ',' + y2 + ' ' + x2 + ',' + y2
  });
  return p;
}

function nodeEl(n) {
  var g = svgEl('g', {
    'class': 'node-box' + (state.selectedId === n.id ? ' selected' : ''),
    transform: 'translate(' + n.x + ',' + n.y + ')',
    'data-id': n.id
  });

  var style = nodeStyle(n);
  g.appendChild(svgEl('rect', {
    width: n.w, height: n.h, rx: 6, ry: 6,
    fill: style.fill, stroke: style.stroke, 'stroke-width': style.strokeWidth || 1.5
  }));

  n.lines.forEach(function (line, i) {
    var text = svgEl('text', {
      x: 12,
      y: PAD_Y + LINE_H * (i + 0.75),
      'class': 'node-label',
      fill: style.text,
      'font-weight': n.kind === 'root' ? 700 : (n.kind === 'list' ? 700 : 500),
      'text-decoration': n.done ? 'line-through' : 'none'
    });
    text.textContent = line;
    g.appendChild(text);
  });

  g.addEventListener('click', function (ev) {
    ev.stopPropagation();
    onNodeClick(n, ev);
  });

  return g;
}

function nodeStyle(n) {
  if (n.kind === 'root')  return { fill: BRAND.dark,  stroke: BRAND.dark,  text: '#fff' };
  if (n.kind === 'list')  return { fill: BRAND.green, stroke: BRAND.green, text: BRAND.dark };
  if (n.kind === 'checklist') return { fill: '#eef1f4', stroke: '#cfd6dd', text: BRAND.brown };
  if (n.kind === 'checkitem') return { fill: '#ffffff', stroke: '#e2e6ea', text: BRAND.brown };

  // karta
  if (state.colorByLabel && n.card && n.card.labels && n.card.labels.length) {
    var c = LABEL_COLORS[n.card.labels[0].color] || BRAND.blue;
    return { fill: '#fff', stroke: c, text: BRAND.dark, strokeWidth: 3 };
  }
  var overdue = n.card && n.card.due && !n.card.dueComplete && new Date(n.card.due) < new Date();
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

/* ------------------------------------------------------------------ */
/* Interakce s uzly                                                    */
/* ------------------------------------------------------------------ */

function onNodeClick(n, ev) {
  // Režim "vyber nového rodiče"
  if (state.linkingFrom) {
    var targetId = null;
    if (n.kind === 'card') targetId = n.card.id;
    else if (n.kind === 'root') targetId = null;      // odpojit na kořen
    else { t.alert({ message: 'Kartu jde připojit jen pod jinou kartu nebo pod kořen mapy.', duration: 5 }); return; }

    if (targetId === state.linkingFrom) { cancelLinking(); return; }
    if (targetId && createsCycle(state.linkingFrom, targetId)) {
      t.alert({ message: 'Takhle by vznikl kruh. Vyber jiný uzel.', duration: 5 });
      return;
    }
    var from = state.linkingFrom;
    cancelLinking();
    saveParent(from, targetId);
    return;
  }

  state.selectedId = n.id;

  if (n.kind !== 'card') { render(); return; }

  var items = [{
    text: 'Otevřít kartu',
    callback: function (tt) {
      tt.showCard(n.card.shortLink || n.card.id);
      return tt.closePopup();
    }
  }];

  if (state.mode === 'custom') {
    items.push({
      text: 'Připojit pod jiný uzel…',
      callback: function (tt) {
        startLinking(n.card.id, n.name);
        return tt.closePopup();
      }
    });
    if (state.parents[n.card.id]) {
      items.push({
        text: 'Odpojit (dát na kořen)',
        callback: function (tt) {
          saveParent(n.card.id, null);
          return tt.closePopup();
        }
      });
    }
  } else {
    items.push({
      text: 'Vazby jdou měnit v režimu „Vlastní vazby“',
      callback: function (tt) { return tt.closePopup(); }
    });
  }

  render();
  t.popup({ title: trimTo(n.name, 40), items: items, mouseEvent: ev });
}

function startLinking(cardId, name) {
  state.linkingFrom = cardId;
  el.wrap.classList.add('linking');
  el.hint.classList.add('show');
  el.hintText.textContent = 'Klikni na uzel, pod který se má „' + trimTo(name, 40) + '“ připojit. Kořen mapy = odpojit.';
}

function cancelLinking() {
  state.linkingFrom = null;
  el.wrap.classList.remove('linking');
  el.hint.classList.remove('show');
}

/* ------------------------------------------------------------------ */
/* Posouvání a zoom                                                    */
/* ------------------------------------------------------------------ */

function applyView() {
  el.viewport.setAttribute('transform',
    'translate(' + state.view.x + ',' + state.view.y + ') scale(' + state.view.k + ')');
}

(function initPanZoom() {
  var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

  el.wrap.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    dragging = true; sx = e.clientX; sy = e.clientY; ox = state.view.x; oy = state.view.y;
    el.wrap.classList.add('panning');
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    state.view.x = ox + (e.clientX - sx);
    state.view.y = oy + (e.clientY - sy);
    applyView();
  });
  window.addEventListener('mouseup', function () {
    dragging = false; el.wrap.classList.remove('panning');
  });

  el.wrap.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = el.wrap.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    var k = Math.min(2.5, Math.max(0.15, state.view.k * factor));
    state.view.x = mx - (mx - state.view.x) * (k / state.view.k);
    state.view.y = my - (my - state.view.y) * (k / state.view.k);
    state.view.k = k;
    applyView();
  }, { passive: false });

  el.wrap.addEventListener('click', function () {
    if (state.linkingFrom) cancelLinking();
  });
})();

function fitToScreen() {
  var box;
  try { box = el.viewport.getBBox(); } catch (e) { return; }
  if (!box || !box.width) return;
  var rect = el.wrap.getBoundingClientRect();
  var k = Math.min((rect.width - 60) / box.width, (rect.height - 60) / box.height, 1.4);
  k = Math.max(k, 0.12);
  state.view.k = k;
  state.view.x = (rect.width  - box.width  * k) / 2 - box.x * k;
  state.view.y = (rect.height - box.height * k) / 2 - box.y * k;
  applyView();
}

function focusOn(nodeId) {
  var g = el.nodes.querySelector('[data-id="' + nodeId + '"]');
  if (!g) { fitToScreen(); return; }
  var m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform'));
  if (!m) { fitToScreen(); return; }
  var rect = el.wrap.getBoundingClientRect();
  state.view.k = 1;
  state.view.x = rect.width / 2 - parseFloat(m[1]) - NODE_W / 2;
  state.view.y = rect.height / 2 - parseFloat(m[2]);
  state.selectedId = nodeId;
  applyView();
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function exportSvg() {
  var box = el.viewport.getBBox();
  var pad = 30;
  var clone = el.svg.cloneNode(true);
  clone.setAttribute('width', box.width + pad * 2);
  clone.setAttribute('height', box.height + pad * 2);
  clone.setAttribute('viewBox', (box.x - pad) + ' ' + (box.y - pad) + ' ' + (box.width + pad * 2) + ' ' + (box.height + pad * 2));
  var vp = clone.querySelector('#viewport');
  if (vp) vp.removeAttribute('transform');

  var style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = ".node-label{font-family:Figtree,Arial,sans-serif;font-size:13px}" +
                      ".edge{fill:none;stroke:#c3c6cc;stroke-width:2}";
  clone.insertBefore(style, clone.firstChild);

  var data = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  try {
    var blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'mysenkova-mapa-' + (state.board ? slug(state.board.name) : 'board') + '.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  } catch (e) {
    console.error(e);
    t.alert({ message: 'Stažení se nepovedlo — zkus to v prohlížeči mimo Trello.', duration: 6 });
  }
}

function slug(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'board';
}

/* ------------------------------------------------------------------ */
/* Ovládací prvky                                                      */
/* ------------------------------------------------------------------ */

function setStatus(msg) { el.status.textContent = msg; }

document.getElementById('mode').addEventListener('change', function (e) {
  state.mode = e.target.value;
  cancelLinking();
  if (state.mode === 'custom' && Object.keys(state.parents).length === 0) {
    loadParents().then(function () { render(); setStatus('Vlastní vazby načteny'); });
  } else {
    render();
  }
});

document.getElementById('opt-checklists').addEventListener('change', function (e) {
  state.showChecklists = e.target.checked;
  render();
});

document.getElementById('opt-labels').addEventListener('change', function (e) {
  state.colorByLabel = e.target.checked;
  render();
});

document.getElementById('btn-fit').addEventListener('click', fitToScreen);
document.getElementById('btn-reload').addEventListener('click', function () { loadData().then(fitToScreen); });
document.getElementById('btn-export').addEventListener('click', exportSvg);
document.getElementById('hint-cancel').addEventListener('click', cancelLinking);

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

var focusArg = t.arg('focus', null);
if (focusArg) state.focusId = focusArg;

loadData().then(function () {
  if (!state.focusId) fitToScreen();
});
