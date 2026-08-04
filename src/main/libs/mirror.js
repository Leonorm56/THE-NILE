import { Server } from "socket.io";
import { createServer } from "http";
import { networkInterfaces } from "os";

/** Preferred port, then fallbacks so a second Electron app (e.g. Whiskers)
 *  already holding 7777 does not stop this one from starting. 0 lets the OS
 *  pick any free port as a last resort. */
const PORTS = [7777, 7778, 7779, 7780, 0];

export function createMirrorServer() {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const server = createServer();
    const io = new Server(server, {
      cors: {
        origin: "*",
      },
    });

    /** Add to Room */
    io.on("connection", (socket) => {
      socket.join("receivers");

      socket.on("message", (arg) => {
        socket.to("receivers").emit("command", arg);
      });
    });

    const handleError = (error) => {
      /* Port taken: try the next one rather than failing to start. */
      if (error?.code === "EADDRINUSE" && attempt < PORTS.length - 1) {
        attempt += 1;
        server.listen(PORTS[attempt]);
        return;
      }

      reject(error);
    };

    const handleListening = () => {
      /* The OS-assigned port when PORTS[attempt] was 0. */
      const port = server.address()?.port ?? PORTS[attempt];

      const nets = networkInterfaces();
      const addresses = [];

      for (const interfaces of Object.values(nets)) {
        for (const net of interfaces) {
          const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
          if (net.family === familyV4Value) {
            addresses.push(`${net.address}:${port}`);
          }
        }
      }

      resolve({ io, server, addresses, port });
    };

    /** Start Server */
    server.on("error", handleError);
    server.on("listening", handleListening);
    server.listen(PORTS[attempt]);
  });
}
