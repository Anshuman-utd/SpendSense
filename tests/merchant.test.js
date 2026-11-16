import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMerchant,
  normalizeMerchantKey,
} from "../src/lib/imports/merchantExtractor.js";

test("Merchant Extractor: identifies known merchants with banking prefixes", () => {
  const cases = [
    { desc: "UPI/SWIGGY/98376282/XYZ", expected: "Swiggy" },
    { desc: "UPI-SWIGGY-BANGALORE-28282", expected: "Swiggy" },
    { desc: "POS SWIGGY LTD", expected: "Swiggy" },
    { desc: "UBER TRIP BANGALORE", expected: "Uber" },
    { desc: "AMAZON PAY RETAIL INDIA", expected: "Amazon" },
    { desc: "NETFLIX.COM MONTHLY SUB", expected: "Netflix" },
    { desc: "ZOMATO UPI ORDER 9821", expected: "Zomato" },
    { desc: "DOMINOS PIZZA ONLINE", expected: "Domino's" },
    { desc: "AIRTEL PREPAID RECHARGE", expected: "Airtel" },
    { desc: "SPOTIFY INDIA SUBSCRIPTION", expected: "Spotify" },
  ];

  cases.forEach(({ desc, expected }) => {
    const res = extractMerchant(desc);
    assert.equal(res.merchant, expected, `Failed for description: "${desc}"`);
    assert.equal(res.confidence > 0.8, true);
  });
});

test("Merchant Extractor: cleans generic merchant tokens when unknown", () => {
  const desc = "POS GREEN LEAF GROCERY PVT LTD";
  const res = extractMerchant(desc);
  assert.equal(res.merchant.toLowerCase().includes("green leaf"), true);
});

test("normalizeMerchantKey: produces consistent lowercase alphanumeric key", () => {
  assert.equal(normalizeMerchantKey("Swiggy"), "swiggy");
  assert.equal(normalizeMerchantKey("Domino's Pizza"), "dominospizza");
  assert.equal(normalizeMerchantKey("Amazon Pay"), "amazonpay");
});
