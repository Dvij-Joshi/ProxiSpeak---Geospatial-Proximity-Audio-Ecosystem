import cluster from 'node:cluster';
import os from 'node:os';

const numCPUs = process.env.WORKERS
  ? parseInt(process.env.WORKERS, 10)
  : Math.min(os.cpus().length, 4);

if (cluster.isPrimary) {
  console.log(`[Cluster] Primary master process ${process.pid} is running`);
  console.log(`[Cluster] Forking ${numCPUs} worker processes across CPU cores...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} exited (code: ${code}, signal: ${signal}). Spawning replacement...`);
    cluster.fork();
  });
} else {
  // Worker process launches server/index.js (with Redis Pub/Sub adapter handling cross-worker sync)
  await import('./index.js');
  console.log(`[Cluster] Worker ${process.pid} initialized and listening`);
}
