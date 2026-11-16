import { categorizeWithGroq } from "../groq.js";
import { SPENDING_CATEGORIES } from "./constants.js";
import { normalizeMerchantKey } from "./merchantExtractor.js";

const DETERMINISTIC_RULES = [
  // Food & Dining
  {
    pattern:
      /\b(?:swiggy|zomato|dominos?|pizza\s*hut|mcdonalds?|kfc|burger\s*king|starbucks|subway|blinkit|zepto|instamart|big\s*basket|dunzo|cafe|restaurant|bistro|bakery|haldirams?)\b/i,
    category: "Food",
  },

  // Transport
  {
    pattern:
      /\b(?:uber|ola|rapido|metro|irctc|railway|train|flight|indigo|air\s*india|makemytrip|redbus|goibibo|petrol|fuel|hpcl|bpcl|iocl|shell|toll|fastag|parking)\b/i,
    category: "Transport",
  },

  // Entertainment
  {
    pattern:
      /\b(?:netflix|spotify|hotstar|prime\s*video|youtube|bookmyshow|pvr|inox|cinema|theatre|zee5|sonyliv|gaming|steam|playstation)\b/i,
    category: "Entertainment",
  },

  // Shopping
  {
    pattern:
      /\b(?:amazon|flipkart|myntra|ajio|nykaa|meesho|tata\s*cliq|croma|reliance|apple|decathlon|zara|h&m|mall|retail|mart|clothing|shoes)\b/i,
    category: "Shopping",
  },

  // Utilities
  {
    pattern:
      /\b(?:electricity|power|bescom|tneb|water|gas|indane|bharat\s*gas|airtel|jio|vodafone|vi|bsnl|tata\s*play|dish\s*tv|act\s*fibernet|broadband|wifi|utility)\b/i,
    category: "Utilities",
  },

  // Housing
  {
    pattern:
      /\b(?:rent|society|maintenance|housing|property\s*tax|home\s*loan|apartment|flat)\b/i,
    category: "Housing",
  },

  // Health
  {
    pattern:
      /\b(?:pharmacy|chemist|hospital|clinic|doctor|apollo|medplus|1mg|pharmeasy|netmeds|diagnostic|pathology|dental|medical)\b/i,
    category: "Health",
  },

  // Education
  {
    pattern:
      /\b(?:udemy|coursera|unacademy|byjus|school|college|university|tuition|coaching|classes|books|library|fees)\b/i,
    category: "Education",
  },

  // Personal Care
  {
    pattern:
      /\b(?:salon|parlour|spa|barber|grooming|gym|fitness|cult\.fit|yoga)\b/i,
    category: "Personal",
  },
];

const TRANSFER_PATTERNS = [
  /\b(?:self\s*transfer|own\s*account|transfer\s*to\s*(?:self|savings|current|own|linked|acc|a\/c)|fund\s*transfer\s*to\s*self|to\s*linked\s*acc|sweep\s*in|sweep\s*out|internal\s*(?:account\s*)?transfer|account\s*transfer|funds?\s*transfer\s*between)\b/i,
];

const REFUND_PATTERNS = [
  /\b(?:refund|reversal|chargeback|cashback|reversed)\b/i,
];

const SALARY_PATTERNS = [/\b(?:salary|sal\s*cred|payroll|wages|stipend)\b/i];

/**
 * Categorize a batch of transactions using the 3-level pipeline:
 * Level 1: User-defined MerchantCategoryRules
 * Level 2: Deterministic pattern rules & financial classification
 * Level 3: Groq AI fallback for ambiguous transactions
 */
export async function categorizeTransactions({
  transactions,
  userId,
  MerchantCategoryRuleModel,
}) {
  if (!transactions || transactions.length === 0) return [];

  // Level 1: Load user's custom merchant rules
  const userRulesMap = new Map();
  if (MerchantCategoryRuleModel && userId) {
    try {
      const rules = await MerchantCategoryRuleModel.find({ userId }).lean();
      rules.forEach((r) => {
        userRulesMap.set(
          normalizeMerchantKey(r.normalizedMerchant),
          r.category,
        );
      });
    } catch (err) {
      console.warn("[Categorizer] Could not load user rules:", err.message);
    }
  }

  const categorized = [];
  const ambiguousDebits = [];

  // Step A: Level 1 & Level 2
  transactions.forEach((txn, _index) => {
    const desc = txn.originalDescription || "";
    const merchant = txn.merchant || "";
    const merchantKey =
      normalizeMerchantKey(merchant) ||
      normalizeMerchantKey(txn.normalizedDescription);

    // 1. Detect Transfers
    let isTransfer = false;
    for (const p of TRANSFER_PATTERNS) {
      if (p.test(desc) || p.test(merchant)) {
        isTransfer = true;
        break;
      }
    }
    if (isTransfer) {
      categorized.push({
        ...txn,
        category: "Transfer",
        classification: "transfer",
        classificationSource: "deterministic",
        classificationConfidence: 0.9,
        selected: false, // Transfers excluded from spending by default
      });
      return;
    }

    // 2. Detect Refunds
    let isRefund = false;
    for (const p of REFUND_PATTERNS) {
      if (p.test(desc)) {
        isRefund = true;
        break;
      }
    }
    if (isRefund) {
      categorized.push({
        ...txn,
        category: "Other",
        classification: "refund",
        classificationSource: "deterministic",
        classificationConfidence: 0.85,
        selected: false, // Refunds do not create regular expenses
      });
      return;
    }

    // 3. Handle Credits / Income
    if (txn.direction === "credit") {
      let isSalary = false;
      for (const p of SALARY_PATTERNS) {
        if (p.test(desc)) {
          isSalary = true;
          break;
        }
      }
      categorized.push({
        ...txn,
        category: "Income",
        classification: "income",
        classificationSource: "deterministic",
        classificationConfidence: isSalary ? 0.95 : 0.8,
        selected: false, // Credits excluded from spending
      });
      return;
    }

    const isUniqueDebit =
      txn.direction === "debit" &&
      txn.duplicateStatus !== "possible_duplicate" &&
      txn.duplicateStatus !== "confirmed_duplicate" &&
      txn.selected !== false;

    // 4. Level 1: User-defined Merchant Rule
    if (merchantKey && userRulesMap.has(merchantKey)) {
      categorized.push({
        ...txn,
        category: userRulesMap.get(merchantKey),
        classification: "expense",
        classificationSource: "user_rule",
        classificationConfidence: 1.0,
        selected: isUniqueDebit,
      });
      return;
    }

    // 5. Level 2: Deterministic Rule Match
    let matchedCategory = null;
    for (const rule of DETERMINISTIC_RULES) {
      if (
        rule.pattern.test(desc) ||
        (merchant && rule.pattern.test(merchant))
      ) {
        matchedCategory = rule.category;
        break;
      }
    }

    if (matchedCategory) {
      categorized.push({
        ...txn,
        category: matchedCategory,
        classification: "expense",
        classificationSource: "deterministic",
        classificationConfidence: 0.85,
        selected: isUniqueDebit,
      });
      return;
    }

    // If debit and unmatched, queue for Level 3 (Groq AI)
    ambiguousDebits.push({ txn, index: categorized.length });
    categorized.push(txn); // placeholder
  });

  // Step B: Level 3 — Groq AI fallback for ambiguous transactions
  if (ambiguousDebits.length > 0 && process.env.GROQ_API_KEY) {
    // Process up to 15 ambiguous transactions concurrently or in small batches
    const batch = ambiguousDebits.slice(0, 15);
    await Promise.all(
      batch.map(async ({ txn, index }) => {
        try {
          const query =
            txn.merchant ||
            txn.normalizedDescription ||
            txn.originalDescription;
          const aiResult = await categorizeWithGroq(query, SPENDING_CATEGORIES);
          if (aiResult?.category) {
            categorized[index] = {
              ...txn,
              category: aiResult.category,
              classification: "expense",
              classificationSource: "ai",
              classificationConfidence: aiResult.confidence,
              selected:
                txn.direction === "debit" &&
                txn.duplicateStatus !== "possible_duplicate" &&
                txn.duplicateStatus !== "confirmed_duplicate" &&
                txn.selected !== false,
            };
          }
        } catch (_err) {
          // Fall back gracefully to 'Other'
          categorized[index] = {
            ...txn,
            category: "Other",
            classification: "expense",
            classificationSource: "default",
            classificationConfidence: 0.1,
            selected:
              txn.direction === "debit" &&
              txn.duplicateStatus !== "possible_duplicate" &&
              txn.duplicateStatus !== "confirmed_duplicate" &&
              txn.selected !== false,
          };
        }
      }),
    );
  }

  // Default any remaining unclassified
  return categorized.map((txn) => {
    if (!txn.category) {
      return {
        ...txn,
        category: "Other",
        classification: txn.direction === "debit" ? "expense" : "income",
        classificationSource: "default",
        classificationConfidence: 0.1,
        selected:
          txn.direction === "debit" &&
          txn.duplicateStatus !== "possible_duplicate" &&
          txn.duplicateStatus !== "confirmed_duplicate" &&
          txn.selected !== false,
      };
    }
    return txn;
  });
}
