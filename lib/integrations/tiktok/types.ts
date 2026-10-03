export type TikTokProfile = {
  openId: string;
  displayName?: string;
  username?: string;
  followerCount?: number;
  followingCount?: number;
  likesCount?: number;
  videoCount?: number;
};

export type TikTokVideo = {
  id: string;
  title?: string;
  createTime: number;
  url?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
};

export type TikTokSettings = {
  openId?: string;
  displayName?: string;
  username?: string;
  scopes?: string[];
  lastVideoCreateTime?: number;
  configurationStatus?: "ready";
};
