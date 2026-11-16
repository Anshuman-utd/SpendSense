import { MAX_FILE_SIZE } from "./constants.js";

/**
 * Validate an uploaded CSV file.
 * @param {{ buffer?: Buffer, filename?: string, size?: number, mimetype?: string }} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCSVFile(file) {
  if (!file) {
    return { valid: false, error: "No file provided" };
  }

  if (file.size && file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB)`,
    };
  }

  const name = file.filename || file.name || "";
  const hasCsvExt = name.toLowerCase().endsWith(".csv");
  const validMimes = [
    "text/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/csv",
    "text/comma-separated-values",
  ];
  const isCsvMime = file.mimetype
    ? validMimes.includes(file.mimetype.toLowerCase())
    : false;

  if (!hasCsvExt && !isCsvMime) {
    return { valid: false, error: "Only CSV (.csv) files are supported" };
  }

  if (file.buffer) {
    // Inspect initial bytes: ensure no null bytes / binary executables
    const checkSlice = file.buffer.slice(0, Math.min(1024, file.buffer.length));
    for (let i = 0; i < checkSlice.length; i++) {
      if (checkSlice[i] === 0) {
        return {
          valid: false,
          error:
            "The uploaded file appears to be a binary file, not a valid CSV text document",
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Sanitize raw transaction description strings.
 * Removes control characters, excessive whitespace, and caps length.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeDescription(text) {
  if (!text || typeof text !== "string") return "";
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitization of CSV text
      .replace(/[\x00-\x1F\x7F-\x9F]/g, " ") // Strip control characters
      .replace(/\s+/g, " ") // Collapse multiple whitespace
      .trim()
      .slice(0, 500)
  );
}

/**
 * Validate that a row has the minimal required fields mapped.
 */
export function validateRow(row, mapping) {
  const errors = [];
  if (!mapping.date || !row[mapping.date] || !row[mapping.date].trim()) {
    errors.push("Missing date");
  }
  if (
    !mapping.description ||
    !row[mapping.description] ||
    !row[mapping.description].trim()
  ) {
    errors.push("Missing description");
  }

  const hasDebit =
    mapping.debit && row[mapping.debit] && row[mapping.debit].trim();
  const hasCredit =
    mapping.credit && row[mapping.credit] && row[mapping.credit].trim();
  const hasAmount =
    mapping.amount && row[mapping.amount] && row[mapping.amount].trim();

  if (!hasDebit && !hasCredit && !hasAmount) {
    errors.push("Missing amount value (no debit, credit, or amount found)");
  }

  return { valid: errors.length === 0, errors };
}
