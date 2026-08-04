import { Server } from "socket.io";
import { createServer } from "http";
import { networkInterfaces } from "os";

/** Preferred port, then fallbacks so a second Electron app (e.g. Whiskers)
 * already holding 7777 does not stop this one from starting. */
const PORTS = [7777, 7778, 7779, 7780, 0];

export function createMirrorServer() {
  return new Promise((resolve, reject) => {
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

    let attempt = 0;

    /** Try the next candidate port when one is already in use. */
    const handleError = (error) => {
      if (error?.code === "EADDRINUSE" && attempt < PORTS.length - 1) {
        attempt += 1;
        server.listen(PORTS[attempt], onListening);
        return;
      }

      reject(error);
    };

    function onListening(error) {
      if (error) return reject(error);

      /** Port 0 means the OS chose one for us. */
      const PORT = server.address()?.port ?? PORTS[attempt];

      const nets = networkInterfaces();
      const addresses = [];

      for (const interfaces of Object.values(nets)) {
        for (const net of interfaces) {
          const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
          if (net.family === familyV4Value) {
            addresses.push(`${net.address}:${PORT}`);
          }
        }
      }

      resolve({ io, server, addresses });
    }

    /** Start Server */
    server.on("error", handleError).listen(PORTS[attempt], onListening);
  });
}
