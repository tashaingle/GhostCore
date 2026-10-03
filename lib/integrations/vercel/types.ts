export type VercelProject = {
  id: string;
  name: string;
  framework?: string | null;
};

export type VercelDeployment = {
  id: string;
  projectId: string;
  projectName: string;
  url?: string;
  createdMs: number;
  state: string;
  target: string | null;
  branch?: string;
};

export type VercelSettings = {
  installationId?: string;
  configurationId?: string;
  teamId?: string | null;
  userId?: string;
  selectedProjectIds?: string[];
  configurationStatus?: "property_required" | "ready";
  rotationIndex?: number;
  lastSyncAt?: string;
};
