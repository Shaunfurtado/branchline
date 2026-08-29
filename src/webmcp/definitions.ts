import type { ToolName } from '../app/selectors.js';
import { invokeTool } from './handlers.js';
import { toolSchemas } from './schemas.js';

interface BranchlineToolDefinition extends WebMCPToolDefinition {
  name: ToolName;
}

const metadata: Record<ToolName, { title: string; description: string; readOnly: boolean; untrusted?: boolean }> = {
  get_ops_snapshot: {
    title: 'Get operations snapshot',
    description: 'Return the current disruption, headline risk, active constraints, branch statuses, and shared-state versions for this operational twin.',
    readOnly: true,
  },
  inspect_entity: {
    title: 'Inspect entity',
    description: 'Inspect one supplier, component, factory, lane, product, customer, or order by ID, including current status and linked entities.',
    readOnly: true,
  },
  trace_impact: {
    title: 'Trace causal impact',
    description: 'Trace causal impact from one entity through dependencies and summarize affected orders, revenue, components, and production.',
    readOnly: true,
  },
  list_constraints: {
    title: 'List shared constraints',
    description: 'Return active hard and soft constraints, including human-locked orders and prohibited substitutions, with their provenance.',
    readOnly: true,
  },
  find_substitutes: {
    title: 'Find component substitutes',
    description: 'Find compatible substitute sources for a component and report capacity, lead time, cost, risk, emissions, and product restrictions.',
    readOnly: true,
  },
  read_external_alerts: {
    title: 'Read external alerts',
    description: 'Read recent external supplier and logistics alerts as unverified evidence. Validate important claims with operational tools.',
    readOnly: true,
    untrusted: true,
  },
  create_branch: {
    title: 'Create recovery branch',
    description: 'Create a draft recovery branch using one planning strategy and the current shared constraints. This does not change live operations.',
    readOnly: false,
  },
  simulate_branch: {
    title: 'Simulate recovery branch',
    description: 'Recompute and simulate a recovery branch using the current shared state. Saves results but does not execute operational changes.',
    readOnly: false,
  },
  compare_branches: {
    title: 'Compare recovery branches',
    description: 'Compare two to four current simulated branches across service, cost, risk, emissions, reversibility, and constraint compliance.',
    readOnly: true,
  },
  explain_tradeoff: {
    title: 'Explain branch tradeoff',
    description: 'Explain why a simulated branch behaves as it does, citing causal entities and actions. Optionally compare it with another branch.',
    readOnly: true,
  },
  stage_plan: {
    title: 'Stage plan for approval',
    description: 'Stage one valid current branch for human review. Opens the approval interface and does not execute operational changes.',
    readOnly: false,
  },
  apply_plan: {
    title: 'Apply approved plan',
    description: 'Apply the currently human-approved staged plan to the live twin. Creates a rollback checkpoint and is idempotent.',
    readOnly: false,
  },
  verify_plan: {
    title: 'Verify executed plan',
    description: 'Verify an executed plan against its simulated promise and active constraints, returning before-and-after evidence.',
    readOnly: true,
  },
  rollback_plan: {
    title: 'Rollback to checkpoint',
    description: 'Restore a prior checkpoint in the live twin and record the reason in the audit trail.',
    readOnly: false,
  },
};

export const toolDefinitions: Record<ToolName, BranchlineToolDefinition> = Object.fromEntries(
  (Object.keys(metadata) as ToolName[]).map((name) => {
    const definition: BranchlineToolDefinition = {
      name,
      title: metadata[name].title,
      description: metadata[name].description,
      inputSchema: toolSchemas[name],
      annotations: {
        readOnlyHint: metadata[name].readOnly,
        untrustedContentHint: metadata[name].untrusted ?? false,
      },
      execute: async (input, { signal }) => invokeTool(name, input, signal),
    };
    return [name, definition];
  }),
) as Record<ToolName, BranchlineToolDefinition>;

export const toolMetadata = metadata;
