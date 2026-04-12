import { useEffect, useState } from 'react'
import type { PlatformCode, PlatformMenuMappingRecord } from '../../../shared/contracts'
import { appApi } from '../lib/api'
import { MappingReviewTable, type MappingReviewRow } from '../components/MappingReviewTable'
import type { MenuRow } from '../components/MenuTable'

const platforms: PlatformCode[] = ['baemin', 'coupangeats', 'ddangyo']

const buildMappingRows = (
  menus: MenuRow[],
  mappings: PlatformMenuMappingRecord[]
): MappingReviewRow[] =>
  menus.flatMap((menu) =>
    platforms.map((platformCode) => {
      const mapping = mappings.find(
        (entry) => entry.menuId === menu.menuId && entry.platformCode === platformCode
      )

      return {
        menuId: menu.menuId,
        baseName: menu.baseName,
        platformCode,
        platformMenuName: mapping?.platformMenuName ?? ''
      }
    })
  )

export const MappingPage = () => {
  const [rows, setRows] = useState<MappingReviewRow[]>([])

  useEffect(() => {
    void Promise.all([appApi.menus.list(), appApi.mappings.list()]).then(([menuValue, mappingValue]) => {
      const menus = Array.isArray(menuValue) ? (menuValue as MenuRow[]) : []
      const mappings = Array.isArray(mappingValue)
        ? (mappingValue as PlatformMenuMappingRecord[])
        : []

      setRows(buildMappingRows(menus, mappings))
    })
  }, [])

  const handleConfirm = (
    menuId: string,
    platformCode: PlatformCode,
    platformMenuName: string
  ) => {
    void appApi.mappings
      .save({
        mappingId: `${menuId}:${platformCode}`,
        menuId,
        platformCode,
        platformMenuId: `${platformCode}:${platformMenuName}`,
        platformMenuName,
        matchedBy: 'manual',
        isConfirmed: 1
      })
      .then(() =>
        setRows((current) =>
          current.map((row) =>
            row.menuId === menuId && row.platformCode === platformCode
              ? { ...row, platformMenuName }
              : row
          )
        )
      )
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>매핑 검토</h1>
        <p>기준 메뉴와 각 플랫폼 메뉴를 한 번만 연결해 두면 다음 반영부터 그대로 사용합니다.</p>
      </header>

      <section className="panel">
        <MappingReviewTable rows={rows} onConfirm={handleConfirm} />
      </section>
    </section>
  )
}
