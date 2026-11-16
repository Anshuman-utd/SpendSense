import Expense from "../../models/Expense.js";
import ImportedTransaction from "../../models/ImportedTransaction.js";
import ImportJob from "../../models/ImportJob.js";
import MerchantCategoryRule from "../../models/MerchantCategoryRule.js";
import dbConnect from "../db.js";
import { deleteFromGridFS, readFromGridFSAsText } from "../gridfs.js";
import { detectColumnMapping, validateMapping } from "./columnMapper.js";
import { parseCSV } from "./csvParser.js";
import {
  detectDuplicatesAgainstDB,
  detectDuplicatesInBatch,
} from "./duplicateDetector.js";
import { extractMerchant } from "./merchantExtractor.js";
import { categorizeTransactions } from "./transactionCategorizer.js";
import { normalizeTransactions } from "./transactionNormalizer.js";

/**
 * Main background pipeline to process an uploaded import job.
 */
export async function processImportJob(importJobId) {
  await dbConnect();

  const job = await ImportJob.findById(importJobId);
  if (!job) {
    throw new Error(`Import job ${importJobId} not found`);
  }

  if (job.status === "completed" || job.status === "cancelled") {
    return job;
  }

  try {
    // Step 1: Read CSV content from GridFS
    job.status = "processing";
    job.startedAt = job.startedAt || new Date();
    job.progress = {
      stage: "Reading statement file",
      percent: 10,
      message: "Reading statement from secure storage...",
    };
    await job.save();

    if (!job.gridFSFileId) {
      throw new Error("No statement file found in storage for this job");
    }

    const csvText = await readFromGridFSAsText(job.gridFSFileId);
    if (!csvText || !csvText.trim()) {
      throw new Error("The uploaded CSV file is empty");
    }

    // Step 2: Parse CSV
    job.progress = {
      stage: "Parsing statement",
      percent: 25,
      message: "Parsing rows and headers...",
    };
    await job.save();

    const { headers, rows, errors: parseErrors, totalRows } = parseCSV(csvText);
    job.totalRows = totalRows;

    if (
      parseErrors.some(
        (e) => e.type === "HeaderError" || e.type === "DataError",
      )
    ) {
      const errorMsg = parseErrors.map((e) => e.message).join("; ");
      throw new Error(`CSV parsing error: ${errorMsg}`);
    }

    // Step 3: Column Mapping
    let mapping = job.selectedMapping;
    if (!mapping || !validateMapping(mapping).valid) {
      const detection = detectColumnMapping(headers);
      job.detectedFormat = {
        headers,
        detectedMapping: detection.mapping,
        confidence: detection.confidence,
        sampleRows: rows.slice(0, 3),
      };

      // If confidence is low or required fields are missing, pause and request user mapping
      if (detection.confidence < 1.0 || detection.unmappedRequired.length > 0) {
        job.status = "mapping_required";
        job.progress = {
          stage: "Column mapping required",
          percent: 30,
          message: `Please map column headers (${detection.unmappedRequired.join(", ")} required)`,
        };
        await job.save();
        return job;
      }

      mapping = detection.mapping;
      job.selectedMapping = mapping;
    }

    // Step 4: Normalization
    job.progress = {
      stage: "Normalizing transactions",
      percent: 45,
      message: "Normalizing dates and monetary values...",
    };
    await job.save();

    const { normalized, invalidRows } = normalizeTransactions({
      rows,
      mapping,
      dateFormat: job.dateFormat || "DD/MM/YYYY",
      currency: job.currency || "INR",
    });

    job.validRows = normalized.length;
    job.invalidRows = invalidRows.length;

    // Step 5: Extract Merchants
    job.progress = {
      stage: "Identifying merchants",
      percent: 60,
      message: "Extracting merchant names...",
    };
    await job.save();

    const withMerchants = normalized.map((txn) => {
      const extracted = extractMerchant(txn.originalDescription);
      return {
        ...txn,
        merchant: extracted.merchant,
        classificationConfidence: extracted.confidence,
      };
    });

    // Step 6: Detect Duplicates
    job.progress = {
      stage: "Detecting duplicates",
      percent: 75,
      message: "Checking for duplicate transactions...",
    };
    await job.save();

    const batchDeduplicated = detectDuplicatesInBatch(withMerchants);
    const fullyDeduplicated = await detectDuplicatesAgainstDB({
      userId: job.userId,
      accountId: job.accountId,
      transactions: batchDeduplicated,
      ImportedTransactionModel: ImportedTransaction,
      ExpenseModel: Expense,
    });

    // Step 7: Categorization
    job.progress = {
      stage: "Categorizing transactions",
      percent: 90,
      message: "Assigning spending categories...",
    };
    await job.save();

    const categorized = await categorizeTransactions({
      transactions: fullyDeduplicated,
      userId: job.userId,
      MerchantCategoryRuleModel: MerchantCategoryRule,
    });

    // Step 8: Save ImportedTransaction documents (clear any previous staged records for this job)
    await ImportedTransaction.deleteMany({ importJobId: job._id });

    const toInsert = categorized.map((item) => ({
      ...item,
      importJobId: job._id,
      userId: job.userId,
      accountId: job.accountId,
      importStatus: "pending",
    }));

    if (toInsert.length > 0) {
      await ImportedTransaction.insertMany(toInsert);
    }

    // Compute metrics
    let duplicateCount = 0;
    let creditCount = 0;
    let approvedCount = 0;
    let selectedTotal = 0;

    categorized.forEach((t) => {
      if (
        t.duplicateStatus === "confirmed_duplicate" ||
        t.duplicateStatus === "possible_duplicate"
      ) {
        duplicateCount++;
      }
      if (t.direction === "credit") {
        creditCount++;
      }
      if (t.selected && t.classification === "expense") {
        approvedCount++;
        selectedTotal += t.amountMinor / 100;
      }
    });

    job.duplicateRows = duplicateCount;
    job.creditRows = creditCount;
    job.approvedRows = approvedCount;
    job.selectedAmountTotal = Math.round(selectedTotal * 100) / 100;
    job.status = "ready_for_review";
    job.progress = {
      stage: "Ready for review",
      percent: 100,
      message: `Processed ${normalized.length} transactions. Ready for your review.`,
    };

    if (invalidRows.length > 0) {
      job.errorSummary = invalidRows
        .slice(0, 10)
        .map((r) => `Row ${r.sourceRowIndex}: ${r.errors.join(", ")}`);
    }

    await job.save();
    return job;
  } catch (error) {
    console.error(
      `[ImportService] Error processing job ${importJobId}:`,
      error,
    );
    job.status = "failed";
    job.progress = { stage: "Failed", percent: 100, message: error.message };
    job.errorSummary = [error.message];
    await job.save();
    throw error;
  }
}

/**
 * Confirm selected transactions and create Expense records.
 * Ensures strict idempotency and cleans up raw files upon completion.
 */
export async function confirmImport(
  importJobId,
  selectedTransactionIds = null,
) {
  await dbConnect();

  const job = await ImportJob.findById(importJobId);
  if (!job) {
    throw new Error(`Import job ${importJobId} not found`);
  }

  if (
    job.status !== "ready_for_review" &&
    job.status !== "partially_completed"
  ) {
    throw new Error(`Job cannot be confirmed from status "${job.status}"`);
  }

  job.status = "importing";
  job.progress = {
    stage: "Importing expenses",
    percent: 10,
    message: "Creating verified expense records...",
  };
  await job.save();

  // Query transactions to import
  const query = {
    importJobId: job._id,
    userId: job.userId,
    importStatus: { $ne: "imported" }, // Idempotency: skip already imported
  };

  if (
    Array.isArray(selectedTransactionIds) &&
    selectedTransactionIds.length > 0
  ) {
    query._id = { $in: selectedTransactionIds };
  } else {
    query.selected = true;
  }

  const transactionsToImport = await ImportedTransaction.find(query);

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < transactionsToImport.length; i++) {
    const txn = transactionsToImport[i];

    // Only spending/expense transactions create Expense records (Rule #4 & #8)
    if (txn.classification !== "expense") {
      txn.importStatus = "skipped";
      txn.importError = `Skipped: classification is ${txn.classification} (not spending)`;
      await txn.save();
      skippedCount++;
      continue;
    }

    try {
      // Check if Expense already exists for this importedTransactionId (Idempotent write)
      let existingExpense = await Expense.findOne({
        importedTransactionId: txn._id,
      });

      if (!existingExpense) {
        const amount = txn.amountMinor / 100;
        const expenseDate = txn.transactionDate || new Date();
        const description =
          txn.normalizedDescription ||
          txn.originalDescription ||
          `${txn.category} Expense`;

        existingExpense = await Expense.create({
          userId: job.userId,
          amount,
          category: txn.category || "Other",
          date: expenseDate,
          description,
          merchant: txn.merchant || "Unknown",
          paymentMethod: "Bank Transfer",
          source: "import",
          importJobId: job._id,
          importedTransactionId: txn._id,
          financialAccountId: job.accountId,
          currency: txn.currency || job.currency || "INR",
          sourceReference: txn.bankReference || "",
        });
      }

      txn.linkedExpenseId = existingExpense._id;
      txn.importStatus = "imported";
      txn.importError = "";
      await txn.save();
      importedCount++;
    } catch (err) {
      console.error(
        `[ImportService] Error saving expense for txn ${txn._id}:`,
        err,
      );
      txn.importStatus = "failed";
      txn.importError = err.message;
      await txn.save();
      failedCount++;
    }

    // Update progress in batches
    if (i % 25 === 0 || i === transactionsToImport.length - 1) {
      const percent = Math.min(
        95,
        10 + Math.round((i / transactionsToImport.length) * 85),
      );
      job.progress = {
        stage: "Importing expenses",
        percent,
        message: `Imported ${importedCount} of ${transactionsToImport.length} transactions...`,
      };
      await job.save();
    }
  }

  job.importedRows = (job.importedRows || 0) + importedCount;
  job.failedRows = failedCount;
  job.status = failedCount === 0 ? "completed" : "partially_completed";
  job.completedAt = new Date();
  job.progress = {
    stage: "Completed",
    percent: 100,
    message: `Successfully imported ${importedCount} expenses${skippedCount > 0 ? `, skipped ${skippedCount}` : ""}.`,
  };
  await job.save();

  // Raw file cleanup (correction #3)
  if (job.gridFSFileId) {
    try {
      await deleteFromGridFS(job.gridFSFileId);
      job.gridFSFileId = null;
      await job.save();
      console.log(
        `[ImportService] Cleaned up raw statement file for job ${job._id}`,
      );
    } catch (cleanupErr) {
      console.warn("[ImportService] GridFS cleanup error:", cleanupErr.message);
    }
  }

  return { importedCount, skippedCount, failedCount };
}
