import type { Category, Topic } from "./types";

const CHINA =
  /\b(China|Chinese|People['’]s Republic of China|Beijing|Shanghai|Shenzhen|Communist Party of China|Xi Jinping|Hong Kong|Macau|Xinjiang|Uyghurs?|Tibet(an)?|Huawei|TikTok|ByteDance|DeepSeek|Alibaba|Tencent|People['’]s Liberation Army)\b/i;
// Acronyms are matched case-sensitively and not inside codes like "27-PRC-0043".
const CHINA_ACRONYMS = /(?<![\w-])(PRC|CCP|CPC|PLA|ZTE|SMIC|CATL|BYD|Xi)(?![\w-])/;
const TAIWAN = /\b(Taiwan|Taiwanese|Taipei|Kaohsiung|Lai Ching-te|Kuomintang)\b/i;
const TAIWAN_ACRONYMS = /(?<![\w-])(TSMC|KMT)(?![\w-])/;

const US_ACTOR =
  /(\bU\.S\.|\bUS\b|\bUSA\b|United States|America|Washington|White House|Trump|Vance|Pentagon|Congress|Senate|\bHouse\b|[Ll]awmakers?|[Ss]enators?|[Rr]epresentatives?|State Department|State Dept|Treasury|Commerce|Rubio|Hegseth|Bessent|Lutnick|Greer|Bondi|Patel|Noem|[Ff]ederal|FBI|Justice Department|\bDOJ\b|\bFCC\b|\bSEC\b|USTR|\bBIS\b|OFAC|CFIUS|Navy|Army|Air Force|Marines|Coast Guard|[Aa]dministration|[Ee]mbassy|[Ss]anction|[Tt]ariff|[Ee]xport control|Entity List|[Aa]rms sale|[Cc]harged|[Ii]ndicted|[Ss]entenced)/;

export function detectTopics(text: string): Topic[] {
  const topics: Topic[] = [];
  if (CHINA.test(text) || CHINA_ACRONYMS.test(text)) topics.push("china");
  if (TAIWAN.test(text) || TAIWAN_ACRONYMS.test(text)) topics.push("taiwan");
  return topics;
}

export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 160);
}

export function mentionsUsActor(text: string): boolean {
  return US_ACTOR.test(text);
}

const RULES: [Category, RegExp][] = [
  ["executive", /\b(executive order|proclamation|presidential (memorandum|action|determination)|national security presidential|memorandum for)\b/i],
  ["sanctions", /\b(sanction(s|ed|ing)?|OFAC|SDN|designat(es|ed|ion|ing)|blocking|asset freeze|visa restrictions?|Magnitsky)\b/i],
  ["export_controls", /\b(export control|Entity List|Bureau of Industry and Security|\bBIS\b|\bEAR\b|unverified list|export (licen[cs]e|ban|restriction)|chips?|semiconductors?|Nvidia|AI diffusion|foreign direct product)\b/i],
  ["trade", /\b(tariffs?|dut(y|ies)|antidumping|anti-dumping|countervailing|Section (232|301|201)|trade (deal|agreement|talks|war|truce|representative)|USTR|imports?|exports?|de minimis|reciprocal|customs|soybeans?|rare earths?)\b/i],
  ["legislation", /\b(bill|H\.\s?R\.\s?\d+|S\.\s?\d+|H\.\s?Res|S\.\s?Res|legislation|Act of \d{4}|amendment|Congress|Senate|House (passes|votes|committee)|lawmakers?|senators?|hearing|Select Committee|NDAA)\b/i],
  ["defense", /\b(Pentagon|Department of (Defense|War)|military|defen[cs]e|arms sales?|weapons?|PLA|navy|naval|warships?|destroyer|carrier|Indo-Pacific Command|INDOPACOM|troops|missiles?|drills?|Strait transit|deterrence)\b/i],
  ["law_enforcement", /\b(charged|indict(ed|ment)|sentenced|arrest(ed)?|pleads? guilty|pleaded guilty|convicted|Justice Department|\bDOJ\b|\bFBI\b|smuggl(ing|ed)|espionage|spy(ing)?|prosecut(e|ed|ion)|transnational repression|fentanyl|money laundering|seiz(ed|ure))\b/i],
  ["immigration", /\b(visas?|immigration|students?|deport(ed|ation)?|asylum|travel advisory|consular|border|green card|H-1B)\b/i],
  ["investment", /\b(CFIUS|outbound investment|investments?|securities|SEC\b|delist(ing)?|stocks?|investors?|capital markets|bonds?|financial)\b/i],
  ["technology", /\b(FCC|TikTok|Huawei|ZTE|telecom|cyber(security|attack)?|hack(ers|ing|ed)?|artificial intelligence|\bAI\b|data security|connected vehicles?|drones?|DJI|quantum|5G|undersea cable|satellite)\b/i],
  ["diplomacy", /\b(Secretary|readout|call with|meets? with|meeting|summit|visit(s|ed)?|talks|dialogue|statement|ambassador|embassy|diplomat(ic|s)?|bilateral|joint statement|spokesperson|press briefing|remarks|consulate|Xi Jinping|One China|AIT)\b/i],
  ["health_agri", /\b(FDA|USDA|agricultur(e|al)|farm(ers)?|food|drug|pharmaceutical|medical|health|biotech|BIOSECURE|farmland)\b/i],
];

export function detectCategories(text: string, extra: Category[] = []): Category[] {
  const cats = new Set<Category>(extra);
  for (const [cat, re] of RULES) if (re.test(text)) cats.add(cat);
  if (cats.size === 0) cats.add("other");
  return [...cats];
}

export function stripHtml(input: string): string {
  return decodeEntities(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

export function decodeEntities(input: string): string {
  let out = input;
  for (let i = 0; i < 2; i++) {
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return NAMED[code.toLowerCase()] ?? m;
    });
  }
  return out;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max).trimEnd()}…`;
}
