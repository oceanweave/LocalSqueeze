import { parentPort, workerData } from 'worker_threads';
import { compressImage, CompressionSettings } from '../compression';

interface WorkerData {
  inputPath: string;
  outputPath: string;
  settings: CompressionSettings;
}

async function main() {
  if (!parentPort) throw new Error('该脚本必须作为工作线程运行');
  const { inputPath, outputPath, settings } = workerData as WorkerData;
  const result = await compressImage(inputPath, outputPath, settings);
  parentPort.postMessage(result.success
    ? { status: 'completed', result }
    : { status: 'error', error: result.error });
}
main().catch(error => parentPort?.postMessage({ status: 'error', error: error.message }));
