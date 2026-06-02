import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import http from 'http';
import https from 'https';

const exeName = 'AGI-client.exe';
const exePath = path.join(process.cwd(), exeName);

// Load .env.local to find server URL
let serverUrl = 'http://49.142.52.133:1777';
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/JJAPVIS_SERVER_URL\s*=\s*(.+)/);
    if (match) {
      serverUrl = match[1].trim();
    }
  }
} catch (e) {
  console.warn('[AGI-client] Warning: Could not read .env.local, using default server URL.', e.message);
}

// 1. Check if process is already running
function isRunning() {
  try {
    const stdout = execSync(`tasklist /nh /fi "imagename eq ${exeName}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    return stdout.toLowerCase().includes(exeName.toLowerCase());
  } catch (e) {
    return false;
  }
}

// 2. Launch local AGI-client.exe in the background
function launchClient(retries = 3, delay = 1000) {
  if (!fs.existsSync(exePath)) {
    console.error(`[AGI-client] Error: ${exeName} not found at ${exePath}`);
    return;
  }
  console.log(`[AGI-client] Spawning ${exeName} in background...`);
  try {
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
    console.log(`[AGI-client] ${exeName} launched successfully.`);
  } catch (e) {
    if (retries > 0 && (e.code === 'EBUSY' || e.message.includes('EBUSY'))) {
      console.warn(`[AGI-client] File busy (EBUSY). Retrying in ${delay}ms... (${retries} left)`);
      setTimeout(() => {
        launchClient(retries - 1, delay * 2);
      }, delay);
    } else {
      console.error(`[AGI-client] Failed to execute ${exeName}:`, e.message);
    }
  }
}

// 3. Helper to download file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;

    console.log(`[AGI-client] Initiating download from: ${url}`);
    const request = client.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        console.log(`[AGI-client] Following redirect to: ${redirectUrl}`);
        file.close();
        fs.unlink(dest, () => {});
        downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`Server responded with status code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close((err) => {
          if (err) {
            fs.unlink(dest, () => {});
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });

    request.setTimeout(15000, () => {
      request.destroy();
      file.close();
      fs.unlink(dest, () => {});
      reject(new Error('Download request timed out (15s)'));
    });
  });
}

// Main execution flow
async function main() {
  if (isRunning()) {
    console.log(`[AGI-client] ${exeName} is already running. Skipping launch.`);
    process.exit(0);
  }

  if (fs.existsSync(exePath)) {
    console.log(`[AGI-client] Found local ${exeName}. Launching...`);
    // Wait a brief moment just in case it was recently modified or closed
    setTimeout(() => {
      launchClient();
    }, 500);
    // Give start/spawn command time to execute before exiting Node process
    setTimeout(() => {
      process.exit(0);
    }, 1500);
    return;
  }

  // Not found, download and launch
  const downloadUrl = `${serverUrl.replace(/\/$/, '')}/download/${exeName}`;
  console.log(`[AGI-client] ${exeName} not found locally.`);
  try {
    await downloadFile(downloadUrl, exePath);
    console.log(`[AGI-client] Download completed. Launching in 1 second...`);
    setTimeout(() => {
      launchClient();
    }, 1000);
  } catch (e) {
    console.error(`[AGI-client] Warning: Failed to download AGI-client.exe (${e.message}). Next.js will proceed anyway.`);
  }
  
  // Keep process alive briefly to let setTimeout callbacks fire
  setTimeout(() => {
    process.exit(0);
  }, 3000);
}

main();
