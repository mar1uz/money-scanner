# Convenții

Se aplică în orice domeniu. Nu le copia în fișierele de domeniu.

- **Doar date reale.** Fiecare preț, procent, scor, dată și indicator vine dintr-o sursă reală, live sau istorică. Fără aproximări, tabele statice, placeholdere sau decalaje artificiale. Când o valoare lipsește, se afișează „—” sau N/A, nu 0 și nu o estimare. (Directiva #1 din capul lui `HANDOFF.md`.)
- **Fără tranzacții reale.** Aplicația este de analiză. Strategiile, backtesturile și forward testurile rămân pe hârtie.
- Textele din interfață se scriu în română, cu perechea engleză în dicționarul de traduceri. Detaliile sunt în `apps/web/CONTEXT.md`.
- Nu tipări și nu comite secrete: `.env`, tokenuri, `../jev-router/.env.local`, cheia CoinGecko, tokenul de scheduler (`x-daily-scan-token`).
- Nu porni din agent ce pleacă în afară sau scrie în producție: mesaje Telegram, rularea joburilor Scheduler, `--apply` pe scripturile de configurare sau de re-pin, postări pe X. Le pornește Marius sau se fac după confirmarea lui.
- Verificare: `npm test` în rădăcină rulează toate workspace-urile. Pentru unul singur: `npm test --workspace=apps/api` sau `npx tsx --test <fișier>.test.ts`. Build: `npm run build`.
- Câteva teste depind de surse live (CoinGecko, Yahoo) și pică la HTTP 429. Înainte să pui un eșec pe seama schimbării, rulează același test pe un tree curat (`git stash` sau un `git worktree`).
- Deploy doar când Marius confirmă. Cum și de unde: `_config/deploy.md`.
- După un pas livrat, se adaugă o secțiune în `HANDOFF.md`: ce s-a cerut, ce s-a schimbat, verificarea, commitul, Cloud Build-ul și revizia. Dacă pasul schimbă o hotărâre, se actualizează și `CONTEXT.md` din domeniul ei.
