export type GmailHeader={name:string;value:string};
export type GmailPart={filename?:string;mimeType?:string;body?:{attachmentId?:string};parts?:GmailPart[]};
export type GmailMessage={id:string;threadId:string;internalDate:string;labelIds?:string[];snippet?:string;payload?:GmailPart&{headers?:GmailHeader[]}};
export type GmailProfile={emailAddress:string;messagesTotal:number;threadsTotal:number;historyId:string};
export type GmailSettings={mailboxEmail?:string;historyId?:string;initialSyncComplete?:boolean;initialWindowDays?:number;includeReceived?:boolean;includeSent?:boolean;includeUnread?:boolean;includeAttachments?:boolean;includeSnippets?:boolean;grantedScopes?:string;mailboxDomain?:string};
