// Public projection `settings`: folds `settings.changed` events into a single "current" row, the
// same one-row-per-tenant convention `model-config` uses. Absence of a row is what makes the UI
// fall back to the default work-details mode ("standard") on a fresh COGNATE_HARNESS_HOME.
import type { Projection } from "@cognate/projections";

export const settingsProjection: Projection = {
  name: "settings",
  version: "1.0.0",
  apply(event) {
    if (event.eventType !== "settings.changed") return [];
    const payload = event.payload as { readonly workDetails: string };
    return [
      {
        key: `${event.tenant}/current`,
        value: { workDetails: payload.workDetails, updatedAt: event.recordedAt },
      },
    ];
  },
};
