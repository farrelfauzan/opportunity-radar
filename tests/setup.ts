import net from "node:net";

// Unit tests never call the network: every outgoing connection (fetch, http,
// https) goes through net.Socket.connect, so refusing it here covers them all.
net.Socket.prototype.connect = function blockedConnect() {
  throw new Error(
    "Network access is blocked in unit tests. Read a recorded response with readFixture() instead.",
  );
} as typeof net.Socket.prototype.connect;
