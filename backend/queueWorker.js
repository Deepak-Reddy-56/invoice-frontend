const { Worker } = require("bullmq");
const Redis = require("ioredis");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// 🔥 IMPORT SHARED JOB STORE
const { jobs } = require("./server");

// -----------------------------
// Redis connection
// -----------------------------
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// -----------------------------
// Helper to run Python safely
// -----------------------------
function runPython(script, args) {
  return new Promise((resolve, reject) => {
    const python = spawn("python", [script, ...args], {
      cwd: __dirname,
    });

    python.stdout.on("data", (data) => {
      console.log(`Python: ${data}`);
    });

    python.stderr.on("data", (data) => {
      console.error(`Python error: ${data}`);
    });

    python.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with code ${code}`));
    });
  });
}

// -----------------------------
// BullMQ Worker
// -----------------------------
new Worker(
  "pdf-processing",
  async (job) => {
    console.log("Worker processing job:", job.name);

    // -------------------------
    // SINGLE PDF JOB
    // -------------------------
    if (job.name === "processPDF") {
      const { jobId, filePath } = job.data;

      const outputExcel = path.join(
        "results",
        `result-${jobId}.xlsx`
      );

      await runPython("worker.py", [
        filePath,
        outputExcel,
      ]);

      // 🔥 UPDATE JOB STATUS
      if (jobs[jobId]) {
        jobs[jobId].status = "completed";
        jobs[jobId].resultPath = outputExcel;
      }

      return { resultPath: outputExcel };
    }

    // -------------------------
    // 🔥 BATCH PDF JOB
    // -------------------------
    if (job.name === "processPDFBatch") {
      const { jobId, filePaths } = job.data;

      const batchExcel = path.join(
        "results",
        `batch-${jobId}.xlsx`
      );

      // Ensure results directory exists
      if (!fs.existsSync("results")) {
        fs.mkdirSync("results");
      }

      // Run batch Python worker
      await runPython("batch_worker.py", [
        batchExcel,
        ...filePaths,
      ]);

      // 🔥 UPDATE JOB STATUS (THIS WAS MISSING)
      if (jobs[jobId]) {
        jobs[jobId].status = "completed";
        jobs[jobId].resultPath = batchExcel;
      }

      console.log("Batch Excel created:", batchExcel);

      return {
        resultPath: batchExcel,
        count: filePaths.length,
      };
    }

    throw new Error(`Unknown job type: ${job.name}`);
  },
  { connection }
);

console.log("Queue Worker Started...");
