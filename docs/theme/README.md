# Theme — Signal Graphite

Tema activă a aplicației web (înlocuiește vechea temă „olive glass" `#181f13`/`#b7df8a`).
Aprobată 2026-09-16; preview original: `tmp/design-preview/theme-signal-graphite.html` (local, gitignored).

## Principii

- Suprafețe grafit neutre (fără tentă olive), hairlines de 1px, radii 12–14px, fără glass/blur în exces.
- Accent **lime `#C8F169`** doar pe interactiv și brand (nav activ, chips selectate, CTA, cifre cheie).
- Culori semantice de date: **up `#3DDC97`**, **down `#FF6B8A`**, **warn `#FFC24B`**, **info `#6FC7FF`**, **AI `#A78BFA`**.
- Tipografie: Inter (UI) + JetBrains Mono (numerice/micro-label-uri), `tabular-nums` forțat de `.font-mono`.
- Floor de lizibilitate pentru texte noi: ≥ 12px (micro-label-urile existente de 9–11px rămân, dar nu coborî sub).

## Fișiere

| Fișier | Rol |
|---|---|
| `apps/web/tailwind.config.js` | Maparea rolurilor de culoare (numele istorice cyan/blue/purple/... rămân; doar hex-urile se schimbă) |
| `apps/web/src/index.css` | Sistemul global: suprafețe, sidebar, tabel, dock mobil, intelligence, AI prose |
| `apps/web/index.html` | theme-color + încărcarea fonturilor |
| `docs/theme/signal-graphite.palette.json` | Paleta (doar hex-uri) — editează aici întâi |

## Cum se aplică o schimbare de paletă

1. Editează `signal-graphite.palette.json`.
2. Actualizează hex-urile în `tailwind.config.js` (scalele) și `index.css` (Căutare: valorile vechi).
3. Hex-uri hardcodate în componente (`apps/web/src/components/*.tsx`): rulează migrarea scriptată hex→hex (tabel explicit, nu sed).
4. QA obligatoriu pe preview-ul local (`node tmp/design-preview/server.cjs` → http://127.0.0.1:4174, date demo):
   - scan de urme din paleta veche (computed styles: color/background/borders/gradients),
   - 0 overlap-uri structurale, 0 truncări în tabel/header/sidebar (desktop 1440 + mobil 390),
   - screenshot + verificare vizuală.

## Pitfall-uri

- `position: sticky` pe `thead` într-un wrapper cu `overflow-x: auto` → browserul calculează `overflow-y: auto` și împinge header-ul cu offsetul `top:` peste primul rând. Fie header static în mockup-uri, fie sticky la nivel de pagină, nu în wrapper scrollabil.
- `font-mono` era mapat pe sans; acum e JetBrains Mono (468 utilizări) — verifică truncările în tabele după orice schimbare de font.
- Numele claselor/rolurilor de culoare (cyan/blue/emerald/rose...) sunt istorice — nu le redenumi, doar valorile se schimbă.
