import { Static, Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { type Exa, type BaseSearchOptions, type DeepSearchType } from "exa-js";

export const DeepSearchParams = Type.Object({
  query: Type.String({
    description:
      "Natural-language research question, avoid keyword-only queries.",
  }),
  numResults: Type.Optional(
    Type.Number({
      description:
        "Number of results to return. Use fewer for focused synthesis and more when broad source coverage matters.",
      default: 10,
      minimum: 1,
      maximum: 100,
    }),
  ),
  type: Type.Optional(
    StringEnum(["deep-lite", "deep", "deep-reasoning"] as const, {
      description:
        "Use deep-lite for faster lightweight synthesis, deep for normal complex research, deep-reasoning for harder high-effort research.",
    }),
  ),
  category: Type.Optional(
    StringEnum(
      [
        "company",
        "research paper",
        "news",
        "pdf",
        "personal site",
        "financial report",
        "people",
      ] as const,
      {
        description:
          "Use category filter only when the desired retrieval surface is clear.",
      },
    ),
  ),
  additionalQueries: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Alternative natural-language queries for deep search. Use when the topic has multiple names, terminology, or angles.",
      maxItems: 5,
    }),
  ),
});
export type DeepSearchParams = Static<typeof DeepSearchParams>;

type StrictEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;

// trigger compile time errors if there is drift between TypeBox and Exa type definitions
const _assertType: StrictEqual<
  Exclude<DeepSearchParams["type"], undefined>,
  DeepSearchType
> = true;
const _assertCategory: StrictEqual<
  Exclude<DeepSearchParams["category"], undefined>,
  Exclude<BaseSearchOptions["category"], undefined>
> = true;

export async function deepSearch(exa: Exa, params: DeepSearchParams) {
  const {
    query,
    type = "deep",
    numResults = 10,
    category,
    additionalQueries,
  } = params;

  const res = await exa.search(query, {
    outputSchema: {
      type: "text",
    },
    contents: {
      highlights: true,
    },
    type,
    numResults,
    category,
    additionalQueries,
  });

  return res;
}
