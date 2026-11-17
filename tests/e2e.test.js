import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { detectColumnMapping } from "../src/lib/imports/columnMapper.js";
import { parseCSV } from "../src/lib/imports/csvParser.js";
import { detectDuplicatesInBatch } from "../src/lib/imports/duplicateDetector.js";
import { extractMerchant } from "../src/lib/imports/merchantExtractor.js";
import { categorizeTransactions } from "../src/lib/imports/transactionCategorizer.js";
import { normalizeTransactions } from "../src/lib/imports/transactionNormalizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("End-to-End Ingestion Pipeline: processes realistic statement fixture", async () => {
  // 1. Read Fixture
  const fixturePath = path.join(__dirname, "fixtures", "sample_statement.csv");
  const csvContent = fs.readFileSync(fixturePath, "utf8");

  // 2. Parse CSV
  const { headers, rows, totalRows } = parseCSV(csvContent);
  assert.equal(totalRows, 9);
  assert.deepEqual(headers, [
    "Date",
    "Description",
    "Debit",
    "Credit",
    "Balance",
    "Reference",
  ]);

  // 3. Detect Columns
  const detection = detectColumnMapping(headers);
  assert.equal(detection.confidence, 1.0);
  assert.equal(detection.mapping.date, "Date");
  assert.equal(detection.mapping.description, "Description");
  assert.equal(detection.mapping.debit, "Debit");
  assert.equal(detection.mapping.credit, "Credit");
  assert.equal(detection.mapping.reference, "Reference");

  // 4. Normalize
  const { normalized, invalidRows } = normalizeTransactions({
    rows,
    mapping: detection.mapping,
    dateFormat: "DD/MM/YYYY",
    currency: "INR",
  });

  // 8 valid transactions + 1 invalid row
  assert.equal(normalized.length, 8);
  assert.equal(invalidRows.length, 1);
  assert.equal(invalidRows[0].sourceRowIndex, 9);

  // 5. Extract Merchants
  const withMerchants = normalized.map((t) => {
    const ext = extractMerchant(t.originalDescription);
    return {
      ...t,
      merchant: ext.merchant,
      classificationConfidence: ext.confidence,
    };
  });

  assert.equal(withMerchants[0].merchant, "Swiggy");
  assert.equal(withMerchants[1].merchant, "Uber");
  assert.equal(withMerchants[2].merchant, "Netflix");
  assert.equal(withMerchants[4].merchant, "Amazon");

  // 6. Detect Duplicates
  const deduplicated = detectDuplicatesInBatch(withMerchants);
  // Row 8 is a duplicate of Row 1 (same date, amount, merchant)
  const duplicateRow = deduplicated.find((t) => t.sourceRowIndex === 8);
  assert.ok(duplicateRow);
  assert.equal(duplicateRow.duplicateStatus, "possible_duplicate");
  assert.equal(duplicateRow.selected, false); // Crucial: not selected by default

  // 7. Categorize
  const categorized = await categorizeTransactions({
    transactions: deduplicated,
    userId: "test_user_id",
    MerchantCategoryRuleModel: { find: () => ({ lean: async () => [] }) },
  });

  // Row 1: Swiggy Debit -> Food, Expense, Selected
  assert.equal(categorized[0].category, "Food");
  assert.equal(categorized[0].classification, "expense");
  assert.equal(categorized[0].selected, true);
  assert.equal(categorized[0].amountMinor, 45000);

  // Row 2: Uber Debit -> Transport, Expense, Selected
  assert.equal(categorized[1].category, "Transport");
  assert.equal(categorized[1].classification, "expense");
  assert.equal(categorized[1].selected, true);

  // Row 3: Netflix Debit -> Entertainment, Expense, Selected
  assert.equal(categorized[2].category, "Entertainment");
  assert.equal(categorized[2].classification, "expense");
  assert.equal(categorized[2].selected, true);

  // Row 4: Salary Credit -> Income, NOT selected
  assert.equal(categorized[3].category, "Income");
  assert.equal(categorized[3].classification, "income");
  assert.equal(categorized[3].selected, false);

  // Row 5: Amazon Debit -> Shopping, Expense, Selected
  assert.equal(categorized[4].category, "Shopping");
  assert.equal(categorized[4].classification, "expense");
  assert.equal(categorized[4].selected, true);

  // Row 6: Refund -> Refund, NOT selected
  assert.equal(categorized[5].classification, "refund");
  assert.equal(categorized[5].selected, false);

  // Row 7: Transfer to savings -> Transfer, NOT selected
  assert.equal(categorized[6].classification, "transfer");
  assert.equal(categorized[6].selected, false);

  // Row 8: Duplicate Swiggy -> Duplicate, NOT selected
  assert.equal(categorized[7].duplicateStatus, "possible_duplicate");
  assert.equal(categorized[7].selected, false);

  // Summary calculation
  const eligibleExpenses = categorized.filter(
    (t) => t.selected && t.classification === "expense",
  );
  // Only Swiggy(450), Uber(320), Netflix(649), Amazon(1299) = 4 transactions
  assert.equal(eligibleExpenses.length, 4);
  const totalSpent = eligibleExpenses.reduce(
    (sum, t) => sum + t.amountMinor / 100,
    0,
  );
  assert.equal(totalSpent, 450 + 320 + 649 + 1299);
});
