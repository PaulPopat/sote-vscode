import * as path from "path";
import {
  getLanguageService,
  ITagData,
  TextDocument,
} from "vscode-html-languageservice";
import { getCSSLanguageService } from "vscode-css-languageservice";
import {
  GetOptions,
  GetAllTpe,
  Options,
} from "@paulpopat/sote/lib/file-system";
import { CompileApp } from "@paulpopat/sote/lib/compiler/page-builder";
import { IsString } from "@paulpopat/safe-type";
import { URI } from "vscode-uri";
import {
  CompletionItem,
  Hover,
  TextDocumentPositionParams,
} from "vscode-languageclient";
import { GetDocumentRegions } from "./document-regions";
import { Logger } from "./utils/logger";
import { Connection, Diagnostic } from "vscode-languageserver";

export function UriToPath(stringUri: string) {
  const uri = URI.parse(stringUri);
  if (uri.scheme !== "file") {
    throw new Error("This service must run on the host machine.");
  }

  return uri.fsPath;
}

async function GetComponents(options: Options) {
  if (!options.components) {
    return [];
  }

  return (
    await Promise.all(
      options.components?.map(async (components_dir) =>
        IsString(components_dir)
          ? await GetAllTpe(components_dir)
          : (await GetAllTpe(components_dir.path)).map((c) => ({
              ...c,
              path: "/" + components_dir.prefix + c.path,
            }))
      )
    )
  ).flatMap((f) => f);
}

export type LanguageService = {
  do_complete(
    document: TextDocument,
    p: TextDocumentPositionParams
  ): CompletionItem[];
  do_hover(document: TextDocument, p: TextDocumentPositionParams): Hover;
  validate(document: TextDocument, connection: Connection): Promise<void>;
};

export async function BuildService(
  dir: string,
  logger: Logger
): Promise<LanguageService> {
  const cwd = UriToPath(dir);
  const options = await GetOptions(path.join(cwd, "tpe-config.json"));
  const components = await GetComponents(options);
  const pages = await GetAllTpe(
    options.pages ?? path.join(cwd, "src", "pages")
  );
  const app = await CompileApp(pages, components, false);
  const html_service = getLanguageService({
    customDataProviders: [
      {
        getId() {
          return "tpe";
        },
        isApplicable(languageId) {
          return languageId === "tpe";
        },
        provideTags() {
          if (!app) {
            return [];
          }

          return Object.keys(app.components)
            .map(
              (c) =>
                ({
                  name: c,
                  description: "A custom SOTE component",
                  attributes: [],
                } as ITagData)
            )
            .concat(
              {
                name: "children",
                description:
                  "Child HTML will be rendered here. More than one is allowed in one component.",
                attributes: [],
              },
              {
                name: "if",
                description:
                  "Will only render the children if the check is truthy",
                attributes: [
                  {
                    name: "check",
                    description: "Should be a expression attribute",
                  },
                ],
              },
              {
                name: "for",
                description:
                  "Renders the children once for every item in the subject.",
                attributes: [
                  {
                    name: "subject",
                    description:
                      "Should be a expression attribute that resolves to an array.",
                  },
                  {
                    name: "key",
                    description:
                      "The item for each iteration can be accessed under this name.",
                  },
                ],
              }
            );
        },
        provideAttributes(tag) {
          if (tag === "script") {
            return [
              {
                name: "src",
                description:
                  "This should be a local machine path. It will get included in the bundle.",
              },
              {
                name: "area",
                description:
                  "Is this script run when the request is made or on the client machine?",
                values: [{ name: "client" }, { name: "server" }],
              },
              {
                name: "method",
                description:
                  "SERVER PAGES ONLY! What method does this script handle",
                values: [
                  { name: "get" },
                  { name: "put" },
                  { name: "patch" },
                  { name: "post" },
                  { name: "delete" },
                ],
              },
            ];
          }

          if (tag === "style") {
            return [
              {
                name: "src",
                description:
                  "This should be a local machine path. It will get included in the bundle.",
              },
              {
                name: "no-hash",
                description:
                  "USE SPARINGLY! Will not hash the CSS. Useful for styling external libraries.",
              },
            ];
          }

          if (tag === "if") {
            return [
              {
                name: "check",
                description: "Should be a expression attribute",
              },
            ];
          }

          if (tag === "for") {
            return [
              {
                name: "subject",
                description:
                  "Should be a expression attribute that resolves to an array.",
              },
              {
                name: "key",
                description:
                  "The item for each iteration can be accessed under this name.",
              },
            ];
          }

          return [];
        },
        provideValues(tag, attribute) {
          if (tag === "script" && attribute === "area") {
            return [{ name: "client" }, { name: "server" }];
          }

          if (tag === "script" && attribute === "method") {
            return [
              { name: "get" },
              { name: "put" },
              { name: "patch" },
              { name: "post" },
              { name: "delete" },
            ];
          }

          return [];
        },
      },
    ],
  });

  const css_service = getCSSLanguageService();
  const GetRegions = (document: TextDocument) =>
    GetDocumentRegions(html_service, document);

  return {
    do_complete(document, p) {
      const current = GetRegions(document).getLanguageAtPosition(p.position);
      return (() =>
        current === "css"
          ? css_service.doComplete(
              document,
              p.position,
              css_service.parseStylesheet(document)
            )
          : html_service.doComplete(
              document,
              p.position,
              html_service.parseHTMLDocument(document)
            ))().items.map((d) => ({
        label: d.label,
        documentation: d.documentation,
        kind: d.kind,
        data: d.data,
      }));
    },
    do_hover(document, p) {
      const current = GetRegions(document).getLanguageAtPosition(p.position);
      const result =
        current === "css"
          ? css_service.doHover(
              document,
              p.position,
              css_service.parseStylesheet(document)
            )
          : html_service.doHover(
              document,
              p.position,
              html_service.parseHTMLDocument(document)
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
    async validate(document, connection) {
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
