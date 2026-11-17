import Papa from "papaparse";
import { MAX_ROW_COUNT } from "./constants.js";

/**
 * Parse CSV text into structured rows.
 * @param {string} csvText - Raw CSV content
 * @returns {{ headers: string[], rows: object[], errors: any[], totalRows: number }}
 */
export function parseCSV(csvText) {
  // Strip BOM (UTF-8 / UTF-16)
  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // keep everything as strings
  });

  const headers = result.meta?.fields ?? [];
  const parseErrors = result.errors ?? [];

  if (headers.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: [{ type: "HeaderError", message: "No headers found in CSV" }],
      totalRows: 0,
    };
  }

  const allRows = result.data ?? [];
  const totalRows = allRows.length;

  if (totalRows === 0) {
    return {
      headers,
      rows: [],
      errors: [{ type: "DataError", message: "CSV contains no data rows" }],
      totalRows: 0,
    };
  }

  // Cap at MAX_ROW_COUNT
  const rows = allRows.slice(0, MAX_ROW_COUNT);

  const errors = [...parseErrors];
  if (totalRows > MAX_ROW_COUNT) {
    errors.push({
      type: "TruncationWarning",
      message: `CSV contains ${totalRows} rows; only the first ${MAX_ROW_COUNT} will be processed`,
    });
  }

  return { headers, rows, errors, totalRows };
}
