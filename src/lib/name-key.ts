// Arabic name normalization: tashkeel, alef/yaa/taa variants, punctuation, honorifics.
// Goal: produce a stable key so the same customer written slightly differently
// in the sales workbook and in the collections workbook still matches exactly.

const ARABIC_INDIC = /[\u0660-\u0669]/g; // ٠..٩
const EXT_ARABIC_INDIC = /[\u06F0-\u06F9]/g; // ۰..۹

export function nameKey(input: string): string {
  if (!input) return "";
  let s = String(input);

  // strip BOM / zero-width / tatweel
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u0640]/g, "");
  // remove Arabic tashkeel/diacritics
  s = s.replace(/[\u064B-\u0652\u0670]/g, "");
  // normalize alef / yaa / taa marbouta / hamza forms
  s = s
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه");
  // arabic-indic digits → ascii
  s = s
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXT_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0));

  // strip common honorific prefixes (with or without slash / space)
  //   ا/  أ/  م/  د/  ست/  السيد/  السيده/  الست/  مهندس/ ...
  s = s.replace(
    /^(ا|أ|م|د|ست|الست|السيد|السيده|مهندس|مهندسه|دكتور|دكتوره|شركه|شركة|مؤسسه|مؤسسة)\s*[\/\.:\-]\s*/,
    "",
  );

  // replace ALL punctuation & separators with a single space so
  // "ايه بي ديري /هشام"  ==  "ايه بي ديري / هشام"  ==  "ايه بي ديري-هشام"
  // and                     "(المنيا -مطاي)" == "( المنيا-مطاي )"
  s = s.replace(/[\/\\|()\[\]{}<>.,،؛;:!?"'`*#&+_=~^\-\u2010-\u2015\u2212]/g, " ");

  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}
