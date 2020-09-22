import { Connection } from "vscode-languageserver";

export function Logger(connection: Connection) {
  return {
    add(message: any) {
      connection.sendNotification(
        "custom/message",
        typeof message === "string"
          ? message
          : JSON.stringify(message, undefined, 2)
      );
    },
  };
}
