# Hytteboka

A week here is a **cabin week** (hytteuke): Saturday to Saturday, and those who leave are out by 12:00, Norwegian time. That is the customer's rule, and 12:00 on Saturday is when one week ends and the next begins. A week is never Monday to Sunday.

- A week's id looks like a calendar week, and names the cabin week that holds that week's Monday to Friday: `2027-W12` runs from Saturday 20 March to Saturday 27 March 2027.
- `src/weeks.js` owns the rule. Take a week's days, its year, and which week it is now, from there.

The look and voice are Miles'; the `miles-brand` skill has the rules.

- Style with the names in `public/brand/miles.css`, a copy of the brand kit's tokens. Write no colour or size of your own.
- Gelica loads from Adobe's kit for Miles and nowhere else. Keep font files out of the repository.
- Logo, icons and illustrations are files from the brand kit, unchanged, in `public/brand/`. Draw none yourself.
