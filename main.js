// main.js

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const ffmpeg = require('fluent-ffmpeg');
// Hot Reloading for Electron
require('electron-reload')(__dirname, {
  electron: require(`${__dirname}/node_modules/electron`),
  awaitWriteFinish: true,
});
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');
  // Uncomment the line below to open DevTools for debugging
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

// Handle folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Handle retrieving video files
ipcMain.handle('get-video-files', async (event, folderPath) => {
  const videoFiles = fs
    .readdirSync(folderPath)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ['.mp4', '.mov', '.avi', '.mkv'].includes(ext);
    })
    .map((file) => path.join(folderPath, file));

  return videoFiles;
});

// Handle video combination
ipcMain.handle('start-processing', async (event, selectedVideos) => {
  try {
    await combineVideos(selectedVideos);
    event.sender.send('combine-status', 'Videos combined successfully!');
  } catch (error) {
    console.error(error);
    event.sender.send('combine-status', 'An error occurred during processing.');
  }
});

// Function to combine videos
async function combineVideos(selectedVideos) {
  if (selectedVideos.length === 0) {
    throw new Error('No videos selected.');
  }

  // Shuffle and select videos to total approximately 60 seconds
  selectedVideos.sort(() => 0.5 - Math.random());
  let totalDuration = 0;
  const videosToCombine = [];

  for (const video of selectedVideos) {
    const duration = await getVideoDuration(video);
    if (totalDuration < 60) {
      totalDuration += duration;
      videosToCombine.push(video);
    } else {
      break;
    }
  }

  // Get the output resolution with a 9:16 aspect ratio
  const outputResolution = await getBestResolution(videosToCombine);

  // Process videos to adjust aspect ratio and resolution
  const processedVideos = await Promise.all(
    videosToCombine.map((video) => processVideo(video, outputResolution))
  );

  // Combine videos
  await mergeVideos(processedVideos, path.dirname(selectedVideos[0]));
}

// Helper functions
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
            // Height is the limiting factor
            outputHeight = maxHeight;
            outputWidth = Math.round((outputHeight / 16) * 9);
          } else {
            // Width is the limiting factor
            outputWidth = maxWidth;
            outputHeight = Math.round((outputWidth / 9) * 16);
          }
          resolve({ width: outputWidth, height: outputHeight });
        }
      });
    });
  });
}

// function processVideo(videoPath, outputResolution) {
//   return new Promise((resolve, reject) => {
//     // Generate a safe output filename
//     const sanitizedBaseName = path
//       .basename(videoPath)
//       .replace(/[^a-z0-9_\-\.]/gi, '_');
//     const outputPath = path.join(
//       path.dirname(videoPath),
//       'processed_' + sanitizedBaseName
//     );

//     // Define filters with escaped commas
//     const scaleFilter = `scale=w=if(gt(a\\,0.5625)\\,${outputResolution.width}\\,-2):h=if(gt(a\\,0.5625)\\,-2\\,${outputResolution.height})`;
//     const padFilter = `pad=${outputResolution.width}:${outputResolution.height}:(ow-iw)/2:(oh-ih)/2`;

//     ffmpeg(videoPath)
//       .videoFilters([scaleFilter, padFilter])
//       .outputOptions('-c:v', 'libx264', '-preset', 'fast', '-crf', '23')
//       .outputOptions('-c:a', 'copy')
//       .on('start', (commandLine) => {
//         console.log('Spawned FFmpeg with command:', commandLine);
//       })
//       .on('stderr', (stderrLine) => {
//         console.error('FFmpeg stderr:', stderrLine);
//       })
//       .on('error', (err, stdout, stderr) => {
//         console.error('FFmpeg Error:', err.message);
//         console.error('FFmpeg Stdout:', stdout);
//         console.error('FFmpeg Stderr:', stderr);
//         reject(err);
//       })
//       .on('end', () => resolve(outputPath))
//       .save(outputPath);
//   });
// }
function processVideo(videoPath, outputResolution) {
  return new Promise((resolve, reject) => {
    // Generate a safe output filename
    const sanitizedBaseName = path
      .basename(videoPath)
      .replace(/[^a-z0-9_\-\.]/gi, '_');
    const outputPath = path.join(
      path.dirname(videoPath),
      'processed_' + sanitizedBaseName
    );

    // Ensure output resolution is provided
    const width =  1080;
    const height =  1920;

    // Calculate the aspect ratio
    const aspectRatio = width / height; // For 1080x1920, aspectRatio = 0.5625

    // Escape commas in the 'if' functions
    const scaleFilter =
      `[0:v]scale=${width}:${height},boxblur=10:1[bg];` +
      `[0:v]scale=w=if(gt(a\\,${aspectRatio})\\,${width}\\,-2):h=if(gt(a\\,${aspectRatio})\\,-2\\,${height})[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2`;

    ffmpeg(videoPath)
      .complexFilter(scaleFilter)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioChannels(2)
      .outputOptions('-preset', 'fast', '-crf', '23')
      .on('start', (commandLine) => {
        console.log('Spawned FFmpeg with command:', commandLine);
      })
      .on('stderr', (stderrLine) => {
        console.error('FFmpeg stderr:', stderrLine);
      })
      .on('error', (err) => {
        console.error('Error during processing:', err);
        reject(err);
      })
      .on('end', () => {
        console.log('Processed video saved:', outputPath);
        resolve(outputPath);
      })
      .save(outputPath);
  });
}

function mergeVideos(videoPaths, outputDir) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'combined_output.mp4');

    // Create a file list for FFmpeg
    const fileListPath = path.join(outputDir, 'filelist.txt');
    const fileListContent = videoPaths
      .map((videoPath) => `file '${videoPath}'`)
      .join('\n');
    fs.writeFileSync(fileListPath, fileListContent);

    ffmpeg()
      .input(fileListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions('-c', 'copy')
      .on('start', (commandLine) => {
        console.log('Spawned FFmpeg with command:', commandLine);
      })
      .on('stderr', (stderrLine) => {
        console.error('FFmpeg stderr:', stderrLine);
      })
      .on('end', () => {
        // Clean up temporary files
        videoPaths.forEach((file) => fs.unlinkSync(file));
        fs.unlinkSync(fileListPath);
        resolve();
      })
      .on('error', (err) => {
        console.error('Error during merging:', err);
        reject(err);
      })
      .save(outputPath);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
