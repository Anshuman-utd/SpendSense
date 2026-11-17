import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import ImportJob from "@/models/ImportJob";
import { validateMapping } from "@/lib/imports/columnMapper";
import { addImportJob, isSyncAllowed } from "@/lib/queue";
import { processImportJob } from "@/lib/imports/importService";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function PUT(req, { params }) {
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

    const body = await req.json();
    const { mapping, dateFormat } = body;

    if (!mapping) {
      return NextResponse.json(
        { success: false, error: "Column mapping is required" },
        { status: 400 },
      );
    }

    const validation = validateMapping(mapping);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing required column mappings: ${validation.missing.join(", ")}`,
        },
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

    job.selectedMapping = mapping;
    if (dateFormat) {
      job.dateFormat = dateFormat;
    }
    job.status = "processing";
    job.progress = {
      stage: "Queued",
      percent: 10,
      message: "Column mapping updated. Resuming processing...",
    };
    await job.save();

    const isSyncRequested = isSyncAllowed(req);

    // Trigger processing
    const queued = await addImportJob(job._id.toString());
    if (!queued) {
      if (isSyncRequested) {
        console.log(
          `[Mapping API] Sync mode active. Processing job ${job._id} synchronously...`,
        );
        await processImportJob(job._id.toString());
        const updatedJob = await ImportJob.findById(job._id);
        return NextResponse.json({
          success: true,
          data: updatedJob,
          mode: "synchronous",
        });
      } else {
        job.status = "failed";
        job.progress = {
          stage: "Failed",
          percent: 100,
          message:
            "Background processing queue is currently unreachable. Please ensure Redis and worker are running.",
        };
        job.errorSummary = ["Redis / BullMQ worker service is unreachable."];
        await job.save();

        return NextResponse.json(
          {
            success: false,
            error:
              "Background processing queue is currently unavailable. Please ensure Redis and worker services are running, or enable SYNC_PROCESSING=true in development.",
            jobId: job._id,
          },
          { status: 503 },
        );
      }
    }

    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    console.error("Update column mapping error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update mapping" },
      { status: 500 },
    );
  }
}
