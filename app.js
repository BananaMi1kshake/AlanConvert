// Initialize Lucide icons
lucide.createIcons();

// UI Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');
const fileSizeDisplay = document.getElementById('file-size-display');
const formatSelect = document.getElementById('format-select');
const namingTemplate = document.getElementById('naming-template');
const convertBtn = document.getElementById('convert-btn');
const engineLoader = document.getElementById('engine-loader');
const progressArea = document.getElementById('progress-area');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressPercentage = document.getElementById('progress-percentage');
const logOutput = document.getElementById('log-output');
const resultArea = document.getElementById('result-area');
const finalFilenameDisplay = document.getElementById('final-filename');
const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');

let selectedFile = null;
let ffmpeg = null;
const { fetchFile, toBlobURL } = FFmpegUtil;

// Initialize FFmpeg on load
async function initFFmpeg() {
    try {
        ffmpeg = new FFmpegWASM.FFmpeg();

        // Connect to internal logger
        ffmpeg.on('log', ({ message }) => {
            logOutput.innerHTML += `\n> ${message}`;
            logOutput.scrollTop = logOutput.scrollHeight;
        });

        // Connect to progress tracker
        ffmpeg.on('progress', ({ progress, time }) => {
            const p = Math.round(progress * 100);
            const safeP = p < 0 ? 0 : (p > 100 ? 100 : p);
            progressBar.style.width = `${safeP}%`;
            progressPercentage.innerText = `${safeP}%`;
            progressText.innerText = "Converting Engine Active...";
        });

        // Load Engine (Using unpkg CDN)
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        // Dismiss loader screen
        engineLoader.style.opacity = '0';
        setTimeout(() => engineLoader.style.display = 'none', 500);

    } catch (err) {
        console.error("FFmpeg load error:", err);
        document.getElementById('engine-status').innerText = "Error initializing engine. Please refresh the page.";
        document.getElementById('engine-status').classList.add("text-red-500");
        engineLoader.querySelector('i').setAttribute('data-lucide', 'alert-circle');
        engineLoader.querySelector('i').classList.remove('animate-spin');
        engineLoader.querySelector('i').classList.add('text-red-500');
        lucide.createIcons();
    }
}

// Generate Target Filename based on template
function generateFilename(originalName, targetExt) {
    const template = namingTemplate.value || "[name]_converted_[date].[ext]";
    
    // Remove the extension from the original file
    const lastDotIndex = originalName.lastIndexOf('.');
    const baseName = lastDotIndex !== -1 ? originalName.substring(0, lastDotIndex) : originalName;
    
    // Create YYYYMMDD_HHMMSS formatted date
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);

    return template
        .replace(/\[name\]/g, baseName)
        .replace(/\[date\]/g, dateStr)
        .replace(/\[ext\]/g, targetExt);
}

// Format file sizes for display
function formatBytes(bytes) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Handle File Selection
function handleFile(file) {
    if (file) {
        selectedFile = file;
        fileNameDisplay.innerText = file.name;
        fileSizeDisplay.innerText = formatBytes(file.size);
        convertBtn.disabled = false;
    }
}

// Event Listeners for File Inputs
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-indigo-500', 'bg-indigo-50');
});
dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-indigo-500', 'bg-indigo-50');
});
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-indigo-500', 'bg-indigo-50');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

// Conversion Engine Logic
convertBtn.addEventListener('click', async () => {
    if (!selectedFile || !ffmpeg) return;

    const targetFormat = formatSelect.value;
    const inputExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
    const inputFileName = 'temp_in' + inputExt;
    const outputFileName = `temp_out.${targetFormat}`;
    const finalCustomName = generateFilename(selectedFile.name, targetFormat);

    // Update UI State
    convertBtn.disabled = true;
    convertBtn.classList.add('hidden');
    progressArea.classList.remove('hidden');
    logOutput.innerHTML = "Initializing environment...\n";
    progressBar.style.width = '0%';
    progressPercentage.innerText = '0%';

    try {
        // 1. Move file to browser's MEMFS
        logOutput.innerHTML += "Reading file into local memory cache...\n";
        await ffmpeg.writeFile(inputFileName, await fetchFile(selectedFile));

        // 2. Prepare Command
        logOutput.innerHTML += `Translating to target format (${targetFormat})...\n`;
        let args = ['-i', inputFileName];
        
        // Set best encoding arguments based on chosen format
        if(targetFormat === 'mp4') {
            args.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac');
        } else if (targetFormat === 'gif') {
            args.push('-vf', 'fps=10,scale=320:-1:flags=lanczos', '-c:v', 'gif');
        }

        args.push(outputFileName);

        // 3. Execute Conversion
        await ffmpeg.exec(args);

        // 4. Retrieve Converted File
        logOutput.innerHTML += "Conversion successful. Packaging output...\n";
        const data = await ffmpeg.readFile(outputFileName);
        
        // 5. Generate Download Blob
        const blobUrl = URL.createObjectURL(new Blob([data.buffer]));

        // Update UI with Result
        progressArea.classList.add('hidden');
        resultArea.classList.remove('hidden');
        finalFilenameDisplay.innerText = finalCustomName;
        
        downloadBtn.href = blobUrl;
        downloadBtn.download = finalCustomName;

        // 6. Memory Cleanup
        await ffmpeg.deleteFile(inputFileName);
        await ffmpeg.deleteFile(outputFileName);

    } catch (error) {
        console.error(error);
        logOutput.innerHTML += `\nCRITICAL ERROR: ${error.message}`;
        progressText.innerText = "Error occurred. Check logs.";
        progressText.classList.add('text-red-500');
        progressBar.classList.add('bg-red-500');
    }
});

// Reset App State for another conversion
resetBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileNameDisplay.innerText = 'Click or drag file here';
    fileSizeDisplay.innerText = 'Supports MP4, MOV, WEBM, MP3, WAV...';
    
    resultArea.classList.add('hidden');
    convertBtn.classList.remove('hidden');
    convertBtn.disabled = true;
    
    progressBar.style.width = '0%';
    progressPercentage.innerText = '0%';
    progressText.classList.remove('text-red-500');
    progressBar.classList.remove('bg-red-500');
});

// Bootstrap App
window.onload = initFFmpeg;
