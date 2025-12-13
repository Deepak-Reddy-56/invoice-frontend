const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Queue } = require("bullmq");
const Redis = require("ioredis");
const { exec } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

// Serve result files
app.use("/results", express.static("results"));

// --------------------------------------------------
// Redis connection
// --------------------------------------------------
const Redis = require("ioredis");

const redisConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});


// --------------------------------------------------
// Job queue (EXISTING – untouched)
// --------------------------------------------------
const pdfQueue = new Queue("pdf-processing", {
  connection: redisConnection,
});

// --------------------------------------------------
// Ensure directories exist
// --------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, "uploads");
const RESULT_DIR = path.join(__dirname, "results");
const RESULT_EXCEL = path.join(RESULT_DIR, "invoices.xlsx");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR);

// --------------------------------------------------
// Multer configuration
// --------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_, file, cb) => cb(null, file.originalname),
  }),
});

// --------------------------------------------------
// In-memory job tracking (EXISTING – untouched)
// --------------------------------------------------
const jobs = {}; 
// jobs[jobId] = { status, filePath, resultPath }

// ==================================================
// EXISTING SINGLE PDF FLOW (UNCHANGED)
// ==================================================
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const jobId = Date.now().toString();
  console.log("New single-PDF job:", jobId);

  jobs[jobId] = {
    status: "queued",
    filePath: req.file.path,
    resultPath: null,
  };

  await pdfQueue.add("processPDF", {
    jobId,
    filePath: req.file.path,
  });

  res.json({ jobId });
});

// --------------------------------------------------
app.get("/api/status/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.json({ error: "Invalid job ID" });

  res.json({
    status: job.status,
    resultUrl: job.resultPath
      ? `http://localhost:4000/${job.resultPath}`
      : null,
  });
});

// ==================================================
// 🔥 NEW: MULTI-PDF BATCH FLOW
// ==================================================

// -------------------------------
// POST /api/upload-batch
// Upload 1000–1500 PDFs
// -------------------------------
app.post("/api/upload-batch", upload.array("files"), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  console.log(`Uploaded ${req.files.length} PDFs for batch processing`);

  res.json({
    message: "Batch upload successful",
    count: req.files.length,
  });
});

// -------------------------------
// POST /api/process-batch
// Runs Python batch_worker.py
// -------------------------------
app.post("/api/process-batch", (req, res) => {
  console.log("Starting batch PDF processing...");

  exec("python batch_worker.py", { cwd: __dirname }, (err) => {
    if (err) {
      console.error("Batch processing failed:", err);
      return res.status(500).json({ error: "Batch processing failed" });
    }

    console.log("Batch processing completed");
    res.json({
      message: "Batch processing completed",
      downloadUrl: "http://localhost:4000/api/download-excel",
    });
  });
});

// -------------------------------
// GET /api/download-excel
// -------------------------------
app.get("/api/download-excel", (req, res) => {
  if (!fs.existsSync(RESULT_EXCEL)) {
    return res.status(404).json({ error: "Excel file not ready" });
  }

  res.download(RESULT_EXCEL);
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
