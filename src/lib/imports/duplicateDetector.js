import crypto from "node:crypto";
import { normalizeMerchantKey } from "./merchantExtractor.js";

/**
 * Generate a deterministic duplicate fingerprint for a transaction.
 */
export function generateFingerprint({
  transactionDate,
  amountMinor,
  direction,
  merchant,
  normalizedDescription,
}) {
  const dateStr =
    transactionDate instanceof Date
      ? transactionDate.toISOString().split("T")[0]
      : String(transactionDate).split("T")[0];

  const merchantKey =
    normalizeMerchantKey(merchant) ||
    normalizeMerchantKey(normalizedDescription);
  const raw = `${dateStr}|${amountMinor}|${direction}|${merchantKey}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Detect duplicates within the current import batch.
 */
export function detectDuplicatesInBatch(transactions) {
  const seenFingerprints = new Map();

  return transactions.map((txn, index) => {
    const fp = generateFingerprint(txn);
    txn.duplicateFingerprint = fp;

    if (seenFingerprints.has(fp)) {
      return {
        ...txn,
        duplicateStatus: "possible_duplicate",
        reviewRequired: true,
        selected: false, // Do not auto-select suspected duplicates
      };
    }

    seenFingerprints.set(fp, index);
    return {
      ...txn,
      duplicateStatus: "unique",
      reviewRequired: false,
      selected: txn.direction === "debit", // auto-select spending, deselect income by default
    };
  });
}

/**
 * Detect duplicates against existing database records (ImportedTransaction and Expense).
 */
export async function detectDuplicatesAgainstDB({
  userId,
  accountId,
  transactions,
  ImportedTransactionModel,
  ExpenseModel,
}) {
  if (!transactions || transactions.length === 0) return [];

  // Collect all fingerprints and bank references from the batch
  const fingerprints = transactions
    .map((t) => t.duplicateFingerprint)
    .filter(Boolean);
  const bankRefs = transactions
    .map((t) => t.bankReference)
    .filter((r) => r && r.length > 3);

  // 1. Query existing ImportedTransactions for this user & account
  const existingImportedQuery = {
    userId,
    accountId,
    $or: [],
  };

  if (fingerprints.length > 0) {
    existingImportedQuery.$or.push({
      duplicateFingerprint: { $in: fingerprints },
    });
  }
  if (bankRefs.length > 0) {
    existingImportedQuery.$or.push({ bankReference: { $in: bankRefs } });
  }

  let existingImported = [];
  if (existingImportedQuery.$or.length > 0) {
    existingImported = await ImportedTransactionModel.find(
      existingImportedQuery,
    )
      .select(
        "_id bankReference duplicateFingerprint transactionDate amountMinor",
      )
      .lean();
  }

  const existingImportedByRef = new Map();
  const existingImportedByFp = new Map();
  existingImported.forEach((doc) => {
    if (doc.bankReference)
      existingImportedByRef.set(doc.bankReference, doc._id);
    if (doc.duplicateFingerprint)
      existingImportedByFp.set(doc.duplicateFingerprint, doc._id);
  });

  // 2. Query existing Expenses for this user by date range
  const dates = transactions.map((t) => t.transactionDate).filter(Boolean);
  const minDate = new Date(
    Math.min(...dates.map((d) => new Date(d).getTime())),
  );
  const maxDate = new Date(
    Math.max(...dates.map((d) => new Date(d).getTime())),
  );
  // Expand by 1 day on each side to account for timezones
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 1);

  const existingExpenses = await ExpenseModel.find({
    userId,
    date: { $gte: minDate, $lte: maxDate },
  })
    .select(
      "_id amount date merchant description sourceReference importedTransactionId",
    )
    .lean();

  const existingExpensesByRef = new Map();
  const existingExpenseKeys = new Set();

  existingExpenses.forEach((exp) => {
    if (exp.sourceReference) {
      existingExpensesByRef.set(exp.sourceReference, exp._id);
    }
    const expDateStr = new Date(exp.date).toISOString().split("T")[0];
    const expAmountMinor = Math.round(exp.amount * 100);
    const expKey = `${expDateStr}|${expAmountMinor}`;
    existingExpenseKeys.add(expKey);
  });

  // 3. Mark transactions
  return transactions.map((txn) => {
    // Strong match via bankReference
    if (txn.bankReference) {
      if (existingImportedByRef.has(txn.bankReference)) {
        return {
          ...txn,
          duplicateStatus: "confirmed_duplicate",
          duplicateOfTransactionId: existingImportedByRef.get(
            txn.bankReference,
          ),
          reviewRequired: true,
          selected: false,
        };
      }
      if (existingExpensesByRef.has(txn.bankReference)) {
        return {
          ...txn,
          duplicateStatus: "confirmed_duplicate",
          reviewRequired: true,
          selected: false,
        };
      }
    }

    // Fingerprint match against existing imported transactions
    if (
      txn.duplicateFingerprint &&
      existingImportedByFp.has(txn.duplicateFingerprint)
    ) {
      return {
        ...txn,
        duplicateStatus: "possible_duplicate",
        duplicateOfTransactionId: existingImportedByFp.get(
          txn.duplicateFingerprint,
        ),
        reviewRequired: true,
        selected: false,
      };
    }

    // Match against existing manual/scanned expenses (date + amount)
    const txnDateStr = new Date(txn.transactionDate)
      .toISOString()
      .split("T")[0];
    const expenseKey = `${txnDateStr}|${txn.amountMinor}`;
    if (txn.direction === "debit" && existingExpenseKeys.has(expenseKey)) {
      return {
        ...txn,
        duplicateStatus: "possible_duplicate",
        reviewRequired: true,
        selected: false,
      };
    }

    // Retain existing status if already marked in batch
    return txn;
  });
}
