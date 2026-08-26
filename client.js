/* global TrelloPowerUp */

// Základní URL Power-Upu — odvozená z adresy tohoto iframu.
var BASE = window.location.href.replace(/\/[^\/]*(\?.*)?$/, '/');
var ICON = BASE + 'icon.svg';

TrelloPowerUp.initialize({

  // Tlačítko vpravo nahoře nad boardem — otevře mapu přes celou obrazovku
  'board-buttons': function (t) {
    return [{
      icon: {
        dark: ICON,
        light: ICON
      },
      text: 'Myšlenková mapa',
      callback: function (t) {
        return t.modal({
          url: './mindmap.html',
          fullscreen: true,
          title: 'Myšlenková mapa'
        });
      }
    }];
  },

  // Tlačítko v detailu karty — otevře mapu a vycentruje ji na tuhle kartu.
  // Kontext bereme synchronně přes getContext(), protože uvnitř .then()
  // Power-Up ztrácí kontext a modal se pak neotevře.
  'card-buttons': function (t) {
    return [{
      icon: ICON,
      text: 'Ukázat v mapě',
      callback: function (t) {
        var ctx = t.getContext() || {};
        return t.modal({
          url: './mindmap.html',
          args: { focus: ctx.card || '' },
          fullscreen: true,
          title: 'Myšlenková mapa'
        });
      }
    }];
  }

});
