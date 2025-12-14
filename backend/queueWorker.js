const { Worker } = require("bullmq");
const Redis = require("ioredis");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// --------------------------------------------------
// Redis connection (same REDIS_URL as server.js)
// --------------------------------------------------
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// --------------------------------------------------
// Helper to run Python scripts safely
// --------------------------------------------------
function runPython(script, args) {
  return new Promise((resolve, reject) => {
    const python = spawn("python", [script, ...args], {
      cwd: __dirname,
    });

    python.stdout.on("data", (data) => {
      console.log(`Python: ${data.toString()}`);
    });

    python.stderr.on("data", (data) => {
      console.error(`Python error: ${data.toString()}`);
    });

    python.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${script} failed with exit code ${code}`));
      }
    });
  });
}

// --------------------------------------------------
// BullMQ Worker (Render free plan compatible)
// --------------------------------------------------
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

      return {
        resultPath: outputExcel,
      };
    }

    // -------------------------
    // BATCH PDF JOB
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

      await runPython("batch_worker.py", [
        batchExcel,
        ...filePaths,
      ]);

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
