/**
 * Deterministic Merchant Extraction & Normalization
 */

const KNOWN_MERCHANTS = [
  // Food & Dining
  { pattern: /\bswiggy\b/i, name: "Swiggy" },
  { pattern: /\bzomato\b/i, name: "Zomato" },
  { pattern: /\bdominos?\b/i, name: "Domino's" },
  { pattern: /\bpizza\s*hut\b/i, name: "Pizza Hut" },
  { pattern: /\bmcdonalds?|mcd\b/i, name: "McDonald's" },
  { pattern: /\bkfc\b/i, name: "KFC" },
  { pattern: /\bburger\s*king\b/i, name: "Burger King" },
  { pattern: /\bstarbucks\b/i, name: "Starbucks" },
  { pattern: /\bcafe\s*coffee\s*day|ccd\b/i, name: "Cafe Coffee Day" },
  { pattern: /\bhaldirams?\b/i, name: "Haldiram" },
  { pattern: /\bbarbeque\s*nation\b/i, name: "Barbeque Nation" },
  { pattern: /\bblinkit\b/i, name: "Blinkit" },
  { pattern: /\bzepto\b/i, name: "Zepto" },
  { pattern: /\binstamart\b/i, name: "Instamart" },
  { pattern: /\bbig\s*basket\b/i, name: "BigBasket" },
  { pattern: /\bdunzo\b/i, name: "Dunzo" },

  // Transport & Travel
  { pattern: /\buber\b/i, name: "Uber" },
  { pattern: /\bola\s*(?:cabs|money)?\b/i, name: "Ola" },
  { pattern: /\brapido\b/i, name: "Rapido" },
  { pattern: /\birctc\b/i, name: "IRCTC" },
  { pattern: /\bmakemytrip|mmt\b/i, name: "MakeMyTrip" },
  { pattern: /\bredbus\b/i, name: "RedBus" },
  { pattern: /\bgoibibo\b/i, name: "Goibibo" },
  { pattern: /\bindigo\b/i, name: "IndiGo" },
  { pattern: /\bair\s*india\b/i, name: "Air India" },

  // Shopping & Retail
  { pattern: /\bamazon\s*(?:pay|retail|seller)?\b/i, name: "Amazon" },
  { pattern: /\bflipkart\b/i, name: "Flipkart" },
  { pattern: /\bmyntra\b/i, name: "Myntra" },
  { pattern: /\bajio\b/i, name: "Ajio" },
  { pattern: /\bnykaa\b/i, name: "Nykaa" },
  { pattern: /\bmeesho\b/i, name: "Meesho" },
  { pattern: /\btata\s*cliq\b/i, name: "Tata CLiQ" },
  { pattern: /\bcroma\b/i, name: "Croma" },
  {
    pattern: /\breliance\s*(?:digital|retail|smart|fresh)?\b/i,
    name: "Reliance",
  },
  { pattern: /\bapple(?:\.com|store)?\b/i, name: "Apple" },
  { pattern: /\bdecathlon\b/i, name: "Decathlon" },
  { pattern: /\bzara\b/i, name: "Zara" },
  { pattern: /\bh&m\b/i, name: "H&M" },

  // Entertainment & Subscriptions
  { pattern: /\bnetflix(?:\.com)?\b/i, name: "Netflix" },
  { pattern: /\bspotify\b/i, name: "Spotify" },
  { pattern: /\b(?:disney\+?\s*)?hotstar\b/i, name: "Hotstar" },
  { pattern: /\bprime\s*video\b/i, name: "Prime Video" },
  { pattern: /\byoutube(?:\s*premium)?\b/i, name: "YouTube" },
  { pattern: /\bbookmyshow\b/i, name: "BookMyShow" },
  { pattern: /\bpvr(?:\s*cinemas)?\b/i, name: "PVR" },
  { pattern: /\binox\b/i, name: "Inox" },
  { pattern: /\bzee5\b/i, name: "Zee5" },
  { pattern: /\bsonyliv\b/i, name: "SonyLIV" },

  // Telecom & Utilities
  { pattern: /\bairtel\b/i, name: "Airtel" },
  { pattern: /\bjio\b/i, name: "Jio" },
  { pattern: /\b(?:vi|vodafone|idea)\b/i, name: "Vi" },
  { pattern: /\bbsnl\b/i, name: "BSNL" },
  { pattern: /\btata\s*sky|tata\s*play\b/i, name: "Tata Play" },
  { pattern: /\bact\s*corp|act\s*fibernet\b/i, name: "ACT Fibernet" },

  // Health
  { pattern: /\bapollo\s*(?:pharmacy|hospitals)?\b/i, name: "Apollo" },
  { pattern: /\bmedplus\b/i, name: "MedPlus" },
  { pattern: /\b1mg\b/i, name: "1mg" },
  { pattern: /\bpharmeasy\b/i, name: "PharmEasy" },
  { pattern: /\bnetmeds\b/i, name: "Netmeds" },

  // Financial / Investments / Wallets
  { pattern: /\bcred\b/i, name: "CRED" },
  { pattern: /\bzerodha\b/i, name: "Zerodha" },
  { pattern: /\bgroww\b/i, name: "Groww" },
  { pattern: /\bpaytm\b/i, name: "Paytm" },
  { pattern: /\bphonepe\b/i, name: "PhonePe" },
  { pattern: /\bgoogle\s*pay|gpay\b/i, name: "Google Pay" },
];

const BANK_PREFIXES = [
  /^UPI[/-]/i,
  /^IMPS[/-]/i,
  /^NEFT[/-]/i,
  /^RTGS[/-]/i,
  /^NACH[/-]/i,
  /^ACH[/-]/i,
  /^POS[\s/-]/i,
  /^ATM[\s/-]/i,
  /^INB[\s/-]/i,
  /^BIL[\s/-]/i,
  /^EBNK[\s/-]/i,
  /^MOB[\s/-]/i,
];

const CORPORATE_SUFFIXES = [
  /\s+ltd\.?$/i,
  /\s+pvt\.?$/i,
  /\s+private\s+limited$/i,
  /\s+limited$/i,
  /\s+llc\.?$/i,
  /\s+inc\.?$/i,
  /\s+corp\.?$/i,
  /\s+india$/i,
  /\s+bangalore$/i,
  /\s+mumbai$/i,
  /\s+delhi$/i,
];

/**
 * Standardize merchant name to a clean lowercase key for lookup.
 */
export function normalizeMerchantKey(merchant) {
  if (!merchant || typeof merchant !== "string") return "";
  return merchant
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Extract a clean merchant name from a raw transaction description.
 * Returns { merchant: string, confidence: number }
 */
export function extractMerchant(description) {
  if (!description || typeof description !== "string") {
    return { merchant: "Unknown", confidence: 0 };
  }

  let cleaned = description.trim();

  // 1. Try known merchant patterns first
  for (const item of KNOWN_MERCHANTS) {
    if (item.pattern.test(cleaned)) {
      return { merchant: item.name, confidence: 0.95 };
    }
  }

  // 2. Strip standard bank transaction prefixes
  for (const prefix of BANK_PREFIXES) {
    cleaned = cleaned.replace(prefix, "");
  }
  cleaned = cleaned.trim();

  // Split by slash, hyphen, or spaces to look for alphanumeric tokens
  const tokens = cleaned
    .split(/[/\-:]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  // Filter out purely numeric tokens (reference numbers, dates, IDs)
  const validTokens = tokens.filter((t) => !/^\d+$/.test(t));

  if (validTokens.length > 0) {
    let candidate = validTokens[0];
    // Strip trailing company suffixes
    for (const suffix of CORPORATE_SUFFIXES) {
      candidate = candidate.replace(suffix, "").trim();
    }
    // Remove trailing digits or short IDs
    candidate = candidate.replace(/\b\d{4,}\b/g, "").trim();

    if (candidate.length >= 2) {
      // Title case candidate
      const titleCased = candidate
        .toLowerCase()
        .replace(/(^|\s)\S/g, (char) => char.toUpperCase());
      return { merchant: titleCased, confidence: 0.6 };
    }
  }

  return { merchant: "Unknown", confidence: 0.1 };
}
