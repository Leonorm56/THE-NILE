import { io } from "socket.io-client";

/** Create Socket */
const socket = io("ws://127.0.0.1:7777");

/** Handle Connection Events */
socket.on("connect", () => {
  console.log("MIRROR CONNECTED");
});

socket.on("disconnect", () => {
  console.log("MIRROR DISCONNECTED");
});

export default socket;
