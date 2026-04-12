import type { PlatformCode } from '../../../shared/contracts'

export interface MappingReviewRow {
  menuId: string
  baseName: string
  platformCode: PlatformCode
  platformMenuName?: string
}

export const MappingReviewTable = ({
  rows,
  onConfirm
}: {
  rows: MappingReviewRow[]
  onConfirm: (menuId: string, platformCode: PlatformCode, platformMenuName: string) => void
}) => (
  <table className="menu-table">
    <thead>
      <tr>
        <th>기준 메뉴</th>
        <th>플랫폼</th>
        <th>연결 메뉴</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={`${row.menuId}:${row.platformCode}`}>
          <td>{row.baseName}</td>
          <td>{row.platformCode}</td>
          <td>
            <input
              defaultValue={row.platformMenuName ?? ''}
              onBlur={(event) => onConfirm(row.menuId, row.platformCode, event.target.value)}
            />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)
