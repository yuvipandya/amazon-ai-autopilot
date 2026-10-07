import { spawnSync } from "node:child_process";

process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

function run(command, args, allowFail = false) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0 && !allowFail) {
    process.exit(result.status ?? 1);
  }

  return result.status ?? 1;
}

run("npx", ["prisma", "migrate", "deploy"], true);

console.log("Syncing Prisma schema to the database...");
run("npx", ["prisma", "db", "push", "--accept-data-loss"]);

run("npx", ["tsx", "prisma/seed.ts"]);
run("node", [".next/standalone/server.js"]);
