/**
 * GRACE — talking to a farm server over SSH.
 *
 * The host and key are per-run arguments, never saved: these machines get
 * rebuilt and the details change, so a stored value would quietly point at a
 * box someone else owns. They come from `--ssh`/`--key` or
 * `GRACE_SSH_HOST`/`GRACE_SSH_KEY`, and a missing one is an error that says so.
 *
 * No shell is involved on this side: args go to `ssh`/`scp` as an array, so
 * spaces in a Windows key path survive untouched.
 */

import { spawn } from "node:child_process";

const SSH_OPTIONS = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"];

/**
 * @param {{host?: string, key?: string, command?: string, port?: number|string, extra?: string[]}} [input]
 * @returns {string[]}
 */
export function buildSshArgs({ host, key, command, port, extra = [] } = {}) {
  if (!host) {
    throw new Error(
      "ssh host is required — pass --ssh user@host (GRACE never stores it)",
    );
  }
  if (!key) {
    throw new Error("ssh key is required — pass --key path/to/key.pem");
  }
  if (!command) {
    throw new Error("ssh command is required");
  }

  const args = ["-i", key, ...SSH_OPTIONS];
  if (port) args.push("-p", String(port));
  args.push(...extra, host, command);
  return args;
}

/**
 * @param {{key?: string, local?: string, remote?: string, port?: number|string, extra?: string[]}} [input]
 * @returns {string[]}
 */
export function buildScpArgs({ key, local, remote, port, extra = [] } = {}) {
  if (!key) {
    throw new Error("ssh key is required — pass --key path/to/key.pem");
  }
  if (!local) throw new Error("scp source is required");
  if (!remote) throw new Error("scp destination is required");

  const args = ["-i", key, ...SSH_OPTIONS];
  if (port) args.push("-P", String(port));
  args.push(...extra, local, remote);
  return args;
}

/**
 * Run a command on the remote host, streaming its output to this terminal.
 *
 * Resolves with the exit code and rejects on a transport error (missing
 * `ssh`, bad key), so the caller can tell "the remote command failed" from
 * "we never got there".
 *
 * @param {{host: string, key: string, command: string, port?: number|string, stdio?: "inherit"|"pipe", input?: string}} input
 * @returns {Promise<number>}
 */
export function runSsh({ host, key, command, port, stdio = "inherit", input }) {
  return run("ssh", buildSshArgs({ host, key, command, port }), stdio, input);
}

/**
 * @param {{key: string, local: string, remote: string, port?: number|string, stdio?: "inherit"|"pipe"}} input
 * @returns {Promise<number>}
 */
export function runScp({ key, local, remote, port, stdio = "inherit" }) {
  return run("scp", buildScpArgs({ key, local, remote, port }), stdio);
}

/**
 * @param {string} file
 * @param {string[]} args
 * @param {"inherit"|"pipe"} stdio
 * @param {string} [input] written to the child's stdin, then closed
 * @returns {Promise<number>}
 */
function run(file, args, stdio, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      stdio: input === undefined ? stdio : ["pipe", "inherit", "inherit"],
    });

    if (input !== undefined) {
      child.stdin.on("error", () => {
        /* The remote side may exit before reading everything (e.g. an unknown
         * farmer id). The exit code carries that failure; an EPIPE here would
         * just mask it. */
      });
      child.stdin.end(input);
    }

    if (stdio === "pipe") {
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
    }

    child.on("error", (error) => {
      reject(
        new Error(
          `could not run ${file}: ${error.message}` +
            (error.code === "ENOENT" ? " (is OpenSSH installed?)" : ""),
        ),
      );
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}
