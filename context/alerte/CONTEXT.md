# Alerte și Telegram

Alertele pleacă pe Telegram, prin botul @Crypto_mac_alert_bot. Centrul de alerte din web arată flipurile confirmate, candidații, alertele active și istoricul.

## Încarcă

| Ce | Fișier |
| --- | --- |
| Rutele Telegram, webhook-ul și scanările programate | `apps/api/src/routes/telegram-routes.ts` |
| Botul, formatul mesajelor, comenzile | `packages/notifications/src/telegram-bot.ts`, `alert-dispatcher.ts` |
| Garda de livrare | `apps/api/src/services/telegram-delivery-guard.ts` |
| Alertele de preț, MA cross, strategie, SMA reclaim, structură | `apps/api/src/services/*-alert-*.ts`, `daily-sma-reclaim-*.ts`, `structure-scanner-*.ts` |
| Scanarea zilnică fără trimitere | `docs/no-send-regime-scan.md` |
| Ecranul din web | `apps/web/src/components/AlertsCenterView.tsx` |

## Hotărâri

- Scanarea programată de regim rulează la 08:00 Europe/Bucharest, doar pe 1D și 1W. Scanerul de structură rulează doar la închiderea zilnică, pe 1D.
- Un push automat pleacă doar pentru un flip a cărui lumânare de confirmare s-a închis în ultimele 48 de ore (inclusiv) față de începutul scanării. Unul mai vechi devine `suppressed-historical`, unul invalid sau din viitor `suppressed-invalid`. Mesajul arată direcția și data originală.
- Cheile de idempotență pe lumânarea închisă împiedică o alertă dublă. Un claim deja trimis sau nesigur rămâne. Un mesaj Telegram eșuat se loghează și nu se reîncearcă.
- `POST /api/alerts/daily-regime-scan/no-send` scanează fără să trimită nimic. Corpul cererii nu poate porni Telegram.
- În web, scanările manuale sunt Rapid (watchlist plus alertele active) și Complet (tot universul). Ambele cer sesiune și `X-CSRF-Token`. „Actualizează” doar reîncarcă datele.
- Bara de progres arată `scanate/total` doar când numărul există. Altfel e nedeterminată, cu secundele scurse, fără un procent inventat.
- `/scan radar` din Telegram trimite digestul determinist din `context/radar/CONTEXT.md`.
- Digestul Telegram al Regime Tape e oprit implicit. Pornește doar cu `REGIME_TAPE_TELEGRAM_DIGEST=1`.
- În test nu se trimit alerte reale și nu se rulează manual jobul Scheduler.
