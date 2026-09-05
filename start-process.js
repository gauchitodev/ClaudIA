import { join } from "path";
import { setupPrimary, fork } from "cluster";
const __dirname = import.meta.dirname;
async function start(file) {
  let args = [join(__dirname, file), ...process.argv.slice(2)];
  setupPrimary({ exec: args[0], args: args.slice(1) });
  let p = fork();
  p.on("exit", (code) => {
    if (code !== 0) {
      console.log(`Reiniciando proceso...`);
      start(file);
    }
  });
}
start("main.js");
