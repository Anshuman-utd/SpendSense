import assert from "node:assert/strict";
import test from "node:test";
import {
  detectDuplicatesAgainstDB,
  detectDuplicatesInBatch,
  generateFingerprint,
} from "../src/lib/imports/duplicateDetector.js";

test("Duplicate Fingerprint: generates identical hash for identical attributes", () => {
  const txn1 = {
    transactionDate: new Date("2024-11-12"),
    amountMinor: 45000,
    direction: "debit",
    merchant: "Swiggy",
    normalizedDescription: "UPI/SWIGGY",
  };
  const txn2 = {
    transactionDate: new Date("2024-11-12"),
    amountMinor: 45000,
    direction: "debit",
    merchant: "Swiggy",
    normalizedDescription: "DIFFERENT RAW STRING",
  };

  const fp1 = generateFingerprint(txn1);
  const fp2 = generateFingerprint(txn2);
  assert.equal(fp1, fp2);
});

test("Duplicate Detector: detects duplicates within the same batch", () => {
  const date = new Date("2024-11-12");
  const batch = [
    {
      transactionDate: date,
      amountMinor: 45000,
      direction: "debit",
      merchant: "Swiggy",
      normalizedDescription: "Swiggy Order 1",
    },
    {
      transactionDate: date,
      amountMinor: 45000,
      direction: "debit",
      merchant: "Swiggy",
      normalizedDescription: "Swiggy Order 2",
    },
    {
      transactionDate: date,
      amountMinor: 32000, // different amount
      direction: "debit",
      merchant: "Uber",
      normalizedDescription: "Uber Trip",
    },
  ];

  const deduplicated = detectDuplicatesInBatch(batch);
  assert.equal(deduplicated.length, 3);
  // First occurrence is unique
  assert.equal(deduplicated[0].duplicateStatus, "unique");
  assert.equal(deduplicated[0].selected, true);

  // Second identical occurrence is flagged
  assert.equal(deduplicated[1].duplicateStatus, "possible_duplicate");
  assert.equal(deduplicated[1].reviewRequired, true);
  assert.equal(deduplicated[1].selected, false);

  // Third occurrence with different amount is unique
  assert.equal(deduplicated[2].duplicateStatus, "unique");
  assert.equal(deduplicated[2].selected, true);
});

test("Duplicate Detector: matches strong bank references against mock DB", async () => {
  const mockImported = [
    {
      _id: "imported_123",
      bankReference: "REF999",
      duplicateFingerprint: "dummy_fp",
    },
  ];

  const mockImportedModel = {
    find: () => ({
      select: () => ({
        lean: async () => mockImported,
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

  const txns = [
    {
      transactionDate: new Date("2024-11-12"),
      amountMinor: 45000,
      direction: "debit",
      merchant: "Swiggy",
      bankReference: "REF999",
      duplicateFingerprint: "fp_new",
      selected: true,
    },
  ];

  const result = await detectDuplicatesAgainstDB({
    userId: "user_1",
    accountId: "acc_1",
    transactions: txns,
    ImportedTransactionModel: mockImportedModel,
    ExpenseModel: mockExpenseModel,
  });

  assert.equal(result[0].duplicateStatus, "confirmed_duplicate");
  assert.equal(result[0].selected, false);
  assert.equal(result[0].reviewRequired, true);
});
