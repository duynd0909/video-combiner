// renderer.js

const videoListContainer = document.getElementById('video-list-container');
const videoPreview = document.getElementById('video-preview');
const combineVideosBtn = document.getElementById('combine-videos-btn');

let allVideoFiles = [];
let selectedVideos = [];

document
  .getElementById('select-folder-btn')
  .addEventListener('click', async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      document.getElementById(
        'status'
      ).innerText = `Selected folder: ${folderPath}`;
      await displayVideoThumbnails(folderPath);
      combineVideosBtn.disabled = false;
    } else {
      document.getElementById('status').innerText = 'No folder selected.';
    }
  });

combineVideosBtn.addEventListener('click', () => {
  if (selectedVideos.length === 0) {
    alert('Please select at least one video to combine.');
    return;
  }
  window.electronAPI.startProcessing(selectedVideos);
});

async function displayVideoThumbnails(folderPath) {
  allVideoFiles = await window.electronAPI.getVideoFiles(folderPath);
  selectedVideos = [...allVideoFiles]; // By default, all videos are selected

  videoListContainer.innerHTML = '';

  allVideoFiles.forEach((videoPath, index) => {
    const videoThumbnail = document.createElement('div');
    videoThumbnail.classList.add('video-thumbnail', 'selected');
    videoThumbnail.dataset.index = index;

    const videoElement = document.createElement('video');
    videoElement.src = videoPath;
    videoElement.currentTime = 1; // Seek to 1 second to generate thumbnail
    videoElement.muted = true;

    videoElement.addEventListener('loadeddata', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 150;
      canvas.height =
        (videoElement.videoHeight / videoElement.videoWidth) * 150;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      const img = document.createElement('img');
      img.src = canvas.toDataURL();
      videoThumbnail.appendChild(img);
    });

    // Label showing the video file name
    const label = document.createElement('label');
    label.textContent = getFileName(videoPath);
    videoThumbnail.appendChild(label);

    // Click handler to select/deselect video
    videoThumbnail.addEventListener('click', () => {
      videoThumbnail.classList.toggle('selected');
      const idx = parseInt(videoThumbnail.dataset.index);
      const videoFile = allVideoFiles[idx];
      if (selectedVideos.includes(videoFile)) {
        selectedVideos = selectedVideos.filter((v) => v !== videoFile);
      } else {
        selectedVideos.push(videoFile);
      }
    });

    // Double-click to preview video
    videoThumbnail.addEventListener('dblclick', () => {
      videoPreview.src = videoPath;
      videoPreview.play();
    });

    videoListContainer.appendChild(videoThumbnail);
  });
}

function getFileName(filePath) {
  // Extracts the file name from the full path
  return filePath.replace(/^.*[\\\/]/, '');
}

// Listen for status updates from the main process
window.electronAPI.onCombineStatus((event, message) => {
  document.getElementById('status').innerText = message;
});
