import type { Channel } from "./types";

type Base = { id: string; name: string; channel: Channel; agency?: string };

export type RssSource = Base & {
  kind: "rss";
  url: string;
  author?: string;
  /** Feed items carry no headline (social posts): build one from the body. */
  titleFromBody?: boolean;
  /** Only keep items whose headline names China/Taiwan (feeds where full text mentions are noisy). */
  requireTitleMatch?: boolean;
};

export type GoogleNewsSource = Base & {
  kind: "google-news";
  query: string;
  /** "site" searches surface official pages; "news" searches surface press coverage. */
  mode: "site" | "news";
  /** Extra headline filter for searches whose matches are often only in the article body. */
  titleMustMatch?: RegExp;
};

export type FederalRegisterSource = Base & { kind: "federal-register" };
export type XSource = Base & { kind: "x"; handles: string[] };

export type SourceDef = RssSource | GoogleNewsSource | FederalRegisterSource | XSource;

const TERMS = "(China OR Chinese OR Taiwan OR Taiwanese OR PRC OR Beijing OR Taipei)";

const site = (id: string, name: string, agency: string, domains: string[]): GoogleNewsSource => ({
  kind: "google-news",
  id,
  name,
  agency,
  channel: "government",
  mode: "site",
  query: `(${domains.map((d) => `site:${d}`).join(" OR ")}) ${TERMS}`,
});

const news = (id: string, name: string, query: string, channel: Channel = "media"): GoogleNewsSource => ({
  kind: "google-news",
  id,
  name,
  channel,
  mode: "news",
  query,
});

/** Officials and offices whose X accounts are read when an X API token is configured. */
export const X_HANDLES = [
  "POTUS",
  "realDonaldTrump",
  "WhiteHouse",
  "VP",
  "JDVance",
  "SecRubio",
  "marcorubio",
  "StateDept",
  "StateDeptSpox",
  "StateDept_EAP",
  "SecScottBessent",
  "USTreasury",
  "howardlutnick",
  "CommerceGov",
  "USTradeRep",
  "PeteHegseth",
  "DeptofWar",
  "INDOPACOM",
  "AGPamBondi",
  "TheJusticeDept",
  "FBI",
  "FBIDirectorKash",
  "DHSgov",
  "Sec_Noem",
  "AIT_Taiwan",
  "USAmbChina",
  "committeeonccp",
  "SpeakerJohnson",
  "SenateForeign",
  "HouseForeign",
];

export const SOURCES: SourceDef[] = [
  // Government: structured and direct feeds
  { kind: "federal-register", id: "federal-register", name: "Federal Register", channel: "government", agency: "Federal Register" },
  {
    kind: "rss",
    id: "wh-actions",
    name: "White House – Presidential Actions",
    channel: "government",
    agency: "White House",
    url: "https://www.whitehouse.gov/presidential-actions/feed/",
  },
  {
    kind: "rss",
    id: "wh-news",
    name: "White House – News",
    channel: "government",
    agency: "White House",
    url: "https://www.whitehouse.gov/news/feed/",
  },
  {
    kind: "rss",
    id: "wh-briefings",
    name: "White House – Briefings & Statements",
    channel: "government",
    agency: "White House",
    url: "https://www.whitehouse.gov/briefings-statements/feed/",
  },
  {
    kind: "rss",
    id: "dod",
    name: "Department of War (Defense) – Releases",
    channel: "government",
    agency: "Department of War (Defense)",
    url: "https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=50",
  },
  {
    kind: "rss",
    id: "doj",
    name: "Department of Justice – Press Releases",
    channel: "government",
    agency: "Department of Justice",
    url: "https://www.justice.gov/news/rss?type=press_release&m=1",
  },
  {
    kind: "rss",
    id: "ustr",
    name: "USTR – Press Releases",
    channel: "government",
    agency: "U.S. Trade Representative",
    url: "https://www.ustr.gov/rss.xml",
  },
  {
    kind: "rss",
    id: "sec",
    name: "SEC – Press Releases",
    channel: "government",
    agency: "Securities and Exchange Commission",
    url: "https://www.sec.gov/news/pressreleases.rss",
  },
  {
    kind: "rss",
    id: "doe",
    name: "Department of Energy – News",
    channel: "government",
    agency: "Department of Energy",
    url: "https://www.energy.gov/rss.xml",
  },
  {
    kind: "rss",
    id: "house-ccp",
    name: "House Select Committee on the CCP",
    channel: "government",
    agency: "Congress",
    url: "https://selectcommitteeontheccp.house.gov/rss.xml",
  },
  {
    kind: "rss",
    id: "congress-bills",
    name: "Congress – New bills (GovInfo)",
    channel: "government",
    agency: "Congress",
    url: "https://www.govinfo.gov/rss/bills.xml",
    requireTitleMatch: true,
  },

  // Government: agencies whose sites block feed readers, reached through site-scoped search
  site("state", "State Department", "Department of State", ["state.gov"]),
  site("treasury", "Treasury & OFAC", "Department of the Treasury", ["treasury.gov", "ofac.treasury.gov"]),
  site("commerce", "Commerce & BIS", "Department of Commerce", ["commerce.gov", "bis.gov", "trade.gov"]),
  site("dhs", "Homeland Security & CBP", "Department of Homeland Security", ["dhs.gov", "cbp.gov", "ice.gov"]),
  site("fbi", "FBI", "FBI", ["fbi.gov"]),
  site("fcc", "FCC", "Federal Communications Commission", ["fcc.gov"]),
  site("usda", "Agriculture (USDA)", "Department of Agriculture", ["usda.gov"]),
  site("senate", "U.S. Senate", "Congress", ["senate.gov"]),
  site("house", "U.S. House", "Congress", ["house.gov"]),
  site("congress-gov", "Congress.gov", "Congress", ["congress.gov"]),
  site("ait", "American Institute in Taiwan", "Department of State", ["ait.org.tw"]),
  site("embassy-china", "U.S. Mission China", "Department of State", ["china.usembassy-china.org.cn"]),
  site("uscc", "U.S.-China Economic and Security Review Commission", "USCC", ["uscc.gov"]),

  // Officials' social media
  {
    kind: "rss",
    id: "truth-trump",
    name: "Truth Social – @realDonaldTrump",
    channel: "social",
    agency: "White House",
    author: "Donald J. Trump",
    url: "https://www.trumpstruth.org/feed",
    titleFromBody: true,
  },
  { kind: "x", id: "x-officials", name: "X – officials & agencies", channel: "social", handles: X_HANDLES },
  {
    ...news(
      "social-reports",
      "Officials' posts (as reported)",
      `(Trump OR Rubio OR Vance OR Hegseth OR Bessent OR Lutnick OR Greer OR Bondi OR Patel OR Noem OR senator OR congressman) ${TERMS} ("on X" OR "Truth Social" OR "posted" OR "wrote on" OR "tweet" OR "social media post")`,
      "social",
    ),
    titleMustMatch: /\b(posts?|posted|tweets?|tweeted|on X|Truth Social|social media|wrote|writes|shares?|shared|meme|video message)\b/i,
  },

  // Media coverage
  news("media-trade", "News – trade, tariffs & sanctions", `(U.S. OR Washington OR Trump) ${TERMS} (tariff OR sanctions OR "export controls" OR "entity list" OR trade)`),
  news("media-security", "News – defense & security", `(Pentagon OR "U.S. military" OR "arms sale" OR "U.S. Navy" OR Hegseth) ${TERMS}`),
  news("media-diplomacy", "News – diplomacy", `("State Department" OR Rubio OR "White House" OR Trump) ${TERMS} (talks OR meeting OR call OR summit OR statement)`),
  news("media-congress", "News – Congress", `(Congress OR Senate OR House OR lawmakers OR bill) ${TERMS}`),
  news("media-justice", "News – law enforcement", `("Justice Department" OR FBI OR prosecutors OR charged OR indicted) (Chinese OR China OR Taiwan)`),
  news("media-tech", "News – tech & investment", `(FCC OR Commerce OR CFIUS OR Treasury OR SEC) ${TERMS} (chips OR AI OR TikTok OR investment OR telecom)`),
  news("media-taiwan", "News – Taiwan policy", `Taiwan (U.S. OR Washington OR American) (policy OR support OR weapons OR delegation OR AIT OR Congress)`),
];
