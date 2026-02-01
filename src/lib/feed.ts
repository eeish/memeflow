export type MediaType = 'image' | 'video';

export function inferMediaType(url: string): MediaType {
  const lowerUrl = url.toLowerCase();
  const videoExts = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'];
  return videoExts.some((ext) => lowerUrl.includes(ext)) ? 'video' : 'image';
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
