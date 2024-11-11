// renderer.js

const videoListContainer = document.getElementById('video-list-container');
const combineVideosBtn = document.getElementById('combine-videos-btn');
const selectVideosBtn = document.getElementById('select-videos-btn');
const selectFolderBtn = document.getElementById('select-folder-btn');

const videoModal = document.getElementById('video-modal');
const modalClose = document.getElementById('modal-close');
const modalVideoPlayer = document.getElementById('modal-video-player');

// Element to display progress
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');

// Help Modal Elements
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const helpModalClose = document.getElementById('help-modal-close');

const revealInExplorerBtn = document.getElementById('reveal-in-explorer-btn');
const numOutputVideosInput = document.getElementById('num-output-videos');

const countRadio = document.getElementById('limit-by-count');
const durationRadio = document.getElementById('limit-by-duration');
const maxDurationInput = document.getElementById('max-duration');
const numInputVideosInput = document.getElementById('num-input-videos');
const countConditionDiv = document.getElementById('count-condition');
const durationConditionDiv = document.getElementById('duration-condition');

let allVideoFiles = [];
let selectedVideos = [];

countConditionDiv.style.display = 'block';

// Sự kiện thay đổi điều kiện
countRadio.addEventListener('change', () => {
  if (countRadio.checked) {
    countConditionDiv.style.display = 'block';
    durationConditionDiv.style.display = 'none';
  }
});

durationRadio.addEventListener('change', () => {
  if (durationRadio.checked) {
    durationConditionDiv.style.display = 'block';
    countConditionDiv.style.display = 'none';
  }
});
// Event listener for select videos button
selectVideosBtn.addEventListener('click', async () => {
  const videoPaths = await window.electronAPI.selectVideos();
  if (videoPaths && videoPaths.length > 0) {
    document.getElementById(
      'status'
    ).innerText = `Selected ${videoPaths.length} video(s).`;
    await displayVideoThumbnailsFromFiles(videoPaths);
  } else {
    document.getElementById('status').innerText = 'Chọn ít nhất 1 video.';
  }
});
// Event listener for select folder button
selectFolderBtn.addEventListener('click', async () => {
  const folderPath = await window.electronAPI.selectFolder();
  if (folderPath) {
    document.getElementById(
      'status'
    ).innerText = `Selected folder: ${folderPath}`;
    // Clear previous selections
    allVideoFiles = [];
    selectedVideos = [];
    videoListContainer.innerHTML = '';

    // Get video files from the selected folder
    allVideoFiles = await window.electronAPI.getVideoFiles(folderPath);
    selectedVideos = [...allVideoFiles];
    await displayVideoThumbnails();
  } else {
    document.getElementById('status').innerText = 'Chọn ít nhất 1 video.';
  }
});
// Function to display video thumbnails from selected files
async function displayVideoThumbnailsFromFiles(videoPaths) {
  // Clear previous selections
  allVideoFiles = [];
  selectedVideos = [];
  videoListContainer.innerHTML = '';

  // Set the new list of video files
  allVideoFiles = videoPaths;
  selectedVideos = [...allVideoFiles];

  // Call the function to display the thumbnails
  await displayVideoThumbnails();
}

// Function to display video thumbnails
async function displayVideoThumbnails() {
  videoListContainer.innerHTML = '';

  allVideoFiles.forEach((videoPath, index) => {
    const videoThumbnail = document.createElement('div');
    videoThumbnail.classList.add('video-thumbnail', 'selected');
    videoThumbnail.dataset.index = index;

    // Create an image element to hold the thumbnail
    const img = document.createElement('img');
    img.src = './assets/default.webp'; // Placeholder image before loading the thumbnail
    videoThumbnail.appendChild(img);

    // Generate the thumbnail
    generateThumbnail(videoPath, img);

    // Create the play button overlay
    const playButton = document.createElement('div');
    playButton.classList.add('play-button');
    videoThumbnail.appendChild(playButton);

    // Create the remove button
    const removeButton = document.createElement('span');
    removeButton.classList.add('remove-button');
    removeButton.innerHTML = '&times;';
    videoThumbnail.appendChild(removeButton);

    // Label showing the video file name
    const label = document.createElement('label');
    label.textContent = getFileName(videoPath);
    videoThumbnail.appendChild(label);

    // Click handler for the remove button
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation(); // Prevent the click from toggling selection
      const idx = parseInt(videoThumbnail.dataset.index);
      const videoFile = allVideoFiles[idx];

      // Remove the video from selectedVideos
      selectedVideos = selectedVideos.filter((v) => v !== videoFile);

      // Update the UI to reflect removal
      videoThumbnail.classList.remove('selected');
      videoThumbnail.style.opacity = '0.5'; // Optionally dim the thumbnail
      videoThumbnail.remove();

      // Disable buttons if no videos are selected
      if (selectedVideos.length === 0) {
        combineVideosBtn.disabled = true;
      }
    });

    // Click handler to select/deselect video
    videoThumbnail.addEventListener('click', (event) => {
      // Ignore if the remove button was clicked or if the video is already removed
      if (
        event.target.classList.contains('remove-button') ||
        !videoThumbnail.classList.contains('selected')
      ) {
        return;
      }

      const idx = parseInt(videoThumbnail.dataset.index);
      const videoFile = allVideoFiles[idx];

      videoThumbnail.classList.toggle('selected');

      if (selectedVideos.includes(videoFile)) {
        selectedVideos = selectedVideos.filter((v) => v !== videoFile);
        videoThumbnail.style.opacity = '0.5'; // Optionally dim the thumbnail
      } else {
        selectedVideos.push(videoFile);
        videoThumbnail.style.opacity = '1'; // Restore opacity
      }

      // Enable/disable buttons based on selection
      if (selectedVideos.length === 0) {
        combineVideosBtn.disabled = true;
      } else {
        combineVideosBtn.disabled = false;
      }
    });

    // Click handler for the play button
    playButton.addEventListener('click', (event) => {
      event.stopPropagation(); // Prevent the click from toggling selection
      openVideoModal(videoPath);
    });
    videoListContainer.appendChild(videoThumbnail);
  });

  // Enable or disable buttons based on selection
  if (selectedVideos.length === 0) {
    combineVideosBtn.disabled = true;
  } else {
    combineVideosBtn.disabled = false;
  }
}

// Function to generate a thumbnail for a video
function generateThumbnail(videoPath, imgElement) {
  const video = document.createElement('video');
  video.src = videoPath;
  video.currentTime = 1; // Seek to 1 second to generate thumbnail
  video.muted = true;

  video.addEventListener('loadeddata', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = (video.videoHeight / video.videoWidth) * 150;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    imgElement.src = canvas.toDataURL();
    video.remove(); // Clean up
  });
}

// Function to open the video modal and play the video
function openVideoModal(videoPath) {
  modalVideoPlayer.src = '';
  modalVideoPlayer.src = videoPath;
  videoModal.style.display = 'block';
  // Event listener for the Reveal in Explorer button
  revealInExplorerBtn.addEventListener('click', () => {
    console.log(videoPath, 'event');

    if (videoPath) {
      window.electronAPI.openPath(videoPath);
    }
  });
  modalVideoPlayer.play();
}

// Function to close the video modal
function closeVideoModal() {
  modalVideoPlayer.pause();
  modalVideoPlayer.currentTime = 0;
  modalVideoPlayer.src = '';
  videoModal.style.display = 'none';
}

// Event listener for the modal close button
modalClose.addEventListener('click', closeVideoModal);

// Event listener to close the modal when clicking outside the modal content
window.addEventListener('click', (event) => {
  if (event.target === videoModal) {
    closeVideoModal();
  }
});

// Function to handle when combining videos is complete
function handleCombineComplete(message, savePath) {
  document.getElementById('status').innerText = message;
  if (message.includes('successfully')) {
    window.electronAPI.openPath(savePath);
    // openVideoModal(savePath);
  }
}

// Hide or reset progress bar when processing is complete
window.electronAPI.onCombineStatus((event, message, savePath) => {
  handleCombineComplete(message, savePath);

  // Hide or reset progress bar
  progressBar.style.width = '0%';
  progressLabel.innerText = '';
  progressContainer.style.display = 'none';
});

// Event listener for the combine videos button
combineVideosBtn.addEventListener('click', async () => {
  const numOutputs = parseInt(numOutputVideosInput.value, 10);
  const limitType = countRadio.checked ? 'count' : 'duration';
  const limitValue =
    limitType === 'count'
      ? parseInt(numInputVideosInput.value, 10)
      : parseInt(maxDurationInput.value, 10);

  if (selectedVideos.length === 0) {
    alert('Chọn ít nhất 1 video để ghép.');
    return;
  }
  const savePath = await promptSaveLocation();
  if (!savePath) {
    alert('Vui lòng chọn đường dẫn lưu video.');
    return;
  }

  // const numClips = parseInt(document.getElementById('num-clips').value, 10);
  const maxDuration = parseInt(
    document.getElementById('max-duration').value,
    10
  );
  // Show progress bar
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  progressLabel.innerText = 'Bắt đầu xử lý...';
  window.electronAPI.startProcessing(
    selectedVideos,
    savePath,
    numOutputs,
    limitType,
    limitValue
  );
});

// Function to prompt for save location
async function promptSaveLocation() {
  const savePath = await window.electronAPI.selectSaveDirectory();
  return savePath;
}

// Function to get the file name from a path
function getFileName(filePath) {
  return filePath.replace(/^.*[\\\/]/, '');
}

// // Event listener for select folder button
// document
//   .getElementById('select-folder-btn')
//   .addEventListener('click', async () => {
//     const folderPath = await window.electronAPI.selectFolder();
//     if (folderPath) {
//       document.getElementById(
//         'status'
//       ).innerText = `Selected folder: ${folderPath}`;
//       // Get video files from the selected folder
//       allVideoFiles = await window.electronAPI.getVideoFiles(folderPath);
//       selectedVideos = [...allVideoFiles];
//       await displayVideoThumbnails();
//     } else {
//       document.getElementById('status').innerText = 'No folder selected.';
//     }
//   });
// Listen for progress updates from the main process
// Listening for progress updates
window.electronAPI.onProcessingProgress((event, data) => {
  const { stage, file, percent } = data;

  // Update progress bar and label
  progressBar.style.width = `${percent}%`;
  if (stage === 'processing') {
    progressLabel.innerText = `Đang xử lý ${file}: ${percent}%`;
  } else if (stage === 'merging') {
    progressLabel.innerText = `Đang ghép video: ${percent}%`;
  }
});

// Event listener to open the help modal
helpBtn.addEventListener('click', () => {
  helpModal.style.display = 'block';
});

// Event listener to close the help modal
helpModalClose.addEventListener('click', () => {
  helpModal.style.display = 'none';
});

// Close the modal when clicking outside the modal content
window.addEventListener('click', (event) => {
  if (event.target === helpModal) {
    helpModal.style.display = 'none';
  }
});
