import Exa from "exa-js";

let exa: Exa | undefined;

export function getExa(apiKey: string | undefined) {
  if (!apiKey) {
    throw new Error("Missing Exa API key");
  }

  if (!exa) {
    exa = new Exa(apiKey);
  }

  return exa;
}
