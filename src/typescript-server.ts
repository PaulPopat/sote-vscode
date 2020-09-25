import { spawn } from "child_process";
import * as path from "path";
import * as jayson from "jayson";
import { TextDocument } from "vscode-css-languageservice";
import { TextDocumentPositionParams } from "vscode-languageclient";
import { Connection } from "vscode-languageserver";

export function BuildServer() {
  const loc = path.join(
    __dirname,
    "..",
    "node_modules",
    ".bin",
    process.platform === "win32"
      ? "typescript-language-server.cmd"
      : "typescript-language-server"
  );

  const bat = spawn(loc, ["--stdio", "--socket=5673"]);

  bat.stdout.on("data", (data) => {
    console.log(data.toString());
  });

  bat.stderr.on("data", (data) => {
    console.error(data.toString());
  });

  bat.on("exit", (code) => {
    console.log(`Child exited with code ${code}`);
  });

  const client = jayson.Client.http({ port: 5673 });

  return {
    do_complete(document: TextDocument, p: TextDocumentPositionParams) {
      return new Promise((res, rej) =>
        client.request("textDocument/completion", p, (err: any, r: any) => {
          if (err) rej(err);
          else res(r.result);
        })
      );
    },
    do_hover(document: TextDocument, p: TextDocumentPositionParams) {
      return new Promise((res, rej) =>
        client.request("textDocument/hover", p, (err: any, r: any) => {
          if (err) rej(err);
          else res(r.result);
        })
      );
    },
    validate(document: TextDocument, connection: Connection) {},
  };
}
