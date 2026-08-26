/* global TrelloPowerUp */

// Základní URL Power-Upu — odvozená z adresy tohoto iframu.
// Díky tomu funguje kód stejně na GitHub Pages, na vlastním serveru i lokálně.
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
          title: 'Myšlenková mapa',
          accentColor: 'bfd630'
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
        return t.card('id').then(function (card) {
          return t.modal({
            url: './mindmap.html',
            args: { focus: card.id },
            fullscreen: true,
            title: 'Myšlenková mapa',
            accentColor: 'bfd630'
          });
        });
      }
    }];
  }

});
