# Myšlenková mapa — Trello Power-Up

Vlastní Power-Up pro Dobré podlahy / BRASED EUROTEXTIL CZ. Vykreslí obsah Trello boardu
jako myšlenkovou mapu. Čistá statika — žádný server, žádná databáze, žádný build.

## Co to umí

- **Podle seznamů** — automatická mapa: board → seznamy → karty. Nic nenastavuješ, funguje hned.
- **Vlastní vazby** — karta se dá pověsit pod jinou kartu. Vazba se ukládá přímo do Trella
  (plugin data na kartě), takže ji vidí všichni v týmu a přežije zavření prohlížeče.
- Checklisty jako další úroveň větví (přepínatelné)
- Barvení uzlů podle prvního štítku karty
- Karty po termínu mají růžový rámeček
- Klik na uzel → otevře kartu v Trellu
- Tlačítko na kartě „Ukázat v mapě" → otevře mapu vycentrovanou na tuhle kartu
- Export do SVG (otevřeš v prohlížeči, vložíš do prezentace, vytiskneš)
- Posouvání myší, zoom kolečkem, tlačítko Vycentrovat

## Soubory

| Soubor | K čemu |
|---|---|
| `manifest.json` | Vizitka Power-Upu — jméno, ikona, co umí. Tuhle URL zadáváš do Trella. |
| `index.html` | Connector — neviditelný iframe, který běží na pozadí boardu. |
| `client.js` | Registrace tlačítek (nad boardem a na kartě). |
| `mindmap.html` | Vzhled okna s mapou. |
| `mindmap.js` | Veškerá logika — načtení dat, sestavení stromu, vykreslení. |
| `icon.svg` | Ikona v tlačítkách. |

## Nasazení na GitHub Pages (doporučeno)

1. Založ repozitář, např. `dobrepodlahy/trello-mindmap`. Může být **veřejný** — žádná firemní
   data v kódu nejsou, všechno se načítá z Trella za běhu.
2. Nahraj do něj obsah téhle složky (do rootu, ne do podsložky).
3. Settings → Pages → Source: `Deploy from a branch`, branch `main`, folder `/ (root)`. Ulož.
4. Za minutu dvě máš adresu ve tvaru
   `https://dobrepodlahy.github.io/trello-mindmap/manifest.json` — ověř si v prohlížeči,
   že se manifest načte.
5. Jdi na https://trello.com/power-ups/admin → **New** → vyber Workspace firmy → vyplň jméno
   a vlož URL manifestu z bodu 4.
6. Na boardu: Power-Ups → záložka **Custom** → přidej. Vpravo nahoře se objeví tlačítko
   „Myšlenková mapa".

Vyžaduje to jen HTTPS a statické soubory. Netlify, Vercel nebo firemní web fungují stejně —
GitHub Pages doporučuju kvůli tomu, že je zdarma, drží verze a nemá žádnou konfiguraci navíc.

## Vývoj a ladění

Trello si manifest cachuje. Když se změna neprojeví, dej v adminu **Refresh** u manifestu
nebo tvrdý reload boardu (Ctrl+Shift+R). Na ladění se hodí ngrok tunel s lokálním serverem —
URL tunelu zadáš do adminu místo GitHub Pages.

## Limity, o kterých je dobré vědět

- Power-Up vidí jen **otevřené karty aktuálního boardu**. Napříč boardy to nefunguje —
  na to už je potřeba REST API a token.
- Vlastní vazby se načítají dotazem na každou kartu. Na boardu s 300+ kartami to bude
  chvíli trvat (jednotky sekund). Režim „Podle seznamů" je okamžitý.
- Plugin data mají limit 4096 znaků na klíč. Tady ukládáme jedno ID na kartu, takže
  do limitu není šance narazit.
- Přesun uzlu v mapě **nepřesouvá kartu mezi seznamy** — mění jen vazbu v mapě.
  Kdyby to mělo hýbat i s kartami, potřebuje to REST API a autorizaci uživatele.
