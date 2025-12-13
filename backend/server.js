const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Queue } = require("bullmq");
const Redis = require("ioredis");

const app = express();
app.use(cors());
app.use(express.json());

// Serve result files
app.use("/results", express.static(path.join(__dirname, "results")));

// --------------------------------------------------
// Redis connection
// --------------------------------------------------
const redisConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// --------------------------------------------------
// BullMQ Queue
// --------------------------------------------------
const pdfQueue = new Queue("pdf-processing", {
  connection: redisConnection,
});

// --------------------------------------------------
// Directories
// --------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, "uploads");
const RESULT_DIR = path.join(__dirname, "results");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR);

// --------------------------------------------------
// Multer config
// --------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

// --------------------------------------------------
// TEMP job tracking (OK for now)
// --------------------------------------------------
const jobs = {};

// ==================================================
// SINGLE PDF (UNCHANGED)
// ==================================================
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const jobId = Date.now().toString();

  jobs[jobId] = { status: "queued", resultPath: null };

  await pdfQueue.add("processPDF", {
    jobId,
    filePath: req.file.path,
  });

  res.json({ jobId });
});

// ==================================================
// 🔥 BATCH PDF UPLOAD (1000–1500 PDFs)
// ==================================================
app.post("/api/upload-batch", upload.array("files"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const jobId = Date.now().toString();
  const filePaths = req.files.map(f => f.path);

  jobs[jobId] = { status: "queued", resultPath: null };

  await pdfQueue.add("processPDFBatch", {
    jobId,
    filePaths,
  });

  res.json({
    jobId,
    count: filePaths.length,
  });
});

// ==================================================
// JOB STATUS
// ==================================================
app.get("/api/status/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.json({ error: "Invalid job ID" });

  res.json({
    status: job.status,
    resultUrl: job.resultPath
      ? `/results/${path.basename(job.resultPath)}`
      : null,
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

// Export jobs ONLY if needed later
module.exports = { jobs };

// Start BullMQ worker in same process (Render free plan)
require("./queueWorker");