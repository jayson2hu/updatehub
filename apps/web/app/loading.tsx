export default function Loading() {
  return <div className="sv-container sv-loading" aria-busy="true" role="status">
    <p className="sv-sr">正在加载内容…</p>
    <div className="sv-skel sv-skel--hero" aria-hidden="true"/>
    <div className="sv-skel sv-skel--row" aria-hidden="true"/>
    <div className="sv-skel sv-skel--row" aria-hidden="true"/>
    <div className="sv-skel sv-skel--row" aria-hidden="true"/>
  </div>;
}
