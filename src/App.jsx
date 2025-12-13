import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_BASE;

function App() {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [jobId, setJobId] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);

  // -------------------------------
  // Drag & Drop handlers
  // -------------------------------
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === "application/pdf"
    );

    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  // -------------------------------
  // Upload PDFs (batch)
  // -------------------------------
  const handleUpload = async () => {
    if (files.length === 0) {
      alert("Please select PDF files first");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    setStatus("Uploading PDFs...");
    setDownloadUrl(null);
    setJobId(null);

    try {
      const res = await fetch(`${API}/api/upload-batch`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setJobId(data.jobId);
      setStatus(`Uploaded ${data.count} PDFs. Processing started...`);
    } catch (err) {
      console.error(err);
      setStatus("Upload failed");
    }
  };

  // -------------------------------
  // Poll job status
  // -------------------------------
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/status/${jobId}`);
        const data = await res.json();

        if (data.resultUrl) {
          setDownloadUrl(`${API}${data.resultUrl}`);
          setStatus("Processing completed. Ready to download.");
          clearInterval(interval);
        } else {
          setStatus("Processing PDFs… please wait");
        }
      } catch (err) {
        console.error(err);
        setStatus("Error checking status");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[420px]">
        <h1 className="text-2xl font-bold text-center mb-6">
          PDF → Excel Invoice Processor
        </h1>

        {/* Drag & Drop Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 text-center mb-4 cursor-pointer transition ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-50"
          }`}
        >
          <p className="font-medium text-gray-700">
            Drag & drop PDFs here
          </p>
          <p className="text-sm text-gray-500 mt-1">
            or click to browse
          </p>

          <input
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            id="fileInput"
            onChange={(e) =>
              setFiles(Array.from(e.target.files || []))
            }
          />
          <label
            htmlFor="fileInput"
            className="inline-block mt-3 text-blue-600 cursor-pointer underline"
          >
            Browse files
          </label>
        </div>

        {files.length > 0 && (
          <p className="text-sm text-gray-600 mb-4 text-center">
            {files.length} PDF(s) selected
          </p>
        )}

        <button
          onClick={handleUpload}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded mb-3"
        >
          Upload & Process PDFs
        </button>

        {downloadUrl && (
          <a
            href={downloadUrl}
            className="block w-full text-center bg-black hover:bg-gray-800 text-white py-2 rounded mb-3"
          >
            Download Excel
          </a>
        )}

        <p className="mt-4 text-center text-sm text-gray-600">
          {status}
        </p>
      </div>
    </div>
  );
}

export default App;
