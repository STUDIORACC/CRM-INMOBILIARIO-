"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { DialogKind, DialogProps } from "./types";

type Registry = { [K in DialogKind]: ComponentType<DialogProps<K>> };

/** Cada diálogo se carga bajo demanda para no inflar el bundle inicial. */
export const DIALOG_REGISTRY: Partial<Registry> = {
  lead: dynamic(() => import("@/components/dialogs/lead-dialog")),
  task: dynamic(() => import("@/components/dialogs/task-dialog")),
  activity: dynamic(() => import("@/components/dialogs/activity-dialog")),
  assign: dynamic(() => import("@/components/dialogs/assign-dialog")),
  lost: dynamic(() => import("@/components/dialogs/lost-dialog")),
  won: dynamic(() => import("@/components/dialogs/won-dialog")),
  whatsapp: dynamic(() => import("@/components/dialogs/whatsapp-dialog")),
  tags: dynamic(() => import("@/components/dialogs/tags-dialog")),
  opportunity: dynamic(() => import("@/components/dialogs/opportunity-dialog")),
  visit: dynamic(() => import("@/components/dialogs/visit-dialogs").then((m) => m.VisitDialog)),
  "visit-result": dynamic(() => import("@/components/dialogs/visit-dialogs").then((m) => m.VisitResultDialog)),
  "visit-cancel": dynamic(() => import("@/components/dialogs/visit-dialogs").then((m) => m.VisitCancelDialog)),
  convert: dynamic(() => import("@/components/dialogs/convert-merge-dialogs").then((m) => m.ConvertDialog)),
  merge: dynamic(() => import("@/components/dialogs/convert-merge-dialogs").then((m) => m.MergeDialog)),
  client: dynamic(() => import("@/components/dialogs/client-dialog")),
  owner: dynamic(() => import("@/components/dialogs/owner-dialog")),
};
