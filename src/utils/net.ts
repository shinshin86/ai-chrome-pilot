import { createServer } from 'node:net';

export async function isPortAvailable(port: number, host: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, host);
  });
}

export async function assertPortAvailable(
  port: number,
  host: string,
  label: string
): Promise<void> {
  const available = await isPortAvailable(port, host);
  if (!available) {
    throw new Error(`${label} port ${port} is already in use on ${host}`);
  }
}
