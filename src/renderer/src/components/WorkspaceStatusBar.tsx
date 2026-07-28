interface WorkspaceStatusBarProps {
  catalogVersion: number
  reviewCount: number
  latestImportAt?: string | null
}

const formatImportTime = (value?: string | null) => {
  if (!value) return '가져오기 기록 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '가져오기 시간 확인 필요'
  return `최근 가져오기 ${new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)}`
}

export const WorkspaceStatusBar = ({
  catalogVersion,
  reviewCount,
  latestImportAt
}: WorkspaceStatusBarProps) => (
  <div className="workspace-status" aria-label="통합메뉴 상태">
    <span className="status-pill status-ready">버전 {catalogVersion}</span>
    <span className={reviewCount > 0 ? 'status-pill status-warning' : 'status-pill'}>
      검토 {reviewCount}건
    </span>
    <span className="status-import">{formatImportTime(latestImportAt)}</span>
  </div>
)
