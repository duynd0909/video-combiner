// renderer.js

const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

document
  .getElementById("select-folder-btn")
  .addEventListener("click", async () => {
    const folderPath = await ipcRenderer.invoke("select-folder");
    if (folderPath) {
      document.getElementById(
        "status"
      ).innerText = `Selected folder: ${folderPath}`;
      combineVideos(folderPath);
    } else {
      document.getElementById("status").innerText = "No folder selected.";
    }
  });

async function combineVideos(folderPath) {
  try {
    const videoFiles = fs
      .readdirSync(folderPath)
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return [".mp4", ".mov", ".avi", ".mkv"].includes(ext);
      })
      .map((file) => path.join(folderPath, file));

    if (videoFiles.length === 0) {
      document.getElementById("status").innerText =
        "No video files found in the selected folder.";
      return;
    }

    // Shuffle and select videos
    videoFiles.sort(() => 0.5 - Math.random());
    let totalDuration = 0;
    const selectedVideos = [];

    for (const video of videoFiles) {
      const duration = await getVideoDuration(video);
      if (totalDuration < 60) {
        totalDuration += duration;
        selectedVideos.push(video);
      } else {
        break;
      }
    }

    // Get the best resolution
    const bestResolution = await getBestResolution(selectedVideos);

    // Process videos to adjust aspect ratio and resolution
    const processedVideos = await Promise.all(
      selectedVideos.map((video) => processVideo(video, bestResolution))
    );

    // Combine videos
    await mergeVideos(processedVideos, folderPath);

    document.getElementById("status").innerText =
      "Videos combined successfully!";
  } catch (error) {
    console.error(error);
    document.getElementById("status").innerText =
      "An error occurred during processing.";
  }
}

function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

function getBestResolution(videoPaths) {
  return new Promise((resolve, reject) => {
    let maxWidth = 0;
    let maxHeight = 0;
    let processed = 0;

    videoPaths.forEach((videoPath) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        const stream = metadata.streams.find((s) => s.width && s.height);
        if (stream.width > maxWidth) {
          maxWidth = stream.width;
        }
        if (stream.height > maxHeight) {
          maxHeight = stream.height;
        }
        processed++;
        if (processed === videoPaths.length) {
          // Calculate the output resolution with a 9:16 aspect ratio
          let outputWidth, outputHeight;
          if ((maxHeight / 16) * 9 <= maxWidth) {
            // Height is limiting factor
            outputHeight = maxHeight;
            outputWidth = Math.round((outputHeight / 16) * 9);
          } else {
            // Width is limiting factor
            outputWidth = maxWidth;
            outputHeight = Math.round((outputWidth / 9) * 16);
          }
          resolve({ width: outputWidth, height: outputHeight });
        }
      });
    });
  });
}

function processVideo(videoPath, bestResolution) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(
      path.dirname(videoPath),
      "processed_" + path.basename(videoPath)
    );
    ffmpeg(videoPath)
      .videoFilters(
        `scale=${bestResolution.width}:${bestResolution.height}:force_original_aspect_ratio=increase`,
        "crop=" + bestResolution.width + ":" + bestResolution.height
      )
      .outputOptions("-c:a copy")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

function mergeVideos(videoPaths, outputDir) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, "combined_output.mp4");

    // Create a file list for FFmpeg
    const fileListPath = path.join(outputDir, "filelist.txt");
    const fileListContent = videoPaths
      .map((videoPath) => `file '${videoPath}'`)
      .join("\n");
    fs.writeFileSync(fileListPath, fileListContent);

    ffmpeg()
      .input(fileListPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions("-c", "copy")
      .on("end", () => {
        // Clean up temporary files
        videoPaths.forEach((file) => fs.unlinkSync(file));
        fs.unlinkSync(fileListPath);
        resolve();
      })
      .on("error", (err) => {
        console.error("Error during merging:", err);
        reject(err);
      })
      .save(outputPath);
  });
}
