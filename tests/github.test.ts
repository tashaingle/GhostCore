import {describe,expect,it,vi} from "vitest";
import {githubActivityTranslator,githubWorkflowTranslator} from "@/lib/integrations/github/translator";
import {GitHubConnector} from "@/lib/integrations/github/connector";
import type {GitHubActivity,GitHubWorkflowRun} from "@/lib/integrations/github/types";
const context={organisationId:"11111111-1111-4111-8111-111111111111",integrationId:"22222222-2222-4222-8222-222222222222",receivedAt:"2026-07-28T00:00:00Z"};
const activity=(type:string,payload:Record<string,unknown>={}):GitHubActivity=>({id:"42",type,created_at:"2026-07-28T00:00:00Z",repo:{name:"ghost/core"},actor:{login:"tasha"},payload});
const workflow:GitHubWorkflowRun={id:9,name:"CI",display_title:"CI",status:"completed",conclusion:"failure",html_url:"https://github.com/ghost/core/actions/runs/9",created_at:"2026-07-28T00:00:00Z",updated_at:"2026-07-28T01:00:00Z",head_branch:"main",repository:{full_name:"ghost/core"}};
describe("GitHub translation",()=>{
  it("translates pushes",()=>expect(githubActivityTranslator.translate(activity("PushEvent",{ref:"refs/heads/main",commits:[{}]}),context)).toMatchObject({eventType:"git.push",severity:"info",title:"Push to main",externalId:"activity:42"}));
  it("translates merged pull requests",()=>expect(githubActivityTranslator.translate(activity("PullRequestEvent",{action:"closed",pull_request:{merged:true}}),context)).toMatchObject({eventType:"pull_request.merged",severity:"good"}));
  it("translates issues and releases",()=>{expect(githubActivityTranslator.translate(activity("IssuesEvent",{action:"opened",issue:{number:7}}),context)).toMatchObject({eventType:"issue.opened",severity:"warning"});expect(githubActivityTranslator.translate(activity("ReleaseEvent",{action:"published",release:{tag_name:"v1"}}),context)).toMatchObject({eventType:"release.published",severity:"good"})});
  it("translates failed workflows as critical",()=>expect(githubWorkflowTranslator.translate(workflow,context)).toMatchObject({eventType:"workflow.failed",severity:"critical",externalId:"workflow:9:2026-07-28T01:00:00Z"}));
});
it("connector returns translated events without inserting them",async()=>{
  const api={user:vi.fn().mockResolvedValue({id:1,login:"tasha",name:null,avatar_url:""}),activity:vi.fn().mockResolvedValue([activity("PushEvent",{ref:"refs/heads/main"})]),workflowRuns:vi.fn().mockResolvedValue([])};
  const connector=new GitHubConnector(api);const result=await connector.sync(context);
  expect(result.received).toBe(1);expect(result.events).toHaveLength(1);expect(result.events[0]).toMatchObject({source:"github",eventType:"git.push"});
});
