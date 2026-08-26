/* global TrelloPowerUp */

// Základní URL Power-Upu — odvozená z adresy tohoto iframu.
var BASE = window.location.href.replace(/\/[^\/]*(\?.*)?$/, '/');
var ICON = BASE + 'icon.svg';
var MAPA = './mapa.html?v=1';

TrelloPowerUp.initialize({

  // Tlačítko vpravo nahoře nad boardem
  'board-buttons': function (t) {
    return [{
      icon: { dark: ICON, light: ICON },
      text: 'Myšlenková mapa',
      callback: function (t) {
        return t.modal({
          url: MAPA,
          fullscreen: true,
          title: 'Myšlenková mapa'
        });
      }
    }];
  },

  // Tlačítko v detailu karty — otevře mapu a vycentruje ji na tuhle kartu
  'card-buttons': function (t) {
    return [{
      icon: ICON,
      text: 'Ukázat v mapě',
      callback: function (t) {
        var ctx = t.getContext() || {};
        return t.modal({
          url: MAPA,
          args: { focus: ctx.card || '' },
          fullscreen: true,
          title: 'Myšlenková mapa'
        });
      }
    }];
  }

});
