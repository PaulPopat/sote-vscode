import {
  getLanguageService,
  ITagData,
  TextDocument,
} from "vscode-html-languageservice";
import { TextDocumentPositionParams } from "vscode-languageclient";
import { Logger } from "./utils/logger";
import { Connection } from "vscode-languageserver";
import { RunSote } from "./utils/spawn";

export async function BuildServer(dir: string, logger: Logger) {
  const app = await RunSote(dir, logger);
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
              {
                name: "babel",
                description:
                  "Indicates that this script should be compiled with babel.",
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

  return {
    async do_complete(document: TextDocument, p: TextDocumentPositionParams) {
      return html_service
        .doComplete(
          document,
          p.position,
          html_service.parseHTMLDocument(document)
        )
        .items.map((d) => ({
          label: d.label,
          documentation: d.documentation,
          kind: d.kind,
          data: d.data,
        }));
    },
    async do_hover(document: TextDocument, p: TextDocumentPositionParams) {
      const result = html_service.doHover(
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
    async validate(document: TextDocument, connection: Connection) {},
    service: html_service,
  };
}
