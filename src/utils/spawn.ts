import { spawn } from "child_process";
import { URI } from "vscode-uri";
import { join } from "path";
import * as fs from "fs-extra";
import temp from "temp-dir";
import { GetOptions } from "@paulpopat/sote/lib/file-system";
import { IsString } from "@paulpopat/safe-type";
import { PagesModel } from "@paulpopat/sote/lib/compiler/page-builder";
import { Logger } from "./logger";
import crypto from "crypto";

export function UriToPath(stringUri: string) {
  const uri = URI.parse(stringUri);
  if (uri.scheme !== "file") {
    throw new Error("This service must run on the host machine.");
  }

  return uri.fsPath;
}

export async function RunSote(dir: string, logger: Logger) {
  const cwd = UriToPath(dir);
  const options = await GetOptions(join(cwd, "tpe-config.json"));
  if (options.components) {
    options.components = options.components.map((dir) =>
      IsString(dir) ? join(cwd, dir) : { ...dir, path: join(cwd, dir.path) }
    );
  }

  options.pages = IsString(options.pages)
    ? join(cwd, options.pages)
    : join(cwd, "src", "pages");

  options.resources = IsString(options.resources)
    ? join(cwd, options.resources)
    : undefined;

  options.sass_variables = IsString(options.sass_variables)
    ? join(cwd, options.sass_variables)
    : undefined;

  const hash = crypto.createHash("md5").update(dir).digest("hex");
  const tmp = join(temp, hash);
  if (!(await fs.pathExists(join(tmp, "node_modules")))) {
    await fs.copy(join(cwd, "node_modules"), join(tmp, "node_modules"));
  }

  await fs.outputJson(join(tmp, "tpe-config.json"), options);
  await new Promise((res, rej) => {
    const command = join(
      cwd,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "sote.cmd" : "sote"
    );

    const cmd = spawn(command, ["build"], { cwd: tmp });

    cmd.stdout.on("data", (data) => {
      console.log(`stdout: ${data}`);
    });

    cmd.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
    });

    cmd.on("close", (code) => {
      console.log(`child process exited with code ${code}`);
      if (code === 0) {
        res();
      } else {
        rej(code);
      }
    });
  });

  const app: PagesModel = await fs.readJson(join(tmp, ".sote", "app.json"));
  return app;
}
