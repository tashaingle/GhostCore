import type {GA4Property} from "./schemas";
export function validatePropertySelection(propertyId:string,properties:GA4Property[]){if(!/^\d+$/.test(propertyId))throw new Error("Select a valid GA4 property.");const property=properties.find(item=>item.propertyId===propertyId);if(!property)throw new Error("The selected GA4 property is not available to this Google account.");return property}
