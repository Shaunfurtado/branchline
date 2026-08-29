import { DomainError } from '../domain/errors.js';
import type { BranchStrategy } from '../domain/types.js';
import type { ToolName } from '../app/selectors.js';

const empty = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export const toolSchemas: Record<ToolName, Record<string, unknown>> = {
  get_ops_snapshot: empty,
  inspect_entity: {
    type: 'object',
    properties: {
      entity_id: { type: 'string', minLength: 1, maxLength: 80, description: 'ID of the entity to inspect.' },
      include_links: { type: 'boolean', default: true, description: 'Include capped upstream and downstream links.' },
    },
    required: ['entity_id'],
    additionalProperties: false,
  },
  trace_impact: {
    type: 'object',
    properties: {
      source_id: { type: 'string', minLength: 1, maxLength: 80, description: 'Entity or disruption ID where tracing begins.' },
      direction: { type: 'string', enum: ['downstream', 'upstream', 'both'], default: 'downstream', description: 'Direction through the causal graph.' },
      max_depth: { type: 'integer', minimum: 1, maximum: 6, default: 5, description: 'Maximum causal hops to traverse.' },
    },
    required: ['source_id'],
    additionalProperties: false,
  },
  list_constraints: empty,
  find_substitutes: {
    type: 'object',
    properties: {
      component_id: { type: 'string', minLength: 1, maxLength: 80, description: 'Component ID requiring an alternative source.' },
      product_id: { type: 'string', minLength: 1, maxLength: 80, description: 'Optional product whose compatibility must be checked.' },
      needed_by_day: { type: 'integer', minimum: 0, maximum: 45, description: 'Latest acceptable arrival day.' },
      quantity: { type: 'integer', minimum: 1, maximum: 100000, description: 'Required component quantity.' },
    },
    required: ['component_id'],
    additionalProperties: false,
  },
  read_external_alerts: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Maximum unverified alerts to return.' },
    },
    additionalProperties: false,
  },
  create_branch: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 48, description: 'Human-readable name for the recovery future.' },
      strategy: { type: 'string', enum: ['service_first', 'cost_guard', 'balanced', 'resilience'], description: 'Deterministic branch planning strategy.' },
      constraints: {
        type: 'object',
        properties: {
          max_extra_cost: { type: 'number', minimum: 0, maximum: 2000000, description: 'Stricter branch cost ceiling in dollars.' },
          protect_tiers: { type: 'array', items: { type: 'integer', enum: [1, 2, 3] }, uniqueItems: true, maxItems: 3, description: 'Additional customer tiers to protect.' },
          max_delayed_orders: { type: 'integer', minimum: 0, maximum: 24, description: 'Stricter delayed-order ceiling.' },
          no_air_freight: { type: 'boolean', description: 'Prohibit air freight in this branch.' },
          max_emissions_delta: { type: 'number', minimum: -100000, maximum: 1000000, description: 'Maximum simplified emissions delta in kilograms.' },
        },
        additionalProperties: false,
      },
    },
    required: ['name', 'strategy'],
    additionalProperties: false,
  },
  simulate_branch: {
    type: 'object',
    properties: {
      branch_id: { type: 'string', minLength: 1, maxLength: 80, description: 'Draft or stale recovery branch ID.' },
      horizon_days: { type: 'integer', minimum: 7, maximum: 45, default: 30, description: 'Simulation horizon in days.' },
    },
    required: ['branch_id'],
    additionalProperties: false,
  },
  compare_branches: {
    type: 'object',
    properties: {
      branch_ids: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 80 }, minItems: 2, maxItems: 4, uniqueItems: true, description: 'Two to four current branch IDs.' },
    },
    required: ['branch_ids'],
    additionalProperties: false,
  },
  explain_tradeoff: {
    type: 'object',
    properties: {
      branch_id: { type: 'string', minLength: 1, maxLength: 80, description: 'Current simulated branch to explain.' },
      versus_branch_id: { type: 'string', minLength: 1, maxLength: 80, description: 'Optional comparison branch.' },
      focus: { type: 'string', enum: ['all', 'service', 'cost', 'risk', 'emissions'], default: 'all', description: 'Metric lens for the explanation.' },
    },
    required: ['branch_id'],
    additionalProperties: false,
  },
  stage_plan: {
    type: 'object',
    properties: {
      branch_id: { type: 'string', minLength: 1, maxLength: 80, description: 'Valid current branch to stage.' },
      rationale: { type: 'string', minLength: 1, maxLength: 240, description: 'Concise reason for recommending this branch.' },
    },
    required: ['branch_id', 'rationale'],
    additionalProperties: false,
  },
  apply_plan: {
    type: 'object',
    properties: {
      plan_id: { type: 'string', minLength: 1, maxLength: 120, description: 'Currently human-approved staged plan ID.' },
      expected_context_version: { type: 'integer', minimum: 0, description: 'Optional optimistic concurrency version.' },
    },
    required: ['plan_id'],
    additionalProperties: false,
  },
  verify_plan: {
    type: 'object',
    properties: {
      plan_id: { type: 'string', minLength: 1, maxLength: 120, description: 'Executed plan ID to verify.' },
    },
    required: ['plan_id'],
    additionalProperties: false,
  },
  rollback_plan: {
    type: 'object',
    properties: {
      checkpoint_id: { type: 'string', minLength: 1, maxLength: 140, description: 'Execution checkpoint to restore.' },
      reason: { type: 'string', minLength: 1, maxLength: 240, description: 'Human-readable reason recorded in the audit trail.' },
    },
    required: ['checkpoint_id', 'reason'],
    additionalProperties: false,
  },
};

type JsonObject = Record<string, unknown>;

function objectInput(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('INVALID_INPUT', 'Tool input must be a JSON object.');
  return value as JsonObject;
}

function rejectExtras(input: JsonObject, allowed: string[]): void {
  const extra = Object.keys(input).filter((key) => !allowed.includes(key));
  if (extra.length) throw new DomainError('INVALID_INPUT', `Unexpected input properties: ${extra.join(', ')}.`);
}

function stringValue(input: JsonObject, key: string, required = false, maxLength = 240): string | undefined {
  const value = input[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    throw new DomainError('INVALID_INPUT', `${key} must be a non-empty string no longer than ${maxLength} characters.`);
  }
  return value;
}

function integerValue(input: JsonObject, key: string, min: number, max: number, fallback?: number): number | undefined {
  const value = input[key];
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new DomainError('INVALID_INPUT', `${key} must be an integer from ${min} to ${max}.`);
  }
  return value as number;
}

function numberValue(input: JsonObject, key: string, min: number, max: number): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new DomainError('INVALID_INPUT', `${key} must be a finite number from ${min} to ${max}.`);
  }
  return value;
}

function booleanValue(input: JsonObject, key: string, fallback?: boolean): boolean | undefined {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new DomainError('INVALID_INPUT', `${key} must be a boolean.`);
  return value;
}

export function validateToolInput(name: ToolName, value: unknown): JsonObject {
  const input = objectInput(value);
  switch (name) {
    case 'get_ops_snapshot':
    case 'list_constraints':
      rejectExtras(input, []);
      return input;
    case 'inspect_entity':
      rejectExtras(input, ['entity_id', 'include_links']);
      return { entity_id: stringValue(input, 'entity_id', true, 80), include_links: booleanValue(input, 'include_links', true) };
    case 'trace_impact': {
      rejectExtras(input, ['source_id', 'direction', 'max_depth']);
      const direction = input.direction ?? 'downstream';
      if (!['downstream', 'upstream', 'both'].includes(String(direction))) throw new DomainError('INVALID_INPUT', 'direction is invalid.');
      return { source_id: stringValue(input, 'source_id', true, 80), direction, max_depth: integerValue(input, 'max_depth', 1, 6, 5) };
    }
    case 'find_substitutes':
      rejectExtras(input, ['component_id', 'product_id', 'needed_by_day', 'quantity']);
      return {
        component_id: stringValue(input, 'component_id', true, 80),
        product_id: stringValue(input, 'product_id', false, 80),
        needed_by_day: integerValue(input, 'needed_by_day', 0, 45),
        quantity: integerValue(input, 'quantity', 1, 100000),
      };
    case 'read_external_alerts':
      rejectExtras(input, ['limit']);
      return { limit: integerValue(input, 'limit', 1, 10, 5) };
    case 'create_branch': {
      rejectExtras(input, ['name', 'strategy', 'constraints']);
      const strategy = stringValue(input, 'strategy', true, 40) as BranchStrategy;
      if (!['service_first', 'cost_guard', 'balanced', 'resilience'].includes(strategy)) throw new DomainError('INVALID_INPUT', 'strategy is invalid.');
      const nested = input.constraints === undefined ? {} : objectInput(input.constraints);
      rejectExtras(nested, ['max_extra_cost', 'protect_tiers', 'max_delayed_orders', 'no_air_freight', 'max_emissions_delta']);
      let protectTiers: number[] | undefined;
      if (nested.protect_tiers !== undefined) {
        if (!Array.isArray(nested.protect_tiers) || nested.protect_tiers.length > 3 || nested.protect_tiers.some((tier) => ![1, 2, 3].includes(Number(tier)))) {
          throw new DomainError('INVALID_INPUT', 'protect_tiers must contain unique values from 1, 2, and 3.');
        }
        protectTiers = [...new Set(nested.protect_tiers as number[])];
      }
      return {
        name: stringValue(input, 'name', true, 48),
        strategy,
        constraints: {
          max_extra_cost: numberValue(nested, 'max_extra_cost', 0, 2_000_000),
          protect_tiers: protectTiers,
          max_delayed_orders: integerValue(nested, 'max_delayed_orders', 0, 24),
          no_air_freight: booleanValue(nested, 'no_air_freight'),
          max_emissions_delta: numberValue(nested, 'max_emissions_delta', -100_000, 1_000_000),
        },
      };
    }
    case 'simulate_branch':
      rejectExtras(input, ['branch_id', 'horizon_days']);
      return { branch_id: stringValue(input, 'branch_id', true, 80), horizon_days: integerValue(input, 'horizon_days', 7, 45, 30) };
    case 'compare_branches': {
      rejectExtras(input, ['branch_ids']);
      if (!Array.isArray(input.branch_ids) || input.branch_ids.length < 2 || input.branch_ids.length > 4 || input.branch_ids.some((id) => typeof id !== 'string')) {
        throw new DomainError('INVALID_INPUT', 'branch_ids must contain two to four branch IDs.');
      }
      if (new Set(input.branch_ids).size !== input.branch_ids.length) throw new DomainError('INVALID_INPUT', 'branch_ids must be unique.');
      return { branch_ids: input.branch_ids };
    }
    case 'explain_tradeoff': {
      rejectExtras(input, ['branch_id', 'versus_branch_id', 'focus']);
      const focus = input.focus ?? 'all';
      if (!['all', 'service', 'cost', 'risk', 'emissions'].includes(String(focus))) throw new DomainError('INVALID_INPUT', 'focus is invalid.');
      return { branch_id: stringValue(input, 'branch_id', true, 80), versus_branch_id: stringValue(input, 'versus_branch_id', false, 80), focus };
    }
    case 'stage_plan':
      rejectExtras(input, ['branch_id', 'rationale']);
      return { branch_id: stringValue(input, 'branch_id', true, 80), rationale: stringValue(input, 'rationale', true, 240) };
    case 'apply_plan':
      rejectExtras(input, ['plan_id', 'expected_context_version']);
      return { plan_id: stringValue(input, 'plan_id', true, 120), expected_context_version: integerValue(input, 'expected_context_version', 0, Number.MAX_SAFE_INTEGER) };
    case 'verify_plan':
      rejectExtras(input, ['plan_id']);
      return { plan_id: stringValue(input, 'plan_id', true, 120) };
    case 'rollback_plan':
      rejectExtras(input, ['checkpoint_id', 'reason']);
      return { checkpoint_id: stringValue(input, 'checkpoint_id', true, 140), reason: stringValue(input, 'reason', true, 240) };
  }
}
