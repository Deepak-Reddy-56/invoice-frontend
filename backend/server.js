const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Queue, QueueEvents } = require("bullmq");
const Redis = require("ioredis");

const app = express();
app.use(cors());
app.use(express.json());

// --------------------------------------------------
// Serve generated result files
// --------------------------------------------------
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
const QUEUE_NAME = "pdf-processing";

const pdfQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
});

// 🔥 THIS IS THE MISSING PIECE
const queueEvents = new QueueEvents(QUEUE_NAME, {
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
    filename: (_, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
});

// --------------------------------------------------
// In-memory job tracking (Render Free safe)
// --------------------------------------------------
const jobs = {};
// jobs[jobId] = { status, resultPath }

// ==================================================
// SINGLE PDF
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
// 🔥 BATCH PDF UPLOAD
// ==================================================
app.post("/api/upload-batch", upload.array("files"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const jobId = Date.now().toString();
  const filePaths = req.files.map((f) => f.path);

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
// JOB STATUS (FRONTEND POLLING)
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

// ==================================================
// 🔥 CORRECT JOB COMPLETION LISTENER
// ==================================================
queueEvents.on("completed", ({ jobId, returnvalue }) => {
  // find the matching job entry
  const entry = Object.entries(jobs).find(
    ([, v]) => v.status === "queued"
  );

  if (!entry) return;

  const [localJobId, job] = entry;

  job.status = "completed";
  job.resultPath = returnvalue.resultPath;

  console.log(
    "Job completed:",
    localJobId,
    returnvalue.resultPath
  );
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

// --------------------------------------------------
// Start worker in same process (Render Free)
// --------------------------------------------------
require("./queueWorker");
