# Hytteboka

A week here is a **cabin week** (hytteuke): Friday to Friday. Those who leave are out by 12:00, Norwegian time, so the cleaner gets through before the next group comes after work. Those who come get the whole weekend on the mountain, and those who leave have theirs at home. That is the customer's rule and her reason. A week is never Monday to Sunday.

- A week changes hands at 12:00 on its Friday, and the stay starts after work that day. The hours between are the cleaner's.
- A week's id looks like a calendar week, and names the cabin week around that working week: `2027-W12` runs from Friday 19 March to Friday 26 March 2027.
- `src/weeks.js` owns the rule: its day, its hours and the sentence that tells people it. Take a week's days, its year, which week it is now, and that sentence, from there.

The look and voice are Miles'; the `miles-brand` skill has the rules.

- Style with the names in `public/brand/miles.css`, a copy of the brand kit's tokens. Write no colour or size of your own.
- Gelica loads from Adobe's kit for Miles and nowhere else. Keep font files out of the repository.
- Logo, icons and illustrations are files from the brand kit, unchanged, in `public/brand/`. Draw none yourself.
