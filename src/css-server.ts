import { LanguageService, TextDocument } from "vscode-html-languageservice";
import { getCSSLanguageService } from "vscode-css-languageservice";
import { TextDocumentPositionParams } from "vscode-languageclient";
import { GetDocumentRegions } from "./document-regions";
import { Connection } from "vscode-languageserver";

export async function BuildServer(html_service: LanguageService) {
  const css_service = getCSSLanguageService();

  const GetRegions = (document: TextDocument) =>
    GetDocumentRegions(html_service, document);

  return {
    async do_complete(document: TextDocument, p: TextDocumentPositionParams) {
      return css_service
        .doComplete(document, p.position, css_service.parseStylesheet(document))
        .items.map((d) => ({
          label: d.label,
          documentation: d.documentation,
          kind: d.kind,
          data: d.data,
        }));
    },
    async do_hover(document: TextDocument, p: TextDocumentPositionParams) {
      const result = css_service.doHover(
        document,
        p.position,
        css_service.parseStylesheet(document)
      );

      if (!result) {
        return undefined;
      }

      return {
        range: result?.range,
        contents: {
          value: (result.contents as any).value,
          kind: "markdown",
        },
      } as any;
    },
    async validate(document: TextDocument, connection: Connection) {
      const css_document = GetRegions(document).getEmbeddedDocument("css");
      try {
        connection.sendDiagnostics({
          uri: document.uri,
          diagnostics: [
            ...(css_service.doValidation(
              css_document,
              css_service.parseStylesheet(css_document)
            ) as any),
          ],
        });
      } catch (e) {
        connection.console.error(`Error while validating ${document.uri}`);
        connection.console.error(e);
      }
    },
  };
}
