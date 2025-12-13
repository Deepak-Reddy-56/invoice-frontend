const { Worker } = require("bullmq");
const Redis = require("ioredis");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// -----------------------------
// Redis connection
// -----------------------------
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// -----------------------------
// BullMQ Worker
// -----------------------------
const worker = new Worker(
  "pdf-processing",
  async (job) => {
    const { jobId, filePath } = job.data;
    console.log("Worker processing:", jobId);

    const outputExcel = path.join("results", `result-${jobId}.xlsx`);

    return new Promise((resolve, reject) => {
      const python = spawn("python", [
        "worker.py",
        filePath,
        outputExcel,
      ]);

      python.stdout.on("data", (data) => {
        console.log(`Python: ${data}`);
      });

      python.stderr.on("data", (data) => {
        console.error(`Python error: ${data}`);
      });

      python.on("close", (code) => {
        if (code === 0) {
          console.log("Job completed:", outputExcel);
          resolve({ excel: outputExcel });
        } else {
          reject(new Error("Python process failed"));
        }
      });
    });
  },
  { connection }
);

console.log("Queue Worker Started...");
