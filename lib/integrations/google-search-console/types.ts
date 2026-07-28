export type SearchConsoleProperty={siteUrl:string;permissionLevel:string;type:"domain"|"url_prefix";selected?:boolean};
export type SearchRow={keys?:string[];clicks?:number;impressions?:number;ctr?:number;position?:number};
export type Sitemap={path:string;lastSubmitted?:string;lastDownloaded?:string;isPending?:boolean;isSitemapsIndex?:boolean;type?:string;errors?:number;warnings?:number;contents?:{type?:string;submitted?:number;indexed?:number}[]};
export type Inspection={inspectionUrl:string;verdict?:string;coverageState?:string;robotsTxtState?:string;indexingState?:string;pageFetchState?:string;lastCrawlTime?:string;googleCanonical?:string;userCanonical?:string};
export type PropertySnapshot={property:SearchConsoleProperty;current:{startDate:string;endDate:string;rows:SearchRow[]};previous:{startDate:string;endDate:string;rows:SearchRow[]};sitemaps:Sitemap[];inspections:Inspection[]};
export type SearchConsoleSettings={accountEmail?:string;properties?:SearchConsoleProperty[];thresholdPercent?:number;minimumClicks?:number;initialSyncComplete?:boolean;lastSyncAt?:string;lastSyncMode?:string;partialFailures?:number};
