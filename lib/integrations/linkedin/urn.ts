const ID=/^[A-Za-z0-9_-]+$/;
export type LinkedInUrnKind="organization"|"sponsoredAccount"|"sponsoredCampaignGroup"|"sponsoredCampaign"|"sponsoredCreative";
export function linkedinId(value:string){const id=decodeURIComponent(value).replace(/^urn:li:[^:]+:/,"");if(!ID.test(id))throw new Error("Invalid LinkedIn identifier.");return id}
export function linkedinUrn(kind:LinkedInUrnKind,value:string){return`urn:li:${kind}:${linkedinId(value)}`}
export function restliList(values:string[]){return`List(${values.map(value=>encodeURIComponent(decodeURIComponent(value))).join(",")})`}
export function restliQuery(params:Record<string,string>){return Object.entries(params).map(([key,value])=>`${encodeURIComponent(key)}=${value.startsWith("List(")?value:encodeURIComponent(value)}`).join("&")}
