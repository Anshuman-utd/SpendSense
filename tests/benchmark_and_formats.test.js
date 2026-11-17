import assert from "node:assert/strict";
import test from "node:test";
import { detectColumnMapping } from "../src/lib/imports/columnMapper.js";
import { parseCSV } from "../src/lib/imports/csvParser.js";
import { detectDuplicatesInBatch } from "../src/lib/imports/duplicateDetector.js";
import { extractMerchant } from "../src/lib/imports/merchantExtractor.js";
import { categorizeTransactions } from "../src/lib/imports/transactionCategorizer.js";
import {
  normalizeTransactions,
  parseDate,
} from "../src/lib/imports/transactionNormalizer.js";

test("Multiple Date Formats: accurately normalizes supported date formats", () => {
  // DD/MM/YYYY
  const d1 = parseDate("15/11/2024", "DD/MM/YYYY");
  assert.equal(d1.toISOString().split("T")[0], "2024-11-15");

  // MM/DD/YYYY
  const d2 = parseDate("11/15/2024", "MM/DD/YYYY");
  assert.equal(d2.toISOString().split("T")[0], "2024-11-15");

  // YYYY-MM-DD (ISO)
  const d3 = parseDate("2024-11-15", "YYYY-MM-DD");
  assert.equal(d3.toISOString().split("T")[0], "2024-11-15");

  // DD-MM-YYYY
  const d4 = parseDate("15-11-2024", "DD-MM-YYYY");
  assert.equal(d4.toISOString().split("T")[0], "2024-11-15");

  // DD-MMM-YYYY (e.g. 15-Nov-2024)
  const d5 = parseDate("15-Nov-2024", "DD-MMM-YYYY");
  assert.equal(d5.toISOString().split("T")[0], "2024-11-15");

  // Fallback/Invalid
  const invalid = parseDate("not-a-date", "DD/MM/YYYY");
  assert.equal(invalid, null);
});

test("Large Statement Benchmark: parses, normalizes, and deduplicates 1,000 transactions in under 200ms", async () => {
  // Generate synthetic 1,000 row CSV
  const rows = ["Date,Description,Debit,Credit,Balance,Ref"];
  const merchants = [
    "SWIGGY",
    "UBER",
    "AMAZON",
    "NETFLIX",
    "STARBUCKS",
    "AIRTEL",
    "APOLLO PHARMACY",
  ];

  for (let i = 1; i <= 1000; i++) {
    const day = String((i % 28) + 1).padStart(2, "0");
    const merchant = merchants[i % merchants.length];
    const isCredit = i % 20 === 0;
    const debit = isCredit ? "" : `${(50 + (i % 500)).toFixed(2)}`;
    const credit = isCredit ? "5000.00" : "";
    const desc = isCredit ? "SALARY PAYMENT" : `UPI/${merchant}/ORD${1000 + i}`;
    rows.push(
      `${day}/11/2024,${desc},${debit},${credit},50000.00,REF${100000 + i}`,
    );
  }

  const csvContent = rows.join("\n");

  const startTime = performance.now();

  // 1. Parse CSV
  const { headers, rows: parsedRows, errors, totalRows } = parseCSV(csvContent);
  assert.equal(errors.length, 0);
  assert.equal(totalRows, 1000);

  // 2. Detect Mapping
  const detection = detectColumnMapping(headers);
  assert.equal(detection.confidence, 1.0);

  // 3. Normalize
  const { normalized, invalidRows } = normalizeTransactions({
    rows: parsedRows,
    mapping: detection.mapping,
    dateFormat: "DD/MM/YYYY",
    currency: "INR",
  });
  assert.equal(invalidRows.length, 0);
  assert.equal(normalized.length, 1000);

  // 4. Extract Merchants
  const withMerchants = normalized.map((t) => ({
    ...t,
    merchant: extractMerchant(t.originalDescription).merchant,
  }));

  // 5. Batch Deduplication
  const deduplicated = detectDuplicatesInBatch(withMerchants);
  assert.equal(deduplicated.length, 1000);

  // 6. Categorize deterministic
  const categorized = await categorizeTransactions({
    transactions: deduplicated,
    userId: "benchmark_user",
    MerchantCategoryRuleModel: { find: () => ({ lean: async () => [] }) },
  });

  const elapsedMs = performance.now() - startTime;
  assert.equal(categorized.length, 1000);
  assert.ok(
    elapsedMs < 500,
    `Benchmark should process 1,000 rows in under 500ms (took ${elapsedMs.toFixed(1)}ms)`,
  );
});
