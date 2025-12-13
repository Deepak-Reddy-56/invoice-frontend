const { Worker } = require("bullmq");
const Redis = require("ioredis");
const { exec } = require("child_process");
const fs = require("fs");

const redisConnection = new Redis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const jobs = require("./server").jobs; // We'll connect this later if needed

const worker = new Worker(
  "pdf-processing",
  async (job) => {
    const { jobId, filePath } = job.data;
    console.log("Worker processing:", jobId);

    const outputExcel = `results/result-${jobId}.xlsx`;

    return new Promise((resolve, reject) => {
      const cmd = `python worker.py "${filePath}" "${outputExcel}"`;

      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.log("Python Error:", stderr);
          reject(error);
        } else {
          console.log("Python Output:", stdout);

          // Save job result path to shared store
          fs.appendFileSync("worker-log.txt", `Completed ${jobId}\n`);

          resolve({ excel: outputExcel });
        }
      });
    });
  },
  {
    connection: redisConnection,
  }
);

console.log("Queue Worker Started...");
