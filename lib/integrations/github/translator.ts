import type { EventTranslator, TranslationContext } from "../connector";
import type { NormalisedEventInput } from "@/types/events";
import type { GitHubActivity, GitHubWorkflowRun } from "./types";

function text(value:unknown){return typeof value==="string"?value:""}
function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function base(context:TranslationContext, externalId:string, occurredAt:string, title:string, eventType:string, severity:NormalisedEventInput["severity"], metadata:Record<string,unknown>):NormalisedEventInput {
  return {organisationId:context.organisationId,integrationId:context.integrationId,source:"github",category:"development",eventType,title,severity,occurredAt,externalId,metadata,rawPayload:{}};
}
export const githubActivityTranslator:EventTranslator<GitHubActivity>={
  translate(record,context){
    const repo=record.repo.name;const payload=object(record.payload);const action=text(payload.action);const common={repository:repo,actor:record.actor?.login};
    if(record.type==="PushEvent"){const branch=text(payload.ref).replace("refs/heads/","")||"repository";return base(context,`activity:${record.id}`,record.created_at,`Push to ${branch}`,"git.push","info",{...common,branch,commitCount:Array.isArray(payload.commits)?payload.commits.length:undefined})}
    if(record.type==="PullRequestEvent"){const pr=object(payload.pull_request);const merged=action==="closed"&&pr.merged===true;if(action!=="opened"&&!merged)return null;return base(context,`activity:${record.id}`,record.created_at,`${merged?"Merged":"Opened"} pull request in ${repo}`,merged?"pull_request.merged":"pull_request.opened",merged?"good":"info",{...common,action,number:payload.number,url:pr.html_url})}
    if(record.type==="IssuesEvent"&&action==="opened"){const issue=object(payload.issue);return base(context,`activity:${record.id}`,record.created_at,`Issue opened in ${repo}`,"issue.opened","warning",{...common,number:issue.number,url:issue.html_url})}
    if(record.type==="ReleaseEvent"&&action==="published"){const release=object(payload.release);return base(context,`activity:${record.id}`,record.created_at,`Release ${text(release.tag_name)||"published"} in ${repo}`,"release.published","good",{...common,tag:release.tag_name,url:release.html_url})}
    return null;
  }
};
export const githubWorkflowTranslator:EventTranslator<GitHubWorkflowRun>={
  translate(run,context){
    if(run.status!=="completed"||!["success","failure","timed_out","cancelled"].includes(run.conclusion??""))return null;
    const succeeded=run.conclusion==="success";
    return base(context,`workflow:${run.id}:${run.updated_at}`,run.updated_at||run.created_at,
      `${run.name||run.display_title} ${succeeded?"succeeded":"failed"}`,succeeded?"workflow.success":"workflow.failed",succeeded?"good":"critical",
      {repository:run.repository.full_name,branch:run.head_branch,conclusion:run.conclusion,url:run.html_url});
  }
};
