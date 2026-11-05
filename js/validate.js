// Minimal JSON Schema validator (subset). No DOM, no dependencies.
// Supports: type (string or array), enum, required, properties, items,
// minimum, maximum, pattern, minLength, anyOf, $ref to "#/$defs/<name>".
// Extra properties are allowed (data files carry notes/review fields freely).

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // string, number, boolean, object
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function resolveRef(ref, root) {
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!m || !root.$defs || !root.$defs[m[1]]) throw new Error(`Unresolvable $ref: ${ref}`);
  return root.$defs[m[1]];
}

function check(value, schema, path, root, errors) {
  if (schema.$ref) schema = resolveRef(schema.$ref, root);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push(`${path}: expected ${types.join(' | ')}, got ${typeOf(value)}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  }

  if (schema.anyOf) {
    const ok = schema.anyOf.some((sub) => {
      const subErrors = [];
      check(value, sub, path, root, subErrors);
      return subErrors.length === 0;
    });
    if (!ok) errors.push(`${path}: ${schema.anyOfMessage || 'does not match any allowed shape'}`);
  }

  const t = typeOf(value);

  if (t === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) {
      errors.push(`${path}: must not be empty`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: "${value}" does not match ${schema.pattern}`);
    }
  }

  if (t === 'integer' || t === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`);
  }

  if (t === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${path}: missing required "${key}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in value) check(value[key], sub, `${path}.${key}`, root, errors);
    }
  }

  if (t === 'array' && schema.items) {
    value.forEach((item, i) => check(item, schema.items, `${path}[${i}]`, root, errors));
  }
}

/** Returns a list of human-readable error strings; empty means valid. */
export function validate(value, schema) {
  const errors = [];
  check(value, schema, '$', schema, errors);
  return errors;
}
