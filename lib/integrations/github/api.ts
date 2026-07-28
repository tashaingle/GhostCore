import "server-only";
import type { GitHubActivity, GitHubUser, GitHubWorkflowRun } from "./types";

export type GitHubFailureKind = "unauthorized"|"rate_limit"|"network"|"api";
export class GitHubApiError extends Error {
  constructor(public kind:GitHubFailureKind,message:string,public resetAt?:string){super(message)}
}
type FetchLike = typeof fetch;
export class GitHubApi {
  constructor(private token:string,private request:FetchLike=fetch){}
  private async get<T>(path:string):Promise<T>{
    let response:Response;
    try { response=await this.request(`https://api.github.com${path}`,{headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${this.token}`,"X-GitHub-Api-Version":"2026-03-10","User-Agent":"Ghost-Core"}}); }
    catch { throw new GitHubApiError("network","GitHub could not be reached. Try again shortly."); }
    if(response.status===401||response.status===403&&response.headers.get("x-ratelimit-remaining")!=="0")throw new GitHubApiError("unauthorized","GitHub authorization has expired. Reconnect GitHub.");
    if(response.status===429||response.headers.get("x-ratelimit-remaining")==="0"){const epoch=response.headers.get("x-ratelimit-reset");const resetAt=epoch?new Date(Number(epoch)*1000).toISOString():undefined;throw new GitHubApiError("rate_limit",resetAt?`GitHub rate limit reached. Try again after ${new Date(resetAt).toLocaleString()}.`:"GitHub rate limit reached. Try again later.",resetAt)}
    if(!response.ok)throw new GitHubApiError("api",`GitHub returned an unexpected response (${response.status}).`);
    return response.json() as Promise<T>;
  }
  user(){return this.get<GitHubUser>("/user")}
  activity(login:string){return this.get<GitHubActivity[]>(`/users/${encodeURIComponent(login)}/events?per_page=100`)}
  async workflowRuns(repositories:string[]){
    const runs:GitHubWorkflowRun[]=[];
    for(const repository of repositories.slice(0,10)){
      const [owner,name]=repository.split("/");
      if(!owner||!name)continue;
      const result=await this.get<{workflow_runs:GitHubWorkflowRun[]}>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?per_page=10`);
      runs.push(...result.workflow_runs);
    }
    return runs;
  }
}
