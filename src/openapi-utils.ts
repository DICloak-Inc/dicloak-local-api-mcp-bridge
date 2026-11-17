/**
 * Utility functions to convert OpenAPI v3 schemas into JSON Schema-like
 * input schemas suitable for MCP tool registration.
 *
 * - Supports internal $ref dereferencing ( "#/components/..." ).
 * - Expands allOf by merging properties and required arrays.
 * - Preserves enum/format/minimum/maximum/pattern/items/default/example.
 * - Provides helpers to extract requestBody/query/path parameters and to
 *   build a single flattened input schema for an operation.
 *
 * NOTE:
 * - This implementation intentionally avoids third-party dereference libs
 *   and only supports internal refs. If your spec uses external refs
 *   (file:/// or http(s) references) switch to @apidevtools/swagger-parser
 *   and call SwaggerParser.dereference(...) before using these utils.
 *
 * Usage example:
 *   import { buildInputSchema } from './openapi-utils';
 *   const inputSchema = buildInputSchema(apiSpec, operationObject, '/v1/env');
 */

import { OpenAPIV3 } from 'openapi-types';

type Spec = OpenAPIV3.Document;

/**
 * Resolve an internal $ref like "#/components/schemas/EnvAccount"
 * Returns the resolved object (still in OpenAPI Schema form).
 * If resolution fails, returns a generic { type: 'object' }.
 */
export function resolveInternalRef(spec: Spec, ref: string): any {
  if (!spec) return { type: 'object' };
  if (!ref || !ref.startsWith('#/')) return { type: 'object' };

  const parts = ref.slice(2).split('/'); // remove "#/" then split
  let current: any = spec;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return { type: 'object' };
    }
    current = current[part];
  }
  return current || { type: 'object' };
}

/**
 * Convert an OpenAPI SchemaObject or ReferenceObject into a JSON-Schema-like
 * object suitable to be used as an input schema for tools (properties + required).
 * This function will dereference internal $ref via resolveInternalRef.
 */
export function convertOpenApiSchemaToJsonSchema(
  spec: Spec,
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined
): any {
  if (!schema) return { type: 'object' };

  if ('$ref' in schema && typeof schema.$ref === 'string') {
    const target = resolveInternalRef(spec, schema.$ref);
    // target is an OpenAPI SchemaObject
    return convertOpenApiSchemaToJsonSchema(
      spec,
      target as OpenAPIV3.SchemaObject
    );
  }

  const schemaObj = schema as OpenAPIV3.SchemaObject;

  // Handle allOf by merging child schemas
  if (Array.isArray(schemaObj.allOf) && schemaObj.allOf.length > 0) {
    const merged: any = { type: schemaObj.type || 'object' };
    if (schemaObj.description) merged.description = schemaObj.description;

    for (const sub of schemaObj.allOf) {
      const resolved = convertOpenApiSchemaToJsonSchema(
        spec,
        sub as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
      );
      // merge properties
      if (resolved.properties) {
        merged.properties = merged.properties || {};
        Object.assign(merged.properties, resolved.properties);
      }
      // merge required
      if (Array.isArray(resolved.required)) {
        merged.required = merged.required || [];
        for (const r of resolved.required) {
          if (!merged.required.includes(r)) merged.required.push(r);
        }
      }
      // prefer first found for these simple fields
      for (const k of [
        'enum',
        'format',
        'minimum',
        'maximum',
        'pattern',
        'items',
        'default',
        'example',
      ]) {
        if (resolved[k] !== undefined && merged[k] === undefined)
          merged[k] = resolved[k];
      }
    }

    merged.required = merged.required || [];
    return merged;
  }

  const jsonSchema: any = {
    type: schemaObj.type || 'object',
  };

  if (schemaObj.description) jsonSchema.description = schemaObj.description;

  // properties
  if (schemaObj.properties && typeof schemaObj.properties === 'object') {
    jsonSchema.properties = {};
    for (const [key, prop] of Object.entries(schemaObj.properties)) {
      jsonSchema.properties[key] = convertOpenApiSchemaToJsonSchema(
        spec,
        prop as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
      );
    }
  }

  // required (only meaningful for object)
  if (jsonSchema.type === 'object') {
    jsonSchema.required = Array.isArray(schemaObj.required)
      ? schemaObj.required.slice()
      : [];
  }

  // array items
  if (
    jsonSchema.type === 'array' &&
    (schemaObj as OpenAPIV3.ArraySchemaObject).items
  ) {
    jsonSchema.items = convertOpenApiSchemaToJsonSchema(
      spec,
      (schemaObj as OpenAPIV3.ArraySchemaObject).items as
        | OpenAPIV3.SchemaObject
        | OpenAPIV3.ReferenceObject
    );
  }

  // passthrough common constraints
  if (schemaObj.enum) jsonSchema.enum = schemaObj.enum;
  if (schemaObj.format) jsonSchema.format = schemaObj.format;
  if (schemaObj.minimum !== undefined) jsonSchema.minimum = schemaObj.minimum;
  if (schemaObj.maximum !== undefined) jsonSchema.maximum = schemaObj.maximum;
  if (schemaObj.pattern) jsonSchema.pattern = schemaObj.pattern;
  if (schemaObj.default !== undefined) jsonSchema.default = schemaObj.default;
  if (schemaObj.example !== undefined) jsonSchema.example = schemaObj.example;
  if ((schemaObj as any).additionalProperties !== undefined)
    jsonSchema.additionalProperties = (schemaObj as any).additionalProperties;

  return jsonSchema;
}

/**
 * Extract requestBody schema (application/json) and return converted JSON Schema.
 * Returns null if not present or cannot be parsed.
 */
export function extractRequestBodySchema(
  spec: Spec,
  operation: OpenAPIV3.OperationObject
): any | null {
  if (!operation.requestBody || '$ref' in operation.requestBody) return null;
  const rb = operation.requestBody as OpenAPIV3.RequestBodyObject;
  if (!rb.content) return null;
  const jsonContent = rb.content['application/json'] || rb.content['*/*'];
  if (!jsonContent || !jsonContent.schema) return null;
  return convertOpenApiSchemaToJsonSchema(
    spec,
    jsonContent.schema as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
  );
}

/**
 * Extract path parameters (object with properties + required[])
 */
export function extractPathParameters(
  spec: Spec,
  operation: OpenAPIV3.OperationObject,
  pathTemplate?: string
): { properties: any; required: string[] } {
  const properties: any = {};
  const required: string[] = [];

  // name list from path template like /v1/env/{id}
  const pathParamNames = pathTemplate
    ? pathTemplate.match(/\{([^}]+)\}/g)?.map((p) => p.slice(1, -1)) || []
    : [];

  if (Array.isArray(operation.parameters)) {
    for (const param of operation.parameters) {
      if ('$ref' in param && typeof (param as any).$ref === 'string') {
        // try resolving parameter ref to a ParameterObject
        const paramObj = resolveInternalRef(
          spec,
          (param as any).$ref
        ) as OpenAPIV3.ParameterObject;
        if (!paramObj) continue;
        // fallthrough to processing paramObj
        if (paramObj.in === 'path') {
          properties[paramObj.name] = paramObj.schema
            ? convertOpenApiSchemaToJsonSchema(spec, paramObj.schema as any)
            : { type: 'string' };
          if (paramObj.required) required.push(paramObj.name);
        }
        continue;
      }
      const p = param as OpenAPIV3.ParameterObject;
      if (p.in === 'path') {
        properties[p.name] = p.schema
          ? convertOpenApiSchemaToJsonSchema(spec, p.schema as any)
          : { type: 'string' };
        if (p.required) required.push(p.name);
      }
    }
  }

  // ensure path params from template are present
  for (const name of pathParamNames) {
    if (!properties[name]) {
      properties[name] = {
        type: 'string',
        description: `Path parameter: ${name}`,
      };
      if (!required.includes(name)) required.push(name);
    }
  }

  return { properties, required };
}

/**
 * Extract query parameters (object with properties + required[])
 */
export function extractQueryParameters(
  spec: Spec,
  operation: OpenAPIV3.OperationObject
): { properties: any; required: string[] } {
  const properties: any = {};
  const required: string[] = [];

  if (!Array.isArray(operation.parameters)) return { properties, required };

  for (const param of operation.parameters) {
    if ('$ref' in param && typeof (param as any).$ref === 'string') {
      const paramObj = resolveInternalRef(
        spec,
        (param as any).$ref
      ) as OpenAPIV3.ParameterObject;
      if (!paramObj) continue;
      if (paramObj.in === 'query') {
        properties[paramObj.name] = paramObj.schema
          ? convertOpenApiSchemaToJsonSchema(spec, paramObj.schema as any)
          : { type: 'string' };
        if (paramObj.required) required.push(paramObj.name);
      }
      continue;
    }
    const p = param as OpenAPIV3.ParameterObject;
    if (p.in === 'query') {
      properties[p.name] = p.schema
        ? convertOpenApiSchemaToJsonSchema(spec, p.schema as any)
        : { type: 'string' };
      if (p.required) required.push(p.name);
    }
  }

  return { properties, required };
}

/**
 * Build a flattened input schema for an operation:
 * - merges path params, query params, and request body properties into one object,
 * - collects a deduped required[] list.
 *
 * Example result:
 * {
 *   type: 'object',
 *   properties: { name: {type:'string'}, browser: {type:'string', enum:['CHROME']} },
 *   required: ['name','browser']
 * }
 */
export function buildInputSchema(
  spec: Spec,
  operation: OpenAPIV3.OperationObject,
  pathTemplate?: string
): any {
  const properties: any = {};
  const required: string[] = [];

  const pathParams = extractPathParameters(spec, operation, pathTemplate);
  const queryParams = extractQueryParameters(spec, operation);
  const bodySchema = extractRequestBodySchema(spec, operation);

  // merge path params
  if (pathParams.properties) {
    for (const [k, v] of Object.entries(pathParams.properties)) {
      properties[k] = v;
    }
    required.push(...pathParams.required);
  }

  // merge query params
  if (queryParams.properties) {
    for (const [k, v] of Object.entries(queryParams.properties)) {
      properties[k] = v;
    }
    required.push(...queryParams.required);
  }

  // merge body properties
  if (bodySchema && bodySchema.properties) {
    for (const [k, v] of Object.entries(bodySchema.properties)) {
      properties[k] = v;
    }
    if (Array.isArray(bodySchema.required))
      required.push(...bodySchema.required);
  }

  const schema: any = { type: 'object', properties };

  const dedupedRequired = Array.from(new Set(required));
  if (dedupedRequired.length > 0) schema.required = dedupedRequired;

  return schema;
}
