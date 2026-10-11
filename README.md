# Hytteboka

Booking av firmahytta, med trekning om ukene alle vil ha.

Dette er en prøvekjøring av øvelsen i Miles-kurset «Agentisk koding», som holdes 14. oktober 2026. Den ble gjort 11. oktober 2026: Claude Code fikk én melding fra en oppdiktet kunde og bygget resten derfra. Historikken følger kundens meldinger, én commit for hver ting hun ber om.

På kurset bygger deltakerne sin egen utgave fra en tom mappe. Denne er til å se på etterpå, ikke til å kopiere fra underveis.

## Oppdraget

> Hei! Jeg er Ragnhild, kontorsjef i Havbris AS. Vi er førti ansatte og har en firmahytte på fjellet. I dag styrer jeg utlånet i et regneark, og det går ikke lenger. Folk dobbeltbooker, og hver vinter blir det bråk om hvem som får påsken.
>
> Jeg trenger en enkel nettside der de ansatte kan se når hytta er ledig, og booke en uke. De ukene alle vil ha, som påsken og vinterferien, skal det trekkes lodd om: alle som vil ha uka, melder seg på, og så trekker jeg en vinner mens hele kontoret ser på. Det må gjerne være litt stas rundt trekningen.
>
> Kan du ha noe å vise meg i dag?

Rammene var at den skal kjøre på egen maskin med én kommando, uten sky og uten innlogging.

## Kjør den

```
npm start
```

Åpne så http://localhost:44210. Den er laget og prøvd med Node.js 24, og har ingen avhengigheter.

Testene kjører du med `npm test`.

## Hva den ikke er

Den er ikke ment for ekte bruk. Det er ingen innlogging, så alle kan skrive hvilket som helst navn, og alt ligger i én fil på maskinen. Det som ble antatt på kundens vegne, står i [ANTAKELSER.md](ANTAKELSER.md).
