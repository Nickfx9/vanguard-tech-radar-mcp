#!/usr/bin/env node
try {
  require("./build/index.js");
} catch (err) {
  console.error("Failed to start server from build/index.js:", err);
  process.exit(1);
}
