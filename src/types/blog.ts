export interface BlogFrontmatter {
  layout: string;
  title: string;
  pubDate: string;
  description?: string;
  author?: string;
  image?: { url?: string; alt?: string };
  tags?: string[];
}
export interface BlogPostModule {
  url: string;
  frontmatter: BlogFrontmatter;
}
