import { TextDocument } from "vscode-html-languageservice";
import { URI } from "vscode-uri";
import { TextDocumentPositionParams } from "vscode-languageclient";
import { GetDocumentRegions } from "./document-regions";
import { Logger } from "./utils/logger";
import { Connection } from "vscode-languageserver";
import { BuildServer as HtmlServer } from "./html-server";
import { BuildServer as CssServer } from "./css-server";
import { BuildServer as TypescriptServer } from "./typescript-server";

type PromiseType<T> = T extends Promise<infer U> ? U : unknown;

export function UriToPath(stringUri: string) {
  const uri = URI.parse(stringUri);
  if (uri.scheme !== "file") {
    throw new Error("This service must run on the host machine.");
  }

  return uri.fsPath;
}

export async function BuildService(dir: string, logger: Logger) {
  const html_server = await HtmlServer(dir, logger);
  const css_server = await CssServer(html_server.service);
  // const typescript_server = TypescriptServer();

  const servers = {
    html: html_server,
    scss: css_server,
    // javascript: typescript_server,
  };

  const GetRegions = (document: TextDocument) =>
    GetDocumentRegions(html_server.service, document);

  return {
    async do_complete(document: TextDocument, p: TextDocumentPositionParams) {
      const current = GetRegions(document).getLanguageAtPosition(p.position);
      return servers[current as "html" | "scss"].do_complete(document, p) as any;
    },
    async do_hover(document: TextDocument, p: TextDocumentPositionParams) {
      const current = GetRegions(document).getLanguageAtPosition(p.position);
      return servers[current as "html" | "scss"].do_hover(document, p) as any;
    },
    async validate(document: TextDocument, connection: Connection) {
      servers.scss.validate(document, connection);
    },
  };
}

export type LanguageService = PromiseType<ReturnType<typeof BuildService>>;
