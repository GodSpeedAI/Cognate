export const JOURNEY_A_AGENT = "copilotkit-reconstruction.chat";
export const JOURNEY_B_AGENT = "copilotkit-reconstruction.front-capability";
export const JOURNEY_C_AGENT = "copilotkit-reconstruction.shared-state";
export const JOURNEY_D_AGENT = "copilotkit-reconstruction.agent-context";
export const JOURNEY_E_AGENT = "copilotkit-reconstruction.controlled-rendering";
export const JOURNEY_F_AGENT = "copilotkit-reconstruction.tool-decision";
export const JOURNEY_G_AGENT = "copilotkit-reconstruction.runtime-interrupt";
export const JOURNEY_H_AGENT = "copilotkit-reconstruction.declarative-ui";
export const JOURNEY_J_AGENT = "copilotkit-reconstruction.rich-thread";
export const JOURNEY_K_AGENT = "copilotkit-reconstruction.live-recovery";
export const JOURNEY_MCP_AGENT = "copilotkit-reconstruction.open-ended-mcp";
// Display-side identity of the MCP open-ended render: pure strings so browser surfaces never
// import the server module that owns the MCP bridge (see remaining-journeys.ts, which re-exports).
export const MCP_APP_COMPONENT = "McpCreateViewApp";
export const MCP_APP_OPERATION = "approve-view";
export const MCP_APP_OPERATION_LABEL = "Approve view";
export const DECLARATIVE_OPERATION = "select-region";
export const DEFAULT_THREAD_ID = "thread:demo";
export const THREAD_J_C = "thread:j-c";
