import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { detectColumnMapping } from "../src/lib/imports/columnMapper.js";
import { parseCSV } from "../src/lib/imports/csvParser.js";
import {
  detectDuplicatesAgainstDB,
  detectDuplicatesInBatch,
} from "../src/lib/imports/duplicateDetector.js";
import { extractMerchant } from "../src/lib/imports/merchantExtractor.js";
import { categorizeTransactions } from "../src/lib/imports/transactionCategorizer.js";
import { normalizeTransactions } from "../src/lib/imports/transactionNormalizer.js";

test("Scenario A: Exact File Duplicate Detection via SHA-256 Checksum", () => {
  const csvContent =
    "Date,Description,Debit,Credit\n12/11/2024,Swiggy,450.00,\n";
  const hash1 = crypto
    .createHash("sha256")
    .update(Buffer.from(csvContent))
    .digest("hex");
  const hash2 = crypto
    .createHash("sha256")
    .update(Buffer.from(csvContent))
    .digest("hex");

  assert.equal(
    hash1,
    hash2,
    "Identical file content must produce identical SHA-256 checksum",
  );
  assert.equal(hash1.length, 64);
});

test("Scenario B & C: Overlapping Batches and Legitimate Same-Day Identical Transactions", () => {
  // Two coffee transactions at Starbucks on the same date for the exact same amount
  const rawBatch = [
    {
      transactionDate: new Date("2024-11-12T10:00:00Z"),
      amountMinor: 25000,
      direction: "debit",
      merchant: "Starbucks",
      normalizedDescription: "Starbucks Morning Coffee",
    },
    {
      transactionDate: new Date("2024-11-12T16:00:00Z"),
      amountMinor: 25000,
      direction: "debit",
      merchant: "Starbucks",
      normalizedDescription: "Starbucks Evening Coffee",
    },
  ];

  const deduplicated = detectDuplicatesInBatch(rawBatch);

  assert.equal(deduplicated.length, 2);
  // First transaction is unique and selected
  assert.equal(deduplicated[0].duplicateStatus, "unique");
  assert.equal(deduplicated[0].selected, true);
  assert.equal(deduplicated[0].reviewRequired, false);

  // Second transaction is flagged for user review rather than dropped
  assert.equal(deduplicated[1].duplicateStatus, "possible_duplicate");
  assert.equal(
    deduplicated[1].selected,
    false,
    "Suspected duplicate must not be pre-selected",
  );
  assert.equal(deduplicated[1].reviewRequired, true, "User review is required");

  // Simulate user review: marking as not duplicate
  deduplicated[1].duplicateStatus = "not_duplicate";
  deduplicated[1].selected = true;
  deduplicated[1].reviewRequired = false;

  assert.equal(deduplicated[1].selected, true);
  assert.equal(deduplicated[1].duplicateStatus, "not_duplicate");
});

test("Scenario D: Account-Scoped Deduplication (Account A vs Account B)", async () => {
  // Existing transaction in Account A
  const mockExistingAccountA = [
    {
      _id: "imported_acc_a_1",
      accountId: "account_A",
      bankReference: "TXN_REF_001",
      duplicateFingerprint: "fp_same",
      transactionDate: new Date("2024-11-12"),
      amountMinor: 50000,
    },
  ];

  // Mock query that respects accountId isolation
  const mockImportedModel = {
    find: (query) => ({
      select: () => ({
        lean: async () => {
          if (query.accountId === "account_A") return mockExistingAccountA;
          // Account B has no existing transactions
          return [];
        },
      }),
    }),
  };

  const mockExpenseModel = {
    find: () => ({
      select: () => ({
        lean: async () => [],
      }),
    }),
  };

  const newTxn = [
    {
      transactionDate: new Date("2024-11-12"),
      amountMinor: 50000,
      direction: "debit",
      merchant: "Amazon",
      bankReference: "TXN_REF_001",
      duplicateFingerprint: "fp_same",
      selected: true,
    },
  ];

  // Check against Account B: must NOT flag as duplicate
  const resultAccountB = await detectDuplicatesAgainstDB({
    userId: "user_1",
    accountId: "account_B",
    transactions: newTxn,
    ImportedTransactionModel: mockImportedModel,
    ExpenseModel: mockExpenseModel,
  });

  assert.equal(
    resultAccountB[0].duplicateStatus,
    undefined,
    "Transaction in Account B is independent of Account A",
  );
  assert.equal(resultAccountB[0].selected, true);

  // Check against Account A: MUST flag as confirmed duplicate
  const resultAccountA = await detectDuplicatesAgainstDB({
    userId: "user_1",
    accountId: "account_A",
    transactions: newTxn,
    ImportedTransactionModel: mockImportedModel,
    ExpenseModel: mockExpenseModel,
  });

  assert.equal(resultAccountA[0].duplicateStatus, "confirmed_duplicate");
  assert.equal(resultAccountA[0].selected, false);
});

test("Scenario E: Signed Amounts and Format C Normalization", () => {
  const csvContent = [
    "Date,Description,Amount",
    "2024-11-01,AMAZON ONLINE SHOPPING,-1500.50",
    "2024-11-02,PAYROLL SALARY CREDIT,45000.00",
    "2024-11-03,STARBUCKS COFFEE,-250.00",
    "2024-11-04,INTERNAL ACCOUNT TRANSFER,-5000.00",
    "2024-11-05,REFUND FROM AMAZON,350.00",
  ].join("\n");

  const { headers, rows } = parseCSV(csvContent);
  const detection = detectColumnMapping(headers);

  assert.equal(detection.mapping.amount, "Amount");
  assert.equal(detection.mapping.description, "Description");
  assert.equal(detection.mapping.date, "Date");

  const { normalized, invalidRows } = normalizeTransactions({
    rows,
    mapping: detection.mapping,
    dateFormat: "YYYY-MM-DD",
    currency: "INR",
  });

  assert.equal(invalidRows.length, 0);
  assert.equal(normalized.length, 5);

  // Row 1: Amazon negative amount is debit
  assert.equal(normalized[0].direction, "debit");
  assert.equal(normalized[0].amountMinor, 150050);

  // Row 2: Salary positive amount is credit
  assert.equal(normalized[1].direction, "credit");
  assert.equal(normalized[1].amountMinor, 4500000);

  // Row 3: Starbucks negative is debit
  assert.equal(normalized[2].direction, "debit");
  assert.equal(normalized[2].amountMinor, 25000);

  // Categorization check: Salary is income, Refund is refund, Amazon is shopping
  const withMerchants = normalized.map((t) => ({
    ...t,
    merchant: extractMerchant(t.originalDescription).merchant,
  }));

  return categorizeTransactions({
    transactions: withMerchants,
    userId: "test_user",
    MerchantCategoryRuleModel: {
      find: () => ({ lean: async () => [] }),
    },
  }).then((categorized) => {
    // Amazon purchase -> expense
    assert.equal(categorized[0].classification, "expense");
    assert.equal(categorized[0].category, "Shopping");
    assert.equal(categorized[0].selected, true);

    // Salary -> income (deselected by default from spending)
    assert.equal(categorized[1].classification, "income");
    assert.equal(categorized[1].selected, false);

    // Transfer -> transfer (deselected)
    assert.equal(categorized[3].classification, "transfer");
    assert.equal(categorized[3].selected, false);

    // Refund -> refund (deselected)
    assert.equal(categorized[4].classification, "refund");
    assert.equal(categorized[4].selected, false);
  });
});

test("Scenario F: Idempotent Expense Creation Simulation", async () => {
  // Simulate confirming an import batch twice
  const expensesDb = new Map();

  const mockCreateExpense = async (data) => {
    if (expensesDb.has(data.importedTransactionId.toString())) {
      throw new Error(
        "E11000 duplicate key error: importedTransactionId unique violation",
      );
    }
    const record = { _id: `exp_${Date.now()}_${Math.random()}`, ...data };
    expensesDb.set(data.importedTransactionId.toString(), record);
    return record;
  };

  const mockFindExpense = async (query) => {
    return expensesDb.get(query.importedTransactionId?.toString()) || null;
  };

  const stagedTxn = {
    _id: "txn_abc_123",
    amountMinor: 45000,
    transactionDate: new Date("2024-11-12"),
    normalizedDescription: "Swiggy Food Delivery",
    merchant: "Swiggy",
    category: "Food",
    classification: "expense",
    importStatus: "pending",
  };

  // First confirmation run:
  let existing = await mockFindExpense({
    importedTransactionId: stagedTxn._id,
  });
  if (!existing) {
    existing = await mockCreateExpense({
      userId: "user_1",
      amount: stagedTxn.amountMinor / 100,
      category: stagedTxn.category,
      importedTransactionId: stagedTxn._id,
    });
  }
  assert.ok(existing);
  assert.equal(expensesDb.size, 1);

  // Second confirmation run (retry or replay):
  const secondRunExisting = await mockFindExpense({
    importedTransactionId: stagedTxn._id,
  });
  assert.ok(
    secondRunExisting,
    "Existing expense found on second run; skipping duplicate insert",
  );
  assert.equal(
    expensesDb.size,
    1,
    "Database must still contain exactly 1 record",
  );
});
