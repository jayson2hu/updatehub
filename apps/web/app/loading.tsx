export default function Loading() {
  return <div className="st-page st-loading" aria-busy="true" role="status">
    <p className="sr-only">正在加载内容…</p>
    <div className="st-skeleton st-skeleton-title" aria-hidden="true"/>
    <div className="st-skeleton st-skeleton-notice" aria-hidden="true"/>
    <div className="st-skeleton st-skeleton-row" aria-hidden="true"/>
    <div className="st-skeleton st-skeleton-row" aria-hidden="true"/>
  </div>;
}
