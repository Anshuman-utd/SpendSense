import assert from "node:assert/strict";
import test from "node:test";
import {
  detectColumnMapping,
  validateMapping,
} from "../src/lib/imports/columnMapper.js";
import { parseCSV } from "../src/lib/imports/csvParser.js";

test("CSV Parser: parses basic CSV and strips BOM", () => {
  const csvWithBom =
    "\uFEFFDate,Description,Amount\n2024-01-01,Test Expense,100";
  const result = parseCSV(csvWithBom);
  assert.equal(result.headers.length, 3);
  assert.equal(result.headers[0], "Date");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].Description, "Test Expense");
});

test("CSV Parser: handles quoted values with embedded commas and whitespace", () => {
  const csv =
    'Date,Description,Amount\n2024-01-01,"Coffee, tea, and snacks",250.50\n\n';
  const result = parseCSV(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].Description, "Coffee, tea, and snacks");
  assert.equal(result.rows[0].Amount, "250.50");
});

test("CSV Parser: returns error for empty CSV or headers only", () => {
  const empty = "";
  const resEmpty = parseCSV(empty);
  assert.equal(resEmpty.rows.length, 0);

  const headersOnly = "Date,Description,Amount\n";
  const resHeaders = parseCSV(headersOnly);
  assert.equal(resHeaders.rows.length, 0);
  assert.equal(resHeaders.errors.length > 0, true);
});

test("Column Mapper: detects Format A (Date, Description, Debit, Credit)", () => {
  const headers = ["Date", "Description", "Debit", "Credit", "Balance"];
  const detected = detectColumnMapping(headers);
  assert.equal(detected.confidence, 1.0);
  assert.equal(detected.mapping.date, "Date");
  assert.equal(detected.mapping.description, "Description");
  assert.equal(detected.mapping.debit, "Debit");
  assert.equal(detected.mapping.credit, "Credit");
  assert.equal(detected.unmappedRequired.length, 0);
});

test("Column Mapper: detects Format B (Transaction Date, Narration, Withdrawal Amount, Deposit Amount)", () => {
  const headers = [
    "Transaction Date",
    "Narration",
    "Withdrawal Amount",
    "Deposit Amount",
    "Closing Balance",
  ];
  const detected = detectColumnMapping(headers);
  assert.equal(detected.confidence, 1.0);
  assert.equal(detected.mapping.date, "Transaction Date");
  assert.equal(detected.mapping.description, "Narration");
  assert.equal(detected.mapping.debit, "Withdrawal Amount");
  assert.equal(detected.mapping.credit, "Deposit Amount");
});

test("Column Mapper: detects Format C (Date, Details, Amount, Transaction Type)", () => {
  const headers = [
    "Date",
    "Details",
    "Amount",
    "Transaction Type",
    "Reference Number",
  ];
  const detected = detectColumnMapping(headers);
  assert.equal(detected.confidence, 1.0);
  assert.equal(detected.mapping.date, "Date");
  assert.equal(detected.mapping.description, "Details");
  assert.equal(detected.mapping.amount, "Amount");
  assert.equal(detected.mapping.transactionType, "Transaction Type");
  assert.equal(detected.mapping.reference, "Reference Number");
});

test("Column Mapper: validates required fields", () => {
  const valid = validateMapping({
    date: "Date",
    description: "Desc",
    debit: "Debit",
  });
  assert.equal(valid.valid, true);

  const missingAmount = validateMapping({ date: "Date", description: "Desc" });
  assert.equal(missingAmount.valid, false);
  assert.equal(
    missingAmount.missing.includes("amount (debit, credit, or amount)"),
    true,
  );

  const missingDate = validateMapping({
    description: "Desc",
    amount: "Amount",
  });
  assert.equal(missingDate.valid, false);
  assert.equal(missingDate.missing.includes("date"), true);
});
