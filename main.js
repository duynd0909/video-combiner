// main.js

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
let ffmpegPath;
let ffprobePath;
const ffmpeg = require('fluent-ffmpeg');

if (process.env.NODE_ENV === 'development') {
  // Development mode
  ffmpegPath = require('ffmpeg-static');
  ffprobePath = require('ffprobe-static').path;
  require('electron-reload')(__dirname, {
    electron: require(`${__dirname}/node_modules/electron`),
    awaitWriteFinish: true,
  });
} else {
  // Production mode
  const ffmpegFolder = path.join(process.resourcesPath, 'ffmpeg');
  const ffprobeFolder = path.join(process.resourcesPath, 'ffprobe');
  ffmpegPath = path.join(ffmpegFolder, 'ffmpeg.exe');
  ffprobePath = path.join(ffprobeFolder, 'ffprobe.exe');
}
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.ico'), // Set the window icon
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('index.html');
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

ipcMain.handle('dialog:selectVideos', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Chọn Video',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }],
  });
  if (canceled) {
    return [];
  } else {
    return filePaths;
  }
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
// Modify 'start-processing' handler to include numOutputs
ipcMain.handle(
  'start-processing',
  async (
    event,
    selectedVideos,
    saveDirectory,
    numOutputs,
    limitType,
    limitValue
  ) => {
    try {
      await combineVideos(
        selectedVideos,
        saveDirectory,
        numOutputs,
        limitType,
        limitValue
      );
      event.sender.send(
        'combine-status',
        'Ghép video thành công (successfully)!',
        saveDirectory
      );
    } catch (error) {
      console.error(error);
      event.sender.send('combine-status', error.message);
    }
  }
);

// ipcMain.handle('select-save-file', async (event, defaultPath) => {
//   const result = await dialog.showSaveDialog({
//     title: 'Lưu Video Đã Ghép',
//     defaultPath: defaultPath,
//     filters: [{ name: 'Video Files', extensions: ['mp4'] }],
//   });
//   return result.canceled ? null : result.filePath;
// });
// Handle selecting save directory
ipcMain.handle('select-save-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Output Directory',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    // Generate a random index between 0 and i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements at indices i and j
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
function splitVideosIntoGroups(videos, numGroups) {
  const groups = Array.from({ length: numGroups }, () => []);

  // Shuffle the videos to ensure random distribution
  const shuffledVideos = shuffleArray([...videos]);

  // Assign each video to a group in a round-robin fashion
  for (let i = 0; i < shuffledVideos.length; i++) {
    const groupIndex = i % numGroups;
    groups[groupIndex].push(shuffledVideos[i]);
  }

  // If numGroups > numVideos, some groups will have duplicate videos
  // To distribute duplicates, randomly assign remaining slots
  if (numGroups > shuffledVideos.length) {
    for (let i = shuffledVideos.length; i < numGroups; i++) {
      const randomIndex = Math.floor(Math.random() * shuffledVideos.length);
      groups[i].push(shuffledVideos[randomIndex]);
    }
  }

  return groups;
}
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(now.getDate()).padStart(2, '0');

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
// Utility function to get a random subset of videos
function getRandomVideos(videos, count) {
  const shuffled = videos.sort(() => 0.5 - Math.random()); // Shuffle videos array
  return shuffled.slice(0, count); // Select the first 'count' videos
}

// Updated combineVideos function
async function combineVideos(
  selectedVideos,
  saveDirectory,
  numOutputs,
  limitType,
  limitValue
) {
  const timestamp = getTimestamp(); // To ensure unique output filenames
  let videoGroups = [];

  if (limitType === 'count') {
    // Create groups with random selection of videos based on the count limit
    for (let i = 0; i < numOutputs; i++) {
      const randomVideos = getRandomVideos(selectedVideos, limitValue);
      videoGroups.push(randomVideos);
    }
  } else if (limitType === 'duration') {
    // Create groups based on the duration limit
    for (let i = 0; i < numOutputs; i++) {
      let cumulativeDuration = 0;
      let currentGroup = [];
      const shuffledVideos = selectedVideos.sort(() => 0.5 - Math.random()); // Shuffle for randomness

      for (const videoPath of shuffledVideos) {
        const videoDuration = await getVideoDuration(videoPath);
        currentGroup.push(videoPath);
        cumulativeDuration += videoDuration;

        if (cumulativeDuration >= limitValue) break;
      }

      // Ensure we add a group, even if the total duration didn't reach limitValue
      videoGroups.push(
        currentGroup.length ? currentGroup : getRandomVideos(selectedVideos, 1)
      );
    }
  }
  console.log('videoGroups', videoGroups);
  // Process each group of videos to create separate output files
  for (let i = 0; i < videoGroups.length; i++) {
    const group = videoGroups[i];
    const outputPath = path.join(
      saveDirectory,
      `${timestamp}_output_${i + 1}.mp4`
    );
    await combineVideoGroup(
      group,
      outputPath,
      limitType === 'duration' ? limitValue : null
    );
  }
}

// New function to process and merge a single group of videos
async function combineVideoGroup(
  selectedVideos,
  outputPath,
  maxDuration = null
) {
  let processedVideos = [];
  let cumulativeDuration = 0;

  try {
    for (const videoPath of selectedVideos) {
      const videoDuration = await getVideoDuration(videoPath);
      if (maxDuration && cumulativeDuration + videoDuration >= maxDuration) {
        const remainingTime = maxDuration - cumulativeDuration;

        if (remainingTime > 0) {
          const processedVideo = await processVideo(videoPath, remainingTime);
          processedVideos.push(processedVideo);
          cumulativeDuration += remainingTime;
        }
        break; // Stop adding videos once we reach the maxDuration
      } else {
        const processedVideo = await processVideo(videoPath);
        processedVideos.push(processedVideo);
        cumulativeDuration += videoDuration;
      }
    }

    await mergeVideos(processedVideos, outputPath);

    mainWindow.webContents.send('processing-progress', {
      stage: 'group-completed',
      outputPath,
    });
  } catch (error) {
    console.error('Có lỗi trong quá trình ghép:', error);
    cleanupProcessedVideos(processedVideos);
    throw error;
  }
}

function cleanupProcessedVideos(processedVideos) {
  processedVideos.forEach((file) => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        console.log(`Đã xóa video đã xử lý: ${file}`);
      } catch (err) {
        console.error(`Lỗi khi xóa tệp ${file}:`, err);
      }
    }
  });
}

function cleanupTemporaryFiles(videoPaths, fileListPath) {
  // Delete processed video files
  cleanupProcessedVideos(videoPaths);

  // Delete file list
  if (fs.existsSync(fileListPath)) {
    try {
      fs.unlinkSync(fileListPath);
      console.log(`Đã xóa danh sách tệp: ${fileListPath}`);
    } catch (err) {
      console.error(`Lỗi khi xóa tệp ${fileListPath}:`, err);
    }
  }
}

// Helper functions
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration;
        resolve(duration);
      }
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

function processVideo(videoPath, duration = null) {
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
    const width = 1080;
    const height = 1920;
    let ffmpegCommand = ffmpeg(videoPath)
      .size(`${width}x${height}`)
      .aspect('9:16')
      .autopad(true, '#000000') // Adds padding with black background if necessary
      .videoCodec('libx264')
      .audioCodec('aac') // Use 'aac' instead of 'libfaac', which is deprecated
      .audioChannels(2)
      .outputOptions('-preset', 'fast', '-crf', '23'); // Adjust encoding settings

    if (duration && duration > 0) {
      ffmpegCommand = ffmpegCommand.setDuration(duration);
    }

    ffmpegCommand
      .on('progress', (progress) => {
        // Calculate percentage (this may not be precise)
        const percent = progress.percent || 0;
        // Send progress to renderer process
        mainWindow.webContents.send('processing-progress', {
          stage: 'processing',
          file: sanitizedBaseName,
          percent: Math.floor(percent),
        });
      })
      .on('start', (commandLine) => {
        console.log('FFmpeg bắt đầu với lệnh:', commandLine);
      })
      .on('stderr', (stderrLine) => {
        console.error('FFmpeg stderr:', stderrLine);
      })
      .on('error', (err) => {
        console.error('Lỗi trong quá trình xử lý:', err);
        reject(err);
      })
      .on('end', () => {
        console.log('Video đã được xử lý và lưu tại:', outputPath);
        resolve(outputPath);
      })
      .save(outputPath);
  });
}

function mergeVideos(videoPaths, outputPath) {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath);
    console.log('Merging', outputDir);
    // Create a file list for FFmpeg
    const fileListPath = path.join(outputDir, 'filelist.txt');
    const fileListContent = videoPaths
      .map((videoPath) => `file '${videoPath.replace(/\\/g, '\\\\')}'`)
      .join('\n');
    fs.writeFileSync(fileListPath, fileListContent);

    ffmpeg()
      .input(fileListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions('-c', 'copy')
      .on('progress', (progress) => {
        const percent = progress.percent || 0;
        mainWindow.webContents.send('processing-progress', {
          stage: 'merging',
          percent: Math.floor(percent),
        });
      })
      .on('start', (commandLine) => {
        console.log('FFmpeg bắt đầu với lệnh:', commandLine);
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
        console.error('Lỗi trong quá trình ghép video:', err);
        reject(err);
      })
      .save(outputPath);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
