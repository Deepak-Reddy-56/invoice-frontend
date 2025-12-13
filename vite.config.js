import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "invoice-frontend-1-ikpt.onrender.com",
    ],
  },
});
