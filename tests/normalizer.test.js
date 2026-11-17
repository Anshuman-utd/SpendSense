import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTransactions,
  parseAmount,
  parseDate,
} from "../src/lib/imports/transactionNormalizer.js";

test("Date Normalizer: parses various supported date formats", () => {
  // DD/MM/YYYY
  const d1 = parseDate("15/11/2024", "DD/MM/YYYY");
  assert.equal(d1.getUTCDate(), 15);
  assert.equal(d1.getUTCMonth(), 10); // Nov is 10
  assert.equal(d1.getUTCFullYear(), 2024);

  // YYYY-MM-DD
  const d2 = parseDate("2024-11-15", "YYYY-MM-DD");
  assert.equal(d2.getUTCDate(), 15);
  assert.equal(d2.getUTCMonth(), 10);

  // Month text: 15 Nov 2024 or 15-Nov-2024
  const d3 = parseDate("15-Nov-2024");
  assert.equal(d3.getUTCDate(), 15);
  assert.equal(d3.getUTCMonth(), 10);

  // Invalid date returns null
  const invalid = parseDate("not-a-date");
  assert.equal(invalid, null);
});

test("Amount Normalizer: handles currency symbols, commas, and parenthesized negatives", () => {
  // Plain float
  const a1 = parseAmount("450.50");
  assert.equal(a1.amountMinor, 45050);
  assert.equal(a1.isNegative, false);

  // Currency symbol and thousands comma: ₹50,000.00
  const a2 = parseAmount("₹50,000.00");
  assert.equal(a2.amountMinor, 5000000);
  assert.equal(a2.isNegative, false);

  // Parenthesized negative: (1,249.99)
  const a3 = parseAmount("(1,249.99)");
  assert.equal(a3.amountMinor, 124999);
  assert.equal(a3.isNegative, true);

  // Rejection of malformed strings (Rule: Reject malformed rather than converting to zero)
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("45.22.11"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount(null), null);
});

test("Transaction Normalizer: converts rows into canonical representations", () => {
  const rows = [
    {
      Date: "12/11/2024",
      Narration: "Swiggy Order",
      Debit: "450.00",
      Credit: "",
      Ref: "REF1",
    },
    {
      Date: "15/11/2024",
      Narration: "Salary Credit",
      Debit: "",
      Credit: "50,000.00",
      Ref: "REF2",
    },
    {
      Date: "99/99/9999",
      Narration: "Malformed Date",
      Debit: "100",
      Credit: "",
    },
  ];

  const mapping = {
    date: "Date",
    description: "Narration",
    debit: "Debit",
    credit: "Credit",
    reference: "Ref",
  };

  const { normalized, invalidRows } = normalizeTransactions({
    rows,
    mapping,
    dateFormat: "DD/MM/YYYY",
    currency: "INR",
  });

  assert.equal(normalized.length, 2);
  assert.equal(invalidRows.length, 1);

  // Check row 1 (Debit)
  assert.equal(normalized[0].direction, "debit");
  assert.equal(normalized[0].amountMinor, 45000);
  assert.equal(normalized[0].classification, "expense");
  assert.equal(normalized[0].bankReference, "REF1");

  // Check row 2 (Credit)
  assert.equal(normalized[1].direction, "credit");
  assert.equal(normalized[1].amountMinor, 5000000);
  assert.equal(normalized[1].classification, "income");
  assert.equal(normalized[1].bankReference, "REF2");

  // Check invalid row isolated
  assert.equal(invalidRows[0].sourceRowIndex, 3);
});
