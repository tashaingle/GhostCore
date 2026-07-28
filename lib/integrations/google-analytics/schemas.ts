export type MetricTotals={activeUsers:number;sessions:number;newUsers:number;totalUsers:number;engagedSessions:number;engagementRate:number;averageSessionDuration:number;eventCount:number;keyEvents:number;screenPageViews:number};
export type DimensionRow={channel:string;sourceMedium:string;landingPage:string;sessions:number;keyEvents:number};
export type GA4Snapshot={propertyId:string;timeZone:string;dates:import("./dates").ComparisonDates;current:MetricTotals;previous:MetricTotals;currentDimensions:DimensionRow[];previousDimensions:DimensionRow[]};
export type GA4Property={accountId:string;accountName:string;propertyId:string;propertyName:string;timeZone?:string};
