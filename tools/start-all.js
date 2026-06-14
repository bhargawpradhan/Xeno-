const { spawn } = require("child_process");
const path = require("path");

const commands = [
  ["frontend", "node", [path.join("frontend", "dev-server.js")]],
  ["backend", "node", [path.join("backend", "server.js")]],
  ["simulator", "node", [path.join("simulator-service", "server.js")]]
];

for (const [name, command, args] of commands) {
  const child = spawn(command, args, { stdio: "pipe", shell: true });
  child.stdout.on("data", (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[${name}] ${data}`));
  child.on("exit", (code) => process.stdout.write(`[${name}] exited with ${code}\n`));
}
