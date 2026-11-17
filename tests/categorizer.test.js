import assert from "node:assert/strict";
import test from "node:test";
import { categorizeTransactions } from "../src/lib/imports/transactionCategorizer.js";

test("Categorizer: Level 1 user rules take precedence over deterministic rules", async () => {
  // Suppose Swiggy would normally be Food, but user defined Swiggy -> 'Personal'
  const mockUserRules = [
    { normalizedMerchant: "swiggy", category: "Personal" },
  ];

  const mockRuleModel = {
    find: () => ({
      lean: async () => mockUserRules,
    }),
  };

  const txns = [
    {
      merchant: "Swiggy",
      originalDescription: "UPI/SWIGGY",
      direction: "debit",
      duplicateStatus: "unique",
    },
  ];

  const categorized = await categorizeTransactions({
    transactions: txns,
    userId: "user_1",
    MerchantCategoryRuleModel: mockRuleModel,
  });

  assert.equal(categorized[0].category, "Personal");
  assert.equal(categorized[0].classificationSource, "user_rule");
  assert.equal(categorized[0].classificationConfidence, 1.0);
});

test("Categorizer: Level 2 deterministic patterns match common expenses", async () => {
  const mockRuleModel = {
    find: () => ({ lean: async () => [] }),
  };

  const txns = [
    { merchant: "Uber", originalDescription: "UBER TRIP", direction: "debit" },
    {
      merchant: "Netflix",
      originalDescription: "NETFLIX.COM SUB",
      direction: "debit",
    },
    {
      merchant: "Amazon",
      originalDescription: "AMAZON PAY RETAIL",
      direction: "debit",
    },
    {
      merchant: "Airtel",
      originalDescription: "AIRTEL PREPAID",
      direction: "debit",
    },
  ];

  const categorized = await categorizeTransactions({
    transactions: txns,
    userId: "user_1",
    MerchantCategoryRuleModel: mockRuleModel,
  });

  assert.equal(categorized[0].category, "Transport");
  assert.equal(categorized[1].category, "Entertainment");
  assert.equal(categorized[2].category, "Shopping");
  assert.equal(categorized[3].category, "Utilities");
});

test("Categorizer: separates credits, refunds, and transfers from spending expenses", async () => {
  const mockRuleModel = {
    find: () => ({ lean: async () => [] }),
  };

  const txns = [
    // 1. Spending debit
    {
      merchant: "Swiggy",
      originalDescription: "SWIGGY ORDER",
      direction: "debit",
    },
    // 2. Salary credit
    {
      merchant: "Acme Corp",
      originalDescription: "SALARY CREDIT ACME CORP",
      direction: "credit",
    },
    // 3. Refund
    {
      merchant: "Swiggy",
      originalDescription: "REFUND SWIGGY ORDER",
      direction: "credit",
    },
    // 4. Internal transfer
    {
      merchant: "",
      originalDescription: "TRANSFER TO OWN ACCOUNT",
      direction: "debit",
    },
  ];

  const categorized = await categorizeTransactions({
    transactions: txns,
    userId: "user_1",
    MerchantCategoryRuleModel: mockRuleModel,
  });

  // 1. Spending is selected
  assert.equal(categorized[0].classification, "expense");
  assert.equal(categorized[0].selected, true);

  // 2. Salary is income, NOT selected
  assert.equal(categorized[1].classification, "income");
  assert.equal(categorized[1].selected, false);

  // 3. Refund is refund, NOT selected
  assert.equal(categorized[2].classification, "refund");
  assert.equal(categorized[2].selected, false);

  // 4. Transfer is transfer, NOT selected
  assert.equal(categorized[3].classification, "transfer");
  assert.equal(categorized[3].selected, false);
});
