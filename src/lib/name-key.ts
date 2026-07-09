// Arabic name normalization: tashkeel, alef/yaa/taa variants, common honorific prefixes.
export function nameKey(input: string): string {
  if (!input) return "";
  let s = String(input).trim();
  // remove tashkeel (Arabic diacritics)
  s = s.replace(/[\u064B-\u0652\u0670]/g, "");
  // normalize alef, yaa, taa marbouta, hamza forms
  s = s
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه");
  // strip honorific prefixes: ا/ , أ/ , م/ , د/ , ست/ , السيد/ , السيده/
  s = s.replace(/^(ا\/|م\/|د\/|ست\/|السيد\/|السيده\/)\s*/, "");
  // collapse whitespace and dashes
  s = s.replace(/\s+/g, " ").replace(/\s*-\s*/g, " - ").trim();
  return s.toLowerCase();
}
