import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import "./Blog.css";

interface Post {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  tags: string[];
  coverImage?: string;
  publishedAt?: string;
  createdAt?: string;
}

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";

const BlogList = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Blog — Ritabrata Paul";
    apiGet("/api/blog")
      .then((d) => setPosts(d.posts || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="blog-page">
      <header className="blog-header">
        <Link to="/" className="blog-back">← Back to portfolio</Link>
        <h1>Blog</h1>
        <p className="blog-sub">Thoughts on web development, DevOps, and building things.</p>
      </header>

      <main className="blog-list">
        {loading && <p className="blog-muted">Loading posts…</p>}
        {error && <p className="blog-error">Couldn't load posts: {error}</p>}
        {!loading && !error && posts.length === 0 && <p className="blog-muted">No posts yet — check back soon.</p>}

        {posts.map((p) => (
          <Link to={`/blog/${p.slug}`} key={p._id} className="blog-card">
            {p.coverImage && <img src={p.coverImage} alt="" className="blog-card-cover" />}
            <div className="blog-card-body">
              <div className="blog-card-date">{fmt(p.publishedAt || p.createdAt)}</div>
              <h2>{p.title}</h2>
              <p className="blog-excerpt">{p.excerpt}</p>
              <div className="blog-tags">
                {(p.tags || []).map((t) => <span key={t} className="blog-tag">{t}</span>)}
              </div>
            </div>
          </Link>
        ))}
      </main>
    </div>
  );
};

export default BlogList;
