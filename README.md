# Hytteboka

Booking av firmahytta, med trekning om ukene alle vil ha.

Dette er en prøvekjøring av øvelsen i Miles-kurset «Agentisk koding», som holdes 14. oktober 2026. Den ble gjort 11. oktober 2026: Claude Code fikk én melding fra en oppdiktet kunde og bygget resten derfra. Historikken følger kundens meldinger, én commit for hver ting hun ber om.

På kurset begynner deltakerne på første utgave, som ligger på grenen `start`, og tar den videre selv. Denne grenen viser hvordan det gikk da vi prøvde: den er til å se på etterpå, ikke til å kopiere fra underveis.

## Oppdraget

> Hei! Jeg er Gro, kontorsjef i Havbris AS. Vi er førti ansatte og har en firmahytte på fjellet. I dag styrer jeg utlånet i et regneark, og det går ikke lenger. Folk dobbeltbooker, og hver vinter blir det bråk om hvem som får påsken.
>
> Jeg trenger en enkel nettside der de ansatte kan se når hytta er ledig, og booke en uke. De ukene alle vil ha, som påsken og vinterferien, skal det trekkes lodd om: alle som vil ha uka, melder seg på, og så trekker jeg en vinner mens hele kontoret ser på. Det må gjerne være litt stas rundt trekningen.
>
> Kan du ha noe å vise meg i dag?

Rammene var at den skal kjøre på egen maskin med én kommando, uten sky og uten innlogging. Det gjør den, med ett unntak: sidene henter Miles' to skrifter utenfra, Gelica fra Adobes fontpakke for Miles og DM Sans fra Google Fonts. Uten nett virker alt som før, med Georgia og maskinens egen skrift i stedet.

## Slik ble den

Kunden rettet og la til underveis. Hytteuka går fra fredag til fredag, og de som reiser, er ute til klokka tolv. Påsken trekkes som én tur på to uker. Ingen vinner to trekninger samme år, en uke som er tatt har venteliste, og den som har en uke, kan legge den i kalenderen sin. Fredagsoversikten over hvem som har hytta, lages med `/oversikt` i Claude Code.

Til slutt skulle boka vises hos Miles, og fikk Miles' utseende og språk. `bilder/` viser kalenderen og en trekning før og etter.

Hele historien står i [HISTORIEN.md](HISTORIEN.md): hva kunden sa i hver runde, prompten agenten fikk, hva som kom tilbake, hva vi la merke til, og et bilde av siden slik den så ut da.

## Kjør den

```
npm start
```

Åpne så http://localhost:44210. Den trenger Node.js 20 eller nyere, og har ingen avhengigheter. Den er laget med Node.js 24, og testene går også på 20 og 22.

Testene kjører du med `npm test`.

## Hva den ikke er

Den er ikke ment for ekte bruk. Det er ingen innlogging, så alle kan skrive hvilket som helst navn, og alt ligger i én fil på maskinen. Det kunden har avklart, og det som ble antatt på hennes vegne, står i [ANTAKELSER.md](ANTAKELSER.md).
