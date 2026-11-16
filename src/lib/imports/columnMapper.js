/**
 * Column-mapping detection and validation.
 */

const ALIAS_MAP = {
  date: [
    "date",
    "transaction date",
    "txn date",
    "value date",
    "posting date",
    "trans date",
  ],
  description: [
    "description",
    "narration",
    "details",
    "particular",
    "particulars",
    "remarks",
    "transaction description",
    "memo",
  ],
  debit: [
    "debit",
    "debit amount",
    "withdrawal",
    "withdrawal amount",
    "withdrawn",
    "dr",
    "debit(inr)",
  ],
  credit: [
    "credit",
    "credit amount",
    "deposit",
    "deposit amount",
    "cr",
    "credit(inr)",
  ],
  amount: ["amount", "transaction amount", "txn amount", "value"],
  transactionType: ["type", "transaction type", "txn type", "dr/cr", "dr / cr"],
  reference: [
    "reference",
    "reference number",
    "ref no",
    "ref",
    "txn ref",
    "utr",
    "cheque no",
  ],
  balance: [
    "balance",
    "closing balance",
    "available balance",
    "running balance",
  ],
};

/**
 * Auto-detect which CSV headers map to known transaction fields.
 * @param {string[]} headers
 * @returns {{ mapping: Record<string, string|null>, confidence: number, unmappedRequired: string[] }}
 */
export function detectColumnMapping(headers) {
  const mapping = {
    date: null,
    description: null,
    debit: null,
    credit: null,
    amount: null,
    transactionType: null,
    reference: null,
    balance: null,
  };

  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

  for (const [field, aliases] of Object.entries(ALIAS_MAP)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.includes(normalizedHeaders[i])) {
        mapping[field] = headers[i]; // preserve original case
        break;
      }
    }
  }

  // Calculate confidence based on required fields
  const requiredChecks = [
    mapping.date !== null,
    mapping.description !== null,
    mapping.debit !== null ||
      mapping.credit !== null ||
      mapping.amount !== null,
  ];

  const mappedCount = requiredChecks.filter(Boolean).length;
  const confidence = mappedCount / requiredChecks.length;

  const unmappedRequired = [];
  if (!mapping.date) unmappedRequired.push("date");
  if (!mapping.description) unmappedRequired.push("description");
  if (!mapping.debit && !mapping.credit && !mapping.amount) {
    unmappedRequired.push("amount (debit, credit, or amount)");
  }

  return { mapping, confidence, unmappedRequired };
}

/**
 * Validate that a mapping contains the required fields.
 * @param {Record<string, string|null>} mapping
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateMapping(mapping) {
  const missing = [];

  if (!mapping.date) missing.push("date");
  if (!mapping.description) missing.push("description");
  if (!mapping.debit && !mapping.credit && !mapping.amount) {
    missing.push("amount (debit, credit, or amount)");
  }

  return { valid: missing.length === 0, missing };
}
