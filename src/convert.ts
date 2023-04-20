import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as fs from "fs";
import * as path from "path";

// Set FFmpeg binary path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

function convertFlvToMp4(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .format("mp4")
      .on("error", (err) => {
        console.error("Error occurred during video conversion:", err);
        reject(err);
      })
      .on("end", () => {
        console.log("Video conversion successful!");
        resolve();
      })
      .run();
  });
}

async function convertAllFlvInFolder(folderPath: string): Promise<void> {
  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      await convertAllFlvInFolder(filePath);
    } else if (path.extname(file) === ".flv") {
      const inputPath = filePath;
      const outputPath = path.join(
        folderPath,
        path.basename(file, ".flv") + ".mp4"
      );

      console.log(`Converting '${file}' to MP4...`);
      try {
        await convertFlvToMp4(inputPath, outputPath);
        console.log(`Successfully converted '${file}' to MP4.`);
      } catch (error) {
        console.error(`Failed to convert '${file}' to MP4:`, error);
      }
    }
  }
}

const folderPath = "downloads";

convertAllFlvInFolder(folderPath);
