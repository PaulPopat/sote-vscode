import * as vscode from "vscode";
import * as path from "path";
import { LanguageClient, TransportKind } from "vscode-languageclient";

export function activate(context: vscode.ExtensionContext) {
  console.log("Starting extension");
  const serverModule = context.asAbsolutePath(path.join("out", "server.js"));

  const client = new LanguageClient(
    "tpe-language-server",
    "TPE Language Server",
    {
      run: { module: serverModule, transport: TransportKind.ipc },
      debug: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: { execArgv: ["--nolazy", "--inspect=6009"] },
      },
    },
    {
      documentSelector: [{ scheme: "file", language: "tpe" }],
      synchronize: {
        fileEvents: [
          vscode.workspace.createFileSystemWatcher("**/*.tpe"),
          vscode.workspace.createFileSystemWatcher("./tpe-config.json"),
        ],
      },
    }
  );

  client.onReady().then(() => {
    client.onNotification("custom/message", (message: string) => {
      console.log(message);
    });
  });

  context.subscriptions.push(client.start());
}

export function deactivate() {}
