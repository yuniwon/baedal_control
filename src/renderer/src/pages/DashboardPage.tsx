const platformStatuses = [
  { name: '배민', status: '연결 대기' },
  { name: '쿠팡이츠', status: '연결 대기' },
  { name: '땡겨요', status: '연결 대기' }
]

export const DashboardPage = () => (
  <section className="page">
    <header className="page-header">
      <h1>대시보드</h1>
      <p>저장한 메뉴를 확인하고 배달앱 반영 준비 상태를 점검합니다.</p>
    </header>

    <div className="summary-grid">
      <article className="summary-card">
        <strong>0</strong>
        <span>변경된 메뉴</span>
      </article>
      <article className="summary-card">
        <strong>준비 전</strong>
        <span>마지막 반영</span>
      </article>
      <article className="summary-card">
        <strong>3개</strong>
        <span>연동 대상 플랫폼</span>
      </article>
    </div>

    <section className="panel">
      <div className="inline-actions">
        <button className="primary-button">전체 반영</button>
        <span>변경 예정 내용은 실행 전에 다시 확인합니다.</span>
      </div>
    </section>

    <section className="status-list">
      {platformStatuses.map((platform) => (
        <article key={platform.name} className="status-row">
          <strong>{platform.name}</strong>
          <span className="status-pill">{platform.status}</span>
        </article>
      ))}
    </section>
  </section>
)
