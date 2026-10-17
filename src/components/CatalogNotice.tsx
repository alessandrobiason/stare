import React, { useSyncExternalStore } from "react";
import { subscribeTleDownloadStatus, tleDownloadStatus, TleDownloadStatus } from "../data/tleDownloadStatus";
import { clockTime } from "../i18n/format";
import { fill, strings } from "../i18n";
import { Notice, NoticeCard } from "./NoticeCard";

type Props = {
  /**
   * How many whole days old the orbits being drawn are, or `null` while they
   * are current. See `useLiveCatalog`.
   */
  staleDays: number | null;
};

/**
 * Says that the sky is being drawn from orbits that are out of date.
 *
 * Which happens when CelesTrak could not be reached — no signal, the service
 * down, the address blocked — and the app opened on an old cache or on the
 * catalogue it shipped with (`bundledCatalog.ts`). The satellites are still
 * roughly where they are drawn, which is exactly what makes it worth a line:
 * a marker a few degrees off looks like a marker, and nothing else on screen
 * would say it is not.
 *
 * Shows the actual download failure and the earliest retry time. The view
 * retries on its own (`refreshStaleCatalog`); the notice clears when newer
 * elements arrive.
 */
export const CatalogNotice: React.FC<Props> = ({ staleDays }) => {
  const download = useSyncExternalStore(subscribeTleDownloadStatus, tleDownloadStatus, tleDownloadStatus);
  const notice = noticeFor(staleDays, download);
  return notice ? <NoticeCard notice={notice} /> : null;
};

function noticeFor(staleDays: number | null, download: TleDownloadStatus): Notice | null {
  if (staleDays === null) return null;
  const words = strings().catalogNotice;
  const age = staleDays <= 1 ? words.oneDay : fill(words.days, { days: staleDays });
  const details = [fill(words.stale.detail, { age })];
  if (download.phase === "loading") details.push(words.downloading);
  else if (download.issue) {
    details.push(fill(words.errors[download.issue.kind], { status: download.issue.status ?? "" }));
    if (download.retryAtMs !== null) details.push(fill(words.retryAfter, { time: clockTime(new Date(download.retryAtMs)) }));
  }
  return { title: words.stale.title, detail: details.join(" ") };
}

export default CatalogNotice;
