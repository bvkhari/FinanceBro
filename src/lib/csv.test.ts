import { expect, it } from "vitest";
import { toCsv } from "./csv";

it("quotes cells so commas, quotes and line breaks survive", () => {
  expect(toCsv([["Payee", "Amount"], ['Kopi "Bumi", Sdn Bhd', 1680], ["a\nb", undefined]])).toBe(
    '"Payee","Amount"\r\n"Kopi ""Bumi"", Sdn Bhd","1680"\r\n"a\nb",""'
  );
});
