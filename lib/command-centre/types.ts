export type CommandEvent={id:string;source:string;event_type:string;title:string;description:string|null;severity:string;occurred_at:string;metadata:Record<string,unknown>};
export type CommandIntegration={id:string;provider:string;provider_account_name:string|null;status:string;last_sync_at:string|null;last_sync_status:string|null;last_sync_error:string|null;token_expires_at:string|null;settings:Record<string,unknown>};
export type CommandAlert={id:string;severity:"critical"|"warning"|"information";title:string;detail:string;href:string;evidence:string};
export const COMMAND_WIDGETS=["overview","attention","activity","health","correlations","timeline","integrations","actions","organisation"]as const;
export type CommandWidgetId=typeof COMMAND_WIDGETS[number];
export type SavedCommandLayout={name:string;widgets:CommandWidgetId[];hidden:CommandWidgetId[];collapsed:CommandWidgetId[];pinnedProviders:string[];pinnedEventIds:string[];dateRange:"today"|"7d"|"30d";updatedAt?:string};
