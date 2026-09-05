const CUTE_ZODIAC_EMOJI = ["🐭", "🐮", "🐯", "🐰", "🐲", "🐍", "🐴", "🐐", "🐵", "🐔", "🐶", "🐷"];
const ZODIAC_REFERENCE_YEAR = 2020;

export function getCuteZodiacEmoji(year) {
  if (year === "" || year === null || year === undefined) return "";
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear)) return "";
  const index = ((numericYear - ZODIAC_REFERENCE_YEAR) % CUTE_ZODIAC_EMOJI.length + CUTE_ZODIAC_EMOJI.length)
    % CUTE_ZODIAC_EMOJI.length;
  return CUTE_ZODIAC_EMOJI[index];
}
