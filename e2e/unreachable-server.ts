import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { e2eDatabaseUrl, e2ePort } from "../scripts/e2e-env";

/**
 * A second production server (same build, port E2E_PORT + 1) that reaches the database through a
 * small TCP proxy. `stopStore()` closes the proxy, which is what "the database is stopped" looks
 * like to a page, without touching the Postgres server other sessions share.
 * The same technique as the "store unreachable" tests of e2e/news.spec.ts.
 */
export async function startUnreachableServer(password = "hunter2") {
  const port = e2ePort() + 1;
  const sockets = new Set<net.Socket>();
  const db = new URL(e2eDatabaseUrl());
  const proxy = net.createServer((client) => {
    const upstream = net.connect(Number(db.port || 5432), db.hostname);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("error", () => (client.destroy(), upstream.destroy()));
      socket.on("close", () => (client.destroy(), upstream.destroy()));
    }
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const proxyPort = (proxy.address() as net.AddressInfo).port;

  const url = new URL(db.href);
  url.username = "postgres";
  url.password = password;
  url.hostname = "127.0.0.1";
  url.port = String(proxyPort);
  const server: ChildProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: url.href },
    stdio: "ignore",
  });

  const stopStore = () => {
    proxy.close();
    for (const socket of sockets) socket.destroy();
  };
  const stop = async () => {
    stopStore();
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      // A graceful stop waits for open connections; the server has nothing to keep, so do not wait long.
      const killer = setTimeout(() => server.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(killer);
    }
  };

  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/en/calculators`)).ok) return { port, proxyPort, password, stopStore, stop };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await stop();
  throw new Error("The second server did not start");
}
