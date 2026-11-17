import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import ImportJob from "@/models/ImportJob";
import ImportedTransaction from "@/models/ImportedTransaction";
import { processImportJob, confirmImport } from "@/lib/imports/importService";
import { addImportJob, addConfirmJob, isSyncAllowed } from "@/lib/queue";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid import job ID" },
        { status: 400 },
      );
    }

    await dbConnect();

    const job = await ImportJob.findOne({ _id: id, userId: session.user.id });
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Import job not found" },
        { status: 404 },
      );
    }

    const retryableStatuses = [
      "failed",
      "partially_completed",
      "importing",
      "confirmation_queued",
    ];
    if (!retryableStatuses.includes(job.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Only failed, partially completed, or stuck jobs can be retried (current status: ${job.status})`,
        },
        { status: 400 },
      );
    }

    // Concurrency safeguard: Prevent retries from reclaiming an actively queued or executing job
    if (
      (job.status === "importing" || job.status === "confirmation_queued") &&
      job.updatedAt
    ) {
      const elapsedSinceUpdateMs =
        Date.now() - new Date(job.updatedAt).getTime();
      if (elapsedSinceUpdateMs < 30000) {
        return NextResponse.json(
          {
            success: false,
            error:
              "An import worker is actively processing this job. Please allow it to finish.",
          },
          { status: 409 },
        );
      }
    }

    const isSyncRequested = isSyncAllowed(req);

    // Check if staged transactions already exist (Requirement #13)
    const stagedTxnsCount = await ImportedTransaction.countDocuments({
      importJobId: job._id,
    });
    const hasStagedTransactions = stagedTxnsCount > 0;

    if (hasStagedTransactions) {
      // Staged transactions already exist: retry confirmation to preserve user selections & edits
      const confirmationToken = crypto.randomUUID();
      const stuckCutoff = new Date(Date.now() - 30000);

      const claimed = await ImportJob.findOneAndUpdate(
        {
          _id: id,
          userId: session.user.id,
          $or: [
            { status: { $in: ["failed", "partially_completed"] } },
            {
              status: { $in: ["confirmation_queued", "importing"] },
              updatedAt: { $lt: stuckCutoff },
            },
          ],
        },
        {
          $set: {
            status: "confirmation_queued",
            confirmationToken,
            progress: {
              stage: "Confirmation queued",
              percent: 5,
              message: "Retrying confirmation of staged transactions...",
            },
            errorSummary: [],
          },
        },
        { new: false }, // return original state to allow rollback
      );

      if (!claimed) {
        return NextResponse.json(
          {
            success: false,
            error: "Job is already being processed or not in a retryable state.",
          },
          { status: 409 },
        );
      }

      // Enqueue BullMQ job with deterministic attempt-scoped confirmation token
      const queued = await addConfirmJob(job._id.toString(), null, {
        confirmationToken,
      });

      if (queued) {
        return NextResponse.json({
          success: true,
          message: "Confirmation retry queued",
          data: {
            queued: true,
            status: "confirmation_queued",
            jobId: job._id.toString(),
            confirmationToken,
          },
        });
      }

      if (isSyncRequested) {
        const result = await confirmImport(job._id.toString(), null, {
          confirmationToken,
        });
        return NextResponse.json({
          success: true,
          message: "Confirmation completed synchronously",
          data: result,
          mode: "synchronous",
        });
      } else {
        // Attempt-token-scoped rollback when enqueueing fails
        await ImportJob.findOneAndUpdate(
          { _id: id, status: "confirmation_queued", confirmationToken },
          {
            $set: {
              status: claimed.status,
              confirmationToken: null,
              progress: {
                stage: "Ready for review",
                percent: 100,
                message:
                  "Queue unavailable. Recovered to previous eligible state.",
              },
            },
          },
        );

        return NextResponse.json(
          {
            success: false,
            error: "Background processing queue is currently unavailable.",
          },
          { status: 503 },
        );
      }
    } else {
      // No staged transactions: failure occurred during parsing. Retry statement ingestion pipeline.
      job.status = "processing";
      job.progress = {
        stage: "Retrying",
        percent: 5,
        message: "Retrying statement parsing...",
      };
      job.errorSummary = [];
      await job.save();

      const queued = await addImportJob(job._id.toString());
      if (queued) {
        return NextResponse.json({
          success: true,
          message: "Parsing retry queued",
          data: job,
        });
      }

      if (isSyncRequested) {
        await processImportJob(job._id.toString());
        const updatedJob = await ImportJob.findById(job._id);
        return NextResponse.json({
          success: true,
          message: "Parsing retry completed synchronously",
          data: updatedJob,
          mode: "synchronous",
        });
      } else {
        job.status = "failed";
        job.progress = {
          stage: "Failed",
          percent: 100,
          message:
            "Background processing queue is unreachable. Please ensure Redis and worker are running.",
        };
        await job.save();

        return NextResponse.json(
          {
            success: false,
            error:
              "Background processing queue is currently unavailable. Please ensure Redis and worker are running.",
          },
          { status: 503 },
        );
      }
    }
  } catch (error) {
    console.error("Retry import error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retry import" },
      { status: 500 },
    );
  }
}
