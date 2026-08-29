import { toolDefinitions } from '../build-test/webmcp/definitions.js';

const failures = [];
const expected = [
  'get_ops_snapshot', 'inspect_entity', 'trace_impact', 'list_constraints', 'find_substitutes',
  'read_external_alerts', 'create_branch', 'simulate_branch', 'compare_branches', 'explain_tradeoff',
  'stage_plan', 'apply_plan', 'verify_plan', 'rollback_plan',
];

const names = Object.keys(toolDefinitions);
if (JSON.stringify(names.sort()) !== JSON.stringify([...expected].sort())) {
  failures.push(`Expected exactly 14 canonical tools; found ${names.join(', ')}`);
}

function inspectSchema(schema, path) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object' && schema.additionalProperties !== false) {
    failures.push(`${path}: object schema must set additionalProperties:false`);
  }
  if (schema.description && schema.description.length > 120) {
    failures.push(`${path}: parameter description exceeds 120 characters`);
  }
  if (schema.properties) {
    for (const [name, child] of Object.entries(schema.properties)) inspectSchema(child, `${path}.${name}`);
  }
  if (schema.items) inspectSchema(schema.items, `${path}[]`);
}

for (const [name, definition] of Object.entries(toolDefinitions)) {
  if (name.length > 30) failures.push(`${name}: tool name exceeds 30 characters`);
  if (!definition.title || definition.title.length > 60) failures.push(`${name}: title missing or exceeds 60 characters`);
  if (!definition.description || definition.description.length > 220) failures.push(`${name}: description missing or exceeds 220 characters`);
  if (typeof definition.execute !== 'function') failures.push(`${name}: execute handler missing`);
  if (!definition.annotations || typeof definition.annotations.readOnlyHint !== 'boolean') failures.push(`${name}: readOnlyHint missing`);
  if (!definition.annotations || typeof definition.annotations.untrustedContentHint !== 'boolean') failures.push(`${name}: untrustedContentHint missing`);
  const serialized = JSON.stringify(definition.inputSchema);
  if (serialized.length > 3000) failures.push(`${name}: schema exceeds 3000 serialized characters`);
  inspectSchema(definition.inputSchema, `${name}.input`);
}

if (toolDefinitions.read_external_alerts?.annotations?.untrustedContentHint !== true) {
  failures.push('read_external_alerts must set untrustedContentHint:true');
}
if (toolDefinitions.apply_plan?.annotations?.readOnlyHint !== false) {
  failures.push('apply_plan must be state-changing');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const totalSchemaBytes = Object.values(toolDefinitions).reduce((sum, tool) => sum + JSON.stringify(tool.inputSchema).length, 0);
console.log(`Tool budget checks passed: ${names.length} tools, ${totalSchemaBytes} total schema bytes, longest name ${Math.max(...names.map((name) => name.length))} chars.`);
