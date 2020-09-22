import * as path from "path";
import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  TextDocuments,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BuildService, LanguageService } from "./app-provider";
import { Logger } from "./utils/logger";

(async () => {
  const services: NodeJS.Dict<LanguageService> = {};
  const connection = createConnection(ProposedFeatures.all);
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument
  );
  const logger = Logger(connection);

  connection.onInitialize(async (params: InitializeParams) => {
    let capabilities = params.capabilities;

    const hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    const hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    for (const dir of params.workspaceFolders ?? []) {
      services[dir.uri] = await BuildService(dir.uri, logger);
    }

    connection.onInitialized(() => {
      if (hasConfigurationCapability) {
        connection.client.register(
          DidChangeConfigurationNotification.type,
          undefined
        );
      }
      if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(async (_event) => {
          for (const dir of _event.added) {
            services[dir.uri] = await BuildService(dir.uri, logger);
          }

          for (const dir of _event.removed) {
            services[dir.uri] = undefined;
          }
        });
      }
    });

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
          triggerCharacters: ["<", "=", "'", '"', ".", "[a-zA-Z0-9]"],
        },
        workspace: {
          workspaceFolders: {
            supported: true,
          },
        },
        hoverProvider: true,
      },
    };
  });

  function GetService(uri: string) {
    for (const key in services) {
      const relative = path.relative(key, uri);
      if (
        relative &&
        !relative.startsWith("..") &&
        !path.isAbsolute(relative)
      ) {
        return services[key];
      }
    }

    return undefined;
  }

  function GetServicePath(uri: string) {
    for (const key in services) {
      const relative = path.relative(key, uri);
      if (
        relative &&
        !relative.startsWith("..") &&
        !path.isAbsolute(relative)
      ) {
        return key;
      }
    }

    return undefined;
  }

  connection.onDidChangeWatchedFiles(async (change) => {
    const works = change.changes.reduce((c, n) => {
      const service = GetServicePath(n.uri);
      if (!service) {
        return c;
      }

      return { ...c, [service]: true };
    }, {} as NodeJS.Dict<boolean>);

    for (const s in works) {
      services[s] = await BuildService(s, logger);
    }
  });

  const processor = <T extends TextDocumentPositionParams, TResult>(
    handler: (p: T, document: TextDocument, service: LanguageService) => TResult
  ) => {
    return (p: T) => {
      if (!p.textDocument.uri.endsWith(".tpe")) {
        return [];
      }

      const service = GetService(p.textDocument.uri);
      if (!service) {
        return [];
      }

      const document = documents.get(p.textDocument.uri);
      if (!document) {
        return [];
      }

      return handler(p, document, service);
    };
  };

  connection.onCompletion(
    processor((p, document, service) => service.do_complete(document, p))
  );

  connection.onHover(
    processor((p, document, service) => service.do_hover(document, p) as any)
  );

  documents.onDidChangeContent((change) => {
    GetService(change.document.uri)?.validate(change.document, connection);
  });

  connection.onCompletionResolve((item) => item);
  documents.listen(connection);
  connection.listen();
})();
