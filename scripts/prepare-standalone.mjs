import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

fs.cpSync(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
  { recursive: true }
);

if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(
    path.join(root, "public"),
    path.join(standalone, "public"),
    { recursive: true }
  );
}

const generatedPrisma = path.join(root, "src", "generated");
if (fs.existsSync(generatedPrisma)) {
  fs.cpSync(generatedPrisma, path.join(standalone, "src", "generated"), {
    recursive: true,
  });
}

console.log("Standalone assets copied successfully.");
