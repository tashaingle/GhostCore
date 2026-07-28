import { expect,it } from "vitest"; import { slugify,uniqueSlug } from "@/lib/organisations/slug"; import { parseEventFilters } from "@/lib/events/filters";
it("creates URL-safe unique slugs",()=>{expect(slugify("Tâsha & Co!")).toBe("tasha-co");expect(uniqueSlug("My Org","abcd1234")).toBe("my-org-abcd1234")});
it("parses safe timeline filters",()=>{expect(parseEventFilters({severity:"warning",page:"2"})).toMatchObject({severity:"warning",page:2,period:"30d"});expect(()=>parseEventFilters({severity:"unknown"})).toThrow()});
it("documents duplicate identity",()=>{const identity=(org:string,source:string,id:string)=>`${org}:${source}:${id}`;expect(identity("a","stripe","1")).toBe(identity("a","stripe","1"));expect(identity("a","stripe","1")).not.toBe(identity("b","stripe","1"))});
