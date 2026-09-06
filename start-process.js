import { join } from "path";
import { setupPrimary, fork } from "cluster";
async function start(file) {
  const args = [join(import.meta.dirname, file), ...process.argv.slice(2)];
  setupPrimary({ exec: args[0], args: args.slice(1) });
  const p = fork();
  p.on("exit", (code) => {
    if (code !== 0) {
      console.log(`Reiniciando proceso...`);
      start(file);
    }
  });
}
start("main.js");
