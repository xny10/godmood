// ==========================================
// TTGODMODE — TikTok Download + Meta Randomizer
// ==========================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { Downloader } = require('@tobyg74/tiktok-api-dl');

// Try to load fluent-ffmpeg (optional — only needed for metadata randomizer)
let ffmpeg;
try {
  ffmpeg = require('fluent-ffmpeg');
} catch (e) {
  console.warn('[WARN] fluent-ffmpeg not installed. Metadata randomizer will be disabled.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// Store active sessions & SSE clients
// ==========================================
const sessions = {}; // sessionId -> { urls, status, files, clients[], randomizeMeta }

// ==========================================
// Metadata Randomizer — Presets from railmetas
// ==========================================

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateRandomMetadata() {
  const authors = [
    'Nova_Media', 'Frame_Studio', 'Motion_Lab', 'Digital_Wave',
    'Creative_Edge', 'Visual_Arts', 'Media_Pro', 'Content_Master',
    'Pixel_Factory', 'Stream_Creator', 'Video_Forge', 'Edit_Zone'
  ];

  const titles = [
    'Amazing_Video', 'Creative_Clip', 'Fresh_Media', 'Stunning_Content',
    'High_Quality', 'Professional', 'Enhanced_Result', 'Premium_Quality',
    'Outstanding_Media', 'Best_Video', 'Awesome_Output', 'Superb_Export'
  ];

  const descriptions = [
    'high_quality_export', 'optimized_for_sharing', 'enhanced_media',
    'professional_content', 'premium_result', 'carefully_processed'
  ];

  const keywords = [
    'clip', 'media', 'export', 'visual', 'content', 'video',
    'production', 'creative', 'premium', 'quality', 'enhanced'
  ];

  const title = getRandomElement(titles);
  const shuffledDesc = shuffleArray(descriptions).slice(0, 3).join(' ');

  const now = new Date();
  const shift = Math.floor(Math.random() * 20) - 10;
  const shiftedTime = new Date(now.getTime() + shift * 1000);
  const creationTime = shiftedTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const selectedKeywords = shuffleArray(keywords).slice(0, 5).join(' ');

  return {
    artist: getRandomElement(authors),
    author: getRandomElement(authors),
    title: title,
    description: shuffledDesc,
    comment: `randomized_${Math.random().toString(36).substring(2, 12)}`,
    encoder: `ttgodmode_${Math.random().toString(36).substring(2, 8)}`,
    publisher: getRandomElement(authors),
    keywords: selectedKeywords,
    creation_time: creationTime,
    date: shiftedTime.toISOString().split('T')[0]
  };
}

// ==========================================
// FFmpeg Video Processor — 10 Uniqueness Techniques
// ==========================================

async function processVideoWithFFmpeg(inputPath, outputPath) {
  if (!ffmpeg) {
    throw new Error('FFmpeg not available. Install fluent-ffmpeg and ensure ffmpeg is in PATH.');
  }

  return new Promise((resolve, reject) => {
    const metadata = generateRandomMetadata();

    // Audio pitch: ±0.01 (very subtle)
    const pitchFactor = 1 + (Math.random() * 0.02 - 0.01);
    const tempoFactor = 1 / pitchFactor;

    // Audio bitrate jitter
    const audioBitrates = ['128k', '160k', '192k'];
    const audioBitrate = getRandomElement(audioBitrates);

    // Video CRF jitter
    const crfValues = [22, 23, 24];
    const crf = getRandomElement(crfValues);

    let command = ffmpeg(inputPath)
      .outputOptions(['-y'])
      .outputOptions(['-map_metadata', '-1'])

      // Video filters: noise + pixel shift
      .videoFilters([
        'noise=alls=1:allf=t+u',
        'crop=iw-2:ih-2:1:1',
        'scale=iw:ih'
      ])

      // Audio filters: pitch shift
      .audioFilters([
        `asetrate=44100*${pitchFactor.toFixed(4)}`,
        'aresample=44100',
        `atempo=${tempoFactor.toFixed(4)}`
      ])

      // Video codec
      .videoCodec('libx264')
      .outputOptions(['-crf', crf.toString()])
      .outputOptions(['-preset', 'veryfast'])

      // Audio codec
      .audioCodec('aac')
      .audioBitrate(audioBitrate)

      // Inject random metadata
      .outputOptions([
        '-metadata', `title=${metadata.title}`,
        '-metadata', `artist=${metadata.artist}`,
        '-metadata', `author=${metadata.author}`,
        '-metadata', `comment=${metadata.comment}`,
        '-metadata', `description=${metadata.description}`,
        '-metadata', `encoder=${metadata.encoder}`,
        '-metadata', `publisher=${metadata.publisher}`,
        '-metadata', `keywords=${metadata.keywords}`,
        '-metadata', `creation_time=${metadata.creation_time}`,
        '-metadata', `date=${metadata.date}`
      ])
      .output(outputPath);

    command
      .on('start', (commandLine) => {
        console.log('[FFmpeg] Command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`[FFmpeg] Processing: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log('[FFmpeg] Processing finished successfully');
        resolve(metadata);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[FFmpeg] Error:', err.message);
        if (stderr) console.error('[FFmpeg] stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

// ==========================================
// API: Check FFmpeg availability
// ==========================================
app.get('/api/check-ffmpeg', (req, res) => {
  if (!ffmpeg) {
    return res.json({ available: false });
  }

  // Check if ffmpeg binary is actually accessible
  const testCmd = require('child_process').spawn('ffmpeg', ['-version']);
  testCmd.on('error', () => {
    res.json({ available: false });
  });
  testCmd.on('close', (code) => {
    res.json({ available: code === 0 });
  });
});

// ==========================================
// API: Start downloads
// ==========================================
app.post('/api/download', (req, res) => {
  const { urls, randomizeMeta } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.json({ success: false, error: 'No URLs provided' });
  }

  if (urls.length > 50) {
    return res.json({ success: false, error: 'Maximum 50 URLs at a time' });
  }

  const sessionId = uuidv4();
  const sessionDir = path.join(DOWNLOADS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  sessions[sessionId] = {
    urls,
    sessionDir,
    randomizeMeta: !!randomizeMeta,
    status: urls.map(() => 'waiting'),
    files: {},
    clients: [],
  };

  // Start processing
  processQueue(sessionId);

  res.json({ success: true, sessionId });
});

// ==========================================
// API: SSE Progress Stream
// ==========================================
app.get('/api/progress', (req, res) => {
  const { sessionId } = req.query;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('\n');

  session.clients.push(res);

  req.on('close', () => {
    session.clients = session.clients.filter(c => c !== res);
  });
});

// ==========================================
// API: Download single file
// ==========================================
app.get('/api/download-file/:filename', (req, res) => {
  const { sessionId } = req.query;
  const { filename } = req.params;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const decodedFilename = decodeURIComponent(filename);
  const filePath = path.join(session.sessionDir, decodedFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Force actual filename to prevent missing extensions
  res.setHeader('Content-Disposition', `attachment; filename="${decodedFilename}"`);
  res.setHeader('Content-Type', 'video/mp4');
  res.download(filePath, decodedFilename);
});

// ==========================================
// API: Download all as ZIP
// ==========================================
app.get('/api/download-all', (req, res) => {
  const { sessionId } = req.query;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const files = Object.values(session.files).filter(f => f);
  if (files.length === 0) {
    return res.status(404).json({ error: 'No files to download' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="ttgodmode-videos.zip"');

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  archive.pipe(res);

  files.forEach(filename => {
    const filePath = path.join(session.sessionDir, filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: filename });
    }
  });

  archive.finalize();
});

// ==========================================
// Download Queue Processor
// ==========================================
const MAX_CONCURRENT = 3;

async function processQueue(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;

  const { urls } = session;
  let activeCount = 0;
  let nextIndex = 0;

  return new Promise((resolve) => {
    function startNext() {
      while (activeCount < MAX_CONCURRENT && nextIndex < urls.length) {
        const index = nextIndex++;
        activeCount++;
        downloadVideo(sessionId, urls[index], index).then(() => {
          activeCount--;
          if (nextIndex >= urls.length && activeCount === 0) {
            // All done
            sendSSE(sessionId, { type: 'all_done' });
            resolve();
          } else {
            startNext();
          }
        });
      }
    }
    startNext();
  });
}

// ==========================================
// Single Video Downloader + Optional Meta Randomizer
// ==========================================
async function downloadVideo(sessionId, url, index) {
  const session = sessions[sessionId];
  if (!session) return;

  session.status[index] = 'downloading';
  sendSSE(sessionId, { index, type: 'start' });

  try {
    // 1. Get download URL from tiktok-api-dl
    sendSSE(sessionId, { index, type: 'progress', percent: 10, detail: 'Fetching video metadata...' });

    const result = await Downloader(url, { version: "v3" });

    if (result.status !== "success" || !result.result) {
      throw new Error(result.message || 'Failed to fetch TikTok metadata');
    }

    const videoData = result.result;
    const downloadUrl = videoData.videoHD || videoData.video1;
    if (!downloadUrl) {
      throw new Error('No video URL found in the response');
    }

    const originalTitle = videoData.desc || `tiktok_video_${videoData.id}`;
    const safeTitle = originalTitle.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 50);
    const finalFilename = `${safeTitle || 'video'}_${videoData.id}.mp4`;
    const outputPath = path.join(session.sessionDir, finalFilename);

    sendSSE(sessionId, { index, type: 'title', title: originalTitle });

    // 2. Download the video file
    const fileRes = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    });

    const totalLength = fileRes.headers['content-length'];
    let downloadedLength = 0;
    let lastPercent = 0;

    const writer = fs.createWriteStream(outputPath);

    fileRes.data.on('data', (chunk) => {
      downloadedLength += chunk.length;
      if (totalLength) {
        const percent = Math.floor((downloadedLength / totalLength) * 100);
        if (percent > lastPercent && percent % 5 === 0) {
          lastPercent = percent;
          const mbDownloaded = (downloadedLength / 1024 / 1024).toFixed(2);
          const mbTotal = (totalLength / 1024 / 1024).toFixed(2);
          sendSSE(sessionId, {
            index,
            type: 'progress',
            percent,
            detail: `Downloading: ${percent}% of ${mbTotal}MB`
          });
        }
      }
    });

    fileRes.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // 3. If randomizeMeta is ON, process with FFmpeg
    if (session.randomizeMeta) {
      sendSSE(sessionId, { index, type: 'meta_start', detail: 'Randomizing metadata...' });

      const metaFilename = `godmode_${safeTitle || 'video'}_${videoData.id}.mp4`;
      const metaOutputPath = path.join(session.sessionDir, metaFilename);

      try {
        const metaResult = await processVideoWithFFmpeg(outputPath, metaOutputPath);

        // Remove original, keep processed
        fs.unlinkSync(outputPath);

        session.status[index] = 'complete';
        session.files[index] = metaFilename;
        sendSSE(sessionId, {
          index,
          type: 'complete',
          filename: metaFilename,
          metaApplied: true,
          metaInfo: metaResult
        });
      } catch (ffmpegErr) {
        console.error(`[FFmpeg Error #${index}]:`, ffmpegErr.message);
        // Fallback: keep the original downloaded file
        session.status[index] = 'complete';
        session.files[index] = finalFilename;
        sendSSE(sessionId, {
          index,
          type: 'complete',
          filename: finalFilename,
          metaApplied: false,
          metaError: ffmpegErr.message
        });
      }
    } else {
      // No metadata randomization
      session.status[index] = 'complete';
      session.files[index] = finalFilename;
      sendSSE(sessionId, { index, type: 'complete', filename: finalFilename });
    }

  } catch (err) {
    console.error(`[Download Error #${index}]:`, err.message);
    session.status[index] = 'error';
    sendSSE(sessionId, { index, type: 'error', detail: err.message });
  }
}

// ==========================================
// SSE Helper
// ==========================================
function sendSSE(sessionId, data) {
  const session = sessions[sessionId];
  if (!session) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  session.clients.forEach(client => {
    try {
      client.write(message);
    } catch (e) {
      // Client disconnected
    }
  });
}

// ==========================================
// Cleanup old sessions (every 1 minute)
// ==========================================
setInterval(() => {
  const now = Date.now();
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;

  // Cleanup session tracking
  const sessionIds = Object.keys(sessions);
  if (sessionIds.length > 20) {
    const toRemove = sessionIds.slice(0, sessionIds.length - 20);
    toRemove.forEach(id => {
      delete sessions[id];
    });
  }

  // Cleanup physical files older than 15 minutes
  fs.readdir(DOWNLOADS_DIR, (err, folders) => {
    if (err) return;

    folders.forEach(folder => {
      const folderPath = path.join(DOWNLOADS_DIR, folder);
      fs.stat(folderPath, (err, stats) => {
        if (err) return;

        if (now - stats.mtimeMs > FIFTEEN_MIN_MS) {
          fs.rm(folderPath, { recursive: true, force: true }, (err) => {
            if (!err) console.log(`[Auto-Delete] Removed expired session folder: ${folder}`);
          });

          if (sessions[folder]) {
            delete sessions[folder];
          }
        }
      });
    });
  });

}, 1 * 60 * 1000);

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║        ⚡ TTGODMODE is running! ⚡           ║');
  console.log(`  ║   Open: http://localhost:${PORT}                  ║`);
  console.log('  ║   TikTok Download + Meta Randomizer          ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});
