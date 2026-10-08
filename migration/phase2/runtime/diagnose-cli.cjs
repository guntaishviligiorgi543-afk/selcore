"use strict";
// Executes the official pinned parser in memory. No CLI upload or credential access.
const { stripTypeScriptTypes } = require("node:module");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const sourceUrl =
  "https://raw.githubusercontent.com/supabase/cli/v2.120.0/apps/cli/src/command-internal/storage-url.ts";
(async () => {
  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200);
  const source = (await response.text()).replace(/^import[\s\S]*?;\s*/, "");
  const code = stripTypeScriptTypes(source).replace(/\bexport\s+/g, "");
  const context = {
    TextDecoder,
    ErrorActionabilityId: Symbol(),
    ErrorActionabilityFingerprintId: Symbol(),
    actionability: {},
  };
  const result = JSON.parse(
    vm.runInNewContext(
      code +
        `\nJSON.stringify({
    absolute:goUrlParse('C:\\\\Users\\\\My Computer\\\\OneDrive\\\\Desktop\\\\selcore\\\\images\\\\iphone15pro.png'),
    relative:goUrlParse('./images/iphone15pro.png'),
    storage:goUrlParse('ss:///product-images/products/1/example.png')
  });`,
      context,
      { timeout: 1000 },
    ),
  );
  assert.equal(result.absolute.scheme, "c");
  assert.equal(result.relative.scheme, "");
  assert.equal(result.storage.scheme, "ss");
  console.log(
    JSON.stringify(
      {
        cli: "2.120.0",
        absolute_source_scheme: result.absolute.scheme,
        relative_source_scheme: result.relative.scheme,
        destination_scheme: result.storage.scheme,
        diagnosis:
          "Windows absolute source is classified as URL scheme c; upload requires an empty source scheme",
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
