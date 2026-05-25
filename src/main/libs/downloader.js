import AdmZip from "adm-zip";
import axios from "axios";
import fs from "fs/promises";
import os from "os";
import { createWriteStream } from "fs";
import { deleteAsync } from "del";
import { join } from "path";

/** Clean Directory */
export async function cleanDirectory(dir) {
  try {
    await deleteAsync(join(dir, "**"), { force: true });
    console.log(`Cleaned up directory: ${dir}`);
  } catch (error) {
    console.error(`Failed to clean directory ${dir}:`, error);
    throw error;
  }
}

/** Download Zip */
export async function downloadZip(url, outputPath) {
  const writer = createWriteStream(outputPath);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

/** Extract Zip */
export async function extractZip(zipPath, extractToDir) {
  /** Log Zip Path */
  console.log("Zip file:", zipPath);

  /** Cleanup extract directory */
  console.log("Cleaning target directory...");
  await cleanDirectory(extractToDir);

  /** Ensure extract directory exists */
  await fs.mkdir(extractToDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractToDir, true);
}

/** Download and Extract */
export async function downloadAndExtract(url, extractToDir) {
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), "the-nile-"));
  const zipPath = join(tempDir, "temp.zip");

  try {
    /** Download ZIP */
    console.log("Downloading ZIP to temp dir...");
    await downloadZip(url, zipPath);
    console.log("Download complete:", zipPath);

    /** Extract ZIP */
    console.log("Extracting zip...");
    await extractZip(zipPath, extractToDir);
    console.log("Extraction complete.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    /** Clean up the temp ZIP file and temp directory */
    try {
      await fs.unlink(zipPath);
      await fs.rmdir(tempDir);
      console.log("Cleaned up temp files");
    } catch (e) {
      console.warn("Failed to fully clean temp files:", e);
    }
  }
}
