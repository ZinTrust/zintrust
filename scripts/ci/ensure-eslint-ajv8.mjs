import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const eslintAjvPath = (() => {
  try {
    // `eslint/lib/...` may not be resolvable due to package export resolution.
    // `eslint/package.json` is reliably resolvable and lets us compute the internal path.
    const eslintPkgJsonPath = require.resolve('eslint/package.json');
    const eslintRoot = path.dirname(eslintPkgJsonPath);
    return path.join(eslintRoot, 'lib/shared/ajv.js');
  } catch {
    return null;
  }
})();

if (eslintAjvPath === null) {
  process.exit(0);
}

const current = fs.readFileSync(eslintAjvPath, 'utf8');

// Idempotency: if we already applied the current patch variant, do nothing.
if (current.includes('[ensure-eslint-ajv8:v2]')) {
  process.exit(0);
}

const patched = `/**
 * @fileoverview The instance of Ajv validator.
 * @author Evgeny Poberezkin
 */
"use strict";

// [ensure-eslint-ajv8:v2]

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const Ajv = require("ajv");

// ESLint 10.0.0 ships with an Ajv v6-style draft-04 meta-schema import:
//   require("ajv/lib/refs/json-schema-draft-04.json")
// That path does not exist in Ajv v8. We load the draft-04 meta-schema via
// ajv-draft-04, with a fallback for environments that still use Ajv v6.
const metaSchema = (() => {
	try {
		return require("ajv-draft-04/dist/refs/json-schema-draft-04.json");
	} catch {
		return require("ajv/lib/refs/json-schema-draft-04.json");
	}
})();

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

module.exports = (additionalOptions = {}) => {
	const extraOptions = { ...additionalOptions };
	const strictDefaults = extraOptions.strictDefaults;
	delete extraOptions.strictDefaults;

	const strict = Object.prototype.hasOwnProperty.call(extraOptions, "strict")
		? extraOptions.strict
		: strictDefaults === true
			? true
			: false;

	const ajv = new Ajv({
		meta: false,
		useDefaults: true,
		validateSchema: false,
		verbose: true,
		// Ajv v8 is strict by default; ESLint's schema validation expects leniency
		// except for specific callers (e.g. RuleTester) that request strict defaults.
		strict,
		...extraOptions,
	});

	ajv.addMetaSchema(metaSchema);

	const metaId = metaSchema.$id || metaSchema.id;
	if (typeof metaId === "string" && metaId.length > 0) {
		if (ajv.opts) {
			ajv.opts.defaultMeta = metaId;
		}
		// eslint-disable-next-line no-underscore-dangle -- Ajv's legacy internal API
		if (ajv._opts) {
			ajv._opts.defaultMeta = metaId;
		}
	}

	return ajv;
};
`;

fs.writeFileSync(eslintAjvPath, patched, 'utf8');
console.log(`[ensure-eslint-ajv8] patched ESLint Ajv loader: ${eslintAjvPath}`);
