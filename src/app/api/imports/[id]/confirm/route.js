import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import ImportJob from "@/models/ImportJob";
import { confirmImport } from "@/lib/imports/importService";
import { addConfirmJob, isSyncAllowed } from "@/lib/queue";
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

    let transactionIds = null;
    try {
      const body = await req.json();
      if (body && Array.isArray(body.transactionIds)) {
        transactionIds = body.transactionIds;
      }
    } catch (_) {
      // body is optional
    }

    const isSyncRequested = isSyncAllowed(req);
    const confirmationToken = crypto.randomUUID();

    // 1. Atomic claim using conditional status filter and unique attempt token (Requirements #2, #3, #6)
    const claimedJob = await ImportJob.findOneAndUpdate(
      {
        _id: id,
        userId: session.user.id,
        status: { $in: ["ready_for_review", "partially_completed"] },
      },
      {
        $set: {
          status: "confirmation_queued",
          confirmationToken,
          progress: {
            stage: "Confirmation queued",
            percent: 5,
            message:
              "Confirmation received. Queued for background processing...",
          },
        },
      },
      { new: false }, // return original state to allow rollback if enqueue fails
    );

    if (!claimedJob) {
      const currentJob = await ImportJob.findOne({
        _id: id,
        userId: session.user.id,
      });
      if (!currentJob) {
        return NextResponse.json(
          { success: false, error: "Import job not found" },
          { status: 404 },
        );
      }
      if (
        currentJob.status === "confirmation_queued" ||
        currentJob.status === "importing"
      ) {
        return NextResponse.json(
          {
            success: true,
            message: "Confirmation is already in progress.",
            data: { queued: true, status: currentJob.status, jobId: id },
          },
          { status: 200 },
        );
      }
      if (currentJob.status === "completed") {
        return NextResponse.json(
          {
            success: false,
            error: "This import has already been completed.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: `Import cannot be confirmed from current status (${currentJob.status})`,
        },
        { status: 400 },
      );
    }

    // 2. Enqueue BullMQ job with deterministic attempt-scoped jobId
    const queued = await addConfirmJob(id, transactionIds, { confirmationToken });

    if (queued) {
      // Worker will transition to 'importing' and 'completed'.
      // Do NOT overwrite worker state in the API (Requirement #7).
      return NextResponse.json({
        success: true,
        message: "Import queued successfully",
        data: {
          queued: true,
          status: "confirmation_queued",
          jobId: id,
          confirmationToken,
        },
      });
    }

    // 3. Fallback: Queue enqueue definitely failed (Requirement #8)
    if (isSyncRequested) {
      const result = await confirmImport(id, transactionIds, { confirmationToken });
      return NextResponse.json({
        success: true,
        message: "Import completed successfully",
        data: result,
        mode: "synchronous",
      });
    } else {
      // Roll back status to previous eligible status scoped to this confirmation attempt
      await ImportJob.findOneAndUpdate(
        { _id: id, status: "confirmation_queued", confirmationToken },
        {
          $set: {
            status: claimedJob.status,
            confirmationToken: null,
            progress: {
              stage: "Ready for review",
              percent: 100,
              message:
                "Background queue unreachable. Confirmation can be retried.",
            },
          },
        },
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Background processing queue is currently unavailable. Please ensure Redis and worker are running, or enable SYNC_PROCESSING=true in development.",
        },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error("Confirm import error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to confirm import" },
      { status: 500 },
    );
  }
}
