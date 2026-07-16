import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marked } from "marked";
import { apiGet } from "../api";
import "./Blog.css";

interface Post {
  title: string;
  content: string;
  tags: string[];
  coverImage?: string;
  publishedAt?: string;
  createdAt?: string;
}

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";

const BlogPost = () => {
  const { slug } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    apiGet(`/api/blog/${slug}`)
      .then(async (d) => {
        setPost(d.post);
        document.title = `${d.post.title} — Ritabrata Paul`;
        setHtml(await marked.parse(d.post.content || ""));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div className="blog-page">
      <header className="blog-header">
        <Link to="/blog" className="blog-back">← All posts</Link>
      </header>

      <article className="blog-article">
        {loading && <p className="blog-muted">Loading…</p>}
        {error && <p className="blog-error">Post not found.</p>}
        {post && (
          <>
            <div className="blog-card-date">{fmt(post.publishedAt || post.createdAt)}</div>
            <h1>{post.title}</h1>
            <div className="blog-tags">
              {(post.tags || []).map((t) => <span key={t} className="blog-tag">{t}</span>)}
            </div>
            {post.coverImage && <img src={post.coverImage} alt="" className="blog-article-cover" />}
            <div className="blog-content" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        )}
      </article>
    </div>
  );
};

export default BlogPost;
