import { sanitizeDescription, validateRow } from "./validation.js";

const MONTH_NAMES = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/**
 * Robust date parser supporting DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY, and month names.
 */
export function parseDate(dateStr, formatHint = "DD/MM/YYYY") {
  if (!dateStr || typeof dateStr !== "string") return null;
  const clean = dateStr.trim();

  // Check for DD-MMM-YYYY or DD MMM YYYY (e.g., 12 Nov 2024, 12-Nov-2024)
  const textMonthMatch = clean.match(
    /^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})$/,
  );
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const monthKey = textMonthMatch[2].toLowerCase();
    let year = parseInt(textMonthMatch[3], 10);
    if (year < 100) year += 2000;
    if (MONTH_NAMES[monthKey] !== undefined && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, MONTH_NAMES[monthKey], day));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  // Split on delimiters -, /, or .
  const parts = clean.split(/[-/.]/);
  if (parts.length !== 3) {
    const parsed = new Date(clean);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  let day, month, year;

  if (formatHint === "YYYY-MM-DD") {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else if (formatHint === "MM/DD/YYYY") {
    month = parseInt(parts[0], 10) - 1;
    day = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    // Default DD/MM/YYYY or DD-MM-YYYY
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    year = parseInt(parts[2], 10);
  }

  if (year < 100) year += 2000;

  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year))
    return null;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse monetary string into minor units (integer paise/cents) and sign.
 * Rejects non-numeric garbage instead of returning 0.
 * Returns { amountMinor: number, isNegative: boolean } or null on invalid.
 */
export function parseAmount(amountStr) {
  if (amountStr === null || amountStr === undefined) return null;
  let s = String(amountStr).trim();
  if (s === "" || s === "-" || s === "--") return null;

  let isNegative = false;

  // Check parenthesized negative: (450.50)
  if (s.startsWith("(") && s.endsWith(")")) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }

  if (s.startsWith("-")) {
    isNegative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }

  // Strip currency symbols (₹, $, €, £, ¥, Rs, INR, USD, etc.)
  s = s.replace(/^[₹$€£¥]|^(?:Rs\.?|INR|USD|EUR|GBP)\s*/i, "");
  s = s.replace(/[₹$€£¥]|(?:Rs\.?|INR|USD|EUR|GBP)$/i, "");

  // Remove thousands commas
  s = s.replace(/,/g, "").trim();

  if (!/^\d+(\.\d+)?$/.test(s)) {
    return null; // Malformed monetary value
  }

  const floatVal = parseFloat(s);
  if (Number.isNaN(floatVal)) return null;

  const amountMinor = Math.round(floatVal * 100);
  return { amountMinor, isNegative };
}

/**
 * Normalize an array of parsed CSV rows into canonical internal transactions.
 */
export function normalizeTransactions({
  rows,
  mapping,
  dateFormat = "DD/MM/YYYY",
  currency = "INR",
}) {
  const normalized = [];
  const invalidRows = [];

  rows.forEach((row, index) => {
    const validation = validateRow(row, mapping);
    if (!validation.valid) {
      invalidRows.push({
        sourceRowIndex: index + 1,
        row,
        errors: validation.errors,
      });
      return;
    }

    const rawDate = row[mapping.date];
    const rawDesc = row[mapping.description];
    const date = parseDate(rawDate, dateFormat);

    if (!date) {
      invalidRows.push({
        sourceRowIndex: index + 1,
        row,
        errors: [
          `Invalid date format: "${rawDate}" does not match ${dateFormat}`,
        ],
      });
      return;
    }

    let direction = null;
    let amountMinor = 0;

    const rawDebit = mapping.debit ? row[mapping.debit] : null;
    const rawCredit = mapping.credit ? row[mapping.credit] : null;
    const rawAmount = mapping.amount ? row[mapping.amount] : null;
    const rawType = mapping.transactionType
      ? row[mapping.transactionType]
      : null;

    const debitParsed = parseAmount(rawDebit);
    const creditParsed = parseAmount(rawCredit);
    const amountParsed = parseAmount(rawAmount);

    if (debitParsed && debitParsed.amountMinor > 0) {
      direction = "debit";
      amountMinor = debitParsed.amountMinor;
    } else if (creditParsed && creditParsed.amountMinor > 0) {
      direction = "credit";
      amountMinor = creditParsed.amountMinor;
    } else if (amountParsed && amountParsed.amountMinor > 0) {
      amountMinor = amountParsed.amountMinor;
      if (rawType) {
        const t = String(rawType).toLowerCase().trim();
        if (
          ["dr", "debit", "withdrawal", "w/d", "expense", "payment"].includes(t)
        ) {
          direction = "debit";
        } else if (
          ["cr", "credit", "deposit", "income", "refund"].includes(t)
        ) {
          direction = "credit";
        }
      }
      if (!direction) {
        // If amount was negative signed, it is a debit
        direction = amountParsed.isNegative ? "debit" : "credit";
      }
    }

    if (!direction || amountMinor <= 0) {
      invalidRows.push({
        sourceRowIndex: index + 1,
        row,
        errors: [
          "Could not determine valid non-zero amount or transaction direction",
        ],
      });
      return;
    }

    const sanitizedDesc = sanitizeDescription(rawDesc);
    const reference =
      mapping.reference && row[mapping.reference]
        ? String(row[mapping.reference]).trim()
        : "";

    // Initial basic classification
    const classification = direction === "debit" ? "expense" : "income";

    normalized.push({
      sourceRowIndex: index + 1,
      transactionDate: date,
      originalDescription: rawDesc.trim(),
      normalizedDescription: sanitizedDesc,
      merchant: "",
      direction,
      classification,
      amountMinor,
      currency: currency.toUpperCase(),
      bankReference: reference,
      validationErrors: [],
    });
  });

  return { normalized, invalidRows };
}
