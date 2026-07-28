export type GitHubActivity = {
  id:string; type:string; created_at:string; repo:{name:string};
  actor?:{login?:string}; payload:Record<string,unknown>;
};
export type GitHubWorkflowRun = {
  id:number; name:string|null; display_title:string; status:string; conclusion:string|null;
  html_url:string; created_at:string; updated_at:string; head_branch:string|null;
  repository:{full_name:string};
};
export type GitHubUser = { id:number; login:string; name:string|null; avatar_url:string };
